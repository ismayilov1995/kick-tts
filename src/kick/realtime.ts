export const FALLBACK = { key: '34bf7a0ff419a2a775b9', cluster: 'us2' };

export type Creds = { key: string; cluster: string; fallback: boolean };
export type SourceStatus = { state: 'connecting' | 'connected' | 'disconnected'; error?: string; fallbackKey?: boolean };
export type SocketLike = {
  send(data: string): void;
  close(): void;
  onmessage: ((m: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
};

export async function getPusherCreds(fetchFn: typeof fetch = fetch): Promise<Creds> {
  try {
    const res = await fetchFn('https://web.kick.com/api/v1/realtime/connection', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client: { id: crypto.randomUUID(), type: 'web' }, capabilities: { accepted_providers: [{ provider: 'pusher' }] } }),
      signal: AbortSignal.timeout(10_000),
    });
    const json: any = await res.json();
    const c = json?.data?.connections?.find((x: any) => x?.provider === 'pusher')?.credentials;
    if (typeof c?.app_key === 'string' && typeof c?.cluster === 'string') return { key: c.app_key, cluster: c.cluster, fallback: false };
  } catch {
    // fall through to the fallback key
  }
  return { ...FALLBACK, fallback: true };
}

export const channelsFor = (channelId: string, chatroomId: string): string[] => [
  `chatrooms.${chatroomId}.v2`,
  `chatroom_${chatroomId}`,
  `channel_${channelId}`,
  `channel.${channelId}`,
];

export type SourceOptions = {
  channelId: string;
  chatroomId: string;
  onEvent: (channel: string, event: string, data: unknown) => void;
  onStatus: (s: SourceStatus) => void;
  creds?: () => Promise<Creds>;
  connect?: (url: string) => SocketLike;
};

const safeJson = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};

export class KickSource {
  private ws: SocketLike | null = null;
  private attempt = 0;
  private stopped = false;
  private fallback = false;
  private state: SourceStatus['state'] = 'disconnected';
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private o: SourceOptions) {}

  async start(): Promise<void> {
    this.stopped = false;
    const { key, cluster, fallback } = await (this.o.creds ?? (() => getPusherCreds()))();
    if (this.stopped) return;
    this.fallback = fallback;
    this.status('connecting');
    const url = `wss://ws-${cluster}.pusher.com/app/${key}?protocol=7&client=js&version=8.4.0&flash=false`;
    const ws = (this.o.connect ?? ((u: string) => new WebSocket(u) as unknown as SocketLike))(url);
    this.ws = ws;
    ws.onmessage = (m) => this.handle(String(m.data));
    ws.onerror = () => {}; // onclose follows and reconnects
    ws.onclose = () => {
      if (this.ws === ws) this.reconnect();
    };
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  private handle(raw: string): void {
    let msg: { event?: unknown; channel?: unknown; data?: unknown };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const event = typeof msg.event === 'string' ? msg.event : '';
    if (event === 'pusher:connection_established') {
      this.attempt = 0;
      for (const channel of channelsFor(this.o.channelId, this.o.chatroomId)) {
        this.send({ event: 'pusher:subscribe', data: { auth: '', channel } });
      }
      this.status('connected');
    } else if (event === 'pusher:ping') {
      this.send({ event: 'pusher:pong', data: {} });
    } else if (event === 'pusher:error') {
      const d: any = typeof msg.data === 'string' ? safeJson(msg.data) : msg.data;
      this.status(this.state, String(d?.message ?? JSON.stringify(d)));
    } else if (event && !event.startsWith('pusher')) {
      this.o.onEvent(typeof msg.channel === 'string' ? msg.channel : '', event, msg.data);
    }
  }

  private status(state: SourceStatus['state'], error?: string): void {
    this.state = state;
    this.o.onStatus({ state, error, fallbackKey: this.fallback });
  }

  private send(x: unknown): void {
    this.ws?.send(JSON.stringify(x));
  }

  private reconnect(): void {
    this.ws = null;
    if (this.stopped) return;
    this.status('disconnected');
    const delay = Math.min(30_000, 1000 * 2 ** this.attempt++);
    this.timer = setTimeout(() => {
      this.start().catch(() => this.reconnect());
    }, delay);
  }
}
