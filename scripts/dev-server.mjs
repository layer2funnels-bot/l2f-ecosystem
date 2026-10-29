// Local development server: serves apps/web and /api/* through the SAME handler Cloudflare Pages will run.
// Local only (binds 127.0.0.1). Defaults point at the Supabase local stack (`npm run stack:start`).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../packages/core/server.mjs';
import { loadManifests } from '../packages/core/manifests.mjs';

const root = fileURLToPath(new URL('../apps/web/', import.meta.url));
const ui = fileURLToPath(new URL('../packages/ui/', import.meta.url));
const core = fileURLToPath(new URL('../packages/core/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
// The same headers Cloudflare Pages will send (apps/web/_headers), so CSP problems show up in development.
const pageHeaders = (() => { try { return Object.fromEntries(readFileSync(new URL('../apps/web/_headers', import.meta.url), 'utf8').split('\n').filter((l) => /^\s+\S+: /.test(l)).map((l) => l.trim().split(/: (.*)/s).slice(0, 2))); } catch { return {}; } })();
export const LOCAL_ENV = {
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  SUPABASE_JWKS_URL: 'http://127.0.0.1:54321/auth/v1/.well-known/jwks.json',          // the local stack signs with ES256
  SUPABASE_JWT_ISSUER: 'http://127.0.0.1:54321/auth/v1',
};

export async function startDevServer({ port = 8788, env = { ...LOCAL_ENV, ...process.env }, sink, limits, weatherFetch, extraConnect } = {}) {
  const cspKey = Object.keys(pageHeaders).find((k) => k.toLowerCase() === 'content-security-policy');
  const headersFor = extraConnect && cspKey ? { ...pageHeaders, [cspKey]: pageHeaders[cspKey].replace(/connect-src ([^;]*)/, (m) => `${m} ${extraConnect}`) } : pageHeaders;
  const server = createServer(env, { ...(sink ? { sink } : {}), ...(limits ? { limits } : {}), ...(weatherFetch ? { weatherFetch } : {}) });
  const http_ = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) {
        const chunks = []; for await (const c of req) chunks.push(c);
        const r = await server.handle(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }));
        res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
      }
      if (url.pathname === '/app-manifests.json') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(loadManifests().map(({ dir, ...m }) => m))); return; }
      // /packages/* is shared browser code (tokens, core modules); everything else comes from apps/web, SPA fallback to index.html
      // Planner is its own Vite app (apps/planner, base /planner/): serve its production build the way scripts/build-web.mjs places it in dist/web/planner
      if (url.pathname === '/planner' || url.pathname.startsWith('/planner/')) {
        const pdist = fileURLToPath(new URL('../apps/planner/dist/', import.meta.url));
        let pf = normalize(join(pdist, url.pathname.replace(/^\/planner\/?/, ''))); if (!pf.startsWith(pdist)) { res.writeHead(404).end(); return; }
        if (!extname(pf)) pf = join(pdist, 'index.html');
        const pbody = await readFile(pf);
        res.writeHead(200, { ...headersFor, 'content-type': TYPES[extname(pf)] ?? 'application/octet-stream', 'cache-control': 'no-store' }); res.end(pbody); return;
      }
      const [base, rel] = url.pathname.startsWith('/packages/ui/') ? [ui, url.pathname.slice(13)] : url.pathname.startsWith('/packages/core/') ? [core, url.pathname.slice(15)] : [root, url.pathname];
      let file = normalize(join(base, rel)); if (!file.startsWith(base)) { res.writeHead(404).end(); return; }
      if (url.pathname === '/' || !extname(file)) file = join(root, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { ...headersFor, 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }); res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((ok) => http_.listen(port, '127.0.0.1', ok));
  return { port: http_.address().port, close: async () => { await new Promise((ok) => http_.close(ok)); await server.close(); } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = await startDevServer({ port: Number(process.env.PORT ?? 8788) });
  console.log(`dev server on http://127.0.0.1:${s.port}  (API + web, local stack)`);
}
