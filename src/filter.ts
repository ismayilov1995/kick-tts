import type { KickEvent, UserContext } from './types';
import type { Settings } from './settings';
import { csv } from './text';

export const BOTS = new Set(['botrix', 'kickbot', 'kicklet', 'lumiastream', 'streamelements', 'nightbot', 'fossabot']);

/** hard = no template either (bots, blocked, the streamer). soft = the event is not read but templates may still fire. */
export type Skip = { reason: string; hard: boolean };

export function skipReason(e: KickEvent, ctx: UserContext, s: Settings): Skip | null {
  const name = e.username.toLowerCase();
  if (BOTS.has(name)) return { reason: 'bot', hard: true };
  if (ctx.blocked) return { reason: 'bloklanıb', hard: true };
  if (s.username && name === s.username.toLowerCase()) return { reason: 'streamerin öz mesajı', hard: true };
  switch (e.type) {
    case 'chat':
      if ((e.text ?? '').trimStart().startsWith('!')) return { reason: 'əmr (!)', hard: false };
      return s.readChat ? null : { reason: 'chat söndürülüb', hard: false };
    case 'reward': {
      if (!s.readRewards) return { reason: 'channel points söndürülüb', hard: false };
      const allow = csv(s.rewardAllowList);
      return allow.length && !allow.includes((e.rewardTitle ?? '').toLocaleLowerCase('tr')) ? { reason: 'reward siyahıda yoxdur', hard: false } : null;
    }
    case 'kicks':
      return s.readKicks ? null : { reason: 'KICK söndürülüb', hard: false };
    case 'sub':
    case 'giftsub':
      return s.readSubs ? null : { reason: 'abunəlik söndürülüb', hard: false };
  }
}
