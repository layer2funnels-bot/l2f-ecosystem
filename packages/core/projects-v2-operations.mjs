// Projects V2 (migration 0048) on the shared API. Each operation of the V2 contract (packages/core/pm/shared/api.ts) is one
// ecosystem operation named `pm.<name>` (e.g. pm.tasks.update), so V2 and the old Projects operations never collide.
// Input is one `args` object (like the Planner strategy operations): V2's own strict validator checks every field inside,
// including `null` meaning "clear this". The result is wrapped as [{ r }] (the API always answers rows).
// Runs inside the request's transaction as app_user (packages/core/pm/server/db.ts); row policies decide, so a refused
// read looks like "not found". Errors carry V2's plain-language messages; database text never reaches the browser.
import { defineOperation } from './define.mjs';
import { registry } from './pm/server/ops/index.ts';
import { ApiError } from './pm/server/errors.ts';

const READ = /(^|\.)(list|get|query|running|usage|feed|detect|statusHistory|trashList|fileUrl|project|me)$/;
const SENSITIVE = new Set(['projects.purge', 'tasks.purge', 'resources.purge', 'fields.purge']);
const STATUS = { not_found: 404, forbidden: 403, invalid: 422, conflict: 409, unauthenticated: 404, internal: 500 };

function publicOf(e) {
  if (!(e instanceof ApiError)) return e;   // already an ecosystem error (or a database error the ecosystem maps)
  if (e.code === 'internal') return { code: 'pm_internal' };   // FAILED: "Something went wrong. Nothing was changed."
  if (e.code === 'not_found' || e.code === 'unauthenticated') return { code: 'PGRST116' };   // T4: denied and missing look the same
  return { code: `pm_${e.code}`, publicError: { status: STATUS[e.code], code: e.code, message: e.message, ...(e.field ? { fields: [e.field] } : {}) } };
}

export const projectsV2Operations = Object.keys(registry).map((name) => defineOperation({
  name: `pm.${name}`,
  class: SENSITIVE.has(name) ? 'sensitive' : READ.test(name) || name === 'session.me' ? 'read' : 'write',
  input: { args: { type: 'json', max: 120000 } },
  run: async (q, ctx, input) => {
    try {
      const out = await registry[name]({ userId: ctx.userId, orgId: ctx.orgId, q, storage: ctx.storage ?? null }, input.args ?? {});
      return [{ r: out === undefined ? null : out }];
    } catch (e) { throw publicOf(e); }
  },
}));
