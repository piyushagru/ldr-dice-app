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
const rollStats = {
    totalRolls: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    allRolls: []
};

// Dice face patterns (using Unicode dice symbols)
const diceFaces = {
    1: '⚀',
    2: '⚁',
    3: '⚂',
    4: '⚃',
    5: '⚄',
    6: '⚅'
};

// 3D Dice face rotations to show specific numbers
const diceRotations = {
    1: { x: 0, y: 0, z: 0 },      // front face
    2: { x: 0, y: -90, z: 0 },    // right face  
    3: { x: 0, y: -180, z: 0 },   // back face
    4: { x: 0, y: 90, z: 0 },     // left face
    5: { x: -90, y: 0, z: 0 },    // top face
    6: { x: 90, y: 0, z: 0 }      // bottom face
};

// Current dice states (track what face is currently showing)
let currentDiceStates = {
    dice1: 1, // Start with face 1 showing
    dice2: 1
};

// Calculate optimal rotation path from current state to desired state
function calculateRotationPath(currentFace, targetFace) {
    const current = diceRotations[currentFace];
    const target = diceRotations[targetFace];
    
    // Calculate the shortest rotation path for each axis
    const deltaX = target.x - current.x;
    const deltaY = target.y - current.y;
    const deltaZ = target.z - current.z;
    
    // Normalize rotations to avoid unnecessary full rotations
    const normalizeRotation = (delta) => {
        if (delta > 180) return delta - 360;
        if (delta < -180) return delta + 360;
        return delta;
    };
    
    return {
        x: normalizeRotation(deltaX),
        y: normalizeRotation(deltaY),
        z: normalizeRotation(deltaZ)
    };
}

// Create dynamic CSS animation for state transition
function createStateTransitionAnimation(diceElement, currentFace, targetFace, animationName) {
    const path = calculateRotationPath(currentFace, targetFace);
    const current = diceRotations[currentFace];
    const target = diceRotations[targetFace];
    
    // Create keyframes for smooth tumbling transition
    const keyframes = `
        @keyframes ${animationName} {
            0% { 
                transform: rotateX(${current.x}deg) rotateY(${current.y}deg) rotateZ(${current.z}deg) scale(1);
            }
            25% { 
                transform: rotateX(${current.x + path.x * 0.3}deg) rotateY(${current.y + path.y * 0.3}deg) rotateZ(${current.z + path.z * 0.3}deg) scale(1.02);
            }
            50% { 
                transform: rotateX(${current.x + path.x * 0.6}deg) rotateY(${current.y + path.y * 0.6}deg) rotateZ(${current.z + path.z * 0.6}deg) scale(1.05);
            }
            75% { 
                transform: rotateX(${current.x + path.x * 0.85}deg) rotateY(${current.y + path.y * 0.85}deg) rotateZ(${current.z + path.z * 0.85}deg) scale(1.03);
            }
            100% { 
                transform: rotateX(${target.x}deg) rotateY(${target.y}deg) rotateZ(${target.z}deg) scale(1);
            }
        }
    `;
    
    // Inject the keyframes into the document
    const styleSheet = document.createElement('style');
    styleSheet.textContent = keyframes;
    document.head.appendChild(styleSheet);
    
    // Clean up the style sheet after animation
    setTimeout(() => {
        document.head.removeChild(styleSheet);
    }, 1000);
    
    return animationName;
}

// Generate randomized tumbling path with intermediate states
function generateRandomTumblingPath(currentFace, targetFace) {
    const path = [currentFace];
    
    // Add 2-3 random intermediate faces for realistic tumbling
    const numIntermediateStates = Math.floor(Math.random() * 2) + 2; // 2-3 states
    
    for (let i = 0; i < numIntermediateStates; i++) {
        let randomFace;
        do {
            randomFace = Math.floor(Math.random() * 6) + 1;
        } while (randomFace === path[path.length - 1]); // Avoid consecutive same faces
        
        path.push(randomFace);
    }
    
    // Ensure we end on the target face
    if (path[path.length - 1] !== targetFace) {
        path.push(targetFace);
    }
    
    return path;
}

