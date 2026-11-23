import { Database } from 'bun:sqlite';
import type { KickEvent, UserContext } from '../types';
import { advanceDay, computeScore, DAILY_MSG_CAP, dayKey, levelFor } from '../loyalty';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, username TEXT NOT NULL, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS users_lower_name ON users (lower(username));
CREATE TABLE IF NOT EXISTS channel_users (
  channel_id TEXT NOT NULL, user_id TEXT NOT NULL,
  msg_count INTEGER NOT NULL DEFAULT 0, msgs_today INTEGER NOT NULL DEFAULT 0, counted_msgs INTEGER NOT NULL DEFAULT 0,
  days_active INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0, last_active_day TEXT,
  kicks_total REAL NOT NULL DEFAULT 0, subs INTEGER NOT NULL DEFAULT 0, gift_subs INTEGER NOT NULL DEFAULT 0,
  redemptions INTEGER NOT NULL DEFAULT 0, score REAL NOT NULL DEFAULT 0, level TEXT NOT NULL,
  blocked INTEGER NOT NULL DEFAULT 0, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
  PRIMARY KEY (channel_id, user_id));
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY, channel_id TEXT NOT NULL, user_id TEXT NOT NULL, type TEXT NOT NULL,
  text TEXT, amount REAL, spoken INTEGER, skip_reason TEXT, raw_json TEXT, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS events_user ON events (channel_id, user_id, ts);
