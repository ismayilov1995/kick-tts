import { rm } from 'node:fs/promises';
import type { QueueItem, SpeechQueue } from './queue';

export type Playing = QueueItem & { file: string };
export type Output = { connected(): boolean; play(p: Playing): void; stop(): void };
export type Result = 'spoken' | 'failed' | 'dropped' | 'skipped';
export type Done = (item: QueueItem, result: Result, reason?: string) => void;

/** Plays one item at a time: synth → overlay plays it → overlay says "ended" → next. */
export class Player {
  current: Playing | null = null;
  paused = false;
  private busy = false;
  private watchdog: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private queue: SpeechQueue,
    private synth: (item: QueueItem) => Promise<string>,
    private out: Output,
    private done: Done,
    private timeoutMs = 60_000,
  ) {}

  enqueue(item: QueueItem): void {
    const dropped = this.queue.push(item);
    if (dropped) this.done(dropped, 'dropped', 'növbə dolu');
    void this.pump();
  }

  async pump(): Promise<void> {
    if (this.current || this.busy || this.paused || !this.out.connected()) return;
    const item = this.queue.next();
    if (!item) return;
    this.busy = true;
    let file: string | null = null;
    try {
      file = await this.synth(item);
    } catch (err) {
      this.done(item, 'failed', err instanceof Error ? err.message : String(err));
    } finally {
      this.busy = false;
    }
    if (!file) return this.pump();
    if (this.paused || !this.out.connected()) {
      this.queue.unshift(item);
      await rm(file, { force: true });
      return;
    }
    this.current = { ...item, file };
    this.out.play(this.current);
    this.watchdog = setTimeout(() => this.ended(item.id), this.timeoutMs);
  }

  ended(id: string, result: Result = 'spoken'): void {
    const c = this.current;
    if (!c || c.id !== id) return;
    clearTimeout(this.watchdog);
    this.current = null;
    this.done(c, result);
    void rm(c.file, { force: true });
    void this.pump();
  }

  skip(): void {
    if (!this.current) return;
    this.out.stop();
    this.ended(this.current.id, 'skipped');
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    void this.pump();
  }

  /** Last overlay closed: keep the current item for when OBS comes back. */
  disconnected(): void {
    const c = this.current;
    if (!c) return;
    clearTimeout(this.watchdog);
    this.current = null;
    const { file, ...item } = c;
    this.queue.unshift(item);
    void rm(file, { force: true });
  }
}