// FIXED: Clean physics-based dice animation - no unnecessary rotations
function animateDiceWithPhysics(diceElement, diceKey, targetFace) {
    const currentFace = currentDiceStates[diceKey];
    
    if (currentFace === targetFace) {
        // Already at target state, just ensure correct transform
        const target = diceRotations[targetFace];
        diceElement.style.transform = `rotateX(${target.x}deg) rotateY(${target.y}deg) rotateZ(${target.z}deg)`;
        return Promise.resolve();
    }
    
    // Calculate optimal rotation path from current to target
    const currentRotation = diceRotations[currentFace];
    const targetRotation = diceRotations[targetFace];
    
    // FIXED: Use the calculated optimal path directly - no random extra rotations
    const path = calculateRotationPath(currentFace, targetFace);
    
    // Add ONE controlled tumble for realism (not random chaos)
    const tumbleAmount = 360; // Single controlled rotation for visual appeal
    let finalX = targetRotation.x + tumbleAmount;
    let finalY = targetRotation.y + tumbleAmount;
    let finalZ = targetRotation.z;
    
    // Create smooth animation using the optimal path
    return anime({
        targets: diceElement,
        rotateX: finalX,
        rotateY: finalY,
        rotateZ: finalZ,
        scale: [1, 1.1, 1], // Keep the nice bounce effect
        duration: 800, // Consistent timing
        easing: 'easeOutElastic(1, .6)',
        complete: () => {
            // CRITICAL: Set final state correctly (without extra rotations)
            diceElement.style.transform = `rotateX(${targetRotation.x}deg) rotateY(${targetRotation.y}deg) rotateZ(${targetRotation.z}deg)`;
            currentDiceStates[diceKey] = targetFace;
        }
    }).finished;
}

// Apply physics-based transition to dice
function transitionDiceToState(diceElement, diceKey, targetFace) {
    return animateDiceWithPhysics(diceElement, diceKey, targetFace);
}

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
            // Check if this is our own roll and we're currently rolling
            const isOwnRoll = data.rolledBy === playerName;
            
            if (isOwnRoll && isRolling) {
                // Store the result to apply after animation completes
                window.pendingDiceResult = {
                    rolls: data.rolls,
                    total: data.total,
                    numDice: data.numDice,
                    rolledBy: data.rolledBy,
                    timestamp: data.timestamp
                };
                // The result will be applied when the animation completes in rollDice()
            } else {
                // For other players' rolls or when not rolling, update immediately
                updateDiceDisplay(data.rolls, data.total, data.numDice, data.rolledBy, data.timestamp);
                
                // Add visual feedback for new roll
                dice1.classList.add('new-roll');
                if (data.numDice === 2) {
                    dice2.classList.add('new-roll');
                }
                setTimeout(() => {
                    dice1.classList.remove('new-roll');
                    dice2.classList.remove('new-roll');
                }, 800);
            }
            
            updateRollHistory(data.rollHistory);
            
            // Update stats for all rolls (including other players)
            updateStats(data.rolls);
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
    if (isRolling) return; // Prevent multiple rolls
    
    isRolling = true;
    
    // Clear any pending result
    window.pendingDiceResult = null;
    
    // Get selected number of dice
    const numDice = parseInt(document.querySelector('input[name="numDice"]:checked').value);
    
    // Disable dice container to prevent clicks during animation (Android-style)
    diceContainer.style.pointerEvents = 'none';
    
    // Android-style sequential animation: First phase (200ms)
    dice1.classList.add('rolling');
    if (numDice === 2) {
        dice2.classList.add('rolling');
    }
    
    // Send roll request to server
    sendRollRequest(playerName, numDice);
    
    // Android-style sequential animation: Second phase after 200ms
    setTimeout(() => {
        dice1.classList.remove('rolling');
        dice1.classList.add('rolling-fast');
        
        if (numDice === 2) {
            dice2.classList.remove('rolling');
            dice2.classList.add('rolling-fast');
        }
        
        // Clean up after fast animation (100ms)
        setTimeout(() => {
            dice1.classList.remove('rolling-fast');
            dice2.classList.remove('rolling-fast');
            
            // Apply the pending result immediately after animation ends
            if (window.pendingDiceResult) {
                const result = window.pendingDiceResult;
                
                // Apply the result immediately with smooth transition
                updateDiceDisplay(result.rolls, result.total, result.numDice, result.rolledBy, result.timestamp);
                
                // Add new-roll pulse effect after a brief moment
                setTimeout(() => {
                    dice1.classList.add('new-roll');
                    if (result.numDice === 2) {
                        dice2.classList.add('new-roll');
                    }
                    setTimeout(() => {
                        dice1.classList.remove('new-roll');
                        dice2.classList.remove('new-roll');
                    }, 600);
                }, 50);
                
                // Clear the pending result
                window.pendingDiceResult = null;
            }
            
            isRolling = false;
            // Re-enable dice container after 2 seconds (Android-style)
            setTimeout(() => {
                diceContainer.style.pointerEvents = 'auto';
            }, 1700); // Total 2 seconds like Android app
            
        }, 100); // Fast animation duration
    }, 200); // First animation duration
}


