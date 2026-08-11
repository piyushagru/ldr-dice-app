// ─── Room ─────────────────────────────────────────────────────────────────────
// Pages are served at /r/:roomId, all API calls are scoped to this room.
const roomId = (window.location.pathname.match(/^\/r\/([a-z0-9]+)/) || [])[1];
if (!roomId) window.location.href = '/';

// ─── SSE connection ───────────────────────────────────────────────────────────
let eventSource;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const playerNameInput = document.getElementById('playerName');
const dice1            = document.getElementById('dice1');
const dice2            = document.getElementById('dice2');
const wrapper1         = document.getElementById('wrapper1');
const wrapper2         = document.getElementById('wrapper2');
const diceContainer    = document.getElementById('diceContainer');
const cardContainer    = document.getElementById('cardContainer');
const rollTotal        = document.getElementById('rollTotal');
const rollHistory      = document.getElementById('rollHistory');
const userCount        = document.getElementById('userCount');
const roomCode         = document.getElementById('roomCode');
const shareBtn         = document.getElementById('shareBtn');
const diceCountSelect  = document.getElementById('diceCount');
const diceModifier     = document.getElementById('diceModifier');
const modeBar          = document.getElementById('modeBar');
const gameRollBtn      = document.getElementById('gameRollBtn');
const eventCallout     = document.getElementById('eventCallout');
const diceTypeSelector = document.getElementById('diceTypeSelector');
const rollConfig       = document.getElementById('rollConfig');

// ─── State ────────────────────────────────────────────────────────────────────
let playerName = '';
let isRolling  = false;

// Interface mode: 'free' or a preset id; Pit-level state owned by the server
const MODES = ['free', 'catan', 'cities-knights'];
const MODE_NAMES = { free: 'Free Roll', catan: 'Catan', 'cities-knights': 'Cities & Knights' };
let currentMode = 'free';

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
// Spins on a random axis by ±90° or ±180°, visually interesting, doesn't need
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

// ─── Card animation for non-d6 dice ───────────────────────────────────────────
// Each die is a flat card that cycles random values and settles on the result.
function playCardAnimation(cardEl, sides, finalValue) {
  return new Promise(resolve => {
    const CYCLES  = 10;
    const BASE_MS = 55;
    const valueEl = cardEl.querySelector('.card-value');
    let cycle = 0;

    cardEl.classList.add('is-rolling');

    function nextCycle() {
      if (cycle < CYCLES) {
        valueEl.textContent = 1 + Math.floor(Math.random() * sides);
        cycle++;
        setTimeout(nextCycle, BASE_MS + cycle * 12); // decelerate
      } else {
        valueEl.textContent = finalValue;
        cardEl.classList.remove('is-rolling');
        cardEl.classList.add('is-settled');
        setTimeout(resolve, 200);
      }
    }

    nextCycle();
  });
}

// Render one result card per die and animate them settling.
function animateCards(rolls, sides) {
  cardContainer.innerHTML = rolls.map(() => `
    <div class="dice-card d${sides}-card">
      <span class="card-sides">d${sides}</span>
      <span class="card-value">?</span>
    </div>`).join('');

  const cards = cardContainer.querySelectorAll('.dice-card');
  return Promise.all(
    rolls.map((value, i) => playCardAnimation(cards[i], sides, value))
  );
}

// ─── Cities & Knights event die ───────────────────────────────────────────────
// Renders as a result card inside the dice row: barbarian ship or colored gate.
const EVENT_CARD = {
  ship:   { glyph: '⛵︎', label: 'Barbarians' },
  blue:   { glyph: '⛩︎', label: 'Blue gate' },
  green:  { glyph: '⛩︎', label: 'Green gate' },
  yellow: { glyph: '⛩︎', label: 'Yellow gate' }
};
const EVENT_FACE_KEYS = Object.keys(EVENT_CARD);

