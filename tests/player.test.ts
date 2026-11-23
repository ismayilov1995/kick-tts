import { expect, test } from 'bun:test';
import { Player, type Playing } from '../src/player';
import { SpeechQueue, type QueueItem } from '../src/queue';

const item = (id: string, text = id): QueueItem => ({ id, text, voiceId: 'v', priority: 3, kind: 'chat', eventId: -1, username: 'u' });
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(opts: { connected?: boolean; failText?: string; max?: number } = {}) {
  const queue = new SpeechQueue(opts.max ?? 15);
  const played: Playing[] = [];
  const done: [string, string, string | undefined][] = [];
  const state = { connected: opts.connected ?? true, stops: 0 };
  const player = new Player(
    queue,
    async (i) => {
      if (i.text === opts.failText) throw new Error('synth fail');
      return `/nonexistent/${i.id}.wav`;
    },
    { connected: () => state.connected, play: (p) => played.push(p), stop: () => state.stops++ },
    (i, result, reason) => done.push([i.id, result, reason]),
    50,
  );
  return { queue, player, played, done, state, ids: () => played.map((p) => p.id) };
}

test('plays one at a time; next after ended', async () => {
  const t = setup();
  t.player.enqueue(item('a'));
  t.player.enqueue(item('b'));
  await flush();
  expect(t.ids()).toEqual(['a']);
  t.player.ended('a');
  await flush();
  expect(t.ids()).toEqual(['a', 'b']);
  expect(t.done[0]).toEqual(['a', 'spoken', undefined]);
});

test('waits until an overlay is connected', async () => {
  const t = setup({ connected: false });
  t.player.enqueue(item('a'));
  await flush();
  expect(t.ids()).toEqual([]);
  t.state.connected = true;
  await t.player.pump();
  expect(t.ids()).toEqual(['a']);
});

test('synth failure is reported and the queue moves on', async () => {
  const t = setup({ failText: 'bad' });
  t.player.enqueue(item('x', 'bad'));
  t.player.enqueue(item('ok'));
  await flush();
  await flush();
  expect(t.done[0]).toEqual(['x', 'failed', 'synth fail']);
  expect(t.ids()).toEqual(['ok']);
});

test('skip stops the overlay and plays the next item', async () => {
  const t = setup();
  t.player.enqueue(item('a'));
  t.player.enqueue(item('b'));
  await flush();
  t.player.skip();
  await flush();
  expect(t.state.stops).toBe(1);
  expect(t.done[0]).toEqual(['a', 'skipped', undefined]);
  expect(t.ids()).toEqual(['a', 'b']);
});

test('stale ended ids are ignored', async () => {
  const t = setup();
  t.player.enqueue(item('a'));
  await flush();
  t.player.ended('zzz');
  expect(t.player.current?.id).toBe('a');
});

test('overlay disconnect puts the current item back', async () => {
  const t = setup();
  t.player.enqueue(item('a'));
  await flush();
  t.state.connected = false;
  t.player.disconnected();
  expect(t.player.current).toBeNull();
  expect(t.queue.size).toBe(1);
  t.state.connected = true;
  await t.player.pump();
  expect(t.ids()).toEqual(['a', 'a']);
});

test('watchdog ends an item the overlay never finished', async () => {
  const t = setup();
  t.player.enqueue(item('a'));
  await flush();
  await Bun.sleep(80);
  expect(t.done[0]).toEqual(['a', 'spoken', undefined]);
});

test('pause holds the queue until resume', async () => {
  const t = setup();
  t.player.pause();
  t.player.enqueue(item('a'));
  await flush();
  expect(t.ids()).toEqual([]);
  t.player.resume();
  await flush();
  expect(t.ids()).toEqual(['a']);
});

test('dropped items are reported', () => {
  const t = setup({ connected: false, max: 1 });
  t.player.enqueue(item('a'));
  t.player.enqueue(item('b'));
  expect(t.done).toEqual([['a', 'dropped', 'növbə dolu']]);
});
