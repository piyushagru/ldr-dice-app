// ─── PipWorks engine unit tests ──────────────────────────────────────────────
// Run with: npm test  (node --test, no external dependencies)

const { test, describe } = require('node:test');
const assert = require('node:assert');
const dice = require('../pipworks');

describe('parseNotation', () => {
  test('parses simple notation', () => {
    assert.deepStrictEqual(dice.parseNotation('3d6'), { count: 3, sides: 6, modifier: 0 });
  });

  test('parses bare die (count defaults to 1)', () => {
    assert.deepStrictEqual(dice.parseNotation('d20'), { count: 1, sides: 20, modifier: 0 });
  });

  test('parses positive modifier', () => {
    assert.deepStrictEqual(dice.parseNotation('3d6+2'), { count: 3, sides: 6, modifier: 2 });
  });

  test('parses negative modifier', () => {
    assert.deepStrictEqual(dice.parseNotation('2d10-1'), { count: 2, sides: 10, modifier: -1 });
  });

  test('tolerates whitespace and uppercase', () => {
    assert.deepStrictEqual(dice.parseNotation(' 2 D 8 + 3 '), { count: 2, sides: 8, modifier: 3 });
  });

  test('parses d100', () => {
    assert.deepStrictEqual(dice.parseNotation('d100'), { count: 1, sides: 100, modifier: 0 });
  });

  test('rejects unsupported sides', () => {
    assert.strictEqual(dice.parseNotation('1d7'), null);
    assert.strictEqual(dice.parseNotation('1d0'), null);
  });

  test('rejects too many dice', () => {
    assert.strictEqual(dice.parseNotation('11d6'), null);
  });

  test('rejects garbage', () => {
    assert.strictEqual(dice.parseNotation('banana'), null);
    assert.strictEqual(dice.parseNotation(''), null);
    assert.strictEqual(dice.parseNotation(null), null);
    assert.strictEqual(dice.parseNotation(42), null);
  });
});

describe('validateSpec', () => {
  test('accepts a valid spec and fills defaults', () => {
    assert.deepStrictEqual(dice.validateSpec({ sides: 12 }), { count: 1, sides: 12, modifier: 0 });
  });

  test('accepts every supported die', () => {
    for (const sides of dice.DICE_SIDES) {
      assert.deepStrictEqual(dice.validateSpec({ count: 2, sides, modifier: 1 }),
        { count: 2, sides, modifier: 1 });
    }
  });

  test('rejects out-of-range count', () => {
    assert.strictEqual(dice.validateSpec({ count: 0, sides: 6 }), null);
    assert.strictEqual(dice.validateSpec({ count: dice.MAX_DICE + 1, sides: 6 }), null);
    assert.strictEqual(dice.validateSpec({ count: 1.5, sides: 6 }), null);
  });

  test('rejects unsupported sides', () => {
    assert.strictEqual(dice.validateSpec({ count: 1, sides: 3 }), null);
  });

  test('rejects oversized modifier', () => {
    assert.strictEqual(dice.validateSpec({ count: 1, sides: 6, modifier: dice.MAX_MODIFIER + 1 }), null);
    assert.strictEqual(dice.validateSpec({ count: 1, sides: 6, modifier: 'abc' }), null);
  });
});

describe('roll', () => {
  test('returns values in range for every die type', () => {
    for (const sides of dice.DICE_SIDES) {
      for (let i = 0; i < 200; i++) {
        const result = dice.roll({ count: 3, sides, modifier: 0 });
        for (const value of result.rolls) {
          assert.ok(value >= 1 && value <= sides, `d${sides} rolled ${value}`);
        }
      }
    }
  });

  test('total includes the modifier, subtotal does not', () => {
    const result = dice.roll({ count: 2, sides: 6, modifier: 5 });
    assert.strictEqual(result.subtotal, result.rolls[0] + result.rolls[1]);
    assert.strictEqual(result.total, result.subtotal + 5);
  });

  test('negative modifier subtracts', () => {
    const result = dice.roll({ count: 1, sides: 20, modifier: -3 });
    assert.strictEqual(result.total, result.rolls[0] - 3);
  });

  test('reports canonical notation', () => {
    assert.strictEqual(dice.roll({ count: 3, sides: 6, modifier: 2 }).notation, '3d6+2');
    assert.strictEqual(dice.roll({ count: 1, sides: 20, modifier: 0 }).notation, '1d20');
    assert.strictEqual(dice.roll({ count: 2, sides: 10, modifier: -1 }).notation, '2d10-1');
  });

  test('produces every face over many rolls (sanity, d6)', () => {
    const seen = new Set();
    for (let i = 0; i < 500; i++) {
      seen.add(dice.roll({ count: 1, sides: 6, modifier: 0 }).rolls[0]);
    }
    assert.strictEqual(seen.size, 6);
  });
});
