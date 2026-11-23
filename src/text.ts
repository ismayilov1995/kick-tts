const EMOTE = /\[emote:\d+:[^\]]*\]/g;
const LINK = /(?:https?:\/\/|www\.)\S+|(?<![\p{L}\p{N}_-])[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)*\.(?:com|net|org|io|gg|tv|ru|az|tr|me|ly|co|xyz|app|dev)(?![\p{L}\p{N}])\S*/giu;
const REPEAT = /(.)\1{3,}/gu;

export const hasCyrillic = (s: string): boolean => /\p{Script=Cyrillic}/u.test(s);

export const csv = (s: string): string[] =>
  s.split(',').map((x) => x.trim().toLocaleLowerCase('tr')).filter(Boolean);

/** Removes emotes and links, shortens "aaaaaa" to "aaa", collapses spaces, cuts to maxLength code points. */
export function cleanText(input: string, maxLength: number): string {
  const s = input.normalize('NFKC').replace(/\p{Cf}/gu, '').replace(EMOTE, ' ').replace(LINK, ' ').replace(REPEAT, '$1$1$1').replace(/\s+/g, ' ').trim();
  return [...s].slice(0, maxLength).join('').trim();
}
