// Live backend: the host application (Office) owns sign-in and passes a signed-in Supabase client.
// Planner never stores credentials; it calls the planner_* functions, so the database decides what is allowed.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlannerBackend, Workspace } from './types.ts';

export function createSupabaseBackend(client: SupabaseClient): PlannerBackend {
  return {
    kind: 'supabase',
    async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
      if (!/^planner_[a-z_]+$/.test(fn)) throw new Error('unknown operation');
      const { data, error } = await client.rpc(fn, args);
      if (error) throw error;   // carries the PostgREST/Postgres code that toPublicError maps
      return data as T;
    },
    async listWorkspaces(): Promise<Workspace[]> {
      const { data, error } = await client.from('workspaces').select('id, slug, name').order('name');
      if (error) throw error;
      return (data ?? []) as Workspace[];
    },
    async listProjects(workspaceId: string) {
      const { data, error } = await client.from('projects').select('id, name').eq('workspace_id', workspaceId).is('archived_at', null).order('name');
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    async setActiveWorkspace(workspaceId: string) {
      const { data: auth } = await client.auth.getUser();
      if (!auth.user) throw { code: 'PGRST301' };
      const { error } = await client.from('profiles').upsert({ id: auth.user.id, active_workspace_id: workspaceId });
      if (error) throw error;   // the database refuses a workspace the person does not belong to
    },
  };
}
