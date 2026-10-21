// The API layer (Phase 5 slice 0). Framework-neutral: a route handler calls api.handle(...) and sends the result.
// Order of checks: organization header -> identity -> operation -> input -> rate limit -> database -> public error.
// Every failure goes through the one error contract (errors.mjs): denied, missing and unknown look identical.
import { randomBytes } from 'node:crypto';
import { NOT_FOUND, INVALID, RATE_LIMITED, ORG_REQUIRED, toPublicError } from './errors.mjs';
import { isUuid, validate } from './validate.mjs';
import { operations as defaultOperations } from './operations.mjs';
import { createRateLimiter } from './rate-limit.mjs';

// "No organization chosen yet" (first sign-in, accepting an invitation). Matches nothing in the database.
export const NO_ORG = '00000000-0000-0000-0000-000000000000';

const header = (headers, name) => {
  if (!headers) return undefined;
  const k = Object.keys(headers).find((h) => h.toLowerCase() === name);
  const v = k === undefined ? undefined : headers[k];
  return Array.isArray(v) ? v[0] : v;
};

export function createApi({ executor, logger, limiter = createRateLimiter(), operations = defaultOperations, now = Date.now }) {
  const done = (requestId, op, t0, status, cls, dbCode, rateLimited, body) => {
    logger.log({ ts: new Date(now()).toISOString(), requestId, op, status, class: cls, db_code: dbCode, ms: now() - t0, rateLimited });
    return { status, body: { requestId, ...body } };
  };
  const fail = (requestId, op, t0, e, dbCode = null) =>
    done(requestId, op, t0, e.status, e.code, dbCode, e.code === 'rate_limited', {
      ok: false, error: { code: e.code, message: e.message, ...(e.fields ? { fields: e.fields } : {}), ...(e.retryAfterSeconds ? { retryAfterSeconds: e.retryAfterSeconds } : {}) },
    });

  return {
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
        const rows = await executor.withRequest({ userId, email: request.auth.email ?? null, orgId }, async (q) => {
          const out = await op.run(q, { orgId, userId }, v.value);
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
