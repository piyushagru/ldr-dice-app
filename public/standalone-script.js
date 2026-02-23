// Initialize Server-Sent Events connection
let eventSource;

// DOM elements
const playerNameInput = document.getElementById('playerName');
const dice1 = document.getElementById('dice1');
const dice2 = document.getElementById('dice2');
const diceContainer = document.getElementById('diceContainer');
const lastRoll = document.getElementById('lastRoll');
const rollHistory = document.getElementById('rollHistory');
const userCount = document.getElementById('userCount');

// Player state
let playerName = '';
let isRolling = false;

// Stats tracking
let rollStats = {
    totalRolls: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    allRolls: []
};

// Dice face patterns (using dots)
const diceFaces = {
    1: '⚀',
    2: '⚁',
    3: '⚂',
    4: '⚃',
    5: '⚄',
    6: '⚅'
};

// Initialize SSE connection
function connectSSE() {
    eventSource = new EventSource('/events');
    
    eventSource.onopen = () => {
        console.log('Connected to server via SSE');
    };
    
    eventSource.onmessage = (event) => {
        try {
            const { type, data } = JSON.parse(event.data);
            handleMessage(type, data);
        } catch (error) {
            console.error('Error parsing SSE message:', error);
        }
    };
    
    eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        // Attempt to reconnect after 3 seconds
        setTimeout(() => {
            console.log('Attempting to reconnect...');
            eventSource.close();
            connectSSE();
        }, 3000);
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
            updateDiceDisplay(data.rolls, data.total, data.numDice, data.rolledBy, data.timestamp);
            updateRollHistory(data.rollHistory);
            
            // Update stats for all rolls (including other players)
            updateStats(data.rolls);
            
            // Add visual feedback for new roll
            dice1.classList.add('new-roll');
            if (data.numDice === 2) {
                dice2.classList.add('new-roll');
            }
            setTimeout(() => {
                dice1.classList.remove('new-roll');
                dice2.classList.remove('new-roll');
            }, 800);
            break;
    }
}

// Send dice roll request to server
async function sendRollRequest(playerName, numDice) {
    try {
        const response = await fetch('/roll', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ playerName, numDice })
        });
        
        if (!response.ok) {
            throw new Error('Failed to roll dice');
        }
        
        const result = await response.json();
        console.log('Roll result:', result);
    } catch (error) {
        console.error('Error rolling dice:', error);
        alert('Failed to roll dice. Please try again.');
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

// Handle dice selection change
document.querySelectorAll('input[name="numDice"]').forEach(radio => {
    radio.addEventListener('change', () => {
        const numDice = parseInt(radio.value);
        if (numDice === 1) {
            dice1.style.display = 'block';
            dice2.style.display = 'none';
        } else {
            dice1.style.display = 'block';
            dice2.style.display = 'block';
        }
    });
});

// Handle dice click
diceContainer.addEventListener('click', () => {
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
    
    // Get selected number of dice
    const numDice = parseInt(document.querySelector('input[name="numDice"]:checked').value);
    
    // Add rolling animation to active dice
    dice1.classList.add('rolling');
    if (numDice === 2) {
        dice2.classList.add('rolling');
    }
    
    // Send roll request to server
    sendRollRequest(playerName, numDice);
    
    // Reset after animation
    setTimeout(() => {
        isRolling = false;
        dice1.classList.remove('rolling');
        dice2.classList.remove('rolling');
    }, 1200);
}

// 3D Dice face rotations to show specific numbers
const diceRotations = {
    1: 'rotateX(0deg) rotateY(0deg)',      // front face
    2: 'rotateX(0deg) rotateY(-90deg)',    // right face  
    3: 'rotateX(0deg) rotateY(-180deg)',   // back face
    4: 'rotateX(0deg) rotateY(90deg)',     // left face
    5: 'rotateX(-90deg) rotateY(0deg)',    // top face
    6: 'rotateX(90deg) rotateY(0deg)'      // bottom face
};

// Update dice display
function updateDiceDisplay(rolls, total, numDice, rolledBy, timestamp) {
    // Handle both single value (legacy) and array of rolls
    if (typeof rolls === 'number') {
        // Legacy single dice display - rotate to show the correct face
        dice1.style.transform = diceRotations[rolls];
        dice2.style.display = 'none';
        
        const isOwnRoll = rolledBy === playerName;
        const rollText = isOwnRoll ? 'You' : rolledBy;
        
        lastRoll.innerHTML = `
            <p><strong>${rollText}</strong> rolled <span class="roll-value">${rolls}</span></p>
            <small>at ${timestamp}</small>
        `;
    } else {
        // Multiple dice display - handle both dice properly
        const isOwnRoll = rolledBy === playerName;
        const rollText = isOwnRoll ? 'You' : rolledBy;
        
        if (numDice === 1) {
            // Single dice
            dice1.style.transform = diceRotations[rolls[0]];
            dice2.style.display = 'none';
            
            lastRoll.innerHTML = `
                <p><strong>${rollText}</strong> rolled <span class="roll-value">${rolls[0]}</span></p>
                <small>at ${timestamp}</small>
            `;
        } else {
            // Two dice
            dice1.style.transform = diceRotations[rolls[0]];
            dice2.style.transform = diceRotations[rolls[1]];
            dice2.style.display = 'block';
            
            lastRoll.innerHTML = `
                <p><strong>${rollText}</strong> rolled <span class="roll-value">[${rolls.join(', ')}] = ${total}</span></p>
                <small>at ${timestamp}</small>
            `;
        }
    }
    
    const isOwnRoll = rolledBy === playerName;
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
        
        // Handle both old format (single value) and new format (multiple dice)
        if (roll.rolls) {
            const diceSymbols = roll.rolls.map(r => diceFaces[r]).join(' ');
            const rollDisplay = roll.numDice === 1 ? 
                `${roll.rolls[0]}` : 
                `[${roll.rolls.join(', ')}] = ${roll.total}`;
            
            return `
                <div class="history-item ${isOwnRoll ? 'own-roll' : 'other-roll'}">
                    <span class="history-value">${diceSymbols}</span>
                    <span class="history-details">
                        <strong>${rollText}</strong> rolled ${rollDisplay}
                        <small>${roll.timestamp}</small>
                    </span>
                </div>
            `;
        } else {
            // Legacy format
            return `
                <div class="history-item ${isOwnRoll ? 'own-roll' : 'other-roll'}">
                    <span class="history-value">${diceFaces[roll.value]}</span>
                    <span class="history-details">
                        <strong>${rollText}</strong> rolled ${roll.value}
                        <small>${roll.timestamp}</small>
                    </span>
                </div>
            `;
        }
    }).join('');
}