function setEventCardFace(cardEl, face) {
  EVENT_FACE_KEYS.forEach(f => cardEl.classList.remove(`face-${f}`));
  cardEl.classList.add(`face-${face}`);
  cardEl.querySelector('.card-value').textContent = EVENT_CARD[face].glyph;
  cardEl.querySelector('.event-label').textContent = EVENT_CARD[face].label;
}

function ensureEventCard() {
  let card = document.getElementById('eventDie');
  if (!card) {
    card = document.createElement('div');
    card.id = 'eventDie';
    card.className = 'dice-card event-card';
    card.innerHTML = '<span class="card-sides">Event</span><span class="card-value">?</span><span class="event-label"></span>';
    diceContainer.appendChild(card);
  }
  return card;
}

// Cycles faces and settles on the server's result (T2: final face only on settle).
function playEventCardAnimation(cardEl, finalFace) {
  return new Promise(resolve => {
    const CYCLES  = 10;
    const BASE_MS = 55;
    let cycle = 0;

    cardEl.classList.remove('is-settled');
    cardEl.classList.add('is-rolling');

    function nextCycle() {
      if (cycle < CYCLES) {
        setEventCardFace(cardEl, EVENT_FACE_KEYS[Math.floor(Math.random() * EVENT_FACE_KEYS.length)]);
        cycle++;
        setTimeout(nextCycle, BASE_MS + cycle * 12);
      } else {
        setEventCardFace(cardEl, finalFace);
        cardEl.classList.remove('is-rolling');
        cardEl.classList.add('is-settled');
        setTimeout(resolve, 200);
      }
    }

    nextCycle();
  });
}

function setCKDiceTint(on) {
  wrapper1.classList.toggle('die-red', on);
  wrapper2.classList.toggle('die-yellow', on);
  if (!on) {
    const card = document.getElementById('eventDie');
    if (card) card.remove();
  }
}

// ─── Roll total banner ────────────────────────────────────────────────────────
// Shows sum (and modifier breakdown) after a multi-dice or modified roll.
// Catan rolls highlight a total of 7.
function showRollTotal(data) {
  const { rolls, total, subtotal, modifier, preset, notation } = data;

  if (preset === 'cities-knights') {
    const production = data.production;
    const robber = production === 7;
    rollTotal.textContent = `${robber ? 'Robber! ' : ''}${rolls[0]} + ${rolls[1]} = ${production}`;
    rollTotal.classList.add('catan-roll');
    rollTotal.classList.toggle('catan-seven', robber);
    rollTotal.style.display = 'block';
    eventCallout.style.display = data.event.face === 'ship' ? 'block' : 'none';
    return;
  }

  const isCatan   = preset === 'catan';
  const showsSum  = rolls.length > 1 || (modifier || 0) !== 0 || isCatan;

  if (!showsSum) {
    rollTotal.style.display = 'none';
    return;
  }

  let text;
  if ((modifier || 0) !== 0) {
    const modStr = modifier > 0 ? `+ ${modifier}` : `− ${Math.abs(modifier)}`;
    text = `${rolls.join(' + ')} ${modStr} = ${total}`;
  } else {
    text = `${rolls.join(' + ')} = ${total}`;
  }
  if (notation) text = `${notation}:  ${text}`;
  if (isCatan && total === 7) text = `Robber! ${text}`;

  rollTotal.textContent = text;
  rollTotal.classList.toggle('catan-seven', isCatan && total === 7);
  rollTotal.classList.toggle('catan-roll', isCatan);
  rollTotal.style.display = 'block';
}

// ─── Roll rendering dispatch ──────────────────────────────────────────────────
// d6 rolls of 1–2 dice keep the original 3D cube animation; everything else
// renders as animated result cards.
function uses3dDice(sides, count) {
  return sides === 6 && count <= 2;
}

