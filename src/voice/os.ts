import type { Settings } from '../settings';
import type { VoiceSlot } from '../types';
import { hasCyrillic } from '../text';

export type Voice = { id: string; name: string; lang: string };

export interface VoiceEngine {
  listVoices(): Promise<Voice[]>;
  synth(text: string, voiceId: string, outFile: string): Promise<void>;
}

export function parseSayVoices(out: string): Voice[] {
  const seen = new Set<string>();
  const voices: Voice[] = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^(.+?)\s+([a-z]{2,3}_[A-Za-z0-9]+)\s+#/);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    voices.push({ id: m[1], name: m[1], lang: m[2] });
  }
  return voices;
}

export function parseWinVoices(out: string): Voice[] {
  return out.split(/\r?\n/).flatMap((line) => {
    const [name, lang] = line.trim().split('|');
    return name && lang ? [{ id: name, name, lang }] : [];
  });
}

export function pickDefaults(voices: Voice[]): { main: string; cyrillic: string } {
  const main = voices.find((v) => v.lang.toLowerCase().startsWith('tr'))?.id ?? voices[0]?.id ?? '';
  const cyrillic = voices.find((v) => v.lang.toLowerCase().startsWith('ru'))?.id ?? main;
  return { main, cyrillic };
}

export function voiceFor(slot: VoiceSlot | undefined, text: string, s: Pick<Settings, 'voices'>, voices: Voice[]): string {
  const auto = pickDefaults(voices);
  const main = s.voices.main || auto.main;
  if (slot === 'announcer') return s.voices.announcer || main;
  if (slot === 'cyrillic' || hasCyrillic(text)) return s.voices.cyrillic || auto.cyrillic;
  return main;
}

/** Runs a command without a shell. Text never becomes part of a command line string. */
async function run(cmd: string[], opts: { stdin?: Response; env?: Record<string, string> } = {}): Promise<string> {
  const p = Bun.spawn(cmd, {
    stdin: opts.stdin ?? 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: opts.env ? { ...process.env, ...opts.env } : undefined,
  });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (code !== 0) throw new Error(`${cmd[0]} exit ${code}: ${err.trim()}`);
  return out;
}

export class MacVoice implements VoiceEngine {
  async listVoices(): Promise<Voice[]> {
    return parseSayVoices(await run(['say', '-v', '?']));
  }

  async synth(text: string, voiceId: string, outFile: string): Promise<void> {
    // Text goes through stdin (-f -), so a message starting with "-" is never read as a flag.
    await run(['say', ...(voiceId ? ['-v', voiceId] : []), '--file-format=WAVE', '--data-format=LEI16@22050', '-o', outFile, '-f', '-'], {
      stdin: new Response(text),
    });
  }
}

const PS_LIST =
  "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name + '|' + $_.VoiceInfo.Culture.Name }";
// Text is passed base64-encoded in an env var: no quoting issues, no injection, no console code-page problems.
const PS_SPEAK =
  'Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; if ($env:KTTS_VOICE) { $s.SelectVoice($env:KTTS_VOICE) }; $s.SetOutputToWaveFile($env:KTTS_OUT); $s.Speak([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:KTTS_TEXT))); $s.Dispose()';
const ps = (script: string) => ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script];

export class WinVoice implements VoiceEngine {
  async listVoices(): Promise<Voice[]> {
    return parseWinVoices(await run(ps(PS_LIST)));
  }

  async synth(text: string, voiceId: string, outFile: string): Promise<void> {
    await run(ps(PS_SPEAK), {
      env: { KTTS_TEXT: Buffer.from(text, 'utf8').toString('base64'), KTTS_VOICE: voiceId, KTTS_OUT: outFile },
    });
  }
}

export const createVoiceEngine = (): VoiceEngine => (process.platform === 'win32' ? new WinVoice() : new MacVoice());
