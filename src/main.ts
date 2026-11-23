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

async function boot(): Promise<void> {
  // Single instance: if something already answers on our port, just show its dashboard.
  const running = await fetch(`http://127.0.0.1:${PORT}/api/state`, { headers: { host: `localhost:${PORT}` }, signal: AbortSignal.timeout(1000) }).then(
    () => true,
    () => false,
  );
  if (running) {
    console.log('Kick TTS artıq işləyir, idarə paneli açılır…');
    openBrowser(URL_);
    process.exit(0);
  }

  const dir = dataDir();
  const firstRun = !existsSync(join(dir, 'settings.json'));
  const app = new App(dir, createVoiceEngine());

  try {
    startServer(app, PORT);
  } catch (err) {
    if ((err as { code?: string })?.code === 'EADDRINUSE') console.error(`${PORT} portu başqa proqram tərəfindən istifadə olunur. O proqramı bağla və yenidən aç.`);
    else console.error(err);
    throw new Error('Server başlamadı');
  }

  await app.init();
  if (firstRun) {
    app.updateSettings({}); // creates settings.json
    openBrowser(URL_);
  }
  console.log(`Kick TTS işləyir.\nİdarə paneli: ${URL_}\nOBS overlay: ${URL_}overlay\nMəlumat qovluğu: ${dir}\nBu pəncərəni bağlama.`);
}

try {
  await boot();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  if (process.platform === 'win32') prompt('Çıxmaq üçün Enter bas…'); // keep the console window readable
  process.exit(1);
}
