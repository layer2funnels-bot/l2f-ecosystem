// The API layer (Phase 5 slice 0). Framework-neutral: a route handler calls api.handle(...) and sends the result.
// Order of checks: organization header -> identity -> operation -> input -> rate limit -> database -> public error.
// Every failure goes through the one error contract (errors.mjs): denied, missing and unknown look identical.
import { randomBytes } from 'node:crypto';
import { NOT_FOUND, INVALID, RATE_LIMITED, ORG_REQUIRED, toPublicError } from './errors.mjs';
import { isUuid, validate } from './validate.mjs';
import { operations as defaultOperations } from './operations.mjs';
import { createRateLimiter } from './rate-limit.mjs';
import { fmpPublic } from './fmp-data-operations.mjs';

// "No organization chosen yet" (first sign-in, accepting an invitation). Matches nothing in the database.
export const NO_ORG = '00000000-0000-0000-0000-000000000000';

const header = (headers, name) => {
  if (!headers) return undefined;
  const k = Object.keys(headers).find((h) => h.toLowerCase() === name);
  const v = k === undefined ? undefined : headers[k];
  return Array.isArray(v) ? v[0] : v;
};

export function createApi({ executor, logger, limiter = createRateLimiter(), operations = defaultOperations, now = Date.now, storage = null, weather = null, mailer = null }) {
  const done = (requestId, op, t0, status, cls, dbCode, rateLimited, body) => {
    logger.log({ ts: new Date(now()).toISOString(), requestId, op, status, class: cls, db_code: dbCode, ms: now() - t0, rateLimited });
    return { status, body: { requestId, ...body } };
  };
  const fail = (requestId, op, t0, e, dbCode = null) =>
    done(requestId, op, t0, e.status, e.code, dbCode, e.code === 'rate_limited', {
      ok: false, error: { code: e.code, message: e.message, ...(e.fields ? { fields: e.fields } : {}), ...(e.retryAfterSeconds ? { retryAfterSeconds: e.retryAfterSeconds } : {}) },
    });

  return {
    /**
     * The public share-link endpoint: no sign-in. { token, ip } -> { status, body }. Everything that is not a live public link answers the same 404.
     * Returns only what a viewer page needs: name, kind, type, size, brand, and the text (documents, sheets) or short-lived addresses (everything else).
     */
    async publicLink({ token, ip }) {
      const requestId = `req_${randomBytes(8).toString('hex')}`, t0 = now();
      const gate = await limiter.take(`pub:${ip || 'unknown'}`, 'read');
      if (!gate.allowed) return fail(requestId, 'public.link', t0, { ...RATE_LIMITED, retryAfterSeconds: gate.retryAfterSeconds });
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32,200}$/.test(token)) return fail(requestId, 'public.link', t0, NOT_FOUND);
      try {
        const rows = await executor.withPublic((q) => q('select * from private.drive_public_resolve($1)', [token]));
        if (!rows.length) return fail(requestId, 'public.link', t0, NOT_FOUND);
        const r = rows[0]; const out = { name: r.name, kind: r.kind, mime_type: r.mime_type, size_bytes: r.size_bytes == null ? null : Number(r.size_bytes), brand: r.brand };
        if (r.body != null) out.body = r.body;
        else if (r.storage_path) {
          if (!storage) return fail(requestId, 'public.link', t0, { status: 503, code: 'storage_unavailable', message: 'File storage is not available right now.' });
          out.url = (await storage.signDownload({ path: r.storage_path, seconds: 300 })).url;                         // for showing in the page
          out.download_url = (await storage.signDownload({ path: r.storage_path, seconds: 300, fileName: r.name })).url; // forces a save-as
        }
        return done(requestId, 'public.link', t0, 200, 'ok', null, false, { ok: true, data: [out] });
      } catch (err) { return fail(requestId, 'public.link', t0, toPublicError(err), err?.code ?? null); }
    },
    /**
     * Funnel Mapper public share links (no sign-in). action: 'get' | 'save' | 'comment'. The database checks the token by hash, its expiry, the
     * link's permissions and that the funnel and client are not in the trash; anything else answers the same 404. Limited per address.
     */
    async publicFmpShare({ action, token, ip, body }) {
      const requestId = `req_${randomBytes(8).toString('hex')}`, t0 = now(), op = `public.fmp.${action}`;
      const gate = await limiter.take(`pubfmp:${ip || 'unknown'}`, action === 'get' ? 'read' : 'write');
      if (!gate.allowed) return fail(requestId, op, t0, { ...RATE_LIMITED, retryAfterSeconds: gate.retryAfterSeconds });
      if (typeof token !== 'string' || !/^[0-9a-f]{16,200}$/.test(token)) return fail(requestId, op, t0, NOT_FOUND);
      try {
        if (action === 'get') {
          const [r] = await executor.withPublic((q) => fmpPublic.get(q, token));
          if (!r?.data) return fail(requestId, op, t0, NOT_FOUND);
          const d = r.data; const logo = d.client?.logo_path;
          if (d.client) delete d.client.logo_path;   // never hand out a storage path; a short-lived address instead
          if (logo && storage && /^[0-9a-f-]{36}\/fmp\/logo\//.test(logo)) d.client.logo_url = (await storage.signDownload({ path: logo, seconds: 3600 })).url;
          return done(requestId, op, t0, 200, 'ok', null, false, { ok: true, data: [d] });
        }
        if (action === 'save') {
          const g = body?.graph, st = body?.settings;
          if (!g || typeof g !== 'object' || (st != null && typeof st !== 'object')) return fail(requestId, op, t0, INVALID);
          await executor.withPublic((q) => fmpPublic.save(q, token, g, st ?? null));
          return done(requestId, op, t0, 200, 'ok', null, false, { ok: true, data: [{ saved: true }] });
        }
        if (action === 'comment') {
          const text = typeof body?.body === 'string' ? body.body : '';
          if (!text.trim() || text.length > 4000) return fail(requestId, op, t0, INVALID);
          const [r] = await executor.withPublic((q) => fmpPublic.comment(q, token, typeof body?.node_id === 'string' ? body.node_id : null,
            typeof body?.author === 'string' ? body.author : '', text));
          return done(requestId, op, t0, 200, 'ok', null, false, { ok: true, data: [{ id: r?.id }] });
        }
        return fail(requestId, op, t0, NOT_FOUND);
      } catch (err) { return fail(requestId, op, t0, toPublicError(err), err?.code ?? null); }
    },
    // request: { operation, input, auth: { userId, email } | null, headers }
    // -> { status, body: { requestId, ok: true, data } | { requestId, ok: false, error } }; limited requests carry error.retryAfterSeconds
    async handle(request) {
      const requestId = `req_${randomBytes(8).toString('hex')}`, t0 = now();
      const opName = typeof request?.operation === 'string' ? request.operation : '';
      const op = Object.hasOwn(operations, opName) ? operations[opName] : null;
      const logName = op ? op.name : 'unknown';

      const orgId = header(request?.headers, 'x-org-id');
      if (!isUuid(orgId)) return fail(requestId, logName, t0, ORG_REQUIRED);
      const userId = request?.auth?.userId;
      if (!isUuid(userId)) return fail(requestId, logName, t0, NOT_FOUND);       // not signed in = indistinguishable from missing
      if (!op) return fail(requestId, logName, t0, NOT_FOUND);
      if (orgId === NO_ORG && !op.allowNoOrg) return fail(requestId, logName, t0, ORG_REQUIRED);

      const v = validate(op.input, request.input);
      if (!v.ok) return fail(requestId, logName, t0, { ...INVALID, fields: v.fields });

      const gate = await limiter.take(userId, op.class);   // sync (in memory) or async (shared store)
      if (!gate.allowed) return fail(requestId, logName, t0, { ...RATE_LIMITED, retryAfterSeconds: gate.retryAfterSeconds });

      try {
        const rows = await executor.withRequest({ userId, email: request.auth.email ?? null, emailVerified: request.auth.emailVerified === true, orgId }, async (q) => {
          if (orgId !== NO_ORG && !op.allowNoOrg) {   // who is calling: client accounts reach only operations marked for clients, and the reverse
            const [{ a } = {}] = await q('select public.my_audience($1) as a', [orgId]);
            const want = op.audience ?? 'staff';
            if (want !== 'any' && a !== want) throw { code: 'PGRST116' };
          }
          const out = await op.run(q, { orgId, userId, storage, weather, mailer, origin: request.origin ?? null }, v.value);
          if (op.single && out.length === 0) throw { code: 'PGRST116' };   // a mutation that touched nothing looks like a denied one
          return out;
        });
        return done(requestId, logName, t0, 200, 'ok', null, false, { ok: true, data: rows });
      } catch (err) {
        const pub = toPublicError(err);
        return fail(requestId, logName, t0, pub, err?.code ?? null);
      }
    },
  };
}
