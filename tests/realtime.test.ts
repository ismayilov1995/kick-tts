import { expect, test } from 'bun:test';
import { FALLBACK, getPusherCreds, KickSource, type SocketLike, type SourceStatus } from '../src/kick/realtime';

class FakeSocket implements SocketLike {
  sent: unknown[] = [];
  closed = false;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;
  send(d: string) { this.sent.push(JSON.parse(d)); }
  close() { this.closed = true; this.onclose?.(); }
  emit(msg: unknown) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

function setup() {
  const sockets: FakeSocket[] = [];
  const urls: string[] = [];
  const events: unknown[][] = [];
  const statuses: SourceStatus[] = [];
  const src = new KickSource({
    backoffMs: 20,
    channelId: '668',
    chatroomId: '669',
    onEvent: (c, e, d) => events.push([c, e, d]),
    onStatus: (s) => statuses.push(s),
    creds: async () => ({ key: 'k1', cluster: 'eu', fallback: false }),
    connect: (url) => {
      urls.push(url);
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
  });
  return { src, sockets, urls, events, statuses };
}

test('connects and subscribes to the 4 channels', async () => {
  const t = setup();
  await t.src.start();
  expect(t.urls[0]).toBe('wss://ws-eu.pusher.com/app/k1?protocol=7&client=js&version=8.4.0&flash=false');
  t.sockets[0].emit({ event: 'pusher:connection_established', data: '{"socket_id":"1.2","activity_timeout":120}' });
  expect(t.sockets[0].sent).toEqual(
    ['chatrooms.669.v2', 'chatroom_669', 'channel_668', 'channel.668'].map((channel) => ({ event: 'pusher:subscribe', data: { auth: '', channel } })),
  );
  expect(t.statuses.at(-1)).toEqual({ state: 'connected', error: undefined, fallbackKey: false });
  t.src.stop();
});

test('answers ping with pong', async () => {
  const t = setup();
  await t.src.start();
  t.sockets[0].emit({ event: 'pusher:ping', data: {} });
  expect(t.sockets[0].sent).toEqual([{ event: 'pusher:pong', data: {} }]);
  t.src.stop();
});

test('forwards app events with their raw data; ignores pusher internals', async () => {
  const t = setup();
  await t.src.start();
  t.sockets[0].emit({ event: 'pusher_internal:subscription_succeeded', channel: 'x', data: '{}' });
  t.sockets[0].emit({ event: 'App\\Events\\ChatMessageEvent', channel: 'chatrooms.669.v2', data: '{"content":"hi"}' });
  expect(t.events).toEqual([['chatrooms.669.v2', 'App\\Events\\ChatMessageEvent', '{"content":"hi"}']]);
  t.src.stop();
});

test('reports pusher:error', async () => {
  const t = setup();
  await t.src.start();
  t.sockets[0].emit({ event: 'pusher:error', data: { code: 4001, message: 'App key not in this cluster' } });
  expect(t.statuses.at(-1)?.error).toBe('App key not in this cluster');
  t.src.stop();
});

test('reconnects after the server closes; stop() prevents it', async () => {
  const t = setup();
  await t.src.start();
  t.sockets[0].onclose?.();
  expect(t.statuses.at(-1)?.state).toBe('disconnected');
  await Bun.sleep(300);
  expect(t.sockets).toHaveLength(2);
  t.src.stop();
  expect(t.sockets[1].closed).toBe(true);
  await Bun.sleep(300);
  expect(t.sockets).toHaveLength(2);
});

const fetchOf = (body: unknown, status = 200) => (async () => Response.json(body, { status })) as unknown as typeof fetch;

test('credentials from the Kick realtime endpoint', async () => {
  const f = fetchOf({ data: { connections: [{ provider: 'pusher', credentials: { app_key: 'abc', cluster: 'mt1' } }] } });
  expect(await getPusherCreds(f)).toEqual({ key: 'abc', cluster: 'mt1', fallback: false });
});

test('credentials fall back on error or bad shape', async () => {
  const boom = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
  expect(await getPusherCreds(boom)).toEqual({ ...FALLBACK, fallback: true });
  expect(await getPusherCreds(fetchOf({ data: {} }))).toEqual({ ...FALLBACK, fallback: true });
});
