# ldr-dice-app

Real-time synchronized dice rolling app for long-distance gaming. Both players see the same roll instantly.

## Tech

- Node.js + plain HTTP server (no framework)
- Server-Sent Events (SSE) for real-time sync
- Vanilla JS frontend

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000` in two browser tabs to test sync.

## Test

1. Open `http://localhost:3000` in **two separate browser windows**
2. Enter different player names in each window
3. Roll dice in one window, the result should appear in both windows instantly
4. Try switching between 1 and 2 dice mode

## Deploy to Railway

1. Push your code to GitHub
2. Create a new project on [railway.app](https://railway.app) → **Deploy from GitHub repo**
3. Railway auto-detects the `Procfile` and runs `node server.js`
4. No environment variables needed — port is set automatically via `$PORT`

```
web: node server.js   ← Procfile
```

That's it! Enjoy! GG!