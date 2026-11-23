import { appendFileSync, existsSync, statSync } from 'node:fs';

/** Raw payloads of events we don't fully understand, so the parser can be fixed from real examples. */
export class UnknownLog {
  private counts = new Map<string, number>();

  constructor(private file: string, private perEvent = 5, private maxBytes = 5_000_000) {}

  write(event: string, channel: string, data: unknown): void {
    if (!this.counts.has(event) && this.counts.size >= 500) return;
    const n = this.counts.get(event) ?? 0;
    if (n >= this.perEvent) return;
    this.counts.set(event, n + 1);
    try {
      if (existsSync(this.file) && statSync(this.file).size > this.maxBytes) return;
      appendFileSync(this.file, JSON.stringify({ at: new Date().toISOString(), channel, event, data }) + '\n');
    } catch (err) {
      console.error('[unknown-log]', err);
    }
  }
}
