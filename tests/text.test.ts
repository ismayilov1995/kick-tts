import { expect, test } from 'bun:test';
import { cleanText, csv, hasCyrillic } from '../src/text';

test('strips emotes', () => expect(cleanText('salam [emote:37226:KEKW] dostlar', 200)).toBe('salam dostlar'));
test('strips links', () => expect(cleanText('bax https://x.com/a və kick.com/foo indi', 200)).toBe('bax və indi'));
test('shortens character spam to three', () => expect(cleanText('aaaaaaa!!!!!!', 200)).toBe('aaa!!!'));
test('keeps short repeats', () => expect(cleanText('aaa ok', 200)).toBe('aaa ok'));
test('truncates by code points', () => expect(cleanText('😀😀😀😀😀abc', 2)).toBe('😀😀'));
test('emote-only becomes empty', () => expect(cleanText('[emote:1:KEKW] [emote:2:LUL]', 200)).toBe(''));
test('detects cyrillic', () => {
  expect(hasCyrillic('привет')).toBe(true);
  expect(hasCyrillic('Salam, ə ğ ş')).toBe(false);
});
test('csv lowercases and drops blanks', () => expect(csv(' Su iç, ,MAHNI ')).toEqual(['su iç', 'mahni']));
