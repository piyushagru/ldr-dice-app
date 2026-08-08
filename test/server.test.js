// ─── Server integration tests: Pit settings + mode enforcement ────────────────
// Run with: npm test  (node --test, no external dependencies)

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { handleRequest, rooms } = require('../server');

let server;
let base;

before(async () => {
  server = http.createServer(handleRequest);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

beforeEach(() => rooms.clear());

function post(path, payload) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

// Opens an SSE connection and collects parsed events into the returned array.
async function openSSE(pitId, events) {
  const res = await fetch(`${base}/r/${pitId}/events`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          if (chunk.startsWith('data: ')) events.push(JSON.parse(chunk.slice(6)));
        }
      }
    } catch (e) { /* connection torn down by test */ }
  })();
  return () => reader.cancel();
}

function waitFor(predicate, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function check() {
      const match = predicate();
      if (match) return resolve(match);
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timed out'));
      setTimeout(check, 10);
    })();
  });
}

describe('Pit settings endpoint', () => {
  test('new Pits default to free mode', async () => {
    const res = await post('/r/testpit/settings', { mode: 'free' });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { success: true, currentMode: 'free' });
  });

  test('sets a valid mode and reports it back', async () => {
    const res = await post('/r/testpit/settings', { mode: 'catan', playerName: 'Sam' });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { success: true, currentMode: 'catan' });
    assert.strictEqual(rooms.get('testpit').gameState.currentMode, 'catan');
  });

  test('rejects unknown modes with 400', async () => {
    const res = await post('/r/testpit/settings', { mode: 'monopoly' });
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(await res.json(), { error: 'Invalid mode' });
  });

  test('rejects malformed JSON with 400', async () => {
    const res = await fetch(`${base}/r/testpit/settings`, { method: 'POST', body: 'not json' });
    assert.strictEqual(res.status, 400);
  });

  test('broadcasts modeChanged to connected clients', async () => {
    const events = [];
    const close = await openSSE('testpit', events);
    await waitFor(() => events.find(e => e.type === 'gameState'));

    await post('/r/testpit/settings', { mode: 'cities-knights', playerName: 'Sam' });
    const evt = await waitFor(() => events.find(e => e.type === 'modeChanged'));
    assert.deepStrictEqual(evt.data, { mode: 'cities-knights', changedBy: 'Sam' });
    await close();
  });

  test('does not re-broadcast when mode is unchanged', async () => {
    const events = [];
    const close = await openSSE('testpit', events);
    await waitFor(() => events.find(e => e.type === 'gameState'));

    await post('/r/testpit/settings', { mode: 'catan', playerName: 'Sam' });
    await waitFor(() => events.find(e => e.type === 'modeChanged'));
    await post('/r/testpit/settings', { mode: 'catan', playerName: 'Sam' });
    await post('/r/testpit/settings', { mode: 'free', playerName: 'Sam' });
    await waitFor(() => events.find(e => e.type === 'modeChanged' && e.data.mode === 'free'));

    const changes = events.filter(e => e.type === 'modeChanged');
    assert.strictEqual(changes.length, 2);
    await close();
  });

  test('two clients in the same Pit both receive the mode change', async () => {
    const eventsA = [];
    const eventsB = [];
    const closeA = await openSSE('testpit', eventsA);
    const closeB = await openSSE('testpit', eventsB);
    await waitFor(() => eventsA.find(e => e.type === 'gameState'));
    await waitFor(() => eventsB.find(e => e.type === 'gameState'));

    await post('/r/testpit/settings', { mode: 'catan', playerName: 'Sam' });
    const a = await waitFor(() => eventsA.find(e => e.type === 'modeChanged'));
    const b = await waitFor(() => eventsB.find(e => e.type === 'modeChanged'));
    assert.deepStrictEqual(a.data, { mode: 'catan', changedBy: 'Sam' });
    assert.deepStrictEqual(b.data, a.data);
    await closeA();
    await closeB();
  });

  test('new joiners receive currentMode in the gameState snapshot', async () => {
    await post('/r/testpit/settings', { mode: 'cities-knights' });

    const events = [];
    const close = await openSSE('testpit', events);
    const snapshot = await waitFor(() => events.find(e => e.type === 'gameState'));
    assert.strictEqual(snapshot.data.currentMode, 'cities-knights');
    await close();
  });
});

describe('Roll mode enforcement', () => {
  test('free mode accepts spec and notation rolls', async () => {
    assert.strictEqual((await post('/r/testpit/roll', { spec: { count: 2, sides: 6 } })).status, 200);
    assert.strictEqual((await post('/r/testpit/roll', { notation: '1d20' })).status, 200);
  });

  test('free mode rejects preset rolls with 409 and reports currentMode', async () => {
    const res = await post('/r/testpit/roll', { preset: 'catan' });
    assert.strictEqual(res.status, 409);
    assert.strictEqual((await res.json()).currentMode, 'free');
  });

  test('game mode accepts only its own preset', async () => {
    await post('/r/testpit/settings', { mode: 'catan' });
    assert.strictEqual((await post('/r/testpit/roll', { preset: 'catan' })).status, 200);

    const stalePreset = await post('/r/testpit/roll', { preset: 'cities-knights' });
    assert.strictEqual(stalePreset.status, 409);
    assert.strictEqual((await stalePreset.json()).currentMode, 'catan');

    const staleFree = await post('/r/testpit/roll', { spec: { count: 1, sides: 6 } });
    assert.strictEqual(staleFree.status, 409);
  });

  test('invalid roll bodies still fail with 400, not 409', async () => {
    const res = await post('/r/testpit/roll', { preset: 'nope' });
    assert.strictEqual(res.status, 400);
  });
});
