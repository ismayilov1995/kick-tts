import { expect, test } from 'bun:test';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_SETTINGS, loadSettings, mergeSettings, saveSettings } from '../src/settings';
import { DEFAULT_TEMPLATES } from '../src/templates';

test('defaults match the spec', () => {
  const s = mergeSettings(undefined);
  expect(s).toMatchObject({ readKicks: true, readRewards: true, readSubs: false, readChat: false, readUsername: true, maxLength: 200, caption: false });
  expect(s.templates.first_message.enabled).toBe(false);
});

test('wrong types are ignored', () => {
  const s = mergeSettings({ readChat: 'yes', maxLength: '5', username: 42 });
  expect(s.readChat).toBe(false);
  expect(s.maxLength).toBe(200);
  expect(s.username).toBe('');
});

test('maxLength is clamped to 20..500', () => {
  expect(mergeSettings({ maxLength: 9999 }).maxLength).toBe(500);
  expect(mergeSettings({ maxLength: 1 }).maxLength).toBe(20);
  expect(mergeSettings({ maxLength: Number.NaN }).maxLength).toBe(200);
});

test('channel ids must be digits', () => {
  expect(mergeSettings({ channelId: '12a' }).channelId).toBe('');
  expect(mergeSettings({ channelId: '668', chatroomId: '669' })).toMatchObject({ channelId: '668', chatroomId: '669' });
});

test('partial voices and templates merge onto the base', () => {
  const base = mergeSettings({ voices: { main: 'Yelda' } });
  const s = mergeSettings({ voices: { cyrillic: 'Milena' }, templates: { spam: { enabled: true } } }, base);
  expect(s.voices).toEqual({ main: 'Yelda', cyrillic: 'Milena', announcer: '' });
  expect(s.templates.spam).toEqual({ enabled: true, variants: DEFAULT_TEMPLATES.spam.variants });
});

test('template variants drop blanks and non-strings', () => {
  expect(mergeSettings({ templates: { streak: { variants: ['a', '', '  ', 5, ' b '] } } }).templates.streak.variants).toEqual(['a', 'b']);
});

test('defaults are never mutated', () => {
  mergeSettings({ templates: { spam: { enabled: true } } });
  expect(DEFAULT_SETTINGS.templates.spam.enabled).toBe(false);
});

test('save/load round trip; corrupt file falls back to defaults', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'ktts-')), 'settings.json');
  saveSettings(file, mergeSettings({ username: 'murad' }));
  expect(loadSettings(file).username).toBe('murad');
  writeFileSync(file, '{oops');
  expect(loadSettings(file).username).toBe('');
});

test('corrupt settings file is moved to .bad', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'kt-')), 'settings.json');
  writeFileSync(f, '{ not json');
  expect(loadSettings(f)).toEqual(mergeSettings(undefined));
  expect(existsSync(f)).toBe(false);
  expect(existsSync(`${f}.bad`)).toBe(true);
});
