import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnv, type Plugin } from 'vite';

/*
 * Serves the Vercel functions in api/ during `npm run dev`, so login and sync
 * work locally. Each file exports GET/POST/PUT handlers that take a Web
 * Request and return a Response, the same signature Vercel uses.
 */

async function toRequest(req: IncomingMessage, origin: string): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(', '));
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && chunks.length > 0;
  return new Request(new URL(req.url ?? '/', origin), {
    method: req.method,
    headers,
    body: hasBody ? Buffer.concat(chunks) : undefined,
  });
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

export function devApi(): Plugin {
  return {
    name: 'hourbook-dev-api',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, '');
      for (const key of ['DATABASE_URL', 'ALLOWED_EMAILS']) {
        if (env[key] && !process.env[key]) process.env[key] = env[key];
      }
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        if (!path.startsWith('/api/')) return next();
        const route = path.replace(/\/$/, '');
        if (!/^\/api\/[a-z/]+$/.test(route) || route.includes('/_')) return next();
        try {
          const mod = (await server.ssrLoadModule(`${route}.ts`)) as Record<string, (r: Request) => Promise<Response>>;
          const handler = mod[req.method ?? 'GET'];
          if (!handler) {
            res.statusCode = 405;
            res.end();
            return;
          }
          const origin = `http://${req.headers.host ?? 'localhost'}`;
          await send(res, await handler(await toRequest(req, origin)));
        } catch (e) {
          if ((e as { code?: string }).code === 'ERR_LOAD_URL') return next();
          console.error(e);
          res.statusCode = 500;
          res.end();
        }
      });
    },
  };
}
