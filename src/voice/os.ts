import { rm } from 'node:fs/promises';
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

export type WinEngine = 'winrt' | 'sapi';

/** Parses `Name|lang` lines. Ids carry the engine prefix so the two Windows engines never collide. */
export function parseWinVoices(out: string, engine: WinEngine): Voice[] {
  return out.split(/\r?\n/).flatMap((line) => {
    const [name, lang] = line.trim().split('|');
    return name && lang ? [{ id: `${engine}:${name}`, name: engine === 'sapi' ? `${name} (SAPI)` : name, lang }] : [];
  });
}

/** '' means "engine default"; an unprefixed id (settings from older versions) is a SAPI name. */
export function splitWinVoiceId(id: string): { engine: WinEngine; name: string } {
  const m = id.match(/^(winrt|sapi):(.*)$/s);
  if (m) return { engine: m[1] as WinEngine, name: m[2] };
  return { engine: id ? 'sapi' : 'winrt', name: id };
}

/** SAPI voice to use when WinRT fails: one with the same language, else the SAPI default (''). */
export function sapiFallback(voices: Voice[], voiceId: string): string {
  const lang = voices.find((v) => v.id === voiceId)?.lang.slice(0, 2).toLowerCase();
  const v = lang ? voices.find((x) => x.id.startsWith('sapi:') && x.lang.toLowerCase().startsWith(lang)) : undefined;
  return v ? splitWinVoiceId(v.id).name : '';
}

export function pickDefaults(voices: Voice[]): { main: string; cyrillic: string } {
  const main = voices.find((v) => v.lang.toLowerCase().startsWith('tr'))?.id ?? voices[0]?.id ?? '';
  const cyrillic = voices.find((v) => v.lang.toLowerCase().startsWith('ru'))?.id ?? main;
  return { main, cyrillic };
}

export function voiceFor(slot: VoiceSlot | undefined, text: string, s: Pick<Settings, 'voices'>, voices: Voice[]): string {
  const auto = pickDefaults(voices);
  const ok = (id: string) => (id && voices.some((v) => v.id === id) ? id : ''); // a voice that is no longer installed falls back to auto
  const main = ok(s.voices.main) || auto.main;
  if (slot === 'announcer') return ok(s.voices.announcer) || main;
  if (slot === 'cyrillic' || hasCyrillic(text)) return ok(s.voices.cyrillic) || auto.cyrillic;
  return main;
}

/** Runs a command without a shell. Text never becomes part of a command line string. */
export async function run(cmd: string[], opts: { stdin?: Response; env?: Record<string, string>; timeoutMs?: number } = {}): Promise<string> {
  const p = Bun.spawn(cmd, {
    stdin: opts.stdin ?? 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: opts.env ? { ...process.env, ...opts.env } : undefined,
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    p.kill();
  }, opts.timeoutMs ?? 30_000);
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]).finally(() => clearTimeout(timer));
  if (timedOut) throw new Error(`${cmd[0]} timed out`);
  if (code !== 0) throw new Error(`${cmd[0]} exit ${code}: ${err.trim()}`);
  return out;
}

export class MacVoice implements VoiceEngine {
  async listVoices(): Promise<Voice[]> {
    return parseSayVoices(await run(['say', '-v', '?']));
  }

  async synth(text: string, voiceId: string, outFile: string): Promise<void> {
    // Text goes through stdin (-f -), so a message starting with "-" is never read as a flag.
    try {
      await run(['say', ...(voiceId ? ['-v', voiceId] : []), '--file-format=WAVE', '--data-format=LEI16@22050', '-o', outFile, '-f', '-'], {
        stdin: new Response(text),
      });
    } catch (err) {
      await rm(outFile, { force: true }).catch(() => {});
      throw err;
    }
  }
}

const PS_SAPI_LIST =
  "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name + '|' + $_.VoiceInfo.Culture.Name }";
