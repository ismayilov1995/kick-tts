import type { KickEvent, Responder, UserContext, Utterance } from './types';
import { levelFor } from './loyalty';

/** Order matters: the first enabled trigger that fires is the one spoken. */
export type TemplateKey = 'level_up' | 'msg_milestone' | 'streak' | 'comeback' | 'first_message' | 'spam';
export type TemplateConfig = { enabled: boolean; variants: string[] };
type Vars = Record<string, string | number>;

// No suffix right after {user}: Azerbaijani suffixes depend on the name's vowels.
export const DEFAULT_TEMPLATES: Record<TemplateKey, TemplateConfig> = {
  level_up: { enabled: true, variants: ['Təbriklər, {user}! Yeni səviyyə: {level}.', '{user} artıq yeni səviyyədədir: {level}!'] },
  msg_milestone: { enabled: true, variants: ['{user} {n} mesaja çatdı!', 'Diqqət: {user} artıq {n} mesaj yazıb!'] },
  streak: { enabled: true, variants: ['{user} {streak} gündür ardıcıl buradadır!', '{streak} gün dalbadal! Sağ ol, {user}.'] },
  comeback: { enabled: true, variants: ['Kimləri görürük! {user} {days} gün sonra qayıtdı.', 'Xoş gördük, {user}! {days} gün idi görünmürdün.'] },
  first_message: { enabled: false, variants: ['Xoş gəldin, {user}!', 'Salam {user}, kanala xoş gəldin!'] },
  spam: { enabled: false, variants: ['{user}, klaviaturanı bir az dincə burax.', '{user}, sakit ol, hamı səni gördü.'] },
};

export const STREAK_MILESTONES = [3, 7, 14, 30];
export const MSG_MILESTONES = [100, 500, 1000, 5000];
export const COMEBACK_DAYS = 7;
export const SPAM_PER_MINUTE = 10;
export const GLOBAL_COOLDOWN_MS = 30_000;
const DAY = 86_400_000;

export const fill = (tpl: string, vars: Vars): string => tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));

export function triggers(e: KickEvent, ctx: UserContext): [TemplateKey, Vars][] {
  const p = ctx.prev;
  const out: [TemplateKey, Vars][] = [];
  if (ctx.level !== (p?.level ?? levelFor(0))) out.push(['level_up', { level: ctx.level.replace(/^\S+\s/, '') }]);
  if (e.type === 'chat' && MSG_MILESTONES.includes(ctx.msgCount) && (p?.msgCount ?? 0) < ctx.msgCount) out.push(['msg_milestone', { n: ctx.msgCount }]);
  if (p && ctx.streak !== p.streak && STREAK_MILESTONES.includes(ctx.streak)) out.push(['streak', { streak: ctx.streak }]);
  if (p && e.ts - p.lastSeen >= COMEBACK_DAYS * DAY) out.push(['comeback', { days: Math.floor((e.ts - p.lastSeen) / DAY) }]);
  if (e.type === 'chat' && (p?.msgCount ?? 0) === 0) out.push(['first_message', {}]);
  if (e.type === 'chat' && ctx.msgsLastMinute > SPAM_PER_MINUTE) out.push(['spam', {}]);
  return out;
}

export class TemplateResponder implements Responder {
  private fired = new Set<string>();
  private lastAt = -Infinity;

  constructor(
    private config: () => Record<TemplateKey, TemplateConfig>,
    private now: () => number = Date.now,
    private rand: () => number = Math.random,
  ) {}

  respond(e: KickEvent, ctx: UserContext): Utterance[] {
    const t = this.now();
    if (t - this.lastAt < GLOBAL_COOLDOWN_MS) return [];
    for (const [key, vars] of triggers(e, ctx)) {
      const cfg = this.config()[key];
      const id = `${ctx.userId}:${key}`;
      if (!cfg?.enabled || cfg.variants.length === 0 || this.fired.has(id)) continue;
      this.fired.add(id);
      this.lastAt = t;
      const tpl = cfg.variants[Math.floor(this.rand() * cfg.variants.length)];
      return [{ text: fill(tpl, { user: ctx.username, ...vars }), voice: 'announcer', priority: 2, kind: `template:${key}` }];
    }
    return [];
  }
}
