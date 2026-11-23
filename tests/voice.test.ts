import { expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MacVoice, WinVoice, run, parseSayVoices, parseWinVoices, pickDefaults, sapiFallback, splitWinVoiceId, voiceFor } from '../src/voice/os';
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

test('parses Windows voice lists with engine-prefixed ids', () => {
  expect(parseWinVoices('Microsoft Tolga|tr-TR\r\n\r\n', 'winrt')).toEqual([{ id: 'winrt:Microsoft Tolga', name: 'Microsoft Tolga', lang: 'tr-TR' }]);
  expect(parseWinVoices('Microsoft Irina Desktop|ru-RU\r\n', 'sapi')).toEqual([
    { id: 'sapi:Microsoft Irina Desktop', name: 'Microsoft Irina Desktop (SAPI)', lang: 'ru-RU' },
  ]);
});

test('splitWinVoiceId routes by prefix; legacy ids are SAPI, empty is WinRT default', () => {
  expect(splitWinVoiceId('winrt:Microsoft Tolga')).toEqual({ engine: 'winrt', name: 'Microsoft Tolga' });
  expect(splitWinVoiceId('sapi:Microsoft Zira Desktop')).toEqual({ engine: 'sapi', name: 'Microsoft Zira Desktop' });
  expect(splitWinVoiceId('Microsoft David Desktop')).toEqual({ engine: 'sapi', name: 'Microsoft David Desktop' });
  expect(splitWinVoiceId('')).toEqual({ engine: 'winrt', name: '' });
});

const WIN_VOICES = [
  ...parseWinVoices('Microsoft Tolga|tr-TR\nMicrosoft Irina|ru-RU', 'winrt'),
  ...parseWinVoices('Microsoft David Desktop|en-US\nMicrosoft Irina Desktop|ru-RU', 'sapi'),
];

test('sapiFallback keeps the language when it can', () => {
  expect(sapiFallback(WIN_VOICES, 'winrt:Microsoft Irina')).toBe('Microsoft Irina Desktop');
  expect(sapiFallback(WIN_VOICES, 'winrt:Microsoft Tolga')).toBe('');
  expect(sapiFallback([], 'winrt:Microsoft Tolga')).toBe('');
});

test('Windows defaults prefer WinRT Turkish and Russian voices', () => {
  expect(pickDefaults(WIN_VOICES)).toEqual({ main: 'winrt:Microsoft Tolga', cyrillic: 'winrt:Microsoft Irina' });
});

/** Fake PowerShell: WinRT scripts mention WindowsRuntime; only list scripts set OutputEncoding. */
function fakePs(opts: { winrtList?: string; sapiList?: string; winrtFails?: boolean }) {
  const calls: { engine: string; voice?: string }[] = [];
  const exec = (async (cmd: string[], o: { env?: Record<string, string> } = {}) => {
    const engine = cmd.at(-1)!.includes('WindowsRuntime') ? 'winrt' : 'sapi';
    const listing = cmd.at(-1)!.includes('OutputEncoding');
    if (!listing) calls.push({ engine, voice: o.env?.KTTS_VOICE });
    if (engine === 'winrt' && (listing ? opts.winrtList === undefined : opts.winrtFails)) throw new Error('winrt broken');
    return listing ? (engine === 'winrt' ? opts.winrtList : opts.sapiList) ?? '' : '';
  }) as typeof run;
  return { exec, calls };
}

test('WinVoice lists WinRT voices first and falls back to SAPI-only listing', async () => {
  const both = await new WinVoice(fakePs({ winrtList: 'Microsoft Tolga|tr-TR', sapiList: 'Microsoft David Desktop|en-US' }).exec).listVoices();
  expect(both.map((v) => v.id)).toEqual(['winrt:Microsoft Tolga', 'sapi:Microsoft David Desktop']);
  const sapiOnly = await new WinVoice(fakePs({ sapiList: 'Microsoft David Desktop|en-US' }).exec).listVoices();
  expect(sapiOnly.map((v) => v.id)).toEqual(['sapi:Microsoft David Desktop']);
});

test('WinVoice routes synth by prefix and falls back to SAPI when WinRT fails', async () => {
  const ok = fakePs({});
  await new WinVoice(ok.exec).synth('salam', 'winrt:Microsoft Tolga', 'x.wav');
  await new WinVoice(ok.exec).synth('salam', 'sapi:Microsoft David Desktop', 'x.wav');
  expect(ok.calls).toEqual([
    { engine: 'winrt', voice: 'Microsoft Tolga' },
    { engine: 'sapi', voice: 'Microsoft David Desktop' },
  ]);

  const broken = fakePs({ winrtList: 'Microsoft Irina|ru-RU', sapiList: 'Microsoft Irina Desktop|ru-RU', winrtFails: true });
  const engine = new WinVoice(broken.exec);
  await engine.listVoices();
  await engine.synth('привет', 'winrt:Microsoft Irina', 'x.wav');
  expect(broken.calls).toEqual([
    { engine: 'winrt', voice: 'Microsoft Irina' },
    { engine: 'sapi', voice: 'Microsoft Irina Desktop' },
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
