// Cloudflare Pages Function: every /api/* request. PREPARED, NOT DEPLOYED (owner approval needed for go-live).
// Needs the `nodejs_compat` compatibility flag (for `pg`) and these encrypted environment variables in the Pages project:
// DATABASE_URL, SUPABASE_JWT_SECRET or SUPABASE_JWKS_URL, optional SUPABASE_JWT_ISSUER. The pure logic is tested in test/http.test.mjs.
import { createServer } from '../../packages/core/server.mjs';

let server;
export async function onRequest({ request, env }) {
  server ??= createServer(env);
  return server.handle(request);
}
