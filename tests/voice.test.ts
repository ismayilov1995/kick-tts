import { expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MacVoice, run, parseSayVoices, parseWinVoices, pickDefaults, voiceFor } from '../src/voice/os';
import { mergeSettings } from '../src/settings';

const SAY = [
  'Albert              en_US    # Hello! My name is Albert.',
  'Milena              ru_RU    # Здравствуйте! Меня зовут Милена.',
  'Yelda (Turkish (Türkiye)) tr_TR    # Merhaba, benim adım Yelda.',
  'Yelda (Turkish (Türkiye)) tr_TR    # Merhaba, benim adım Yelda.',
].join('\n');

test('parses say -v ? output and removes duplicates', () => {
  expect(parseSayVoices(SAY)).toEqual([
    { id: 'Albert', name: 'Albert', lang: 'en_US' },
    { id: 'Milena', name: 'Milena', lang: 'ru_RU' },
    { id: 'Yelda (Turkish (Türkiye))', name: 'Yelda (Turkish (Türkiye))', lang: 'tr_TR' },
  ]);
});

test('parses Windows voice list', () => {
  expect(parseWinVoices('Microsoft Tolga Desktop|tr-TR\r\nMicrosoft Irina Desktop|ru-RU\r\n\r\n')).toEqual([
    { id: 'Microsoft Tolga Desktop', name: 'Microsoft Tolga Desktop', lang: 'tr-TR' },
    { id: 'Microsoft Irina Desktop', name: 'Microsoft Irina Desktop', lang: 'ru-RU' },
  ]);
});

test('defaults prefer Turkish main and Russian cyrillic', () => {
  expect(pickDefaults(parseSayVoices(SAY))).toEqual({ main: 'Yelda (Turkish (Türkiye))', cyrillic: 'Milena' });
  expect(pickDefaults([{ id: 'A', name: 'A', lang: 'en_US' }])).toEqual({ main: 'A', cyrillic: 'A' });
});

test('voiceFor picks the slot, cyrillic text and user overrides', () => {
  const voices = parseSayVoices(SAY);
  const auto = mergeSettings(undefined);
  expect(voiceFor(undefined, 'salam', auto, voices)).toBe('Yelda (Turkish (Türkiye))');
  expect(voiceFor(undefined, 'привет', auto, voices)).toBe('Milena');
  expect(voiceFor('announcer', 'salam', mergeSettings({ voices: { announcer: 'Albert' } }), voices)).toBe('Albert');
  expect(voiceFor('announcer', 'salam', auto, voices)).toBe('Yelda (Turkish (Türkiye))');
});

test.skipIf(process.platform !== 'darwin')('macOS say writes a WAV file', async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'ktts-')), 'a.wav');
  await new MacVoice().synth('-salam, dostlar', '', out);
  const bytes = new Uint8Array(await Bun.file(out).arrayBuffer());
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF');
  expect(bytes.length).toBeGreaterThan(1000);
});

test('voiceFor ignores a configured voice that is not installed', () => {
  expect(voiceFor(undefined, 'salam', mergeSettings({ voices: { main: 'Gone' } }), parseSayVoices(SAY))).toBe('Yelda (Turkish (Türkiye))');
});

test('run kills a hung command and rejects', async () => {
  await expect(run(['sleep', '5'], { timeoutMs: 100 })).rejects.toThrow('timed out');
});