// Handle Enter key in name input
playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        diceContainer.focus();
    }
});

// Handle spacebar for rolling
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !isRolling && playerName) {
        e.preventDefault();
        rollDice();
    }
});

// Update stats with new rolls
function updateStats(rolls) {
    // Handle both single value and array
    const rollArray = Array.isArray(rolls) ? rolls : [rolls];
    
    // Add each individual dice roll to stats
    rollArray.forEach(roll => {
        rollStats.totalRolls++;
        rollStats.distribution[roll]++;
        rollStats.allRolls.push(roll);
    });
    
    // Update the stats display
    updateStatsDisplay();
}

// Calculate and update stats display
function updateStatsDisplay() {
    // Update total rolls
    document.getElementById('totalRolls').textContent = rollStats.totalRolls;
    
    if (rollStats.totalRolls === 0) {
        return; // No rolls yet
    }
    
    // Calculate average
    const sum = rollStats.allRolls.reduce((a, b) => a + b, 0);
    const average = (sum / rollStats.allRolls.length).toFixed(2);
    document.getElementById('avgRoll').textContent = average;
    
    // Find most and least rolled numbers
    const counts = rollStats.distribution;
    const maxCount = Math.max(...Object.values(counts));
    const minCount = Math.min(...Object.values(counts).filter(c => c > 0));
    
    const mostRolled = Object.keys(counts).filter(k => counts[k] === maxCount);
    const leastRolled = Object.keys(counts).filter(k => counts[k] === minCount && counts[k] > 0);
    
    document.getElementById('mostRolled').textContent = mostRolled.join(', ') + ` (${maxCount}x)`;
    document.getElementById('leastRolled').textContent = leastRolled.length > 0 ? 
        leastRolled.join(', ') + ` (${minCount}x)` : '-';
    
    // Calculate randomness score (chi-square test approximation)
    const expected = rollStats.totalRolls / 6;
    let chiSquare = 0;
    for (let i = 1; i <= 6; i++) {
        const observed = counts[i];
        chiSquare += Math.pow(observed - expected, 2) / expected;
    }
    
    // Convert to percentage (lower chi-square = more random)
    // Perfect randomness would be 0, higher values indicate less randomness
    const randomnessScore = Math.max(0, Math.min(100, 100 - (chiSquare * 2)));
    document.getElementById('randomnessScore').textContent = randomnessScore.toFixed(1) + '%';
    
    // Update distribution bars
    const maxBarCount = Math.max(...Object.values(counts));
    for (let i = 1; i <= 6; i++) {
        const bar = document.getElementById(`bar${i}`);
        const percentage = maxBarCount > 0 ? (counts[i] / maxBarCount) * 100 : 0;
        bar.style.height = Math.max(2, percentage) + '%';
        bar.title = `${i}: ${counts[i]} rolls (${((counts[i] / rollStats.totalRolls) * 100).toFixed(1)}%)`;
    }
}

// Initialize SSE connection when page loads
connectSSE();

console.log('Dice Sync App loaded! Press spacebar or click the dice to roll.');
