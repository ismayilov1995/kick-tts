import { expect, test } from 'bun:test';
import { safeText } from '../src/safety';

const S = { maxLength: 200, bannedWords: 'pis, çirkin' };

test('cleans links', () => expect(safeText('salam https://x.com dostlar', S)).toBe('salam dostlar'));
test('blocks banned words, Turkish-aware case', () => expect(safeText('Bu PİS söz', S)).toBeNull());
test('empty after cleaning is null', () => expect(safeText('[emote:1:x]', S)).toBeNull());
test('passes normal text', () => expect(safeText('Təbriklər, Murad!', S)).toBe('Təbriklər, Murad!'));
