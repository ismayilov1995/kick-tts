import { afterAll, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from '../src/app';
import { startServer } from '../src/server';
import type { VoiceEngine } from '../src/voice/os';

const engine: VoiceEngine = {
  listVoices: async () => [{ id: 'Yelda', name: 'Yelda', lang: 'tr_TR' }],
  synth: async (_text, _voice, out) => {
    await Bun.write(out, 'RIFF0000WAVE');
  },
};
const app = new App(mkdtempSync(join(tmpdir(), 'ktts-')), engine);
await app.init();
const server = startServer(app, 0);
const base = `http://127.0.0.1:${server.port}`;
afterAll(() => server.stop(true));

async function waitFor(cond: () => boolean, ms = 2000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timeout');
    await Bun.sleep(10);
  }
}

test('serves the dashboard and overlay pages', async () => {
  expect(await (await fetch(`${base}/`)).text()).toContain('Kick TTS');
  expect((await fetch(`${base}/overlay`)).status).toBe(200);
});

test('state endpoint returns settings and voices', async () => {
  const s = await (await fetch(`${base}/api/state`)).json();
  expect(s.settings.readKicks).toBe(true);
  expect(s.voices[0].id).toBe('Yelda');
});

test('requests from other sites are rejected', async () => {
  const r = await fetch(`${base}/api/skip`, { method: 'POST', headers: { origin: 'https://evil.example' } });
  expect(r.status).toBe(403);
});

test('settings POST is validated', async () => {
  const r = await fetch(`${base}/api/settings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ maxLength: 9999, readChat: 'yes' }) });
  expect(await r.json()).toMatchObject({ maxLength: 500, readChat: false });
});

test('overlay flow: play → audio → ended → logged as spoken', async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?role=overlay`);
  const msgs: any[] = [];
  ws.onmessage = (m) => msgs.push(JSON.parse(String(m.data)));
  await new Promise((r) => (ws.onopen = r));
  await waitFor(() => app.snapshot().status.overlays === 1);
  app.test();
  await waitFor(() => msgs.length > 0);
  expect(msgs[0]).toMatchObject({ type: 'play', text: 'Salam! Bu, Kick TTS sınaq mesajıdır.', caption: false });
  const audio = await fetch(`${base}${msgs[0].url}`);
  expect(audio.status).toBe(200);
  expect(audio.headers.get('content-type')).toBe('audio/wav');
  ws.send(JSON.stringify({ type: 'ended', id: msgs[0].id }));
  await waitFor(() => app.player.current === null);
  expect(app.snapshot().log[0]).toMatchObject({ status: 'spoken', username: 'Test' });
  ws.close();
});
