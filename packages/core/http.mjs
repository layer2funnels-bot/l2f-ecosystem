// HTTP edge for the API layer, on standard Request/Response (Cloudflare Pages Functions, Node 20+, tests).
//   POST /api/<operation>   body = JSON input   headers: Authorization: Bearer <access token>, x-org-id: <uuid>
//   POST /api/batch         body = { calls: [{ op, input }, …] } (at most BATCH_MAX): the operations run one after another on ONE database connection,
//                           each with its own checks, rate limit and transaction; answers { ok: true, results: [{ status, ok, data | error }, …] } in order.
//                           Opening a connection is the expensive part of a request (time to the database, and CPU on Cloudflare Free), so the
//                           browser sends the calls a screen makes together in one batch (apps/web/js/api.js).
//   GET  /api/health        no database, no auth (deploy smoke test)
// Same-origin only: no CORS headers are ever sent. A bearer header (not cookies) carries identity, so there is no CSRF
// surface, and a mismatching Origin is refused anyway.
import { NOT_FOUND, SESSION_EXPIRED, BAD_REQUEST, FAILED } from './errors.mjs';

const MAX_BODY_BYTES = 16 * 1024;
// Saving a first-party document (Docs, Sheets, boards: up to 1,000,000 characters) needs a larger body; every other operation keeps the 16 KB limit.
const LARGE_BODY_OPS = new Set(['drive.files.create', 'drive.files.versions.add']);
const LARGE_BODY_BYTES = 4 * 1024 * 1024;
export const BATCH_MAX = 4;   // about one connection plus four short transactions: stays near Cloudflare Free's 10 ms CPU (DECISIONS V4-28)
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
      // Public share links: no sign-in, GET only, nothing but the one resolve function behind it, limited per address.
      if (url.pathname === '/api/public/link') {
        if (request.method !== 'GET') return reply(405, errorBody(NOT_FOUND), { allow: 'GET' });
        const ip = request.headers.get('cf-connecting-ip') ?? (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
        const out = await api.publicLink({ token: url.searchParams.get('t') ?? '', ip });
        return reply(out.status, out.body, { 'x-robots-tag': 'noindex' });
      }
      if (request.method !== 'POST') return reply(405, errorBody(NOT_FOUND), { allow: 'POST' });

      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin && !extraOrigins.includes(origin)) return reply(404, errorBody(NOT_FOUND));

      const auth = request.headers.get('authorization') ?? '';
      const m = /^Bearer ([A-Za-z0-9._-]+)$/.exec(auth);
      const who = m ? await verifyToken(m[1]) : { ok: false };
      if (!who.ok) return reply(SESSION_EXPIRED.status, errorBody(SESSION_EXPIRED));

      if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return reply(BAD_REQUEST.status, errorBody(BAD_REQUEST));
      const limit = LARGE_BODY_OPS.has(decodeURIComponent(url.pathname.slice('/api/'.length))) ? LARGE_BODY_BYTES : MAX_BODY_BYTES;
      const declared = Number(request.headers.get('content-length') ?? 0);
      if (declared > limit) return reply(BAD_REQUEST.status, errorBody(BAD_REQUEST));
      const text = await request.text();
      if (text.length > limit) return reply(BAD_REQUEST.status, errorBody(BAD_REQUEST));
      let input = {};
      if (text) { try { input = JSON.parse(text); } catch { return reply(BAD_REQUEST.status, errorBody(BAD_REQUEST)); } }

      const operation = decodeURIComponent(url.pathname.slice('/api/'.length));
      const headers = { 'x-org-id': request.headers.get('x-org-id') ?? undefined };
      if (operation === 'batch') {
        const calls = input?.calls;
        if (!Array.isArray(calls) || calls.length < 1 || calls.length > BATCH_MAX || !calls.every((c) => c && typeof c.op === 'string' && c.op !== 'batch')) return reply(BAD_REQUEST.status, errorBody(BAD_REQUEST));
        const results = [];
        for (const c of calls) {     // one after another: the connection is reused, and a later call never sees an earlier one's half-done work
          const out = await api.handle({ operation: c.op, input: c.input ?? {}, auth: { userId: who.userId, email: who.email, emailVerified: who.emailVerified }, headers, origin: url.origin });
          results.push({ status: out.status, ...out.body });
        }
        return reply(200, { ok: true, results });
      }
      const out = await api.handle({
        operation, input,
        auth: { userId: who.userId, email: who.email, emailVerified: who.emailVerified },
        headers, origin: url.origin,
      });
      const e = out.body.error;
      return reply(out.status, out.body, { 'x-request-id': out.body.requestId, ...(e?.retryAfterSeconds ? { 'retry-after': String(e.retryAfterSeconds) } : {}) });
    } catch {
      return reply(FAILED.status, errorBody(FAILED));   // never leak the exception
    }
  };
}
