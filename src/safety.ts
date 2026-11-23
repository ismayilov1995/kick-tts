import type { Settings } from './settings';
import { cleanText, csv } from './text';

/** Last check on every line before it is spoken (direct, template, later LLM). null = do not speak. */
export function safeText(text: string, s: Pick<Settings, 'maxLength' | 'bannedWords'>): string | null {
  const t = cleanText(text, s.maxLength);
  if (!t) return null;
  const low = t.toLocaleLowerCase('tr');
  return csv(s.bannedWords).some((w) => low.includes(w.toLocaleLowerCase('tr'))) ? null : t;
}