async function animateAndReveal(data) {
  const { rolls, total, sides, rolledBy, timestamp } = data;
  const count = rolls.length;
  const isCK  = data.preset === 'cities-knights';

  rollTotal.style.display = 'none';
  eventCallout.style.display = 'none';
  setCKDiceTint(isCK);

  if (isCK) {
    cardContainer.style.display = 'none';
    diceContainer.style.display = '';
    wrapper2.style.display = 'block';

    await Promise.all([
      playRollAnimation(dice1, 'dice1', rolls[0]),
      playRollAnimation(dice2, 'dice2', rolls[1]),
      playEventCardAnimation(ensureEventCard(), data.event.face)
    ]);

    pulseEffect(wrapper1);
    pulseEffect(wrapper2);
  } else if (uses3dDice(sides, count)) {
    cardContainer.style.display = 'none';
    diceContainer.style.display = '';
    wrapper2.style.display = count === 2 ? 'block' : 'none';

    const animations = [playRollAnimation(dice1, 'dice1', rolls[0])];
    if (count === 2) animations.push(playRollAnimation(dice2, 'dice2', rolls[1]));
    await Promise.all(animations);

    pulseEffect(wrapper1);
    if (count === 2) pulseEffect(wrapper2);
  } else {
    diceContainer.style.display = 'none';
    cardContainer.style.display = 'flex';
    await animateCards(rolls, sides);
  }

  showRollTotal(data);

  // Push to feed after dice settle
  window.RollFeed.push(rolls, total, count, rolledBy, timestamp, playerName, {
    sides, notation: data.notation, preset: data.preset,
    event: data.event, production: data.production
  });
}

// ─── Pulse effect (on wrapper, not the preserve-3d element) ───────────────────
function pulseEffect(wrapperEl) {
  wrapperEl.classList.remove('result-pulse');
  void wrapperEl.offsetWidth;
  wrapperEl.classList.add('result-pulse');
  setTimeout(() => wrapperEl.classList.remove('result-pulse'), 500);
}

// ─── Build the current roll request from the controls ─────────────────────────
function buildRollRequest() {
  if (currentMode !== 'free') {
    return { playerName, preset: currentMode };
  }
  const sides    = parseInt(document.querySelector('input[name="diceType"]:checked').value);
  const count    = parseInt(diceCountSelect.value);
  const modifier = parseInt(diceModifier.value) || 0;
  return { playerName, spec: { count, sides, modifier } };
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

  // Fire the server request; result comes back via SSE
  await sendRollRequest(buildRollRequest());
}

// ─── SSE message handler ──────────────────────────────────────────────────────
function handleMessage(type, data) {
  switch (type) {
    case 'gameState':
      userCount.textContent = data.connectedUsers;
      if (MODES.includes(data.currentMode)) applyMode(data.currentMode);
      if (data.rollHistory && data.rollHistory.length > 0) {
        const last = data.rollHistory[0];
        const sides = last.sides || 6;
        const lastIsCK = last.preset === 'cities-knights';

        // On reconnect just snap to last known state without animation
        setCKDiceTint(lastIsCK);
        if (lastIsCK) {
          wrapper2.style.display = 'block';
          last.rolls.slice(0, 2).forEach((face, i) => {
            const el  = i === 0 ? dice1 : dice2;
            const key = i === 0 ? 'dice1' : 'dice2';
            snapToFace(el, key, face);
            currentFace[key] = face;
          });
          const eventCard = ensureEventCard();
          setEventCardFace(eventCard, last.event.face);
          eventCard.classList.add('is-settled');
        } else if (uses3dDice(sides, last.rolls.length)) {
          wrapper2.style.display = last.rolls.length === 2 ? 'block' : 'none';
          last.rolls.forEach((face, i) => {
            const el  = i === 0 ? dice1 : dice2;
            const key = i === 0 ? 'dice1' : 'dice2';
            snapToFace(el, key, face);
            currentFace[key] = face;
          });
        }

        window.RollFeed.push(last.rolls, last.total, last.rolls.length,
          last.rolledBy, last.timestamp, playerName,
          { sides, notation: last.notation, preset: last.preset,
            event: last.event, production: last.production });
        updateRollHistory(data.rollHistory);
      }
      break;

    case 'userCount':
      userCount.textContent = data;
      break;

    case 'modeChanged': {
      applyMode(data.mode);
      const who = data.changedBy === playerName ? 'You' : data.changedBy;
      window.RollFeed.pushNotice(`${who} switched the Pit to ${MODE_NAMES[data.mode]}`);
      break;
    }

    case 'diceRolled': {
      const isOwn = data.rolledBy === playerName;

      animateAndReveal(data)
        .then(() => {
          if (isOwn) {
            // Re-enable after our own animation completes
            isRolling = false;
            diceContainer.style.pointerEvents = 'auto';
          }
        });

      updateRollHistory(data.rollHistory);
      updateStats(data.rolls, data.sides);
      break;
    }
  }
}

