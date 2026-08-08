# The SpiceDice Codex

Steering file for AI-written code in this package. Every change MUST comply with this document.

## Names

| Thing | Name |
|---|---|
| App | **SpiceDice** |
| Shareable rooms | **Pits** (a Pit is a room; URL `/r/:pitId`) |
| Dice engine | **PipWorks** (`pipworks.js`) |
| Catan preset | **Robber Radar** (API preset id: `catan`) |
| Cities & Knights preset | **Barbarian Beacon** (API preset id: `cities-knights`) |
| This file | **The SpiceDice Codex** |

Use these names consistently in code comments, UI copy, and logs. API identifiers
(`/r/`, `/api/rooms`, preset ids `catan` and `cities-knights`) are frozen contracts — do not rename them.

## Tenants

- **T1 Fairness.** Every die face has exactly equal probability. Rolls use
  `crypto.randomInt` (CSPRNG, zero modulo bias) and are server-authoritative.
  Clients never generate results. Never replace with `Math.random` or
  modulo-on-random-bytes.
- **T2 Realistic feel.** Rolling animation is smooth and MUST deterministically
  land on the server's result — zero lag or mismatch between the number shown
  and the die face shown. Never display a result before or different from the
  settled face. The 3D d6 uses `landOnFace()` to guarantee this; result cards
  set the final value only on settle.
- **T3 Minimal comments.** Code self-explains. Comment only genuinely
  non-obvious logic (e.g. gimbal-drift correction, SSE reaping rules).
- **T4 Leverage existing code.** Extend, don't rewrite. Write the least code
  that works. No speculative abstractions, flags, or config for imagined needs.
- **T5 SOLID.** Single-responsibility modules, small interfaces, dependency
  direction points inward to PipWorks (the engine imports nothing from the
  server or UI).

## Writing principles

- Follow the five tenants above in every change.
- No frameworks, no database, no socket.io. Vanilla Node + SSE + vanilla JS.
- Zero runtime npm dependencies. Prefer stdlib (`node:crypto`, `node:http`,
  `node:test`).
- Validate at system boundaries only (HTTP request bodies, dice notation);
  trust internal calls.
- Unit tests live in `test/` and run with `node --test`. The engine stays
  I/O-free so it is trivially testable.

## Design language

Palette and motion are defined once as CSS custom properties in
`public/style.css` (`:root`). Never hardcode theme colors elsewhere.

| Token | Value | Use |
|---|---|---|
| `--bg-0` | `#0a0a14` | Page background (deep space) |
| `--bg-1` | `#12111f` | Elevated surfaces, inputs |
| `--glass` / `--glass-strong` | white @ 5% / 9% | Glass panels (with `backdrop-filter: blur`) |
| `--glass-border` | white @ 12% | Panel borders |
| `--accent-purple` | `#7c5cff` | Primary accent |
| `--accent-blue` | `#4f9dff` | Secondary accent |
| `--gradient-accent` | purple→blue 135° | Buttons, highlights, gradient text |
| `--text-hi` / `--text-mid` / `--text-lo` | `#f2f1fa` / `#a5a3bd` / `#6d6b84` | Type hierarchy |
| `--success` / `--info` / `--danger` | `#3ddc97` / `#4fc3ff` / `#ff5470` | Status |
| `--glow-accent(-soft)` | purple glow shadows | Hover/focus/settle states |

- Typography: Space Grotesk with system-sans fallback (`--font-sans`); mono
  for Pit codes (`--font-mono`). Generous spacing, uppercase micro-labels with
  letter-spacing.
- Motion: subtle and purposeful. Ease-out landings (`--ease-out`), short
  slide/pop keyframes (< 500ms). Dice tumble timing lives in `app.js` and is
  part of the T2 contract — do not "simplify" it.
- Interactive elements glow on hover/focus; never remove focus affordances.

## Architecture

```
pipworks.js          ← PipWorks facade: parseNotation / validateSpec / roll (pure, no I/O); selects OCaml artifact or pure-JS fallback
ocaml/               ← PipWorks engine in OCaml + js_of_ocaml bridge (see "OCaml engine" below)
presets.js           ← game presets: PRESETS map + preset roll decoration (C&K event-die mapping)
server.js            ← HTTP + SSE + Pits (rooms Map); depends on PipWorks and presets
public/app.js        ← Pit page logic: SSE client, mode bar, 3D d6 tumble, result cards
public/widget/*.js   ← self-contained UI widgets (stats, roll feed)
test/                ← node --test unit tests for PipWorks and presets
```

