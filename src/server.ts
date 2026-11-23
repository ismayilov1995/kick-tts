import type { BunRequest, Server } from 'bun';
import dashboard from '../web/dashboard.html';
import overlay from '../web/overlay.html';
import type { App, WsData } from './app';

const json = (data: unknown, status = 200) => Response.json(data, { status });
const noContent = () => new Response(null, { status: 204 });
const forbidden = () => new Response('Forbidden', { status: 403 });

/** Only this machine's own pages may call the API (blocks CSRF from other sites and DNS rebinding). */
function trusted(req: Request, port: number | undefined): boolean {
  const hosts = [`localhost:${port}`, `127.0.0.1:${port}`];
  if (!hosts.includes(req.headers.get('host') ?? '')) return false;
  const origin = req.headers.get('origin');
  return !origin || hosts.some((h) => origin === `http://${h}`);
}

function g<R extends Request>(fn: (req: R) => Response | Promise<Response>) {
  return (req: R, server: Server<WsData>) => (trusted(req, server.port) ? fn(req) : forbidden());
}

const id = (req: BunRequest<'/api/users/:id'> | BunRequest<'/api/users/:id/block'>) => req.params.id;

export function startServer(app: App, port = 7777) {
  return Bun.serve({
    hostname: '127.0.0.1',
    port,
    routes: {
      '/': dashboard,
      '/overlay': overlay,
      '/api/state': g(() => json(app.snapshot())),
      '/api/settings': { POST: g(async (req) => json(app.updateSettings(await req.json().catch(() => ({}))))) },
      '/api/connect': { POST: g(async () => json(await app.connect())) },
      '/api/test': {
        POST: g(async (req) => {
          const b: any = await req.json().catch(() => ({}));
          await app.test(['main', 'cyrillic', 'announcer'].includes(b?.slot) ? b.slot : 'main');
          return noContent();
        }),
      },
      '/api/skip': { POST: g(() => (app.player.skip(), noContent())) },
      '/api/pause': { POST: g(() => (app.player.pause(), app.refresh(), noContent())) },
      '/api/resume': { POST: g(() => (app.player.resume(), app.refresh(), noContent())) },
      '/api/users': g((req) => json(app.users(new URL(req.url).searchParams.get('q') ?? ''))),
      '/api/users/:id': {
        GET: g((req: BunRequest<'/api/users/:id'>) => {
          const p = app.profile(id(req));
          return p ? json(p) : json({ error: 'not found' }, 404);
        }),
        DELETE: g((req: BunRequest<'/api/users/:id'>) => (app.deleteUser(id(req)), noContent())),
      },
      '/api/users/:id/block': {
        POST: g(async (req: BunRequest<'/api/users/:id/block'>) => {
          const b: any = await req.json().catch(() => ({}));
          app.setBlocked(id(req), b?.blocked === true);
          return noContent();
        }),
      },
      '/audio/:id': g((req: BunRequest<'/audio/:id'>) => {
        const c = app.player.current;
        return c && c.id === req.params.id
          ? new Response(Bun.file(c.file), { headers: { 'content-type': 'audio/wav', 'cache-control': 'no-store' } })
          : new Response('Not found', { status: 404 });
      }),
    },
    fetch(req, server) {
      if (new URL(req.url).pathname === '/ws') {
        if (!trusted(req, server.port)) return forbidden();
        const role = new URL(req.url).searchParams.get('role') === 'overlay' ? 'overlay' : 'dashboard';
        if (server.upgrade(req, { data: { role } satisfies WsData })) return;
        return new Response('Upgrade failed', { status: 400 });
      }
      return new Response('Not found', { status: 404 });
    },
    websocket: {
      data: {} as WsData,
      open: (ws) => app.addSocket(ws),
      message: (ws, msg) => app.onSocketMessage(ws, String(msg)),
      close: (ws) => app.removeSocket(ws),
    },
  });
}
