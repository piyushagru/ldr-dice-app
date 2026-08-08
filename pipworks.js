// ─── PipWorks — the SpiceDice dice engine ───────────────────────────────────────
// Server-authoritative dice logic: notation parsing, validation and
// crypto-fair rolling (crypto.randomInt CSPRNG). Framework-free, no I/O.
// Backed by the js_of_ocaml build in ocaml/ when the compiled artifact is
// present; this file's pure-JS implementation is the fallback (SpiceDice Codex).

const { randomInt } = require('crypto');
const path = require('path');

// Supported dice types
const DICE_SIDES = [4, 6, 8, 10, 12, 20, 100];

// Sanity limits for a single roll
const MAX_DICE = 10;
const MAX_MODIFIER = 99;

// Dice notation, e.g. "d20", "3d6", "3d6+2", "2d10 - 1"
const NOTATION_PATTERN = /^\s*(\d{1,2})?\s*d\s*(\d{1,3})\s*(?:([+-])\s*(\d{1,3}))?\s*$/i;

const OCAML_ARTIFACT = path.join(__dirname, 'ocaml', 'pipworks_ocaml.js');

function loadOCamlEngine() {
  try {
    return require(OCAML_ARTIFACT);
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') return null;
    throw error;
  }
}

const ocaml = loadOCamlEngine();

// ─── Parse dice notation into a roll spec ─────────────────────────────────────
// Returns { count, sides, modifier } or null if the notation is invalid.
function parseNotation(notation) {
  if (typeof notation !== 'string') return null;
  if (ocaml) return ocaml.parseNotation(notation);

  const match = notation.match(NOTATION_PATTERN);
  if (!match) return null;

  const count = match[1] ? parseInt(match[1], 10) : 1;
  const sides = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3] + match[4], 10) : 0;

  return validateSpec({ count, sides, modifier });
}

// ─── Validate a structured roll spec ──────────────────────────────────────────
// Accepts { count, sides, modifier } and returns a normalized copy,
// or null if any part is out of range.
function validateSpec(spec) {
  const count = Number(spec.count ?? 1);
  const sides = Number(spec.sides ?? 6);
  const modifier = Number(spec.modifier ?? 0);

  if (ocaml) return ocaml.validateSpec(count, sides, modifier);

  if (!Number.isInteger(count) || count < 1 || count > MAX_DICE) return null;
  if (!DICE_SIDES.includes(sides)) return null;
  if (!Number.isInteger(modifier) || Math.abs(modifier) > MAX_MODIFIER) return null;

  return { count, sides, modifier };
}

// ─── Roll a validated spec ────────────────────────────────────────────────────
// Returns { rolls, subtotal, total, count, sides, modifier, notation }.
// Randomness always comes from crypto.randomInt; the OCaml engine receives it
// as an injected function and never rolls on its own (tenant T1).
function roll(spec) {
  if (ocaml) {
    return ocaml.roll(spec.count, spec.sides, spec.modifier,
      (sides) => randomInt(1, sides + 1));
  }

  const rolls = [];
  let subtotal = 0;
  for (let i = 0; i < spec.count; i++) {
    const value = randomInt(1, spec.sides + 1); // crypto CSPRNG, 1–sides inclusive
    rolls.push(value);
    subtotal += value;
  }

  const modSuffix = spec.modifier === 0
    ? ''
    : (spec.modifier > 0 ? `+${spec.modifier}` : `${spec.modifier}`);

  return {
    rolls,
    subtotal,
    total: subtotal + spec.modifier,
    count: spec.count,
    sides: spec.sides,
    modifier: spec.modifier,
    notation: `${spec.count}d${spec.sides}${modSuffix}`
  };
}

module.exports = {
  DICE_SIDES,
  MAX_DICE,
  MAX_MODIFIER,
  parseNotation,
  validateSpec,
  roll,
  backend: ocaml ? 'ocaml' : 'js'
};
