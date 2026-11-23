import { describe, expect, test } from 'bun:test';
import { Store } from '../src/db/store';
import { DAY, T0, makeEvent } from './helpers';

const CH = 'kick:668';

describe('Store.record', () => {
  test('first chat: prev is null, stats start at 1', () => {
    const s = new Store();
    const { eventId, ctx } = s.record(makeEvent());
    expect(eventId).toBeGreaterThan(0);
    expect(ctx).toMatchObject({ msgCount: 1, daysActive: 1, streak: 1, prev: null, level: '🌱 Yeni', msgsLastMinute: 1, score: 15.2 });
    expect(ctx.recentMessages).toEqual([{ text: 'salam', ts: T0 }]);
  });

  test('same day: counts messages, keeps streak, exposes prev', () => {
    const s = new Store();
    s.record(makeEvent());
    const { ctx } = s.record(makeEvent({ ts: T0 + 1000 }));
    expect(ctx).toMatchObject({ msgCount: 2, daysActive: 1, streak: 1 });
    expect(ctx.prev).toEqual({ msgCount: 1, streak: 1, level: '🌱 Yeni', lastSeen: T0 });
  });

  test('next day extends streak', () => {
    const s = new Store();
    s.record(makeEvent());
    const { ctx } = s.record(makeEvent({ ts: T0 + DAY }));
    expect(ctx).toMatchObject({ daysActive: 2, streak: 2 });
  });

  test('only 30 chat messages per day count toward score', () => {
    const s = new Store();
    for (let i = 0; i < 35; i++) s.record(makeEvent({ ts: T0 + i * 1000 }));
    const p = s.profile(CH, 'kick:101')!;
    expect(p.msg_count).toBe(35);
    expect(p.counted_msgs).toBe(30);
    expect(p.score).toBe(21); // 1 day*10 + streak 1*5 + 30*0.2
  });

  test('kicks, gift subs, subs and rewards add up', () => {
    const s = new Store();
    s.record(makeEvent({ type: 'kicks', amount: 100, text: undefined }));
    s.record(makeEvent({ type: 'giftsub', amount: 3, text: undefined }));
    s.record(makeEvent({ type: 'sub', text: undefined }));
    const { ctx } = s.record(makeEvent({ type: 'reward', rewardTitle: 'Su iç', text: undefined }));
    expect(ctx).toMatchObject({ kicksTotal: 100, giftSubs: 3, subs: 1, redemptions: 1, msgCount: 0, score: 192, level: '👋 Tanış' });
  });

  test('msgsLastMinute only counts chat in the last 60 s', () => {
    const s = new Store();
    s.record(makeEvent({ ts: T0 - 120_000 }));
    s.record(makeEvent({ ts: T0 - 30_000 }));
    expect(s.record(makeEvent({ ts: T0 })).ctx.msgsLastMinute).toBe(2);
  });

  test('name-only events resolve to a known user id', () => {
    const s = new Store();
    s.record(makeEvent({ userId: 'kick:5', username: 'Ali' }));
    const { ctx } = s.record(makeEvent({ type: 'sub', userId: 'kick:name:ali', username: 'ali', text: undefined }));
    expect(ctx.userId).toBe('kick:5');
    expect(ctx.subs).toBe(1);
  });

  test('unknown names stay name-keyed', () => {
    const s = new Store();
    expect(s.record(makeEvent({ type: 'sub', userId: 'kick:name:yeni', username: 'Yeni' })).ctx.userId).toBe('kick:name:yeni');
  });
});

describe('Store queries', () => {
  function seeded() {
    const s = new Store();
    s.record(makeEvent({ userId: 'kick:1', username: 'Murad' }));
    s.record(makeEvent({ userId: 'kick:2', username: 'Aysel', type: 'sub', text: undefined }));
    return s;
  }

  test('top orders by score', () => {
    expect(seeded().top(CH).map((r) => r.username)).toEqual(['Aysel', 'Murad']);
  });

  test('search is a case-insensitive prefix match', () => {
    expect(seeded().search(CH, 'MU').map((r) => r.username)).toEqual(['Murad']);
  });

  test('search escapes LIKE wildcards', () => {
    expect(seeded().search(CH, '%')).toEqual([]);
  });

  test('setBlocked shows up in the next context', () => {
    const s = seeded();
    s.setBlocked(CH, 'kick:1', true);
    expect(s.record(makeEvent({ userId: 'kick:1', username: 'Murad' })).ctx.blocked).toBe(true);
  });

  test('markSpoken stores the outcome', () => {
    const s = new Store();
    const { eventId } = s.record(makeEvent());
    s.markSpoken(eventId, false, 'chat söndürülüb');
    expect(s.db.query('SELECT spoken, skip_reason FROM events WHERE id = ?').get(eventId)).toEqual({ spoken: 0, skip_reason: 'chat söndürülüb' });
  });

  test('deleteUser removes events, stats and the user row', () => {
    const s = seeded();
    s.deleteUser(CH, 'kick:1');
    expect(s.profile(CH, 'kick:1')).toBeNull();
    expect(s.db.query("SELECT count(*) AS n FROM events WHERE user_id = 'kick:1'").get()).toEqual({ n: 0 });
    expect(s.db.query("SELECT count(*) AS n FROM users WHERE id = 'kick:1'").get()).toEqual({ n: 0 });
  });

  test('deleteUser keeps the user row when seen in another channel', () => {
    const s = seeded();
    s.record(makeEvent({ channelId: 'kick:999', userId: 'kick:1', username: 'Murad' }));
    s.deleteUser(CH, 'kick:1');
    expect(s.db.query("SELECT count(*) AS n FROM users WHERE id = 'kick:1'").get()).toEqual({ n: 1 });
  });

  test('pruneRaw clears raw_json older than 7 days', () => {
    const s = new Store();
    s.record(makeEvent({ ts: T0 - 8 * DAY, raw: { a: 1 } }));
    s.record(makeEvent({ ts: T0, raw: { b: 2 } }));
    expect(s.pruneRaw(T0)).toBe(1);
    expect(s.db.query('SELECT raw_json FROM events ORDER BY id').all()).toEqual([{ raw_json: null }, { raw_json: '{"b":2}' }]);
  });
});

describe('Store hardening', () => {
  test('out-of-order old events never move last_seen backward', () => {
    const s = new Store();
    s.record(makeEvent());
    s.record(makeEvent({ ts: T0 - 8 * DAY }));
    expect(s.record(makeEvent({ ts: T0 + 1000 })).ctx.prev?.lastSeen).toBe(T0);
  });

  test('deleteUser also removes the name alias', () => {
    const s = new Store();
    s.record(makeEvent({ type: 'sub', userId: 'kick:name:murad', username: 'Murad', text: undefined }));
    s.record(makeEvent());
    s.deleteUser(CH, 'kick:101');
    expect(s.db.query("SELECT count(*) AS n FROM events WHERE user_id IN ('kick:101','kick:name:murad')").get()).toEqual({ n: 0 });
    expect(s.db.query("SELECT count(*) AS n FROM users WHERE id IN ('kick:101','kick:name:murad')").get()).toEqual({ n: 0 });
  });
});
