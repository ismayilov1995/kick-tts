import { expect, test } from 'bun:test';
import { advanceDay, computeScore, dayKey, levelFor } from '../src/loyalty';
import { T0 } from './helpers';

test('score formula', () => {
  expect(computeScore({ daysActive: 10, streak: 5, countedMsgs: 100, kicksTotal: 20, subs: 1, giftSubs: 2, redemptions: 3 })).toBe(261);
});

test('level boundaries', () => {
  expect(levelFor(0)).toBe('🌱 Yeni');
  expect(levelFor(49.9)).toBe('🌱 Yeni');
  expect(levelFor(50)).toBe('👋 Tanış');
  expect(levelFor(199)).toBe('👋 Tanış');
  expect(levelFor(200)).toBe('⭐ Daimi');
  expect(levelFor(600)).toBe('💎 Sadiq');
  expect(levelFor(1500)).toBe('👑 Əfsanə');
});

test('dayKey uses local date', () => expect(dayKey(T0)).toBe('2026-11-23'));

const prev = { lastActiveDay: '2026-11-23', streak: 4, daysActive: 9, msgsToday: 12 };

test('first activity ever', () => {
  expect(advanceDay({ lastActiveDay: null, streak: 0, daysActive: 0, msgsToday: 0 }, '2026-11-23'))
    .toEqual({ lastActiveDay: '2026-11-23', streak: 1, daysActive: 1, msgsToday: 0 });
});
test('same day changes nothing', () => expect(advanceDay(prev, '2026-11-23')).toEqual(prev));
test('next day extends streak and resets daily count', () => {
  expect(advanceDay(prev, '2026-11-24')).toEqual({ lastActiveDay: '2026-11-24', streak: 5, daysActive: 10, msgsToday: 0 });
});
test('gap resets streak', () => {
  expect(advanceDay(prev, '2026-11-26')).toEqual({ lastActiveDay: '2026-11-26', streak: 1, daysActive: 10, msgsToday: 0 });
});
test('month boundary', () => {
  expect(advanceDay({ ...prev, lastActiveDay: '2026-11-30' }, '2026-12-01').streak).toBe(5);
});
