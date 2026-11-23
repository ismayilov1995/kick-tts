import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Per-user data folder. KICKTTS_HOME overrides it (dev/tests). */
export function dataDir(): string {
  const dir =
    process.env.KICKTTS_HOME ??
    (process.platform === 'win32'
      ? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'KickTTS')
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support', 'KickTTS')
        : join(homedir(), '.kick-tts'));
  mkdirSync(dir, { recursive: true });
  return dir;
}
