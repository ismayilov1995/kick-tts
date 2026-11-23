import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { VoiceSlot } from './types';
import { DEFAULT_TEMPLATES, type TemplateConfig, type TemplateKey } from './templates';

export type Settings = {
  username: string;
  channelId: string;
  chatroomId: string;
  readKicks: boolean;
  readRewards: boolean;
  rewardAllowList: string; // comma-separated, empty = all
  readSubs: boolean;
  readChat: boolean;
  readUsername: boolean;
  maxLength: number;
  bannedWords: string; // comma-separated
  caption: boolean;
  voices: Record<VoiceSlot, string>; // '' = automatic
  templates: Record<TemplateKey, TemplateConfig>;
};

export const DEFAULT_SETTINGS: Settings = {
  username: '', channelId: '', chatroomId: '',
  readKicks: true, readRewards: true, rewardAllowList: '', readSubs: false, readChat: false,
  readUsername: true, maxLength: 200, bannedWords: '', caption: false,
  voices: { main: '', cyrillic: '', announcer: '' },
  templates: DEFAULT_TEMPLATES,
};

/** Validates untrusted input (settings file, dashboard POST) and applies it onto `base`. */
export function mergeSettings(raw: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const out = structuredClone(base);
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, any>;
  for (const k of Object.keys(out) as (keyof Settings)[]) {
    if (k === 'voices' || k === 'templates') continue;
    if (typeof r[k] === typeof out[k]) (out as any)[k] = r[k];
  }
  if (!Number.isFinite(out.maxLength)) out.maxLength = base.maxLength;
  out.maxLength = Math.min(500, Math.max(20, Math.round(out.maxLength)));
  if (!/^\d*$/.test(out.channelId)) out.channelId = base.channelId;
  if (!/^\d*$/.test(out.chatroomId)) out.chatroomId = base.chatroomId;
  for (const slot of Object.keys(out.voices) as VoiceSlot[]) {
    if (typeof r.voices?.[slot] === 'string') out.voices[slot] = r.voices[slot];
  }
  for (const key of Object.keys(out.templates) as TemplateKey[]) {
    const t = r.templates?.[key];
    if (typeof t?.enabled === 'boolean') out.templates[key].enabled = t.enabled;
    if (Array.isArray(t?.variants)) {
      out.templates[key].variants = t.variants
        .filter((v: unknown): v is string => typeof v === 'string')
        .map((v: string) => v.trim())
        .filter(Boolean)
        .slice(0, 20);
    }
  }
  return out;
}

export function loadSettings(file: string): Settings {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return mergeSettings(undefined); // no file yet
  }
  try {
    return mergeSettings(JSON.parse(text));
  } catch {
    try {
      renameSync(file, `${file}.bad`); // keep the user's templates instead of overwriting on next save
    } catch {}
    return mergeSettings(undefined);
  }
}

/** Write to a temp file then rename, so a crash never leaves a half-written settings file. */
export function saveSettings(file: string, s: Settings): void {
  writeFileSync(`${file}.tmp`, JSON.stringify(s, null, 2));
  renameSync(`${file}.tmp`, file);
}
