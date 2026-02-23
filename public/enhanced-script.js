// Enhanced Dice Sync Client with amazing features
let eventSource;
let currentRoom = 'default';
let playerName = '';
let isRolling = false;

// DOM elements
const playerNameInput = document.getElementById('playerName');
const roomInput = document.getElementById('roomInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');