- **Pits model.** `rooms: Map<pitId, { id, gameState, clients: Set<res>, emptySince }>`.
  Pits are created on demand (`getOrCreateRoom`) so shared links survive
  restarts; empty Pits are swept after a 5-minute grace period. State is
  in-memory only — that is a feature, not a gap. The game mode
  (`gameState.currentMode`: `free` | `catan` | `cities-knights`, default
  `free`) is Pit-level shared state — the server is the source of truth, never
  the client. Any member switches it via `POST /r/:pitId/settings`
  `{mode, playerName}`; the server validates the mode, updates the Pit, and
  broadcasts `modeChanged` `{mode, changedBy}` (no broadcast when the mode is
  unchanged). Clients never persist the mode locally.
- **SSE contract.** `GET /r/:pitId/events` streams `data: {type, data}` JSON
  events (`gameState`, `userCount`, `diceRolled`, `modeChanged`) plus
  `: keepalive` comments every 25s. The initial `gameState` snapshot includes
  `currentMode`, so new joiners and reconnects land on the Pit's mode.
  Broadcast collects dead clients during iteration and removes them
  after the loop — never mutate `clients` while iterating.
- **Roll contract.** `POST /r/:pitId/roll` accepts, in priority order:
  `{preset}` > `{notation}` > `{spec:{count,sides,modifier}}` > legacy
  `{numDice}`. Supported dice: d4 d6 d8 d10 d12 d20 d100, ≤10 dice, |modifier| ≤99.
  Rolls must match the Pit's `currentMode`: game modes accept only their own
  preset, free mode accepts everything except a preset. Mismatches (stale
  clients) get `409 {error, currentMode}` so the client can resync.
- **Presets.** `PRESETS` in `presets.js` maps id → `{name, spec, highlightTotal}`;
  `decorateRoll` adds preset-specific fields to the roll entry. Adding a game =
  one `PRESETS` entry + a frontend control. Catan (Robber Radar) and
  Cities & Knights (Barbarian Beacon) ship today. Barbarian Beacon rolls 3d6:
  red + yellow production dice plus an event die whose fair d6 result maps to
  3× barbarian ship / blue gate / green gate / yellow gate — the mapping lives
  only in `presets.js`.
- **Engine boundary.** Everything random goes through PipWorks. The server
  treats it as a black box: `parseNotation`, `validateSpec`, `roll`.

## OCaml engine (executed)

The OCaml swap described in earlier revisions of this file is done. PipWorks
is implemented in OCaml (`ocaml/engine.ml` + `engine.mli`, bridged by
`ocaml/bridge.ml`) and compiled with `js_of_ocaml` to
`ocaml/pipworks_ocaml.js`. `docs/ocaml-walkthrough.md` teaches the OCaml side.

Rules for contributors (AI and human):

- **Build.** From `ocaml/`: `opam exec --switch=clattr -- dune build`
  (opam switch `clattr` — the app's historical name, kept because renaming a
  switch is toolchain churn for zero benefit — OCaml 5.2.1, js_of_ocaml 6.x). The build promotes
  `pipworks_ocaml.js` into `ocaml/`; never edit that artifact by hand.
- **Fallback rule.** At startup `pipworks.js` requires
  `ocaml/pipworks_ocaml.js`; if the artifact is absent it transparently uses
  its own pure-JS implementation. `require('./pipworks').backend` reports
  `'ocaml'` or `'js'`. Both backends MUST stay behavior-identical: any engine
  change lands in `ocaml/engine.ml` *and* the JS fallback in `pipworks.js`,
  and `test/pipworks.test.js` must pass with the artifact present and absent.
- **T1 unchanged.** Randomness is injected from JS (`crypto.randomInt`) into
  the OCaml engine as a function; the OCaml side has no RNG of its own. Never
  give it one.
- **Boundary unchanged.** `server.js` and the tests still see only
  `parseNotation` / `validateSpec` / `roll` from `pipworks.js`. JS type
  coercion (`Number()`, `??` defaults, `typeof` checks) stays in the JS
  wrapper, not in OCaml.

## Out of scope (do not add)

Turn management, auth/identity, scoreboards, TV/spectator view, QR codes,
PWA, haptics, sound.
