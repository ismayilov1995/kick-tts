import { expect, test } from 'bun:test';
import { Store } from '../src/db/store';
import { Pipeline, type LogEntry } from '../src/pipeline';
import { DirectResponder } from '../src/responders';
import { mergeSettings } from '../src/settings';
import { TemplateResponder } from '../src/templates';
import type { Utterance } from '../src/types';
import { T0, makeEvent } from './helpers';

function setup(patch: Record<string, unknown> = {}) {
  const settings = mergeSettings({ username: 'streamer', channelId: '668', chatroomId: '669', ...patch });
  const store = new Store();
  const queued: { u: Utterance; eventId: number }[] = [];
  const logs: LogEntry[] = [];
  const unknown: string[] = [];
  const pipeline = new Pipeline({
    store,
    settings: () => settings,
    direct: new DirectResponder(() => settings),
    templates: new TemplateResponder(() => settings.templates, () => T0, () => 0),
    enqueue: (u, _e, eventId) => queued.push({ u, eventId }),
    log: (l) => logs.push(l),
    unknown: { write: (ev) => unknown.push(ev) },
    channelKey: () => 'kick:668',
  });
  return { pipeline, store, queued, logs, unknown };
}

test('reads chat when enabled', () => {
  const t = setup({ readChat: true });
  t.pipeline.handle(makeEvent());
  expect(t.queued).toHaveLength(1);
  expect(t.queued[0].u).toEqual({ text: 'Murad: salam', priority: 3, kind: 'chat' });
  expect(t.queued[0].eventId).toBeGreaterThan(0);
  expect(t.logs[0]).toMatchObject({ status: 'queued', username: 'Murad' });
});

test('chat off: skipped and the reason is stored', () => {
  const t = setup();
  t.pipeline.handle(makeEvent());
  expect(t.queued).toEqual([]);
  expect(t.logs[0]).toMatchObject({ status: 'skipped', reason: 'chat söndürülüb' });
  expect(t.store.db.query('SELECT spoken, skip_reason FROM events').get()).toEqual({ spoken: 0, skip_reason: 'chat söndürülüb' });
});

test('templates still run when chat reading is off', () => {
  const t = setup({ templates: { first_message: { enabled: true } } });
  t.pipeline.handle(makeEvent());
  expect(t.queued.map((q) => q.u)).toEqual([{ text: 'Xoş gəldin, Murad!', voice: 'announcer', priority: 2, kind: 'template:first_message' }]);
});

test('bots never trigger templates', () => {
  const t = setup({ readChat: true, templates: { first_message: { enabled: true } } });
  t.pipeline.handle(makeEvent({ username: 'botrix', userId: 'kick:9' }));
  expect(t.queued).toEqual([]);
});

test('emote-only and banned text are skipped', () => {
  const t = setup({ readChat: true, bannedWords: 'pis' });
  t.pipeline.handle(makeEvent({ text: '[emote:1:KEKW]' }));
  t.pipeline.handle(makeEvent({ text: 'pis söz', ts: T0 + 1 }));
  expect(t.queued).toEqual([]);
  expect(t.logs.map((l) => l.reason)).toEqual(['boş və ya qadağan mətn', 'boş və ya qadağan mətn']);
});

test('handleRaw parses the double-encoded chat payload', () => {
  const t = setup({ readChat: true });
  t.pipeline.handleRaw('chatrooms.669.v2', 'App\\Events\\ChatMessageEvent', JSON.stringify({ content: 'hi', sender: { id: 101, username: 'Murad' } }));
  expect(t.queued[0].u.text).toBe('Murad: hi');
  expect(t.unknown).toEqual([]);
});

test('unknown events are logged; unverified ones are logged and processed', () => {
  const t = setup();
  t.pipeline.handleRaw('channel_668', 'App\\Events\\StreamerIsLive', '{}');
  t.pipeline.handleRaw('channel_668', 'KicksGifted', JSON.stringify({ sender: { id: 5, username: 'Ali' }, gift: { amount: 50 } }));
  expect(t.unknown).toEqual(['App\\Events\\StreamerIsLive', 'KicksGifted']);
  expect(t.queued.map((q) => q.u)).toEqual([{ text: 'Ali 50 KICK göndərdi', priority: 1, kind: 'kicks' }]);
});
