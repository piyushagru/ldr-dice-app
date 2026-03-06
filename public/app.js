// ─── SSE connection ───────────────────────────────────────────────────────────
let eventSource;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const playerNameInput = document.getElementById('playerName');
const dice1            = document.getElementById('dice1');
const dice2            = document.getElementById('dice2');
const wrapper1         = document.getElementById('wrapper1');
const wrapper2         = document.getElementById('wrapper2');
const diceContainer    = document.getElementById('diceContainer');
const lastRoll         = document.getElementById('lastRoll');
const rollHistory      = document.getElementById('rollHistory');
const userCount        = document.getElementById('userCount');

// ─── State ────────────────────────────────────────────────────────────────────
let playerName = '';
let isRolling  = false;

// What face (1-6) is currently showing on each die
let currentFace = { dice1: 1, dice2: 1 };

// ─── Dice geometry ────────────────────────────────────────────────────────────
// rotateX / rotateY values that bring each face to the front
const FACE_ROTATION = {
  1: { x:   0, y:   0 },   // front
  2: { x:   0, y: -90 },   // right
  3: { x:   0, y: 180 },   // back
  4: { x:   0, y:  90 },   // left
  5: { x: -90, y:   0 },   // top
  6: { x:  90, y:   0 },   // bottom
};

const DICE_SYMBOLS = { 1:'⚀', 2:'⚁', 3:'⚂', 4:'⚃', 5:'⚄', 6:'⚅' };

// ─── Rotation accumulator ─────────────────────────────────────────────────────
// Tracks total accumulated degrees on each axis so we never reset mid-tumble.
let accumulated = {
  dice1: { x: 0, y: 0 },
  dice2: { x: 0, y: 0 },
};

// ─── Core: instant snap to a face (load / reconnect) ─────────────────────────
function snapToFace(el, diceKey, face) {
  const { x, y } = FACE_ROTATION[face];
  accumulated[diceKey] = { x, y };
  el.style.transition  = 'none';
  el.style.transform   = `rotateX(${x}deg) rotateY(${y}deg)`;
}

// ─── Core: free-tumble step (intermediate) ────────────────────────────────────
// Spins on a random axis by ±90° or ±180° — visually interesting, doesn't need
// to land on a real face, so no gimbal issues.
function tumbleStep(el, diceKey, durationMs) {
  const acc    = accumulated[diceKey];
  const axes   = ['x', 'y'];
  const axis   = axes[Math.floor(Math.random() * 2)];
  const angles = [-180, -90, 90, 180];
  const delta  = angles[Math.floor(Math.random() * angles.length)];

  acc[axis] += delta;

  el.style.transition = `transform ${durationMs}ms cubic-bezier(0.4, 0, 0.6, 1)`;
  el.style.transform  = `rotateX(${acc.x}deg) rotateY(${acc.y}deg)`;
}

