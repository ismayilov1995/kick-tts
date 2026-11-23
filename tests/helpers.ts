import type { KickEvent, UserContext } from '../src/types';

export const T0 = new Date(2026, 10, 23, 12, 0, 0).getTime(); // local noon, 2026-11-23
export const DAY = 86_400_000;

export function makeEvent(p: Partial<KickEvent> = {}): KickEvent {
  return { platform: 'kick', channelId: 'kick:668', userId: 'kick:101', username: 'Murad', type: 'chat', text: 'salam', raw: {}, ts: T0, ...p };
}

export function makeCtx(p: Partial<UserContext> = {}): UserContext {
  return {
    userId: 'kick:101', username: 'Murad', level: '🌱 Yeni', score: 0, msgCount: 1, daysActive: 1, streak: 1,
    firstSeen: T0, lastSeen: T0, kicksTotal: 0, subs: 0, giftSubs: 0, redemptions: 0, blocked: false,
    msgsLastMinute: 1, recentMessages: [], prev: null, ...p,
  };
}
