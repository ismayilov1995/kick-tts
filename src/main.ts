import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { App } from './app';
import { dataDir } from './paths';
import { startServer } from './server';
import { createVoiceEngine } from './voice/os';

const PORT = 7777;
const URL_ = `http://localhost:${PORT}/`;

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'win32' ? ['cmd', '/c', 'start', '', url] : process.platform === 'darwin' ? ['open', url] : ['xdg-open', url];
  try {
    Bun.spawn(cmd, { stdout: 'ignore', stderr: 'ignore' });
  } catch {
    // no browser available: the console message below still shows the URL
  }
}

const dir = dataDir();
const firstRun = !existsSync(join(dir, 'settings.json'));
const app = new App(dir, createVoiceEngine());

try {
  startServer(app, PORT);
} catch {
  // Port taken: the app is already running. Show its dashboard instead of starting twice.
  console.log('Kick TTS artıq işləyir, idarə paneli açılır…');
  openBrowser(URL_);
  process.exit(0);
}

await app.init();
if (firstRun) {
  app.updateSettings({}); // creates settings.json
  openBrowser(URL_);
}
console.log(`Kick TTS işləyir.\nİdarə paneli: ${URL_}\nOBS overlay: ${URL_}overlay\nMəlumat qovluğu: ${dir}\nBu pəncərəni bağlama.`);
