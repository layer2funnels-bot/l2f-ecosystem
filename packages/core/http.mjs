// HTTP edge for the API layer, on standard Request/Response (Cloudflare Pages Functions, Node 20+, tests).
//   POST /api/<operation>   body = JSON input   headers: Authorization: Bearer <access token>, x-org-id: <uuid>
//   GET  /api/health        no database, no auth (deploy smoke test)
// Same-origin only: no CORS headers are ever sent. A bearer header (not cookies) carries identity, so there is no CSRF
// surface, and a mismatching Origin is refused anyway.
import { NOT_FOUND, SESSION_EXPIRED, BAD_REQUEST, FAILED } from './errors.mjs';

const MAX_BODY_BYTES = 16 * 1024;
const BASE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

export function createHttpHandler({ api, verifyToken, extraOrigins = [] }) {
  const reply = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...extra } });
  const errorBody = (e, extra = {}) => ({ ok: false, error: { code: e.code, message: e.message, ...extra } });

  return async function handle(request) {
    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith('/api/')) return reply(404, errorBody(NOT_FOUND));
      if (url.pathname === '/api/health') return request.method === 'GET' ? reply(200, { ok: true }) : reply(405, errorBody(NOT_FOUND), { allow: 'GET' });
      if (request.method !== 'POST') return reply(405, errorBody(NOT_FOUND), { allow: 'POST' });

      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin && !extraOrigins.includes(origin)) return reply(404, errorBody(NOT_FOUND));

      const auth = request.headers.get('authorization') ?? '';
      const m = /^Bearer ([A-Za-z0-9._-]+)$/.exec(auth);
      const who = m ? await verifyToken(m[1]) : { ok: false };
      if (!who.ok) return reply(SESSION_EXPIRED.status, errorBody(SESSION_EXPIRED));

      if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return reply(BAD_REQUEST.status, errorBody(BAD_REQUEST));
      const declared = Number(request.headers.get('content-length') ?? 0);
      if (declared > MAX_BODY_BYTES) return reply(BAD_REQUEST.status, errorBody(BAD_REQUEST));
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) return reply(BAD_REQUEST.status, errorBody(BAD_REQUEST));
      let input = {};
      if (text) { try { input = JSON.parse(text); } catch { return reply(BAD_REQUEST.status, errorBody(BAD_REQUEST)); } }

      const operation = decodeURIComponent(url.pathname.slice('/api/'.length));
      const out = await api.handle({
        operation, input,
        auth: { userId: who.userId, email: who.email },
        headers: { 'x-org-id': request.headers.get('x-org-id') ?? undefined },
      });
      const e = out.body.error;
      return reply(out.status, out.body, { 'x-request-id': out.body.requestId, ...(e?.retryAfterSeconds ? { 'retry-after': String(e.retryAfterSeconds) } : {}) });
    } catch {
      return reply(FAILED.status, errorBody(FAILED));   // never leak the exception
    }
  };
}
