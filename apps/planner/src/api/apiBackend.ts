// Ecosystem backend: the Planner inside Layer2Funnels. Every call goes through the shared API (/api/<operation>) with the
// signed-in session's bearer token and the active organization in x-org-id, exactly like the other apps (apps/web/js/api.js).
// The server runs packages/core/planner-strategy-operations.mjs, which calls the planner_* functions of migration 0033
// as the signed-in person, so row-level security decides what is allowed. No key or secret lives in the browser.
import type { PlannerBackend, ProjectRef, Workspace } from './types.ts';

const SESSION_KEY = 'l2f.session.v1';   // written by the ecosystem shell (apps/web/js/session.js)
const NO_ORG = '00000000-0000-0000-0000-000000000000';

interface Envelope<T> { ok: boolean; data?: T; error?: { code?: string; message?: string } }

export function createApiBackend(opts: { fetchImpl?: typeof fetch; storage?: Storage } = {}): PlannerBackend & { me(): { id: string; name: string } | null } {
  const fetchImpl = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const storage = opts.storage ?? window.localStorage;
  let org: string | null = null;
  const session = () => { try { return JSON.parse(storage.getItem(SESSION_KEY) || 'null') as { access?: string; userId?: string; name?: string; email?: string } | null; } catch { return null; } };

  async function call<T>(op: string, input: unknown, orgId = org ?? NO_ORG): Promise<T> {
    // a request that never answers must end as a clear error, not an endless spinner that only a refresh clears
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 20_000);
    let r: Response;
    try { r = await fetchImpl(`/api/${op}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session()?.access ?? ''}`, 'x-org-id': orgId },
      body: JSON.stringify(input ?? {}), signal: ctl.signal,
    }); } catch { throw { code: 'offline', message: 'Planner could not reach the server. Check your connection and try again.' }; } finally { clearTimeout(timer); }
    let body: Envelope<T> | null = null; try { body = await r.json() as Envelope<T>; } catch { /* not json */ }
    if (!body?.ok) throw { code: body?.error?.code ?? (r.status === 401 ? 'PGRST301' : 'failed'), message: body?.error?.message };
    return body.data as T;
  }

  return {
    kind: 'supabase',
    me() { const s = session(); return s?.userId ? { id: s.userId, name: s.name ?? s.email ?? 'You' } : null; },
    async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
      if (!/^planner_[a-z_]+$/.test(fn)) throw new Error('unknown operation');
      // the organization a call names becomes the active one; calls about one plan or objective use the active organization
      if (typeof args.p_workspace === 'string') org = args.p_workspace;
      const rows = await call<{ r: T }[]>(`planner.strategy.${fn.replace(/^planner_/, '')}`, { args });
      return rows[0]?.r as T;
    },
    async listWorkspaces(): Promise<Workspace[]> {
      const rows = await call<{ org_id: string; name: string; slug: string; member_kind: string }[]>('org.list', {}, NO_ORG);
      return rows.filter((o) => o.member_kind !== 'client').map((o) => ({ id: o.org_id, name: o.name, slug: o.slug }) as Workspace);
    },
    async setActiveWorkspace(workspaceId: string) { org = workspaceId; },
    async listProjects(workspaceId: string): Promise<ProjectRef[]> {
      const rows = await call<{ id: string; name: string }[]>('projects.list', { scope: 'all' }, workspaceId);
      return rows.map((p) => ({ id: p.id, name: p.name }));
    },
  };
}
