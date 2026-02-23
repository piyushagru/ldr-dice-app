// Initialize WebSocket connection
let ws;
let reconnectInterval;

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

// Initialize WebSocket connection
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('Connected to server');
        clearInterval(reconnectInterval);
    };
    
    ws.onmessage = (event) => {
        try {
            const { type, data } = JSON.parse(event.data);
            handleMessage(type, data);
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    };
    
    ws.onclose = () => {
        console.log('Disconnected from server');
        // Attempt to reconnect every 3 seconds
        reconnectInterval = setInterval(() => {
            console.log('Attempting to reconnect...');
            connectWebSocket();
        }, 3000);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

// Handle incoming messages
function handleMessage(type, data) {
    switch (type) {
        case 'gameState':
            userCount.textContent = data.connectedUsers;
            
            if (data.lastRoll) {
                updateDiceDisplay(data.lastRoll, data.rolledBy, data.timestamp);
            }
            
            if (data.rollHistory && data.rollHistory.length > 0) {
                updateRollHistory(data.rollHistory);
            }
            break;
            
        case 'userCount':
            userCount.textContent = data;
            break;
            
        case 'diceRolled':
            updateDiceDisplay(data.value, data.rolledBy, data.timestamp);
            updateRollHistory(data.rollHistory);
            
            // Add visual feedback for new roll
            dice.classList.add('new-roll');
            setTimeout(() => {
                dice.classList.remove('new-roll');
            }, 500);
            break;
    }
}

// Send message to server
function sendMessage(type, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, data }));
    }
}

// Initialize player name from localStorage
const savedName = localStorage.getItem('dicePlayerName');
if (savedName) {
    playerNameInput.value = savedName;
    playerName = savedName;
}

// Handle player name changes
playerNameInput.addEventListener('input', (e) => {
    playerName = e.target.value.trim();
    localStorage.setItem('dicePlayerName', playerName);
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
    sendMessage('rollDice', { playerName });
    
    // Reset button after animation
    setTimeout(() => {
        isRolling = false;
        rollButton.disabled = false;
        rollButton.textContent = 'Roll Dice';
        dice.classList.remove('rolling');
    }, 1000);
}

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

// Initialize WebSocket connection when page loads
connectWebSocket();

console.log('Dice Sync App loaded! Press spacebar or click the button to roll.');