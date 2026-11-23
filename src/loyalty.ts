export const WEIGHTS = { day: 10, streak: 5, msg: 0.2, kick: 0.5, sub: 50, giftSub: 25, redemption: 2 } as const;
export const DAILY_MSG_CAP = 30;

const LEVELS: [number, string][] = [
  [1500, '👑 Əfsanə'],
  [600, '💎 Sadiq'],
  [200, '⭐ Daimi'],
  [50, '👋 Tanış'],
  [0, '🌱 Yeni'],
];

export type Stats = {
  daysActive: number;
  streak: number;
  countedMsgs: number;
  kicksTotal: number;
  subs: number;
  giftSubs: number;
  redemptions: number;
};

export function computeScore(s: Stats): number {
  const raw =
    s.daysActive * WEIGHTS.day + s.streak * WEIGHTS.streak + s.countedMsgs * WEIGHTS.msg +
    s.kicksTotal * WEIGHTS.kick + s.subs * WEIGHTS.sub + s.giftSubs * WEIGHTS.giftSub + s.redemptions * WEIGHTS.redemption;
  return Math.round(raw * 10) / 10;
}

export function levelFor(score: number): string {
  return LEVELS.find(([min]) => score >= min)?.[1] ?? LEVELS[LEVELS.length - 1][1];
}

/** Local calendar day, 'YYYY-MM-DD'. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function prevDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1).getTime());
}

export type DayState = { lastActiveDay: string | null; streak: number; daysActive: number; msgsToday: number };

export function advanceDay(prev: DayState, today: string): DayState {
  if (prev.lastActiveDay !== null && today <= prev.lastActiveDay) return prev;
  const streak = prev.lastActiveDay === prevDayKey(today) ? prev.streak + 1 : 1;
  return { lastActiveDay: today, streak, daysActive: prev.daysActive + 1, msgsToday: 0 };
}
