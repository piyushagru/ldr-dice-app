// Initialize Socket.IO connection
const socket = io();

// DOM elements
const playerNameInput = document.getElementById('playerName');
const rollButton = document.getElementById('rollButton');
const dice = document.getElementById('dice');
const diceFace = document.getElementById('diceFace');
const lastRoll = document.getElementById('lastRoll');
const rollHistory = document.getElementById('rollHistory');
const userCount = document.getElementById('userCount');

// Player state
let playerName = '';
let isRolling = false;

// Dice face patterns (using dots)
const diceFaces = {
    1: '⚀',
    2: '⚁',
    3: '⚂',
    4: '⚃',
    5: '⚄',
    6: '⚅'
};

// Initialize player name from localStorage
const savedName = localStorage.getItem('dicePlayerName');
if (savedName) {
    playerNameInput.value = savedName;
    playerName = savedName;
    socket.emit('updatePlayerName', { playerName });
}

// Handle player name changes
playerNameInput.addEventListener('input', (e) => {
    playerName = e.target.value.trim();
    localStorage.setItem('dicePlayerName', playerName);
    socket.emit('updatePlayerName', { playerName });
});

// Handle dice roll button click
rollButton.addEventListener('click', () => {
    if (isRolling) return;
    
    if (!playerName) {
        alert('Please enter your name first!');
        playerNameInput.focus();
        return;
    }
    
    rollDice();
});

// Roll dice function
function rollDice() {
    isRolling = true;
    rollButton.disabled = true;
    rollButton.textContent = 'Rolling...';
    
    // Add rolling animation
    dice.classList.add('rolling');
    diceFace.textContent = '🎲';
    
    // Send roll request to server
    socket.emit('rollDice', { playerName });
    
    // Reset button after animation
    setTimeout(() => {
        isRolling = false;
        rollButton.disabled = false;
        rollButton.textContent = 'Roll Dice';
        dice.classList.remove('rolling');
    }, 1000);
}

// Socket event listeners
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('gameState', (state) => {
    userCount.textContent = state.connectedUsers;
    
    if (state.lastRoll) {
        updateDiceDisplay(state.lastRoll, state.rolledBy, state.timestamp);
    }
    
    if (state.rollHistory && state.rollHistory.length > 0) {
        updateRollHistory(state.rollHistory);
    }
});

socket.on('userCount', (count) => {
    userCount.textContent = count;
});

socket.on('diceRolled', (data) => {
    updateDiceDisplay(data.value, data.rolledBy, data.timestamp);
    updateRollHistory(data.rollHistory);
    
    // Add visual feedback for new roll
    dice.classList.add('new-roll');
    setTimeout(() => {
        dice.classList.remove('new-roll');
    }, 500);
});

// Update dice display
function updateDiceDisplay(value, rolledBy, timestamp) {
    diceFace.textContent = diceFaces[value];
    
    const isOwnRoll = rolledBy === playerName;
    const rollText = isOwnRoll ? 'You' : rolledBy;
    
    lastRoll.innerHTML = `
        <p><strong>${rollText}</strong> rolled <span class="roll-value">${value}</span></p>
        <small>at ${timestamp}</small>
    `;
    
    lastRoll.className = `last-roll ${isOwnRoll ? 'own-roll' : 'other-roll'}`;
}

// Update roll history
function updateRollHistory(history) {
    if (!history || history.length === 0) {
        rollHistory.innerHTML = '<p class="no-history">No rolls yet...</p>';
        return;
    }
    
    rollHistory.innerHTML = history.map(roll => {
        const isOwnRoll = roll.rolledBy === playerName;
        const rollText = isOwnRoll ? 'You' : roll.rolledBy;
        
        return `
            <div class="history-item ${isOwnRoll ? 'own-roll' : 'other-roll'}">
                <span class="history-value">${diceFaces[roll.value]}</span>
                <span class="history-details">
                    <strong>${rollText}</strong> rolled ${roll.value}
                    <small>${roll.timestamp}</small>
                </span>
            </div>
        `;
    }).join('');
}

// Handle Enter key in name input
playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        rollButton.focus();
    }
});

// Handle spacebar for rolling
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !isRolling && playerName) {
        e.preventDefault();
        rollDice();
    }
});

console.log('Dice Sync App loaded! Press spacebar or click the button to roll.');