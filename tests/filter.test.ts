import { expect, test } from 'bun:test';
import { skipReason } from '../src/filter';
import { mergeSettings, type Settings } from '../src/settings';
import { makeCtx, makeEvent } from './helpers';

const S = (p: Partial<Settings> = {}) => mergeSettings({ username: 'Streamer', ...p });

test('bots are hard skips', () => expect(skipReason(makeEvent({ username: 'BotRix' }), makeCtx(), S())).toEqual({ reason: 'bot', hard: true }));
test('blocked viewers are hard skips', () => expect(skipReason(makeEvent(), makeCtx({ blocked: true }), S({ readChat: true }))).toEqual({ reason: 'bloklanıb', hard: true }));
test("streamer's own messages are hard skips", () => expect(skipReason(makeEvent({ username: 'streamer' }), makeCtx(), S({ readChat: true }))?.hard).toBe(true));
test('commands are soft skips', () => expect(skipReason(makeEvent({ text: ' !discord' }), makeCtx(), S({ readChat: true }))).toEqual({ reason: 'əmr (!)', hard: false }));
test('chat is off by default', () => expect(skipReason(makeEvent(), makeCtx(), S())).toEqual({ reason: 'chat söndürülüb', hard: false }));
test('chat on', () => expect(skipReason(makeEvent(), makeCtx(), S({ readChat: true }))).toBeNull());
test('reward allow-list is case-insensitive', () => {
  const s = S({ rewardAllowList: 'Su iç, Mahnı' });
  expect(skipReason(makeEvent({ type: 'reward', rewardTitle: 'su iç' }), makeCtx(), s)).toBeNull();
  expect(skipReason(makeEvent({ type: 'reward', rewardTitle: 'Başqa' }), makeCtx(), s)?.reason).toBe('reward siyahıda yoxdur');
  expect(skipReason(makeEvent({ type: 'reward', rewardTitle: 'Mahnı' }), makeCtx(), S({ rewardAllowList: 'MAHNI' }))).toBeNull();
});
test('kicks on by default', () => {
  expect(skipReason(makeEvent({ type: 'kicks' }), makeCtx(), S())).toBeNull();
  expect(skipReason(makeEvent({ type: 'kicks' }), makeCtx(), S({ readKicks: false }))?.reason).toBe('KICK söndürülüb');
});
test('subs off by default', () => {
  expect(skipReason(makeEvent({ type: 'sub' }), makeCtx(), S())?.reason).toBe('abunəlik söndürülüb');
  expect(skipReason(makeEvent({ type: 'giftsub' }), makeCtx(), S({ readSubs: true }))).toBeNull();
});