// ─── Core: smooth landing on an exact face ────────────────────────────────────
// Rounds accumulated angles to the nearest multiple of 90, then adds the exact
// canonical delta so the die lands pixel-perfectly on the target face.
function landOnFace(el, diceKey, face, durationMs) {
  const { x: tx, y: ty } = FACE_ROTATION[face];
  const acc = accumulated[diceKey];

  // Snap accumulated to nearest 90° multiple to eliminate drift
  const baseX = Math.round(acc.x / 90) * 90;
  const baseY = Math.round(acc.y / 90) * 90;

  // Shortest delta from rounded base to target
  let dx = tx - ((baseX % 360 + 360) % 360);
  let dy = ty - ((baseY % 360 + 360) % 360);
  if (dx >  180) dx -= 360;  if (dx < -180) dx += 360;
  if (dy >  180) dy -= 360;  if (dy < -180) dy += 360;

  acc.x = baseX + dx;
  acc.y = baseY + dy;

  el.style.transition = `transform ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
  el.style.transform  = `rotateX(${acc.x}deg) rotateY(${acc.y}deg)`;
}

// ─── Roll animation ───────────────────────────────────────────────────────────
//
//  Phase 1 – rapid tumble  (free-spin, 7 steps × 80 ms)
//  Phase 2 – slow-down     (free-spin, 4 steps, each ×1.65 longer)
//  Phase 3 – land          (exact face, 380 ms ease-out)
//
function playRollAnimation(diceEl, diceKey, targetFace) {
  return new Promise(resolve => {
    const RAPID_STEPS    = 7;
    const SLOWDOWN_STEPS = 4;
    const BASE_MS        = 80;
    const SLOWDOWN_MULT  = 1.65;

    diceEl.classList.add('is-rolling');

    let step = 0;
    const totalFastSteps = RAPID_STEPS + SLOWDOWN_STEPS;

    function nextStep() {
      if (step < RAPID_STEPS) {
        tumbleStep(diceEl, diceKey, BASE_MS * 0.9);
        step++;
        setTimeout(nextStep, BASE_MS);

      } else if (step < totalFastSteps) {
        const slowIndex = step - RAPID_STEPS;
        const stepMs    = BASE_MS * Math.pow(SLOWDOWN_MULT, slowIndex + 1);
        tumbleStep(diceEl, diceKey, stepMs * 0.85);
        step++;
        setTimeout(nextStep, stepMs);

      } else {
        // Guaranteed correct landing
        const landMs = 420;
        landOnFace(diceEl, diceKey, targetFace, landMs);
        currentFace[diceKey] = targetFace;
        setTimeout(() => {
          diceEl.classList.remove('is-rolling');
          resolve();
        }, landMs + 60);
      }
    }

    nextStep();
  });
}

// ─── Roll both/one die and reveal result ──────────────────────────────────────
async function animateAndReveal(rolls, total, numDice, rolledBy, timestamp) {
  const animations = [playRollAnimation(dice1, 'dice1', rolls[0])];
  if (numDice === 2) animations.push(playRollAnimation(dice2, 'dice2', rolls[1]));

  await Promise.all(animations);

  // Show result text after dice settle
  showResultText(rolls, total, numDice, rolledBy, timestamp);

  // Subtle pulse on the wrapper (safe — no preserve-3d)
  pulseEffect(wrapper1);
  if (numDice === 2) pulseEffect(wrapper2);
}

// ─── Pulse effect (on wrapper, not the preserve-3d element) ───────────────────
function pulseEffect(wrapperEl) {
  wrapperEl.classList.remove('result-pulse');
  void wrapperEl.offsetWidth;
  wrapperEl.classList.add('result-pulse');
  setTimeout(() => wrapperEl.classList.remove('result-pulse'), 500);
}

// ─── Result text ──────────────────────────────────────────────────────────────
function showResultText(rolls, total, numDice, rolledBy, timestamp) {
  const isOwn     = rolledBy === playerName;
  const byLabel   = isOwn ? 'You' : rolledBy;
  const rollLabel = numDice === 1
    ? `<span class="roll-value">${rolls[0]}</span>`
    : `<span class="roll-value">[${rolls.join(', ')}] = ${total}</span>`;

  lastRoll.innerHTML = `
    <p><strong>${byLabel}</strong> rolled ${rollLabel}</p>
    <small>at ${timestamp}</small>
  `;
  lastRoll.className = `last-roll ${isOwn ? 'own-roll' : 'other-roll'}`;
}

// ─── Full update path (own + other players) ───────────────────────────────────
function updateDiceDisplay(rolls, total, numDice, rolledBy, timestamp) {
  // Normalise legacy single-number format
  const rollArr   = Array.isArray(rolls) ? rolls : [rolls];
  const diceCount = numDice || rollArr.length;

  // Show/hide second die (via wrapper)
  wrapper2.style.display = diceCount === 2 ? 'block' : 'none';

  animateAndReveal(rollArr, total, diceCount, rolledBy, timestamp);
}

// ─── Roll dice (own player) ───────────────────────────────────────────────────
async function rollDice() {
  if (isRolling) return;
  if (!playerName) {
    alert('Please enter your name first!');
    playerNameInput.focus();
    return;
  }

  isRolling = true;
  diceContainer.style.pointerEvents = 'none';

  const numDice = parseInt(document.querySelector('input[name="numDice"]:checked').value);

  // Fire the server request; result comes back via SSE
  await sendRollRequest(playerName, numDice);
}

// ─── SSE message handler ──────────────────────────────────────────────────────
function handleMessage(type, data) {
  switch (type) {
    case 'gameState':
      userCount.textContent = data.connectedUsers;
      if (data.lastRoll) {
        // On reconnect just snap to last known state without animation
        const r = Array.isArray(data.lastRoll) ? data.lastRoll : [data.lastRoll];
        r.forEach((face, i) => {
          const el  = i === 0 ? dice1 : dice2;
          const key = i === 0 ? 'dice1' : 'dice2';
          snapToFace(el, key, face);
          currentFace[key] = face;
        });
        if (data.rollHistory && data.rollHistory.length > 0) {
          const last = data.rollHistory[0];
          showResultText(r, last.total, r.length, data.rolledBy, data.timestamp);
          updateRollHistory(data.rollHistory);
        }
      }
      break;

    case 'userCount':
      userCount.textContent = data;
      break;

    case 'diceRolled': {
      const rolls    = data.rolls;
      const isOwn    = data.rolledBy === playerName;
      const numDice  = data.numDice;

      // Show/hide second die before animation (via wrapper)
      wrapper2.style.display = numDice === 2 ? 'block' : 'none';

      animateAndReveal(rolls, data.total, numDice, data.rolledBy, data.timestamp)
        .then(() => {
          if (isOwn) {
            // Re-enable after our own animation completes
            isRolling = false;
            diceContainer.style.pointerEvents = 'auto';
          }
        });

      updateRollHistory(data.rollHistory);
      updateStats(rolls);
      break;
    }
  }
}

// ─── Server request ───────────────────────────────────────────────────────────
async function sendRollRequest(name, numDice) {
  try {
    const res = await fetch('/roll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName: name, numDice })
    });
    if (!res.ok) throw new Error('Server error');
  } catch (err) {
    console.error('Roll failed:', err);
    alert('Failed to roll. Please try again.');
    isRolling = false;
    diceContainer.style.pointerEvents = 'auto';
  }
}

// ─── SSE connection ───────────────────────────────────────────────────────────
function connectSSE() {
  eventSource = new EventSource('/events');

  eventSource.onopen = () => console.log('SSE connected');

  eventSource.onmessage = (event) => {
    try {
      const { type, data } = JSON.parse(event.data);
      handleMessage(type, data);
    } catch (e) {
      console.error('SSE parse error:', e);
    }
  };

  eventSource.onerror = () => {
    console.warn('SSE error, reconnecting in 3s…');
    eventSource.close();
    setTimeout(connectSSE, 3000);
  };
}

// ─── Roll history ─────────────────────────────────────────────────────────────
function updateRollHistory(history) {
  if (!history || history.length === 0) {
    rollHistory.innerHTML = '<p class="no-history">No rolls yet…</p>';
    return;
  }

  rollHistory.innerHTML = history.map(roll => {
    const isOwn    = roll.rolledBy === playerName;
    const byLabel  = isOwn ? 'You' : roll.rolledBy;
    const symbols  = roll.rolls.map(r => DICE_SYMBOLS[r]).join(' ');
    const display  = roll.numDice === 1
      ? `${roll.rolls[0]}`
      : `[${roll.rolls.join(', ')}] = ${roll.total}`;

    return `
      <div class="history-item ${isOwn ? 'own-roll' : 'other-roll'}">
        <span class="history-value">${symbols}</span>
        <span class="history-details">
          <strong>${byLabel}</strong> rolled ${display}
          <small>${roll.timestamp}</small>
        </span>
      </div>`;
  }).join('');
}

// ─── Stats — delegated to stats.js (window.Stats) ────────────────────────────
function updateStats(rolls) {
  window.Stats.update(rolls);
}

// ─── Event listeners ──────────────────────────────────────────────────────────
// Restore saved name
const savedName = localStorage.getItem('dicePlayerName');
if (savedName) { playerNameInput.value = savedName; playerName = savedName; }

playerNameInput.addEventListener('input', e => {
  playerName = e.target.value.trim();
  localStorage.setItem('dicePlayerName', playerName);
});

// Dice count toggle
document.querySelectorAll('input[name="numDice"]').forEach(radio => {
  radio.addEventListener('change', () => {
    wrapper2.style.display = radio.value === '2' ? 'block' : 'none';
  });
});

// Click to roll
diceContainer.addEventListener('click', () => rollDice());

// Spacebar to roll
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && !isRolling && playerName) {
    e.preventDefault();
    rollDice();
  }
});

// Enter in name field → focus dice
playerNameInput.addEventListener('keypress', e => {
  if (e.key === 'Enter') diceContainer.focus();
});

// ─── Init ─────────────────────────────────────────────────────────────────────
// Snap both dice to face 1 on load
snapToFace(dice1, 'dice1', 1);
snapToFace(dice2, 'dice2', 1);

connectSSE();
console.log('Dice Sync loaded – click the dice or press Space to roll.');