CREATE INDEX IF NOT EXISTS events_ts ON events (channel_id, ts)
`;

const RAW_TTL_MS = 7 * 86_400_000;
const USER_COLS = 'cu.user_id, u.username, cu.score, cu.level, cu.msg_count, cu.days_active, cu.streak, cu.blocked';

type Row = {
  channel_id: string; user_id: string; msg_count: number; msgs_today: number; counted_msgs: number;
  days_active: number; streak: number; last_active_day: string | null; kicks_total: number; subs: number;
  gift_subs: number; redemptions: number; score: number; level: string; blocked: number; first_seen: number; last_seen: number;
};

export type UserRow = {
  user_id: string; username: string; score: number; level: string;
  msg_count: number; days_active: number; streak: number; blocked: number;
};

export type Profile = Row & { username: string; recent: { text: string; ts: number }[] };

export class Store {
  readonly db: Database;

  constructor(path = ':memory:') {
    this.db = new Database(path, { create: true });
    this.db.run('PRAGMA journal_mode = WAL');
    for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) this.db.run(stmt);
  }

  /** Events without a numeric id (e.g. subscriptions) reuse the id of a known user with the same name. */
  resolveUserId(e: Pick<KickEvent, 'userId' | 'username'>): string {
    if (!e.userId.startsWith('kick:name:')) return e.userId;
    const hit = this.db
      .query<{ id: string }, [string]>("SELECT id FROM users WHERE lower(username) = ? AND id NOT LIKE 'kick:name:%' ORDER BY last_seen DESC LIMIT 1")
      .get(e.username.toLowerCase());
    return hit?.id ?? e.userId;
  }

  /** Stores the event, updates the viewer's stats and returns the context responders need. */
  record(input: KickEvent): { eventId: number; ctx: UserContext } {
    return this.db.transaction(() => {
      const e = { ...input, userId: this.resolveUserId(input) };
      const before = this.row(e.channelId, e.userId);
      const day = advanceDay(
        {
          lastActiveDay: before?.last_active_day ?? null,
          streak: before?.streak ?? 0,
          daysActive: before?.days_active ?? 0,
          msgsToday: before?.msgs_today ?? 0,
        },
        dayKey(e.ts),
      );
      const isChat = e.type === 'chat';
      const msgsToday = day.msgsToday + (isChat ? 1 : 0);
      const msgCount = (before?.msg_count ?? 0) + (isChat ? 1 : 0);
      const stats = {
        daysActive: day.daysActive,
        streak: day.streak,
        countedMsgs: (before?.counted_msgs ?? 0) + (isChat && msgsToday <= DAILY_MSG_CAP ? 1 : 0),
        kicksTotal: (before?.kicks_total ?? 0) + (e.type === 'kicks' ? e.amount ?? 0 : 0),
        subs: (before?.subs ?? 0) + (e.type === 'sub' ? 1 : 0),
        giftSubs: (before?.gift_subs ?? 0) + (e.type === 'giftsub' ? e.amount ?? 1 : 0),
        redemptions: (before?.redemptions ?? 0) + (e.type === 'reward' ? 1 : 0),
      };
      const score = computeScore(stats);
      const level = levelFor(score);
      const firstSeen = before?.first_seen ?? e.ts;
      const blocked = before?.blocked ?? 0;

      this.db
        .query(`INSERT INTO users (id, username, first_seen, last_seen) VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET username = excluded.username, last_seen = excluded.last_seen`)
        .run(e.userId, e.username, e.ts, e.ts);
      this.db
        .query(`INSERT OR REPLACE INTO channel_users (channel_id, user_id, msg_count, msgs_today, counted_msgs, days_active,
          streak, last_active_day, kicks_total, subs, gift_subs, redemptions, score, level, blocked, first_seen, last_seen)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(e.channelId, e.userId, msgCount, msgsToday, stats.countedMsgs, stats.daysActive, stats.streak,
          day.lastActiveDay, stats.kicksTotal, stats.subs, stats.giftSubs, stats.redemptions, score, level, blocked, firstSeen, e.ts);
      const res = this.db
        .query('INSERT INTO events (channel_id, user_id, type, text, amount, raw_json, ts) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(e.channelId, e.userId, e.type, e.text ?? e.rewardTitle ?? null, e.amount ?? null, JSON.stringify(e.raw ?? null), e.ts);
      const { n } = this.db
        .query<{ n: number }, [string, string, number]>(
          "SELECT count(*) AS n FROM events WHERE channel_id = ? AND user_id = ? AND type = 'chat' AND ts > ?")
        .get(e.channelId, e.userId, e.ts - 60_000)!;

      return {
        eventId: Number(res.lastInsertRowid),
        ctx: {
          userId: e.userId, username: e.username, level, score, msgCount,
          daysActive: stats.daysActive, streak: stats.streak, firstSeen, lastSeen: e.ts,
          kicksTotal: stats.kicksTotal, subs: stats.subs, giftSubs: stats.giftSubs, redemptions: stats.redemptions,
          blocked: blocked === 1, msgsLastMinute: n,
          recentMessages: this.recent(e.channelId, e.userId, 20),
          prev: before ? { msgCount: before.msg_count, streak: before.streak, level: before.level, lastSeen: before.last_seen } : null,
        },
      };
    })();
  }

  markSpoken(eventId: number, spoken: boolean, reason: string | null = null): void {
    this.db.query('UPDATE events SET spoken = ?, skip_reason = ? WHERE id = ?').run(spoken ? 1 : 0, reason, eventId);
  }

  recent(channelId: string, userId: string, limit: number): { text: string; ts: number }[] {
    return this.db
      .query<{ text: string; ts: number }, [string, string, number]>(
        "SELECT text, ts FROM events WHERE channel_id = ? AND user_id = ? AND type = 'chat' AND text IS NOT NULL ORDER BY ts DESC, id DESC LIMIT ?")
      .all(channelId, userId, limit);
  }

  top(channelId: string, limit = 20): UserRow[] {
    return this.db
      .query<UserRow, [string, number]>(`SELECT ${USER_COLS} FROM channel_users cu JOIN users u ON u.id = cu.user_id
        WHERE cu.channel_id = ? ORDER BY cu.score DESC LIMIT ?`)
      .all(channelId, limit);
  }

  search(channelId: string, q: string): UserRow[] {
    const like = q.toLowerCase().replace(/[\\%_]/g, '\\$&') + '%';
    return this.db
      .query<UserRow, [string, string]>(`SELECT ${USER_COLS} FROM channel_users cu JOIN users u ON u.id = cu.user_id
        WHERE cu.channel_id = ? AND lower(u.username) LIKE ? ESCAPE '\\' ORDER BY cu.score DESC LIMIT 20`)
      .all(channelId, like);
  }

  profile(channelId: string, userId: string): Profile | null {
    const row = this.db
      .query<Row & { username: string }, [string, string]>(
        'SELECT cu.*, u.username FROM channel_users cu JOIN users u ON u.id = cu.user_id WHERE cu.channel_id = ? AND cu.user_id = ?')
      .get(channelId, userId);
    return row ? { ...row, recent: this.recent(channelId, userId, 50) } : null;
  }

  setBlocked(channelId: string, userId: string, blocked: boolean): void {
    this.db.query('UPDATE channel_users SET blocked = ? WHERE channel_id = ? AND user_id = ?').run(blocked ? 1 : 0, channelId, userId);
  }

  /** "Məlumatı sil": removes the viewer from this channel, and entirely if no other channel knows them. */
  deleteUser(channelId: string, userId: string): void {
    this.db.transaction(() => {
      this.db.query('DELETE FROM events WHERE channel_id = ? AND user_id = ?').run(channelId, userId);
      this.db.query('DELETE FROM channel_users WHERE channel_id = ? AND user_id = ?').run(channelId, userId);
      this.db.query('DELETE FROM users WHERE id = ? AND NOT EXISTS (SELECT 1 FROM channel_users WHERE user_id = ?)').run(userId, userId);
    })();
  }

  pruneRaw(now = Date.now()): number {
    return this.db.query('UPDATE events SET raw_json = NULL WHERE raw_json IS NOT NULL AND ts < ?').run(now - RAW_TTL_MS).changes;
  }

  private row(channelId: string, userId: string): Row | null {
    return this.db.query<Row, [string, string]>('SELECT * FROM channel_users WHERE channel_id = ? AND user_id = ?').get(channelId, userId);
  }
}