// Smooth dice display update with transition
function updateDiceDisplaySmooth(rolls, total, numDice, rolledBy, timestamp) {
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

// Update dice display with state-based transitions
function updateDiceDisplay(rolls, total, numDice, rolledBy, timestamp) {
    // Handle both single value (legacy) and array of rolls
    if (typeof rolls === 'number') {
        // Legacy single dice display - use state transition
        transitionDiceToState(dice1, 'dice1', rolls);
        dice2.style.display = 'none';
        
        const isOwnRoll = rolledBy === playerName;
        const rollText = isOwnRoll ? 'You' : rolledBy;
        
        lastRoll.innerHTML = `
            <p><strong>${rollText}</strong> rolled <span class="roll-value">${rolls}</span></p>
            <small>at ${timestamp}</small>
        `;
    } else {
        // Multiple dice display - use state transitions for both dice
        const isOwnRoll = rolledBy === playerName;
        const rollText = isOwnRoll ? 'You' : rolledBy;
        
        if (numDice === 1) {
            // Single dice
            transitionDiceToState(dice1, 'dice1', rolls[0]);
            dice2.style.display = 'none';
            
            lastRoll.innerHTML = `
                <p><strong>${rollText}</strong> rolled <span class="roll-value">${rolls[0]}</span></p>
                <small>at ${timestamp}</small>
            `;
        } else {
            // Two dice - transition both to their target states
            transitionDiceToState(dice1, 'dice1', rolls[0]);
            transitionDiceToState(dice2, 'dice2', rolls[1]);
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
    const rollArray = Array.isArray(rolls) ? rolls : [rolls];
    
    // Add each individual dice roll to stats
    rollArray.forEach(roll => {
        rollStats.totalRolls++;
        rollStats.distribution[roll]++;
        rollStats.allRolls.push(roll);
    });
    
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

// Stats panel collapse functionality
document.addEventListener('DOMContentLoaded', () => {
    const statsHeader = document.querySelector('.stats-header');
    const statsContent = document.querySelector('.stats-content');
    
    if (statsHeader && statsContent) {
        statsHeader.addEventListener('click', (e) => {
            e.stopPropagation();
            
            const isCollapsed = statsContent.style.display === 'none';
            statsContent.style.display = isCollapsed ? 'flex' : 'none';
            statsHeader.textContent = isCollapsed ? 'Stats' : 'Stats +';
        });
    }
});

// Initialize SSE connection when page loads
connectSSE();

console.log('Dice Sync App loaded! Press spacebar or click the dice to roll.');
