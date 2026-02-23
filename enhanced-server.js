const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Enhanced game state with more features
let gameState = {
  lastRoll: null,
  rolledBy: null,
  timestamp: null,
  connectedUsers: 0,
  rollHistory: [],
  rooms: new Map(), // Support for multiple rooms
  userSessions: new Map() // Track user sessions
};

// Store SSE connections with room support
let sseConnections = new Map(); // roomId -> [connections]

// Create HTTP server
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  
  // Handle SSE endpoint with room support
  if (pathname === '/events') {
    const roomId = parsedUrl.query.room || 'default';
    
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });
    
    // Initialize room if it doesn't exist
    if (!sseConnections.has(roomId)) {
      sseConnections.set(roomId, []);
      gameState.rooms.set(roomId, {
        lastRoll: null,
        rolledBy: null,
        timestamp: null,
        connectedUsers: 0,
        rollHistory: []
      });
    }
    
    // Add connection to room
    const roomConnections = sseConnections.get(roomId);
    roomConnections.push({ res, roomId });
    
    const roomState = gameState.rooms.get(roomId);
    roomState.connectedUsers++;
    gameState.connectedUsers++;
    
    // Send current room state
    res.write(`data: ${JSON.stringify({
      type: 'gameState',
      data: roomState,
      roomId: roomId
    })}\n\n`);
    
    // Broadcast user count update to room
    broadcastToRoom(roomId, {
      type: 'userCount',
      data: roomState.connectedUsers,
      roomId: roomId
    });
    
    // Handle client disconnect
    req.on('close', () => {
      const index = roomConnections.findIndex(conn => conn.res === res);
      if (index !== -1) {
        roomConnections.splice(index, 1);
        roomState.connectedUsers--;
        gameState.connectedUsers--;
        
        broadcastToRoom(roomId, {
          type: 'userCount',
          data: roomState.connectedUsers,
          roomId: roomId
        });
        
        // Clean up empty rooms
        if (roomState.connectedUsers === 0) {
          sseConnections.delete(roomId);
          gameState.rooms.delete(roomId);
        }
      }
    });
    
    return;
  }
  
  // Handle dice roll endpoint with room support
  if (pathname === '/roll' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const roomId = data.roomId || 'default';
        const diceType = data.diceType || 6; // Support different dice types
        const numDice = Math.min(data.numDice || 1, 10); // Support multiple dice, max 10
        
        // Generate dice rolls
        const rolls = [];
        let total = 0;
        for (let i = 0; i < numDice; i++) {
          const roll = Math.floor(Math.random() * diceType) + 1;
          rolls.push(roll);
          total += roll;
        }
        
        const roomState = gameState.rooms.get(roomId);
        if (!roomState) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Room not found' }));
          return;
        }
        
        roomState.lastRoll = numDice === 1 ? rolls[0] : rolls;
        roomState.rolledBy = data.playerName || 'Anonymous';
        roomState.timestamp = new Date().toLocaleTimeString();
        
        // Add to roll history (keep last 20 rolls)
        roomState.rollHistory.unshift({
          rolls: rolls,
          total: total,
          diceType: diceType,
          numDice: numDice,
          rolledBy: roomState.rolledBy,
          timestamp: roomState.timestamp
        });
        
        if (roomState.rollHistory.length > 20) {
          roomState.rollHistory.pop();
        }
        
        console.log(`${roomState.rolledBy} rolled ${numDice}d${diceType}: [${rolls.join(', ')}] = ${total} in room ${roomId}`);
        
        // Broadcast the roll to all connected clients in the room
        broadcastToRoom(roomId, {
          type: 'diceRolled',
          data: {
            rolls: rolls,
            total: total,
            diceType: diceType,
            numDice: numDice,
            rolledBy: roomState.rolledBy,
            timestamp: roomState.timestamp,
            rollHistory: roomState.rollHistory
          },
          roomId: roomId
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, rolls: rolls, total: total }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    
    return;
  }
  
  // Handle room list endpoint
  if (pathname === '/rooms' && req.method === 'GET') {
    const rooms = Array.from(gameState.rooms.entries()).map(([id, state]) => ({
      id,
      connectedUsers: state.connectedUsers,
      lastActivity: state.timestamp
    }));
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ rooms }));
    return;
  }
  
  // Serve static files
  let filePath = pathname === '/' ? '/public/enhanced-index.html' : pathname;
  
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
    '.json': 'application/json',
    '.ico': 'image/x-icon'
  };
  const contentType = contentTypes[ext] || 'text/plain';
  
  // Read and serve file
  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('File not found');
      return;
    }
    
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// Broadcast message to all SSE connections in a specific room
function broadcastToRoom(roomId, message) {
  const roomConnections = sseConnections.get(roomId);
  if (!roomConnections) return;
  
  const data = `data: ${JSON.stringify(message)}\n\n`;
  roomConnections.forEach((conn, index) => {
    try {
      conn.res.write(data);
    } catch (error) {
      // Remove dead connections
      roomConnections.splice(index, 1);
    }
  });
}

const PORT = process.env.PORT || 3000;

// Function to try different ports if the default is in use
function startServer(port) {
  server.listen(port, () => {
    console.log(`🎲 Enhanced Dice Sync Server running on port ${port}`);
    console.log(`🌐 Open http://localhost:${port} in multiple browser windows to test!`);
    console.log(`✨ Features: Multiple rooms, different dice types, multiple dice rolls`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is in use, trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer(PORT);