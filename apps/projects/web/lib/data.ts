// Shared query hooks so every screen uses the same cache keys.
import { useMemo } from 'react';
import type { ProjectScope } from '../../shared/api.ts';
import { call } from '../api/client.ts';
import { useQuery } from '../api/store.ts';
import { todayYmd } from './util.ts';

export const useProjects = (scope: ProjectScope = 'active', enabled = true) =>
  useQuery(`projects:${scope}`, () => call('projects.list', { scope }), [], { enabled });
export const usePeople = (enabled = true) => useQuery('people', () => call('people.list', {}), [], { enabled });
export const useClients = (enabled = true) => useQuery('clients', () => call('clients.list', {}), [], { enabled });
export const useProject = (id: string | null) => useQuery(`project:${id}`, () => call('projects.get', { id: id as string }), [], { enabled: !!id });
export const useTasks = (projectId: string, includeDone = true) => useQuery(`tasks:${projectId}`, () => call('tasks.list', { projectId, includeDone }), [includeDone]);

/** Local midnight as an ISO timestamp: "completed today" follows the person's own day. */
export const localMidnightIso = (): string => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };

/** My open tasks plus the ones I completed today. One cache key ('mywork:done') shared by Home and My Work, so they never disagree. */
export function useMyWork() {
  const today = todayYmd();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const since = useMemo(localMidnightIso, [today]);
  return useQuery('mywork:done', () => call('mywork.list', { doneSince: since }), [since]);
}
export const usePortfolio = () => useQuery('portfolio', () => call('portfolio.get', {}), []);