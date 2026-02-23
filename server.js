const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store game state
let gameState = {
  lastRoll: null,
  rolledBy: null,
  timestamp: null,
  connectedUsers: 0,
  rollHistory: []
};

// Handle socket connections
io.on('connection', (socket) => {
  gameState.connectedUsers++;
  console.log(`User connected. Total users: ${gameState.connectedUsers}`);
  
  // Send current game state to new user
  socket.emit('gameState', gameState);
  
  // Broadcast user count update
  io.emit('userCount', gameState.connectedUsers);
  
  // Handle dice roll
  socket.on('rollDice', (data) => {
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
    io.emit('diceRolled', {
      value: diceValue,
      rolledBy: gameState.rolledBy,
      timestamp: gameState.timestamp,
      rollHistory: gameState.rollHistory
    });
  });
  
  // Handle player name update
  socket.on('updatePlayerName', (data) => {
    socket.playerName = data.playerName;
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    gameState.connectedUsers--;
    console.log(`User disconnected. Total users: ${gameState.connectedUsers}`);
    io.emit('userCount', gameState.connectedUsers);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Dice Sync Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in multiple browser windows to test!`);
});