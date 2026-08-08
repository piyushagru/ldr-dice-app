const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { randomInt } = require('crypto');
const dice = require('./pipworks');
const { PRESETS, decorateRoll } = require('./presets');

// ─── Rooms ────────────────────────────────────────────────────────────────────
// Each room has isolated game state and its own set of SSE clients.
// Empty rooms are garbage collected after a grace period.
const ROOM_ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/O/1/l/i
const ROOM_ID_LENGTH = 6;
const ROOM_ID_PATTERN = /^[a-z0-9]{4,12}$/;
const ROOM_GRACE_MS = 5 * 60 * 1000;   // keep empty rooms for 5 minutes
const ROOM_GC_INTERVAL_MS = 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 25 * 1000;
const MAX_HISTORY = 15;

const rooms = new Map();

function generateRoomId() {
  let id = '';
  for (let i = 0; i < ROOM_ID_LENGTH; i++) {
    id += ROOM_ID_ALPHABET[randomInt(ROOM_ID_ALPHABET.length)];
  }
  return id;
}

// Pit-level game mode: 'free' or a preset id. Shared by everyone in the Pit.
const VALID_MODES = ['free', ...Object.keys(PRESETS)];

function createGameState() {
  return {
    lastRoll: null,
    rolledBy: null,
    timestamp: null,
    connectedUsers: 0,
    rollHistory: [],
    currentMode: 'free'
  };
}

// Get an existing room or create it. Creating on demand keeps shared links
// working even after a server restart (state is in-memory only).
function getOrCreateRoom(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    room = { id: roomId, gameState: createGameState(), clients: new Set(), emptySince: Date.now() };
    rooms.set(roomId, room);
    console.log(`Pit ${roomId} opened (${rooms.size} total)`);
  }
  return room;
}

// ─── SSE broadcast ────────────────────────────────────────────────────────────
// Writes to every client in the room. Dead clients are collected during
// iteration and removed afterwards, so a failed write never causes other
// clients to be skipped (the old splice-while-iterating bug).
function broadcastSSE(room, message) {
  const data = `data: ${JSON.stringify(message)}\n\n`;
  const dead = [];
  for (const res of room.clients) {
    try {
      res.write(data);
    } catch (error) {
      dead.push(res);
    }
  }
  dead.forEach(res => removeClient(room, res));
}

function removeClient(room, res) {
  if (!room.clients.delete(res)) return;
  room.gameState.connectedUsers = room.clients.size;
  if (room.clients.size === 0) {
    room.emptySince = Date.now();
  }
  broadcastSSE(room, { type: 'userCount', data: room.gameState.connectedUsers });
}

// Periodic keepalive comment so idle connections aren't closed by proxies.
setInterval(() => {
  for (const room of rooms.values()) {
    const dead = [];
    for (const res of room.clients) {
      try {
        res.write(': keepalive\n\n');
      } catch (error) {
        dead.push(res);
      }
    }
    dead.forEach(res => removeClient(room, res));
  }
}, HEARTBEAT_INTERVAL_MS).unref();

// Garbage collect rooms that have been empty past the grace period.
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms) {
    if (room.clients.size === 0 && now - room.emptySince > ROOM_GRACE_MS) {
      rooms.delete(roomId);
      console.log(`Pit ${roomId} swept (${rooms.size} total)`);
    }
  }
}, ROOM_GC_INTERVAL_MS).unref();

// ─── Roll spec resolution ─────────────────────────────────────────────────────
// Accepts the /roll request body and resolves it to a validated spec.
// Priority: preset > notation > structured spec > legacy numDice (d6).
// Returns { spec, preset } or null if invalid.
function resolveRollRequest(data) {
  if (data.preset !== undefined) {
    const preset = PRESETS[data.preset];
    if (!preset) return null;
    return { spec: preset.spec, preset: data.preset };
  }
  if (data.notation !== undefined) {
    const spec = dice.parseNotation(data.notation);
    return spec ? { spec, preset: null } : null;
  }
  if (data.spec !== undefined && typeof data.spec === 'object' && data.spec !== null) {
    const spec = dice.validateSpec(data.spec);
    return spec ? { spec, preset: null } : null;
  }
  // Legacy format: { numDice: 1|2 } rolls d6
  const numDice = Math.min(Math.max(data.numDice || 1, 1), 2);
  return { spec: { count: numDice, sides: 6, modifier: 0 }, preset: null };
}

// A roll must match the Pit's mode: game modes accept only their own preset,
// free mode accepts anything except a preset. Keeps stale clients honest.
function rollMatchesMode(mode, preset) {
  return mode === 'free' ? preset === null : preset === mode;
}

function readJsonBody(req, onData) {
  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', () => onData(body));
}

const PORT = process.env.PORT || 3005;

function handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // Match room routes: /r/:roomId, /r/:roomId/events, /r/:roomId/roll, /r/:roomId/settings
    const roomMatch = pathname.match(/^\/r\/([^/]+)(?:\/(events|roll|settings))?$/);
    if (roomMatch) {
      const roomId = roomMatch[1].toLowerCase();
      const action = roomMatch[2];

      if (!ROOM_ID_PATTERN.test(roomId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid room id' }));
        return;
      }

      // Game page for the room
      if (!action) {
        serveFile(res, path.join(__dirname, 'public', 'index.html'), 'text/html');
        return;
      }

      const room = getOrCreateRoom(roomId);

      // Handle SSE endpoint (scoped to room)
      if (action === 'events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control'
        });

        room.clients.add(res);
        room.gameState.connectedUsers = room.clients.size;

        // Send current game state to the new client
        res.write(`data: ${JSON.stringify({
          type: 'gameState',
          data: room.gameState
        })}\n\n`);

        // Broadcast user count update to the room
        broadcastSSE(room, {
          type: 'userCount',
          data: room.gameState.connectedUsers
        });

        // Handle client disconnect
        req.on('close', () => removeClient(room, res));
        return;
      }

      // Handle dice roll endpoint (scoped to room)
      if (action === 'roll' && req.method === 'POST') {
        readJsonBody(req, body => {
          try {
            const data = JSON.parse(body);
            const resolved = resolveRollRequest(data);
            if (!resolved) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid roll request' }));
              return;
            }

            const gameState = room.gameState;
            if (!rollMatchesMode(gameState.currentMode, resolved.preset)) {
              res.writeHead(409, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Roll does not match Pit mode', currentMode: gameState.currentMode }));
              return;
            }

            const result = dice.roll(resolved.spec);

            gameState.lastRoll = result.count === 1 ? result.rolls[0] : result.rolls;
            gameState.rolledBy = data.playerName || 'Anonymous';
            gameState.timestamp = new Date().toLocaleTimeString();

            const entry = {
              rolls: result.rolls,
              total: result.total,
              subtotal: result.subtotal,
              numDice: result.count,
              sides: result.sides,
              modifier: result.modifier,
              notation: result.notation,
              preset: resolved.preset,
              ...decorateRoll(resolved.preset, result),
              rolledBy: gameState.rolledBy,
              timestamp: gameState.timestamp
            };

            // Add to roll history (keep last 15 rolls)
            gameState.rollHistory.unshift(entry);
            if (gameState.rollHistory.length > MAX_HISTORY) {
              gameState.rollHistory.pop();
            }

            console.log(`[${roomId}] ${gameState.rolledBy} rolled ${result.notation}: [${result.rolls.join(', ')}] = ${result.total}`);

            // Broadcast the roll to all clients in the room
            broadcastSSE(room, {
              type: 'diceRolled',
              data: { ...entry, rollHistory: gameState.rollHistory }
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, rolls: result.rolls, total: result.total, notation: result.notation }));
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });

        return;
      }

      // Pit settings: any member can switch the shared game mode.
      if (action === 'settings' && req.method === 'POST') {
        readJsonBody(req, body => {
          try {
            const data = JSON.parse(body);
            if (!VALID_MODES.includes(data.mode)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid mode' }));
              return;
            }

            const gameState = room.gameState;
            if (data.mode !== gameState.currentMode) {
              gameState.currentMode = data.mode;
              const changedBy = data.playerName || 'Anonymous';
              console.log(`[${roomId}] ${changedBy} switched mode to ${data.mode}`);
              broadcastSSE(room, {
                type: 'modeChanged',
                data: { mode: data.mode, changedBy }
              });
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, currentMode: gameState.currentMode }));
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });

        return;
      }
    }

    // Create a new room and return its id
    if (pathname === '/api/rooms' && req.method === 'POST') {
      let roomId = generateRoomId();
      while (rooms.has(roomId)) roomId = generateRoomId();
      getOrCreateRoom(roomId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ roomId }));
      return;
    }

    // Landing page
    if (pathname === '/') {
      serveFile(res, path.join(__dirname, 'public', 'landing.html'), 'text/html');
      return;
    }

    // Serve static files
    let filePath;
    if (pathname.startsWith('/public/')) {
      filePath = pathname;
    } else {
      // For files like style.css, app.js, serve from public directory
      filePath = '/public' + pathname;
    }

    // Security: prevent directory traversal
    if (filePath.includes('..')) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const fullPath = path.join(__dirname, filePath);

    // Determine content type
    const ext = path.extname(fullPath);
    const contentTypes = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json'
    };
    const contentType = contentTypes[ext] || 'text/plain';

    serveFile(res, fullPath, contentType);
}

// Function to try different ports if the default is in use
function startServer(port) {
  http.createServer(handleRequest).listen(port, () => {
    console.log(`SpiceDice server running on port ${port}`);
    console.log(`Open http://localhost:${port} to open a Pit and start rolling!`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is in use, trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

// Read and serve a file from disk
function serveFile(res, fullPath, contentType) {
  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('File not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

if (require.main === module) startServer(PORT);

module.exports = { handleRequest, rooms, getOrCreateRoom };