// Text is passed base64-encoded in an env var: no quoting issues, no injection, no console code-page problems.
const PS_SAPI_SPEAK =
  'Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; try { if ($env:KTTS_VOICE) { $s.SelectVoice($env:KTTS_VOICE) }; $s.SetOutputToWaveFile($env:KTTS_OUT); $s.Speak([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:KTTS_TEXT))) } finally { $s.Dispose() }';
// WinRT sees OneCore voices (Settings → Speech → Add voices) that System.Speech cannot.
const WINRT_SYNTH = '[Windows.Media.SpeechSynthesis.SpeechSynthesizer,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime]';
const PS_WINRT_LIST = `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${WINRT_SYNTH}::AllVoices | ForEach-Object { $_.DisplayName + '|' + $_.Language }`;
// Windows PowerShell 5.1 cannot await WinRT IAsyncOperation directly, so it goes through WindowsRuntimeSystemExtensions.AsTask.
const PS_WINRT_SPEAK = [
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
  "$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1",
  '$await = { param($op, [Type]$t) $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }',
  '[Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null',
  `$s = ${WINRT_SYNTH}::new()`,
  `if ($env:KTTS_VOICE) { $v = ${WINRT_SYNTH}::AllVoices | Where-Object { $_.DisplayName -eq $env:KTTS_VOICE } | Select-Object -First 1; if (-not $v) { throw "voice not found: $env:KTTS_VOICE" }; $s.Voice = $v }`,
  '$stream = & $await ($s.SynthesizeTextToStreamAsync([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:KTTS_TEXT)))) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])',
  '$r = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))',
  '& $await ($r.LoadAsync([uint32]$stream.Size)) ([uint32]) | Out-Null',
  '$bytes = New-Object byte[] ([int]$stream.Size)',
  '$r.ReadBytes($bytes)',
  '[IO.File]::WriteAllBytes($env:KTTS_OUT, $bytes)',
  '$r.Dispose(); $stream.Dispose(); $s.Dispose()',
].join('; ');
const ps = (script: string) => ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script];

export class WinVoice implements VoiceEngine {
  private voices: Voice[] = [];

  constructor(private exec: typeof run = run) {}

  /** WinRT (OneCore) voices first, then SAPI; either engine may be missing, but not both. */
  async listVoices(): Promise<Voice[]> {
    const [winrt, sapi] = await Promise.allSettled([this.exec(ps(PS_WINRT_LIST)), this.exec(ps(PS_SAPI_LIST))]);
    if (winrt.status === 'rejected' && sapi.status === 'rejected') throw sapi.reason;
    if (winrt.status === 'rejected') console.error('[voice] WinRT list failed', winrt.reason);
    this.voices = [
      ...(winrt.status === 'fulfilled' ? parseWinVoices(winrt.value, 'winrt') : []),
      ...(sapi.status === 'fulfilled' ? parseWinVoices(sapi.value, 'sapi') : []),
    ];
    return this.voices;
  }

  async synth(text: string, voiceId: string, outFile: string): Promise<void> {
    const { engine, name } = splitWinVoiceId(voiceId);
    const env = { KTTS_TEXT: Buffer.from(text, 'utf8').toString('base64'), KTTS_OUT: outFile };
    try {
      if (engine === 'winrt') {
        try {
          await this.exec(ps(PS_WINRT_SPEAK), { env: { ...env, KTTS_VOICE: name } });
          return;
        } catch (err) {
          console.error('[voice] WinRT synth failed, using SAPI', err);
          await rm(outFile, { force: true }).catch(() => {});
        }
      }
      await this.exec(ps(PS_SAPI_SPEAK), { env: { ...env, KTTS_VOICE: engine === 'winrt' ? sapiFallback(this.voices, voiceId) : name } });
    } catch (err) {
      await rm(outFile, { force: true }).catch(() => {});
      throw err;
    }
  }
}

export const createVoiceEngine = (): VoiceEngine => (process.platform === 'win32' ? new WinVoice() : new MacVoice());
