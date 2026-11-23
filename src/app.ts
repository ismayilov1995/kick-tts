import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ServerWebSocket } from 'bun';
import { Store } from './db/store';
import { fetchChannelIds } from './kick/channel';
import { KickSource, type SourceStatus } from './kick/realtime';
import { Pipeline, type LogEntry } from './pipeline';
import { Player, type Result } from './player';
import { SpeechQueue, type QueueItem } from './queue';
import { DirectResponder } from './responders';
import { loadSettings, mergeSettings, saveSettings, type Settings } from './settings';
import { TemplateResponder } from './templates';
import type { Utterance, VoiceSlot } from './types';
import { UnknownLog } from './unknown-log';
import { voiceFor, type Voice, type VoiceEngine } from './voice/os';

export type WsData = { role: 'overlay' | 'dashboard' };
type Sock = ServerWebSocket<WsData>;

const DAY = 86_400_000;

export class App {
  settings: Settings;
  voices: Voice[] = [];
  readonly store: Store;
  readonly player: Player;
  readonly pipeline: Pipeline;
  private status: SourceStatus = { state: 'disconnected' };
  private queue = new SpeechQueue(15);
  private source: KickSource | null = null;
  private overlays = new Set<Sock>();
  private dashboards = new Set<Sock>();
  private logRing: LogEntry[] = [];
  private settingsFile: string;

  constructor(dir: string, private engine: VoiceEngine) {
    this.settingsFile = join(dir, 'settings.json');
    this.settings = loadSettings(this.settingsFile);
    this.store = new Store(join(dir, 'kick-tts.db'));
    this.player = new Player(
      this.queue,
      (item) => this.synth(item),
      {
        connected: () => this.overlays.size > 0,
        play: (p) => this.toOverlays({ type: 'play', id: p.id, url: `/audio/${p.id}`, text: p.text, caption: this.settings.caption }),
        stop: () => this.toOverlays({ type: 'stop' }),
      },
      (item, result, reason) => this.onDone(item, result, reason),
    );
    this.pipeline = new Pipeline({
      store: this.store,
      settings: () => this.settings,
      direct: new DirectResponder(() => this.settings),
      templates: new TemplateResponder(() => this.settings.templates),
      enqueue: (u, e, eventId) => this.say(u, e.username, eventId),
      log: (entry) => this.pushLog(entry),
      unknown: new UnknownLog(join(dir, 'unknown-events.log')),
      channelKey: () => this.channelKey,
    });
  }

  private get channelKey(): string {
    return `kick:${this.settings.channelId}`;
  }

  async init(): Promise<void> {
    this.voices = await this.engine.listVoices().catch((err) => {
      console.error('[voice] list failed', err);
      return [];
    });
    this.prune();
    // DOM and Bun both type setInterval; the cast keeps unref() without fighting the lib types.
    (setInterval(() => this.prune(), DAY) as unknown as { unref?: () => void }).unref?.();
    if (this.settings.channelId && this.settings.chatroomId) this.startSource();
  }

  private prune(): void {
    try {
      this.store.pruneRaw();
    } catch (err) {
      console.error('[db] prune', err);
    }
  }

  async connect(): Promise<{ ok: boolean; needManual?: boolean; error?: string }> {
    if (!this.settings.username.trim()) return { ok: false, error: 'Kick istifadəçi adını yaz' };
    if (!this.settings.channelId || !this.settings.chatroomId) {
      const ids = await fetchChannelIds(this.settings.username);
      if (!ids) return { ok: false, needManual: true };
      this.updateSettings(ids);
    }
    this.startSource();
    return { ok: true };
  }

  private startSource(): void {
    this.source?.stop();
    this.source = new KickSource({
      channelId: this.settings.channelId,
      chatroomId: this.settings.chatroomId,
      onEvent: (ch, ev, data) => this.pipeline.handleRaw(ch, ev, data),
      onStatus: (st) => {
        this.status = st;
        this.pushStatus();
      },
    });
    void this.source.start();
  }

