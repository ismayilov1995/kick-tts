import type { KickEvent } from '../types';

/** Event names whose payload shape was never seen live. Their raw payload is always logged. */
export const UNVERIFIED = new Set(['KicksGifted', 'SubscriptionEvent', 'ChannelSubscriptionEvent', 'GiftedSubscriptionsEvent']);

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v
    : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v)
    : undefined;

export const shortName = (event: string): string => event.replace(/^App\\Events\\/, '');

export function userKey(id: unknown, username: string): string {
  const n = num(id);
  return n !== undefined ? `kick:${n}` : `kick:name:${username.toLowerCase()}`;
}

/** Pusher sends `data` as a JSON string inside the JSON frame. */
export function parseData(data: unknown): any {
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/** Returns null for events we do not read or cannot parse. */
export function normalize(event: string, data: any, channelId: string, ts = Date.now()): KickEvent | null {
  if (!data || typeof data !== 'object') return null;
  const base = { platform: 'kick' as const, channelId, raw: data, ts };
  switch (shortName(event)) {
    case 'ChatMessageEvent': {
      const username = str(data.sender?.username);
      const text = str(data.content);
      if (!username || text === undefined) return null;
      return { ...base, type: 'chat', userId: userKey(data.sender?.id, username), username, text };
    }
    case 'RewardRedeemedEvent': {
      const username = str(data.username);
      const rewardTitle = str(data.reward_title);
      if (!username || !rewardTitle) return null;
      return { ...base, type: 'reward', userId: userKey(data.user_id, username), username, rewardTitle, text: str(data.user_input) };
    }
    case 'KicksGifted': {
      const username = str(data.sender?.username) ?? str(data.username);
      if (!username) return null;
      const gift = data.gift ?? {};
      return {
        ...base, type: 'kicks', userId: userKey(data.sender?.id, username), username,
        amount: num(gift.amount) ?? num(data.amount), text: str(gift.message) ?? str(data.message),
      };
    }
    case 'SubscriptionEvent':
    case 'ChannelSubscriptionEvent': {
      const username = str(data.username) ?? str(data.user?.username);
      if (!username) return null;
      return { ...base, type: 'sub', userId: userKey(data.user_id ?? data.user?.id, username), username, amount: num(data.months) };
    }
    case 'GiftedSubscriptionsEvent': {
      const username = str(data.gifter_username) ?? str(data.gifter?.username);
      if (!username) return null;
      const n = Array.isArray(data.gifted_usernames) ? data.gifted_usernames.length : num(data.quantity);
      return { ...base, type: 'giftsub', userId: userKey(data.gifter_id ?? data.gifter?.id, username), username, amount: n ?? 1 };
    }
    default:
      return null;
  }
}
