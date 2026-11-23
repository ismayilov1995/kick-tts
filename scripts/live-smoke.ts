// Usage: bun run smoke [kick-username]   — listens for 60 s and reports what arrived and what would be spoken.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/db/store';
import { fetchChannelIds } from '../src/kick/channel';
import { normalize, parseData, shortName } from '../src/kick/normalize';
import { KickSource } from '../src/kick/realtime';
import { Pipeline } from '../src/pipeline';
import { DirectResponder } from '../src/responders';
import { mergeSettings } from '../src/settings';
import { TemplateResponder } from '../src/templates';
import { createVoiceEngine, voiceFor } from '../src/voice/os';

async function pickLive(): Promise<string> {
  try {
    const r = await fetch('https://kick.com/stream/livestreams/en?page=1&limit=3&sort=desc', {
      headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10_000),
    });
    const slug = ((await r.json()) as any)?.data?.[0]?.channel?.slug;
    if (typeof slug === 'string') return slug;
  } catch {
    // fall back below
  }
  return 'xqc';
}

const username = process.argv[2] ?? (await pickLive());
const ids = await fetchChannelIds(username);
if (!ids) {
  console.error(`FAIL: ${username} üçün kanal ID-ləri alınmadı`);
  process.exit(1);
}
console.log('kanal:', username, ids);

const settings = mergeSettings({ username: 'smoke-test-nobody', ...ids, readChat: true });
const counts = new Map<string, number>();
const samples: string[] = [];
let queued = 0;

const pipeline = new Pipeline({
  store: new Store(),
  settings: () => settings,
  direct: new DirectResponder(() => settings),
  templates: new TemplateResponder(() => settings.templates),
  enqueue: (u) => {
    queued++;
    if (samples.length < 3) samples.push(u.text);
  },
  log: () => {},
  unknown: { write: (ev, _ch, d) => console.log('[unknown]', ev, JSON.stringify(d).slice(0, 300)) },
  channelKey: () => `kick:${ids.channelId}`,
});

const src = new KickSource({
  ...ids,
  onEvent: (ch, ev, data) => {
    const name = shortName(ev);
    counts.set(name, (counts.get(name) ?? 0) + 1);
    if (name === 'RewardRedeemedEvent') console.log('[reward]', normalize(ev, parseData(data), 'kick:x'));
    pipeline.handleRaw(ch, ev, data);
  },
  onStatus: (s) => console.log('[status]', s),
});

await src.start();
await Bun.sleep(60_000);
src.stop();

console.log('event sayları:', Object.fromEntries(counts));
console.log(`oxunmaq üçün növbəyə düşən: ${queued}`, samples);

const engine = createVoiceEngine();
const voices = await engine.listVoices();
for (const [i, text] of samples.entries()) {
  const out = join(tmpdir(), `kicktts-smoke-${i}.wav`);
  await engine.synth(text, voiceFor(undefined, text, settings, voices), out);
  console.log('wav:', out, Bun.file(out).size, 'bytes');
}

if (!counts.get('ChatMessageEvent') || queued === 0) {
  console.error('FAIL: chat gəlmədi və ya oxunmaq üçün növbəyə düşmədi');
  process.exit(1);
}
console.log('OK');
