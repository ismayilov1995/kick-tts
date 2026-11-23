export type EventType = 'chat' | 'reward' | 'kicks' | 'sub' | 'giftsub';

export type KickEvent = {
  platform: 'kick';
  channelId: string; // 'kick:<numeric channel id>'
  userId: string; // 'kick:<id>' or 'kick:name:<lowercase username>'
  username: string;
  type: EventType;
  text?: string;
  amount?: number;
  rewardTitle?: string;
  raw: unknown;
  ts: number;
};

export type PrevStats = { msgCount: number; streak: number; level: string; lastSeen: number };

/** Everything a responder may know about the viewer. v2's LLM prompt is built from this. */
export type UserContext = {
  userId: string;
  username: string;
  level: string;
  score: number;
  msgCount: number;
  daysActive: number;
  streak: number;
  firstSeen: number;
  lastSeen: number;
  kicksTotal: number;
  subs: number;
  giftSubs: number;
  redemptions: number;
  blocked: boolean;
  msgsLastMinute: number;
  recentMessages: { text: string; ts: number }[]; // newest first, max 20
  prev: PrevStats | null; // stats before this event; null = first event ever in this channel
};

export type VoiceSlot = 'main' | 'cyrillic' | 'announcer';

export type Utterance = { text: string; voice?: VoiceSlot; priority: 1 | 2 | 3; kind: string };

export interface Responder {
  respond(e: KickEvent, ctx: UserContext): Utterance[];
}
