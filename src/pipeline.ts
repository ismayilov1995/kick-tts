import type { KickEvent, Responder, UserContext, Utterance } from './types';
import type { Store } from './db/store';
import type { Settings } from './settings';
import type { UnknownLog } from './unknown-log';
import { skipReason } from './filter';
import { levelFor } from './loyalty';
import { normalize, parseData, shortName, UNVERIFIED } from './kick/normalize';
import { safeText } from './safety';

export type LogEntry = {
  ts: number;
  username: string;
  type: string;
  text: string;
  status: 'queued' | 'skipped' | 'spoken' | 'failed' | 'dropped';
  reason?: string;
  kind?: string;
};

export type PipelineDeps = {
  store: Store;
  settings: () => Settings;
  direct: Responder;
  templates: Responder;
  enqueue: (u: Utterance, e: KickEvent, eventId: number) => void;
  log: (entry: LogEntry) => void;
  unknown: Pick<UnknownLog, 'write'>;
  channelKey: () => string;
};

const EMPTY = 'boş və ya qadağan mətn';

/** Used only when the DB write fails: speech must keep working. */
function blankContext(e: KickEvent): UserContext {
  return {
    userId: e.userId, username: e.username, level: levelFor(0), score: 0, msgCount: 0, daysActive: 0, streak: 0,
    firstSeen: e.ts, lastSeen: e.ts, kicksTotal: 0, subs: 0, giftSubs: 0, redemptions: 0, blocked: false,
    msgsLastMinute: 0, recentMessages: [], prev: null,
  };
}

export class Pipeline {
  constructor(private d: PipelineDeps) {}

  handleRaw(channel: string, event: string, data: unknown): void {
    const parsed = parseData(data);
    const e = normalize(event, parsed, this.d.channelKey());
    if (!e || UNVERIFIED.has(shortName(event))) this.d.unknown.write(event, channel, parsed);
    if (e) this.handle(e);
  }

  handle(e: KickEvent): void {
    const s = this.d.settings();
    let eventId = -1;
    let ctx: UserContext | null = null;
    try {
      ({ eventId, ctx } = this.d.store.record(e));
    } catch (err) {
      console.error('[db]', err);
    }
    const c = ctx ?? blankContext(e);
    const skip = skipReason(e, c, s);
    const out: Utterance[] = [];
    if (!skip) out.push(...this.d.direct.respond(e, c));
    if (ctx && !skip?.hard) out.push(...this.d.templates.respond(e, ctx));
    const safe = out.flatMap((u) => {
      const text = safeText(u.text, s);
      return text ? [{ ...u, text }] : [];
    });

    const base = { ts: e.ts, username: e.username, type: e.type, text: e.text ?? e.rewardTitle ?? '' };
    const reason = skip?.reason ?? (safe.length === 0 ? EMPTY : undefined);
    if (reason) {
      this.mark(eventId, reason);
      this.d.log({ ...base, status: 'skipped', reason });
    }
    for (const u of safe) {
      this.d.enqueue(u, e, eventId);
      this.d.log({ ...base, text: u.text, status: 'queued', kind: u.kind });
    }
  }

  private mark(eventId: number, reason: string): void {
    if (eventId < 0) return;
    try {
      this.d.store.markSpoken(eventId, false, reason);
    } catch (err) {
      console.error('[db]', err);
    }
  }
}
