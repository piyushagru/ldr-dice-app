// ─── Game presets ─────────────────────────────────────────────────────────────
// Each preset maps to a fixed roll spec plus display hints for the frontend.
// Adding a game = adding one entry here + a frontend control.
const PRESETS = {
  catan: {
    name: 'Catan',
    spec: { count: 2, sides: 6, modifier: 0 },
    highlightTotal: 7
  },
  // Barbarian Beacon — Catan Cities & Knights: red + yellow production dice
  // plus the event die (third d6, mapped to faces below).
  'cities-knights': {
    name: 'Cities & Knights',
    spec: { count: 3, sides: 6, modifier: 0 },
    highlightTotal: 7
  }
};

// Event die faces by d6 value (index = value − 1): 3× barbarian ship,
// then the blue / green / yellow city gates. Sole source of this mapping.
const EVENT_FACES = ['ship', 'ship', 'ship', 'blue', 'green', 'yellow'];

function eventFace(value) {
  return EVENT_FACES[value - 1] ?? null;
}

// Preset-specific fields merged into the roll entry broadcast over SSE.
function decorateRoll(presetId, result) {
  if (presetId !== 'cities-knights') return {};
  const [red, yellow, event] = result.rolls;
  return {
    production: red + yellow,
    event: { value: event, face: eventFace(event) }
  };
}

module.exports = { PRESETS, EVENT_FACES, eventFace, decorateRoll };
