// Op registry: every operation of shared/api.ts `Ops`, typed so a missing or mismatched op fails to compile.
import type { Ctx, Registry } from './util.ts';
import { toApiError } from '../errors.ts';
import { projectOps } from './projects.ts';
import { taskOps } from './tasks.ts';
import { collabOps } from './collab.ts';
import { timeOps } from './time.ts';
import { oversightOps } from './oversight.ts';
import { miscOps } from './misc.ts';
import { resourcesOps } from './resources.ts';
import { fieldOps } from './fields.ts';

const raw: Registry = { ...miscOps, ...projectOps, ...taskOps, ...collabOps, ...timeOps, ...oversightOps, ...resourcesOps, ...fieldOps };

// Every op reports failures as ApiError (Postgres errors are translated), whether called over HTTP or directly.
export const registry: Registry = Object.fromEntries(Object.entries(raw).map(([name, handler]) => [name,
  async (ctx: Ctx, args: never) => { try { return await (handler as (c: Ctx, a: never) => Promise<unknown>)(ctx, args); } catch (e) { throw toApiError(e); } }])) as unknown as Registry;
export const PUBLIC_OPS: ReadonlySet<string> = new Set();
export type { Ctx, Registry } from './util.ts';
