// A PlannerBackend over any PGlite instance. Identity is set exactly as PostgREST does it (JWT claims, role app_user),
// so row-level policies decide everything. Shared by the browser demo engine and the Node application tests.
import type { PGlite } from '@electric-sql/pglite';
import type { PlannerBackend, Workspace } from './types.ts';

const claims = (userId: string) => JSON.stringify({ sub: userId, role: 'authenticated' });

export function makeBackend(db: PGlite, userId: string): PlannerBackend & { userId: string } {
  const asUser = <T>(fn: (tx: { query: PGlite['query'] }) => Promise<T>) => db.transaction(async (tx) => {
    await tx.exec('set local role app_user');
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims(userId)]);
    return fn(tx);
  });
  return {
    kind: 'local-demo',
    userId,
    async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
      if (!/^planner_[a-z_]+$/.test(fn)) throw new Error('unknown operation');
      const keys = Object.keys(args);
      const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
      const params = keys.map((k) => { const v = args[k]; return v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v; });
      return asUser(async (tx) => (await tx.query<{ r: T }>(sql, params as unknown[])).rows[0]!.r);
    },
    async listWorkspaces(): Promise<Workspace[]> {
      return asUser(async (tx) => (await tx.query<Workspace>(`select id, slug, name from public.workspaces order by name`)).rows);
    },
    async listProjects(workspaceId: string) {
      return asUser(async (tx) => (await tx.query<{ id: string; name: string }>(
        'select id, name from public.projects where workspace_id = $1 and archived_at is null order by name', [workspaceId])).rows);
    },
    async setActiveWorkspace(workspaceId: string) {
      await asUser(async (tx) => {
        await tx.query(`insert into public.profiles (id, active_workspace_id) values ($1, $2)
                        on conflict (id) do update set active_workspace_id = excluded.active_workspace_id`, [userId, workspaceId]);
      });
    },
  };
}