  updateSettings(patch: unknown): Settings {
    const prev = this.settings;
    const next = mergeSettings(patch, prev);
    const p = (patch ?? {}) as Record<string, unknown>;
    // A new username means the old ids belong to someone else.
    if (next.username.toLowerCase() !== prev.username.toLowerCase() && p.channelId === undefined) {
      next.channelId = '';
      next.chatroomId = '';
    }
    this.settings = next;
    saveSettings(this.settingsFile, next);
    if (next.channelId !== prev.channelId || next.chatroomId !== prev.chatroomId) {
      if (next.channelId && next.chatroomId) this.startSource();
      else {
        this.source?.stop();
        this.source = null;
        this.status = { state: 'disconnected' };
        this.pushStatus();
      }
    }
    return next;
  }

  say(u: Utterance, username: string, eventId = -1): void {
    this.player.enqueue({
      id: crypto.randomUUID(),
      text: u.text,
      voiceId: voiceFor(u.voice, u.text, this.settings, this.voices),
      priority: u.priority,
      kind: u.kind,
      eventId,
      username,
    });
    this.pushStatus();
  }

  test(slot: VoiceSlot = 'main'): void {
    const text = slot === 'cyrillic' ? 'Привет! Это тестовое сообщение.' : 'Salam! Bu, Kick TTS sınaq mesajıdır.';
    this.say({ text, voice: slot, priority: 1, kind: 'test' }, 'Test');
  }

  users(q: string) {
    return q.trim() ? this.store.search(this.channelKey, q.trim()) : this.store.top(this.channelKey, 20);
  }

  profile(userId: string) {
    return this.store.profile(this.channelKey, userId);
  }

  deleteUser(userId: string): void {
    this.store.deleteUser(this.channelKey, userId);
  }

  setBlocked(userId: string, blocked: boolean): void {
    this.store.setBlocked(this.channelKey, userId, blocked);
  }

  refresh(): void {
    this.pushStatus();
  }

  private async synth(item: QueueItem): Promise<string> {
    const file = join(tmpdir(), `kicktts-${item.id}.wav`);
    try {
      await this.engine.synth(item.text, item.voiceId, file);
    } catch (err) {
      const fallback = voiceFor('main', '', this.settings, this.voices);
      if (!fallback || fallback === item.voiceId) throw err;
      await this.engine.synth(item.text, fallback, file);
    }
    return file;
  }

  private onDone(item: QueueItem, result: Result, reason?: string): void {
    const why = reason ?? (result === 'skipped' ? 'düymə ilə keçildi' : undefined);
    if (item.eventId >= 0) {
      try {
        this.store.markSpoken(item.eventId, result === 'spoken', result === 'spoken' ? null : why ?? result);
      } catch (err) {
        console.error('[db]', err);
      }
    }
    this.pushLog({ ts: Date.now(), username: item.username, type: item.kind, text: item.text, status: result, reason: why, kind: item.kind });
    this.pushStatus();
  }

  // ---- sockets ----
  addSocket(ws: Sock): void {
    (ws.data.role === 'overlay' ? this.overlays : this.dashboards).add(ws);
    if (ws.data.role === 'overlay') void this.player.pump();
    this.pushStatus();
  }

  removeSocket(ws: Sock): void {
    const isOverlay = this.overlays.delete(ws);
    this.dashboards.delete(ws);
    if (isOverlay && this.overlays.size === 0) this.player.disconnected();
    this.pushStatus();
  }

  onSocketMessage(ws: Sock, raw: string): void {
    if (ws.data.role !== 'overlay') return;
    try {
      const msg = JSON.parse(raw);
      if (msg?.type === 'ended' && typeof msg.id === 'string') this.player.ended(msg.id);
    } catch {
      // ignore malformed overlay messages
    }
  }

  snapshot() {
    return { settings: this.settings, voices: this.voices, status: this.statusPayload(), log: this.logRing };
  }

  private statusPayload() {
    return {
      source: this.status,
      overlays: this.overlays.size,
      queue: this.queue.size,
      paused: this.player.paused,
      current: this.player.current?.text ?? null,
    };
  }

  private pushStatus(): void {
    this.toDashboards({ type: 'status', status: this.statusPayload() });
  }

  private pushLog(entry: LogEntry): void {
    this.logRing.unshift(entry);
    if (this.logRing.length > 100) this.logRing.length = 100;
    this.toDashboards({ type: 'log', entry });
  }

  private toOverlays(msg: unknown): void {
    const s = JSON.stringify(msg);
    for (const ws of this.overlays) ws.send(s);
  }

  private toDashboards(msg: unknown): void {
    const s = JSON.stringify(msg);
    for (const ws of this.dashboards) ws.send(s);
  }
}
