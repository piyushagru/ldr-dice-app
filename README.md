# SpiceDice

Real-time synchronized dice rolling for long-distance gaming. Open a Pit (a shareable room), share the link, and everyone in the Pit sees the same roll instantly.

## Tech

- Node.js + plain HTTP server (no framework, no runtime dependencies)
- Server-Sent Events (SSE) for real-time sync, with heartbeat keepalive
- Vanilla JS frontend, futuristic dark theme (pure CSS custom properties)
- PipWorks dice engine (`pipworks.js`): server-authoritative, crypto-fair rolls (`crypto.randomInt`)

## Features

- **Pits (shareable rooms)** — the landing page opens a Pit with a short code (e.g. `xk4p2m`). Share `http://host/r/<code>` to invite others. Pits are isolated; empty Pits are swept after 5 minutes.
- **All standard dice** — d4, d6, d8, d10, d12, d20, d100, up to 10 dice per roll with a ±99 modifier. The roll endpoint also accepts dice notation like `3d6+2`.
- **3D dice** — d6 rolls keep the CSS 3D cube animation; other dice render as animated result cards.
- **Game modes** — a sticky bar at the top of every Pit switches between Free Roll (dice picker), Catan, and Cities & Knights; the choice persists per browser.
- **Game presets** — "Catan" (Robber Radar) rolls 2d6, shows both dice plus the sum, and highlights a 7. "Cities & Knights" (Barbarian Beacon) rolls red + yellow production dice plus the event die (3× barbarian ship, blue/green/yellow gates), highlights a production 7, and calls out advancing barbarians on a ship.

## Run locally

```bash
npm start
```

Open `http://localhost:3005`, open a Pit, and open the Pit link in a second browser window to test sync.

## Test

```bash
npm test   # unit tests for the PipWorks engine (node --test, no dependencies)
```

Manual check:

1. Open `http://localhost:3005` and open a Pit
2. Copy the Pit link into a **second browser window**
3. Enter different player names in each window
4. Roll dice in one window, the result should appear in both windows instantly
5. Try different dice types, counts, modifiers, and the Catan preset

### Roll API

```bash
# Dice notation
curl -X POST localhost:3005/r/<room>/roll -H 'Content-Type: application/json' \
  -d '{"playerName":"alice","notation":"3d6+2"}'

# Structured spec
curl -X POST localhost:3005/r/<room>/roll -H 'Content-Type: application/json' \
  -d '{"playerName":"alice","spec":{"count":2,"sides":20,"modifier":1}}'

# Preset
curl -X POST localhost:3005/r/<room>/roll -H 'Content-Type: application/json' \
  -d '{"playerName":"alice","preset":"catan"}'

# Cities & Knights preset (red + yellow production dice + event die)
curl -X POST localhost:3005/r/<room>/roll -H 'Content-Type: application/json' \
  -d '{"playerName":"alice","preset":"cities-knights"}'
```

## Deploy to Railway

1. Push your code to GitHub
2. Create a new project on [railway.app](https://railway.app) → **Deploy from GitHub repo**
3. Railway detects the `Dockerfile` and builds a Docker image from it
4. The `CMD` in the Dockerfile is what starts the app `node server.js`
5. No environment variables needed port is set automatically via `$PORT`

```dockerfile
CMD ["node", "server.js"]   ← Dockerfile (this is what Railway runs)
```

> **Note:** The `Procfile` is only used when there is no `Dockerfile`. Since this project has a `Dockerfile`, the `Procfile` is ignored by Railway.

That's it! Enjoy! GG!
