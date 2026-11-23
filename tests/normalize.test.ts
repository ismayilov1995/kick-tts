import { expect, test } from 'bun:test';
import { normalize, parseData, shortName, UNVERIFIED, userKey } from '../src/kick/normalize';

const CH = 'kick:668';

test('chat message', () => {
  const data = { id: 'a1', chatroom_id: 669, content: 'salam [emote:37226:KEKW]', type: 'message', sender: { id: 101, username: 'Murad', slug: 'murad' } };
  expect(normalize('App\\Events\\ChatMessageEvent', data, CH, 1000)).toEqual({
    platform: 'kick', channelId: CH, userId: 'kick:101', username: 'Murad', type: 'chat', text: 'salam [emote:37226:KEKW]', raw: data, ts: 1000,
  });
});

test('chat without sender is ignored', () => {
  expect(normalize('App\\Events\\ChatMessageEvent', { content: 'x' }, CH)).toBeNull();
});

test('reward redeemed (verified shape)', () => {
  const data = { reward_title: 'Hidrate ol', user_id: 202, channel_id: 668, username: 'Aysel', user_input: 'su iç!', reward_background_color: '#00e701' };
  expect(normalize('RewardRedeemedEvent', data, CH, 1)).toMatchObject({ type: 'reward', userId: 'kick:202', username: 'Aysel', rewardTitle: 'Hidrate ol', text: 'su iç!' });
});

test('reward without user id falls back to name key', () => {
  expect(normalize('RewardRedeemedEvent', { reward_title: 'X', username: 'Aysel' }, CH)?.userId).toBe('kick:name:aysel');
});

test('kicks gifted with message', () => {
  const data = { sender: { id: 303, username: 'Ali' }, gift: { amount: 100, name: 'Rage Quit', message: 'gözəl oyun' } };
  expect(normalize('KicksGifted', data, CH, 1)).toMatchObject({ type: 'kicks', userId: 'kick:303', username: 'Ali', amount: 100, text: 'gözəl oyun' });
});

test('kicks gifted: string amount, no message', () => {
  const e = normalize('KicksGifted', { sender: { id: 303, username: 'Ali' }, gift: { amount: '50' } }, CH);
  expect(e?.amount).toBe(50);
  expect(e?.text).toBeUndefined();
});

test('subscription', () => {
  expect(normalize('App\\Events\\SubscriptionEvent', { chatroom_id: 669, username: 'Nigar', months: 2 }, CH))
    .toMatchObject({ type: 'sub', username: 'Nigar', userId: 'kick:name:nigar', amount: 2 });
});

test('gifted subscriptions', () => {
  expect(normalize('App\\Events\\GiftedSubscriptionsEvent', { gifted_usernames: ['a', 'b', 'c'], gifter_username: 'Kamal' }, CH))
    .toMatchObject({ type: 'giftsub', username: 'Kamal', amount: 3 });
});

test('unknown event returns null', () => {
  expect(normalize('App\\Events\\MessageDeletedEvent', { id: 1 }, CH)).toBeNull();
});

test('parseData handles double-encoded JSON', () => {
  expect(parseData('{"a":1}')).toEqual({ a: 1 });
  expect(parseData({ a: 1 })).toEqual({ a: 1 });
  expect(parseData('{oops')).toBeNull();
});

test('shortName and UNVERIFIED', () => {
  expect(shortName('App\\Events\\ChatMessageEvent')).toBe('ChatMessageEvent');
  expect(UNVERIFIED.has('KicksGifted')).toBe(true);
});

test('userKey accepts only safe non-negative integer ids', () => {
  expect(userKey('0x1F', 'A')).toBe('kick:name:a');
  expect(userKey(-5, 'A')).toBe('kick:name:a');
  expect(userKey('42', 'A')).toBe('kick:42');
});

test('hostile amounts are rejected or clamped', () => {
  const neg = normalize('KicksGifted', { sender: { id: 1, username: 'A' }, gift: { amount: -5 } }, CH);
  expect(neg?.amount).toBeUndefined();
  expect(normalize('KicksGifted', { sender: { id: 1, username: 'A' }, gift: { amount: 1e12 } }, CH)?.amount).toBe(1_000_000);
  expect(normalize('App\\Events\\GiftedSubscriptionsEvent', { gifter_username: 'K', quantity: 1e9 }, CH)?.amount).toBe(1000);
});