// ─── Server request ───────────────────────────────────────────────────────────
async function sendRollRequest(payload) {
  try {
    const res = await fetch(`/r/${roomId}/roll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.status === 409) {
      // Stale mode: resync to the Pit's mode instead of rolling
      const { currentMode: pitMode } = await res.json();
      if (MODES.includes(pitMode)) applyMode(pitMode);
      isRolling = false;
      diceContainer.style.pointerEvents = 'auto';
      return;
    }
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
  eventSource = new EventSource(`/r/${roomId}/events`);

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
    const sides    = roll.sides || 6;
    const symbols  = sides === 6
      ? roll.rolls.map(r => DICE_SYMBOLS[r]).join(' ')
      : (roll.notation || `d${sides}`);
    const display  = roll.preset === 'cities-knights'
      ? `[${roll.rolls[0]}, ${roll.rolls[1]}] = ${roll.production} · event: ${roll.event.face}`
      : roll.rolls.length === 1 && !roll.modifier
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

// ─── Stats: delegated to stats.js (window.Stats) ────────────────────────────
// The stats panel tracks d6 distribution only, so other dice are skipped.
function updateStats(rolls, sides) {
  if ((sides || 6) === 6) window.Stats.update(rolls);
}

// ─── Event listeners ──────────────────────────────────────────────────────────
// Restore saved name
const savedName = localStorage.getItem('dicePlayerName');
if (savedName) { playerNameInput.value = savedName; playerName = savedName; }

playerNameInput.addEventListener('input', e => {
  playerName = e.target.value.trim();
  localStorage.setItem('dicePlayerName', playerName);
});

// Room code + share link
roomCode.textContent = roomId;
shareBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    shareBtn.textContent = 'Copied!';
  } catch (err) {
    prompt('Copy this room link:', window.location.href);
    shareBtn.textContent = 'Copy link';
    return;
  }
  setTimeout(() => { shareBtn.textContent = 'Copy link'; }, 1500);
});

// Mode bar: the Pit's mode swaps the visible controls and governs the payload.
// applyMode only updates the UI; the server owns the state (modeChanged SSE).
function applyMode(mode) {
  currentMode = mode;
  modeBar.querySelectorAll('.mode-btn').forEach(btn => {
    const active = btn.dataset.mode === mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  const isFree = mode === 'free';
  diceTypeSelector.style.display = isFree ? '' : 'none';
  rollConfig.style.display = isFree ? '' : 'none';
  gameRollBtn.style.display = isFree ? 'none' : '';
  gameRollBtn.classList.toggle('mode-ck', mode === 'cities-knights');
}

// Ask the server to switch the whole Pit; UI updates when modeChanged arrives.
async function requestModeChange(mode) {
  try {
    const res = await fetch(`/r/${roomId}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, playerName })
    });
    if (!res.ok) throw new Error('Server error');
  } catch (err) {
    console.error('Mode change failed:', err);
  }
}

modeBar.addEventListener('click', e => {
  const btn = e.target.closest('.mode-btn');
  if (btn && btn.dataset.mode !== currentMode) requestModeChange(btn.dataset.mode);
});

gameRollBtn.addEventListener('click', () => rollDice());

applyMode('free');

// Click to roll
diceContainer.addEventListener('click', () => rollDice());
cardContainer.addEventListener('click', () => rollDice());

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
console.log(`SpiceDice loaded: Pit ${roomId}. Click the dice or press Space to roll.`);
