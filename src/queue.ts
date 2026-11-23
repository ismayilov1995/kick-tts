export type QueueItem = {
  id: string;
  text: string;
  voiceId: string;
  priority: 1 | 2 | 3; // 1 paid, 2 template, 3 chat
  kind: string;
  eventId: number; // -1 when not tied to a stored event (e.g. Test)
  username: string;
};

export class SpeechQueue {
  private items: QueueItem[] = [];

  constructor(private max = 15) {}

  get size(): number {
    return this.items.length;
  }

  /** Adds an item; returns the one dropped to stay under the limit. Priority 1 is never counted or dropped. */
  push(item: QueueItem): QueueItem | null {
    this.items.push(item);
    if (this.items.filter((i) => i.priority !== 1).length <= this.max) return null;
    for (const p of [3, 2] as const) {
      const idx = this.items.findIndex((i) => i.priority === p);
      if (idx >= 0) return this.items.splice(idx, 1)[0];
    }
    return null;
  }

  unshift(item: QueueItem): void {
    this.items.unshift(item);
  }

  next(): QueueItem | undefined {
    if (this.items.length === 0) return undefined;
    const best = Math.min(...this.items.map((i) => i.priority));
    return this.items.splice(this.items.findIndex((i) => i.priority === best), 1)[0];
  }
}
