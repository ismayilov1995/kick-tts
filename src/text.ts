const EMOTE = /\[emote:\d+:[^\]]*\]/g;
const LINK = /(?:https?:\/\/|www\.)\S+|\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|io|gg|tv|ru|az|tr|me|ly|co|xyz|app|dev)\b\S*/gi;
const REPEAT = /(.)\1{3,}/gu;

export const hasCyrillic = (s: string): boolean => /[а-яё]/i.test(s);

export const csv = (s: string): string[] =>
  s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

/** Removes emotes and links, shortens "aaaaaa" to "aaa", collapses spaces, cuts to maxLength code points. */
export function cleanText(input: string, maxLength: number): string {
  const s = input.replace(EMOTE, ' ').replace(LINK, ' ').replace(REPEAT, '$1$1$1').replace(/\s+/g, ' ').trim();
  return [...s].slice(0, maxLength).join('').trim();
}
