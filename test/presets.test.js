// ─── Presets unit tests ───────────────────────────────────────────────────────
// Run with: npm test  (node --test, no external dependencies)

const { test, describe } = require('node:test');
const assert = require('node:assert');
const presets = require('../presets');
const dice = require('../pipworks');

describe('PRESETS', () => {
  test('catan is unchanged: 2d6, highlight 7', () => {
    assert.deepStrictEqual(presets.PRESETS.catan.spec, { count: 2, sides: 6, modifier: 0 });
    assert.strictEqual(presets.PRESETS.catan.highlightTotal, 7);
    assert.strictEqual(presets.PRESETS.catan.name, 'Catan');
  });

  test('cities-knights rolls 3d6 and highlights a production 7', () => {
    assert.deepStrictEqual(presets.PRESETS['cities-knights'].spec, { count: 3, sides: 6, modifier: 0 });
    assert.strictEqual(presets.PRESETS['cities-knights'].highlightTotal, 7);
    assert.strictEqual(presets.PRESETS['cities-knights'].name, 'Cities & Knights');
  });

  test('preset specs pass PipWorks validation', () => {
    for (const preset of Object.values(presets.PRESETS)) {
      assert.deepStrictEqual(dice.validateSpec(preset.spec), preset.spec);
    }
  });
});

describe('eventFace', () => {
  test('maps 1-3 to ship, 4/5/6 to blue/green/yellow gates', () => {
    assert.strictEqual(presets.eventFace(1), 'ship');
    assert.strictEqual(presets.eventFace(2), 'ship');
    assert.strictEqual(presets.eventFace(3), 'ship');
    assert.strictEqual(presets.eventFace(4), 'blue');
    assert.strictEqual(presets.eventFace(5), 'green');
    assert.strictEqual(presets.eventFace(6), 'yellow');
  });

  test('face weights are 3:1:1:1 (ship:blue:green:yellow)', () => {
    const counts = {};
    for (const face of presets.EVENT_FACES) counts[face] = (counts[face] || 0) + 1;
    assert.deepStrictEqual(counts, { ship: 3, blue: 1, green: 1, yellow: 1 });
    assert.strictEqual(presets.EVENT_FACES.length, 6);
  });

  test('returns null for out-of-range values', () => {
    assert.strictEqual(presets.eventFace(0), null);
    assert.strictEqual(presets.eventFace(7), null);
  });
});

describe('decorateRoll', () => {
  test('adds nothing for non-C&K rolls', () => {
    const result = dice.roll(presets.PRESETS.catan.spec);
    assert.deepStrictEqual(presets.decorateRoll('catan', result), {});
    assert.deepStrictEqual(presets.decorateRoll(null, result), {});
  });

  test('adds production sum and mapped event die', () => {
    const result = { rolls: [3, 4, 5] };
    assert.deepStrictEqual(presets.decorateRoll('cities-knights', result), {
      production: 7,
      event: { value: 5, face: 'green' }
    });
  });

  test('event distribution over many rolls approximates 3:1:1:1', () => {
    const ROLLS = 6000;
    const counts = { ship: 0, blue: 0, green: 0, yellow: 0 };
    for (let i = 0; i < ROLLS; i++) {
      const result = dice.roll(presets.PRESETS['cities-knights'].spec);
      counts[presets.decorateRoll('cities-knights', result).event.face]++;
    }
    // ship expected at 1/2, each gate at 1/6 — loose bounds (>7σ) to avoid flakes
    assert.ok(counts.ship / ROLLS > 0.45 && counts.ship / ROLLS < 0.55,
      `ship ratio ${counts.ship / ROLLS}`);
    for (const gate of ['blue', 'green', 'yellow']) {
      assert.ok(counts[gate] / ROLLS > 0.12 && counts[gate] / ROLLS < 0.21,
        `${gate} ratio ${counts[gate] / ROLLS}`);
    }
  });
});
