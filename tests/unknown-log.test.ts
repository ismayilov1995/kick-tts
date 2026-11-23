import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UnknownLog } from '../src/unknown-log';

test('keeps at most 5 samples per event name', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'ktts-')), 'unknown-events.log');
  const log = new UnknownLog(file);
  for (let i = 0; i < 7; i++) log.write('KicksGifted', 'channel_668', { i });
  log.write('Other', 'channel_668', {});
  const lines = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  expect(lines.filter((l) => l.event === 'KicksGifted')).toHaveLength(5);
  expect(lines.at(-1)).toMatchObject({ event: 'Other', channel: 'channel_668', data: {} });
});
