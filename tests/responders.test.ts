import { expect, test } from 'bun:test';
import { DirectResponder } from '../src/responders';
import { mergeSettings, type Settings } from '../src/settings';
import { makeCtx, makeEvent } from './helpers';

const say = (e: Parameters<DirectResponder['respond']>[0], p: Partial<Settings> = {}) =>
  new DirectResponder(() => mergeSettings(p)).respond(e, makeCtx());

test('chat with username, emotes removed', () => {
  expect(say(makeEvent({ text: 'salam [emote:1:x]' }))).toEqual([{ text: 'Murad: salam', priority: 3, kind: 'chat' }]);
});
test('chat without username', () => expect(say(makeEvent(), { readUsername: false })[0].text).toBe('salam'));
test('emote-only chat says nothing', () => expect(say(makeEvent({ text: '[emote:1:KEKW]' }))).toEqual([]));
test('kicks message has priority 1', () => {
  expect(say(makeEvent({ type: 'kicks', amount: 100, text: 'gözəl oyun' }))).toEqual([{ text: 'Murad: gözəl oyun', priority: 1, kind: 'kicks' }]);
});
test('kicks without (or with empty) message uses the default line', () => {
  expect(say(makeEvent({ type: 'kicks', amount: 100, text: undefined }))[0].text).toBe('Murad 100 KICK göndərdi');
  expect(say(makeEvent({ type: 'kicks', amount: 100, text: '[emote:1:x]' }))[0].text).toBe('Murad 100 KICK göndərdi');
});
test('reward reads input, else title', () => {
  expect(say(makeEvent({ type: 'reward', rewardTitle: 'Hidrate ol', text: 'su iç!' }))[0].text).toBe('Murad: su iç!');
  expect(say(makeEvent({ type: 'reward', rewardTitle: 'Hidrate ol', text: undefined }))[0].text).toBe('Murad: Hidrate ol');
});
test('subs and gift subs', () => {
  expect(say(makeEvent({ type: 'sub', text: undefined }))[0].text).toBe('Murad abunə oldu');
  expect(say(makeEvent({ type: 'giftsub', amount: 3, text: undefined }))[0].text).toBe('Murad 3 abunəlik hədiyyə etdi');
});
