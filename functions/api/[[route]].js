// Cloudflare Pages Function: every /api/* request. PREPARED, NOT DEPLOYED (owner approval needed for go-live).
// Needs the `nodejs_compat` compatibility flag (for `pg`) and these encrypted environment variables in the Pages project:
// DATABASE_URL, SUPABASE_JWT_SECRET or SUPABASE_JWKS_URL, optional SUPABASE_JWT_ISSUER, RATE_LIMIT_STORE=postgres. The pure logic is tested in test/http.test.mjs.
//
// One server (and one database connection) PER REQUEST: the Workers runtime does not let a request use a connection opened by an earlier one
// ("code had hung": found in the go-live rehearsal, docs/GO_LIVE_REHEARSAL.md). The counters and the cached signing keys hold no connection, so they
// are built once and shared. With a session pooler a connection per request is cheap enough at this size; Hyperdrive is the upgrade if it ever is not.
import { createServer, createSharedState } from '../../packages/core/server.mjs';

let shared;
export async function onRequest({ request, env, waitUntil }) {
  shared ??= createSharedState(env);
  const server = createServer({ ...env, DB_POOL_MAX: '1' }, { shared });
  try { return await server.handle(request); } finally { waitUntil(server.close()); }
}
