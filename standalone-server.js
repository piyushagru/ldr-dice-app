const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Game state
let gameState = {
  lastRoll: null,
  rolledBy: null,
  timestamp: null,
  connectedUsers: 0,
  rollHistory: []
};

// Store SSE connections
let sseConnections = [];

// Create HTTP server
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  
  // Handle SSE endpoint
  if (pathname === '/events') {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });
    
    // Add connection to list
    sseConnections.push(res);
    gameState.connectedUsers++;
    
    // Send current game state
    res.write(`data: ${JSON.stringify({
      type: 'gameState',
      data: gameState
    })}\n\n`);
    
    // Broadcast user count update
    broadcastSSE({
      type: 'userCount',
      data: gameState.connectedUsers
    });
    
    // Handle client disconnect
    req.on('close', () => {
      const index = sseConnections.indexOf(res);
      if (index !== -1) {
        sseConnections.splice(index, 1);
        gameState.connectedUsers--;
        broadcastSSE({
          type: 'userCount',
          data: gameState.connectedUsers
        });
      }
    });
    
    return;
  }
  
  // Handle dice roll endpoint
  if (pathname === '/roll' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const numDice = Math.min(Math.max(data.numDice || 1, 1), 2); // Support 1 or 2 dice
        
        // Generate dice rolls
        const rolls = [];
        let total = 0;
        for (let i = 0; i < numDice; i++) {
          const roll = Math.floor(Math.random() * 6) + 1;
          rolls.push(roll);
          total += roll;
        }
        
        gameState.lastRoll = numDice === 1 ? rolls[0] : rolls;
        gameState.rolledBy = data.playerName || 'Anonymous';
        gameState.timestamp = new Date().toLocaleTimeString();
        
        // Add to roll history (keep last 15 rolls)
        gameState.rollHistory.unshift({
          rolls: rolls,
          total: total,
          numDice: numDice,
          rolledBy: gameState.rolledBy,
          timestamp: gameState.timestamp
        });
        
        if (gameState.rollHistory.length > 15) {
          gameState.rollHistory.pop();
        }
        
        console.log(`${gameState.rolledBy} rolled ${numDice} dice: [${rolls.join(', ')}] = ${total}`);
        
        // Broadcast the roll to all connected clients
        broadcastSSE({
          type: 'diceRolled',
          data: {
            rolls: rolls,
            total: total,
            numDice: numDice,
            rolledBy: gameState.rolledBy,
            timestamp: gameState.timestamp,
            rollHistory: gameState.rollHistory
          }
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
  
  // Serve static files
  let filePath;
  if (pathname === '/') {
    filePath = '/public/standalone-index.html';
  } else if (pathname.startsWith('/public/')) {
    filePath = pathname;
  } else {
    // For files like style.css, standalone-script.js, serve from public directory
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

// Broadcast message to all SSE connections
function broadcastSSE(message) {
  const data = `data: ${JSON.stringify(message)}\n\n`;
  sseConnections.forEach((res, index) => {
    try {
      res.write(data);
    } catch (error) {
      // Remove dead connections
      sseConnections.splice(index, 1);
    }
  });
}

const PORT = process.env.PORT || 3000;

// Function to try different ports if the default is in use
function startServer(port) {
  server.listen(port, () => {
    console.log(`Dice Sync Server running on port ${port}`);
    console.log(`Open http://localhost:${port} in multiple browser windows to test!`);
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
