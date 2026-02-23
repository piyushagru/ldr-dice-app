const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

// Create HTTP server
const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/public/simple-index.html' : req.url;
  
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

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Game state
let gameState = {
  lastRoll: null,
  rolledBy: null,
  timestamp: null,
  connectedUsers: 0,
  rollHistory: []
};

// Handle WebSocket connections
wss.on('connection', (ws) => {
  gameState.connectedUsers++;
  console.log(`User connected. Total users: ${gameState.connectedUsers}`);
  
  // Send current game state to new user
  ws.send(JSON.stringify({
    type: 'gameState',
    data: gameState
  }));
  
  // Broadcast user count update
  broadcast({
    type: 'userCount',
    data: gameState.connectedUsers
  });
  
  // Handle messages
  ws.on('message', (message) => {
    try {
      const { type, data } = JSON.parse(message);
      
      if (type === 'rollDice') {
        const diceValue = Math.floor(Math.random() * 6) + 1;
        
        gameState.lastRoll = diceValue;
        gameState.rolledBy = data.playerName || 'Anonymous';
        gameState.timestamp = new Date().toLocaleTimeString();
        
        // Add to roll history (keep last 10 rolls)
        gameState.rollHistory.unshift({
          value: diceValue,
          rolledBy: gameState.rolledBy,
          timestamp: gameState.timestamp
        });
        
        if (gameState.rollHistory.length > 10) {
          gameState.rollHistory.pop();
        }
        
        console.log(`${gameState.rolledBy} rolled: ${diceValue}`);
        
        // Broadcast the roll to all connected clients
        broadcast({
          type: 'diceRolled',
          data: {
            value: diceValue,
            rolledBy: gameState.rolledBy,
            timestamp: gameState.timestamp,
            rollHistory: gameState.rollHistory
          }
        });
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });
  
  // Handle disconnect
  ws.on('close', () => {
    gameState.connectedUsers--;
    console.log(`User disconnected. Total users: ${gameState.connectedUsers}`);
    broadcast({
      type: 'userCount',
      data: gameState.connectedUsers
    });
  });
});

// Broadcast message to all connected clients
function broadcast(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Dice Sync Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in multiple browser windows to test!`);
});