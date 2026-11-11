import { createContext, useContext } from 'react';
import type { OrgMember, Person, TaskDetail, TaskPatch, TaskStatus } from '../../shared/api.ts';
import { ApiError } from '../api/client.ts';

export type UpdateResult = { ok: true } | { ok: false; error: ApiError };
export type ActResult<T> = { ok: true; value: T } | { ok: false; error: ApiError };

export interface TaskCtxValue {
  task: TaskDetail;
  /** Cache key of this task's detail query. */
  taskKey: string;
  /** Viewer role or trashed task: no field edits. */
  readOnly: boolean;
  trashed: boolean;
  people: OrgMember[];
  me: Person;
  isAdmin: boolean;
  /** Optimistic, version-checked, serialized tasks.update on this task. `local` is applied to the cached detail immediately. */
  update: (patch: TaskPatch, local?: Partial<TaskDetail>) => Promise<UpdateResult>;
  setStatus: (status: TaskStatus) => void;
  /** Run any other write: optional optimistic cache edit, rollback + toast on failure, refresh every view on success. */
  act: <T>(fn: () => Promise<T>, local?: (d: TaskDetail) => TaskDetail, opts?: { silent?: boolean }) => Promise<ActResult<T>>;
  reload: () => void;
}

export const TaskContext = createContext<TaskCtxValue | null>(null);

export function useTask(): TaskCtxValue {
  const v = useContext(TaskContext);
  if (!v) throw new Error('useTask outside TaskDrawer');
  return v;
}

export function toApiError(e: unknown): ApiError {
  return e instanceof ApiError ? e : new ApiError('internal', e instanceof Error ? e.message : 'Unexpected error');
}
