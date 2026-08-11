<div align="center">

<!-- Logo coming soon: drop the final artwork at docs/branding/logo.svg -->
<img src="docs/branding/logo.svg" alt="SpiceDice logo" width="120" height="120">

# SpiceDice

**Crypto-fair party dice for every game night, no matter the distance.**

![Node](https://img.shields.io/badge/node-%E2%89%A518-339933?style=flat-square&logo=node.js&logoColor=white) ![Runtime dependencies](https://img.shields.io/badge/runtime%20deps-0-blueviolet?style=flat-square) ![Engine](https://img.shields.io/badge/engine-OCaml%20%2B%20JS%20fallback-ec6813?style=flat-square&logo=ocaml&logoColor=white) ![Tests](https://img.shields.io/badge/tests-node%20--test-brightgreen?style=flat-square)

<!--
  HERO SCREENSHOT GOES HERE: capture and add:
  1. landing.png     the landing page at http://localhost:3005 (hero + "Open a Pit" button)
  2. pit-free.png    a Pit in Free Roll mode mid-roll: 3D d6 tumbling, dice picker visible
  3. pit-catan.png   Catan mode (Robber Radar) right after rolling a 7 (highlight state)
  4. pit-cnk.png     Cities & Knights mode (Barbarian Beacon) showing red + yellow dice + event die face
  5. two-windows.png  two browser windows side by side on the same Pit, showing the synced roll

  Save them under docs/screenshots/ and embed like:
  <img src="docs/screenshots/pit-free.png" alt="A Pit in Free Roll mode" width="720">
-->
<img src="docs/screenshots/pit-free.png" alt="A Pit in Free Roll mode, 3D d6 mid-tumble" width="720">

</div>

## 🚀 Get rolling

```bash
git clone https://github.com/piyushagru/ldr-dice-app.git && cd ldr-dice-app
npm install   # zero runtime dependencies, this is instant
node server.js
```

Open <http://localhost:3005>, open a **Pit** (a shareable dice room), and send the link: everyone sees the same roll land at the same moment. Open the Pit link in a second browser window to see the sync.

> [!NOTE]
> A fresh clone runs on the pure-JS engine out of the box, no OCaml toolchain needed. Both engines behave identically. The port comes from `$PORT` (default `3005`); if it's busy the server tries the next one.

> [!TIP]
> Rolls also work over HTTP:
> ```bash
> curl -X POST localhost:3005/r/<pit>/roll -H 'Content-Type: application/json' \
>   -d '{"playerName":"alice","notation":"3d6+2"}'
> ```

## ✨ Features

| | |
|---|---|
| 🕳️ **Shareable Pits**: share `/r/<code>`, friends join instantly; empty Pits swept after 5 min | 🎲 **Crypto-fair rolls**: server-authoritative `crypto.randomInt` CSPRNG, zero modulo bias |
| 🎯 **All the dice**: d4–d100, up to 10 dice, ±99 modifier, notation like `3d6+2` | 🏝️ **Game modes**: Catan (**Robber Radar**) and Cities & Knights (**Barbarian Beacon**) |
| 🔄 **Pit-synced mode**: anyone switches the mode, everyone follows, new joiners land on it | 🎬 **Exact-landing animation**: the 3D d6 deterministically settles on the server's result |
| 🌌 **Futuristic theme**: glassmorphism over deep space, one palette in CSS custom properties | 🐫 **OCaml-powered engine**: PipWorks in OCaml via `js_of_ocaml`, behavior-identical JS fallback |
| 📦 **Zero runtime dependencies**: vanilla Node + SSE + vanilla JS | 🔒 **No accounts, no database, no frameworks**: Pit state lives in memory only |

## 🎮 Playing

Click **Open a Pit** on the landing page to get a room like `/r/xk4p2m`. Anyone with the link joins the same Pit: same rolls, same history, same game mode. A Pit link keeps working across server restarts (the Pit is recreated on demand), but history starts fresh.

| Mode | What it does |
|---|---|
| **Free Roll** | Full dice picker + notation. |
| **Catan** (Robber Radar) | Rolls 2d6, shows both dice and the sum, highlights a 7. |
| **Cities & Knights** (Barbarian Beacon) | Rolls red + yellow production dice plus the event die (3× barbarian ship, blue/green/yellow city gates); highlights a production 7. |

> [!NOTE]
> The mode belongs to the Pit, not your browser: switching it updates everyone live, and rolls that don't match the current mode are rejected so stale clients resync instead of desyncing the room.

<details>
<summary>🎲 <b>Dice notation cheatsheet</b></summary>

Type notation directly or use the dice picker.

| Notation | Meaning |
|---|---|
| `d20` | one d20 |
| `3d6` | three d6, summed |
| `3d6+2` | three d6 plus 2 |
| `2d10-1` | two d10 minus 1 |

Limits: dice types d4/d6/d8/d10/d12/d20/d100, at most 10 dice, modifier within ±99.

</details>

<details>
<summary>🏗️ <b>Architecture</b></summary>

```
 Browser ──POST /r/:pit/roll──▶ Node (server.js) ──▶ PipWorks (pipworks.js)
    ▲                              │                   ├─ ocaml/pipworks_ocaml.js (js_of_ocaml build)
    │                              │                   └─ pure-JS fallback (same behavior)
    └────── SSE /r/:pit/events ◀───┘ broadcasts: gameState · diceRolled · modeChanged · userCount
```

The server is plain `node:http` + Server-Sent Events, no framework, no socket library, no database. All randomness flows through **PipWorks**, which the server treats as a black box (`parseNotation` / `validateSpec` / `roll`).

</details>

<details>
<summary>🐫 <b>Building the OCaml engine</b></summary>

The compiled artifact `ocaml/pipworks_ocaml.js` is a **build product**: it is gitignored, never committed. Only the engine source (`engine.ml`, `engine.mli`, `bridge.ml`) and the dune build rules live in git; the artifact is always built from them:

```bash
# one-time setup: opam switch with OCaml 5.2.1, dune, and js_of_ocaml
opam switch create spicedice 5.2.1
opam install --switch=spicedice dune js_of_ocaml js_of_ocaml-ppx
eval $(opam env --switch=spicedice)

npm run build:engine   # dune build in ocaml/, promotes pipworks_ocaml.js
```

The Docker image builds the artifact from source in its first stage, so deploys always ship the OCaml engine. Locally, no toolchain is required: if the artifact is missing, `pipworks.js` transparently falls back to its pure-JS implementation with identical behavior (`require('./pipworks').backend` reports `'ocaml'` or `'js'`).

> [!WARNING]
> Never edit `pipworks_ocaml.js` by hand. Both backends must stay behavior-identical: engine changes land in `ocaml/engine.ml` *and* the JS fallback, and the tests must pass with the artifact present and absent.

</details>

<details>
<summary>📁 <b>Project layout</b></summary>

```
server.js            HTTP + SSE + Pits (in-memory rooms)
pipworks.js          PipWorks facade: OCaml artifact or pure-JS fallback
presets.js           game presets + event-die mapping
ocaml/               engine.ml/.mli + js_of_ocaml bridge → pipworks_ocaml.js
public/              landing + Pit page, 3D dice, theme (CSS custom properties)
public/widget/       self-contained stats + roll-feed widgets
test/                node --test unit tests
docs/                OCaml walkthrough
.kiro/steering/      The SpiceDice Codex
```

</details>

## 🛠️ Development

```bash
node --test   # 40 unit tests for PipWorks, presets, and roll-mode enforcement
```

Every change follows the five tenants of [the Codex](.kiro/steering/spicedice-codex.md): **fairness** (equal probability per face, CSPRNG, server-authoritative) · **realistic feel** (animations land exactly on the server's result) · **minimal comments** · **leverage existing code** · **SOLID**.

Depth lives in the docs:

- **[The SpiceDice Codex](.kiro/steering/spicedice-codex.md)**: tenants, naming, API contracts, design tokens. The source of truth for every change.
- **[OCaml walkthrough](docs/ocaml-walkthrough.md)**: learn OCaml through the PipWorks engine source.

## 🤝 Contributing

Read [the SpiceDice Codex](.kiro/steering/spicedice-codex.md) first: it is the contract for humans and AI alike. Keep changes small, run `node --test`, and update this README in the same change when you alter features, the quick start, or API/mode names.

---

<div align="center">

Built for long-distance game nights. 🎲

<a href="https://ko-fi.com/piyusha"><img src="https://img.shields.io/badge/Ko--fi-support%20SpiceDice-FF5E5B?style=flat-square&logo=kofi&logoColor=white" alt="Ko-fi"></a>

</div>
