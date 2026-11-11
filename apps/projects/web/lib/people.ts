// Who can be assigned to a task, and how an assignee patch changes a task's assignee list (for optimistic updates).
import { useMemo } from 'react';
import type { BulkTaskPatch, OrgMember, Person, ProjectDetail } from '../../shared/api.ts';
import { usePeople } from './data.ts';

export const MAX_ASSIGNEES = 20;
const byName = (a: Person, b: Person) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);
export const toPerson = (p: Person): Person => ({ id: p.id, name: p.name, email: p.email, color: p.color });

/**
 * Same rule as the server (pm.user_can_view): in a personal project only its owner; otherwise organization owners/admins,
 * everybody when the project is visible to the organization, and the project's members. People who are already assigned
 * stay in the list so they remain visible and removable.
 */
export function assignablePeople(
  project: Pick<ProjectDetail, 'kind' | 'visibility' | 'owner' | 'members'> | undefined,
  org: OrgMember[],
  current: Person[] = [],
): Person[] {
  let list: Person[];
  if (!project) list = org;
  else if (project.kind === 'personal') list = org.filter((p) => p.id === project.owner?.id);
  else {
    const members = new Set(project.members.map((m) => m.id));
    list = org.filter((p) => p.role === 'owner' || p.role === 'admin' || project.visibility === 'organization' || members.has(p.id));
  }
  const seen = new Set(list.map((p) => p.id));
  return [...list.map(toPerson), ...current.filter((p) => !seen.has(p.id)).map(toPerson)].sort(byName);
}

/** The project's assignable people (loads the organization's people once, shared cache). */
export function useAssignable(project: Pick<ProjectDetail, 'kind' | 'visibility' | 'owner' | 'members'> | undefined, current: Person[] = []): Person[] {
  const org = usePeople().data;
  return useMemo(() => assignablePeople(project, org ?? [], current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, org, current.map((p) => p.id).join(',')]);
}

/** Applies assigneeIds / addAssigneeIds / removeAssigneeIds (in the server's order) to a list of people. `pool` resolves ids to people. */
export function patchAssignees(current: Person[], p: Pick<BulkTaskPatch, 'assigneeIds' | 'addAssigneeIds' | 'removeAssigneeIds'>, pool: Person[]): Person[] {
  if (p.assigneeIds === undefined && p.addAssigneeIds === undefined && p.removeAssigneeIds === undefined) return current;
  const find = (id: string) => current.find((x) => x.id === id) ?? pool.find((x) => x.id === id);
  let ids = p.assigneeIds ? [...p.assigneeIds] : current.map((x) => x.id);
  if (p.addAssigneeIds) ids = [...new Set([...ids, ...p.addAssigneeIds])];
  if (p.removeAssigneeIds) ids = ids.filter((id) => !p.removeAssigneeIds!.includes(id));
  return ids.map(find).filter((x): x is Person => !!x).map(toPerson).sort(byName);
}
