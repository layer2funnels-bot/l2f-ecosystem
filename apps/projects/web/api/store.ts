// Tiny data layer. One cache entry per (org, key, deps). invalidate(prefix) refetches every mounted
// consumer whose key starts with the prefix, so List / Board / Calendar can never disagree.
//
// Key conventions (shared by every view):
//   projects:<scope>   project:<id>   tasks:<projectId>   task:<id>   activity:<projectId>
//   mywork   workload   portfolio   timer   notifications   people   clients   tags   search
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError, getOrgId } from './client.ts';
import { toast } from '../ui/Toast.tsx';

interface Snap<T> { data: T | undefined; error: ApiError | null; loading: boolean; fetching: boolean }
interface Entry {
  key: string;
  snap: Snap<unknown>;
  fetcher: (() => Promise<unknown>) | null;
  gen: number;
  stale: boolean;
  updatedAt: number;
  listeners: Set<() => void>;
}

const cache = new Map<string, Entry>();
const IDLE: Snap<never> = { data: undefined, error: null, loading: false, fetching: false };
const orgPrefix = () => `${getOrgId() ?? ''}|`;

function getEntry(key: string): Entry {
  let e = cache.get(key);
  if (!e) {
    e = { key, snap: { data: undefined, error: null, loading: true, fetching: false }, fetcher: null, gen: 0, stale: false, updatedAt: 0, listeners: new Set() };
    cache.set(key, e);
  }
  return e;
}
function patch(e: Entry, p: Partial<Snap<unknown>>) {
  e.snap = { ...e.snap, ...p };
  for (const l of [...e.listeners]) l();
}
function toApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError('internal', err instanceof Error ? err.message : 'Unexpected error');
}

async function run(e: Entry, force: boolean): Promise<void> {
  if (!e.fetcher) return;
  if (e.snap.fetching && !force) return;
  const gen = ++e.gen;
  e.stale = false;
  patch(e, { fetching: true, loading: e.snap.data === undefined });
  try {
    const data = await e.fetcher();
    if (cache.get(e.key) !== e || gen !== e.gen) return;
    e.updatedAt = Date.now();
    patch(e, { data, error: null, loading: false, fetching: false });
  } catch (err) {
    if (cache.get(e.key) !== e || gen !== e.gen) return;
    patch(e, { error: toApiError(err), loading: false, fetching: false });
  }
}

const invalidateHooks = new Set<(prefixes: string[]) => void>();
/** Lets non-React caches (context-menu data) drop their copies when a key prefix is invalidated. */
export function onInvalidate(fn: (prefixes: string[]) => void): void { invalidateHooks.add(fn); }

/** Mark matching entries stale and refetch the ones currently on screen. */
export function invalidate(...prefixes: string[]): void {
  for (const h of invalidateHooks) h(prefixes);
  const base = orgPrefix();
  for (const e of cache.values()) {
    if (!prefixes.some((p) => e.key.startsWith(base + p))) continue;
    e.stale = true;
    if (e.listeners.size > 0) void run(e, true);
  }
}

/** Everything that depends on tasks / projects. Call after any task or project write. */
export function invalidateWork(): void {
  invalidate('projects', 'project', 'tasks', 'task', 'activity', 'mywork', 'workload', 'analytics', 'portfolio', 'search', 'timer', 'notifications');
}

/** Optimistically rewrite cached data for keys `prefix` (any deps). Returns a rollback function. */
export function setQueryData<T>(prefix: string, updater: (old: T) => T): () => void {
  const base = `${orgPrefix()}${prefix}|`;
  const undo: [Entry, unknown][] = [];
  for (const e of cache.values()) {
    if (!e.key.startsWith(base) || e.snap.data === undefined) continue;
    undo.push([e, e.snap.data]);
    patch(e, { data: updater(e.snap.data as T) });
  }
  return () => { for (const [e, old] of undo) if (cache.get(e.key) === e) patch(e, { data: old }); };
}

export function clearCache(): void { cache.clear(); }

export interface QueryResult<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
  fetching: boolean;
  refetch: () => Promise<void>;
}

export function useQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  deps: readonly unknown[] = [],
  opts: { enabled?: boolean; refetchInterval?: number } = {},
): QueryResult<T> {
  const enabled = opts.enabled !== false;
  const fullKey = `${getOrgId() ?? ''}|${key}|${JSON.stringify(deps)}`;
  const entry = enabled ? getEntry(fullKey) : null;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const snap = useSyncExternalStore(
    useCallback((cb: () => void) => {
      if (!entry) return () => {};
      entry.listeners.add(cb);
      return () => { entry.listeners.delete(cb); };
    }, [entry]),
    () => (entry ? entry.snap : IDLE),
  ) as Snap<T>;

  useEffect(() => {
    if (!entry) return;
    entry.fetcher = () => fetcherRef.current();
    if (entry.snap.data === undefined || entry.stale || Date.now() - entry.updatedAt > 10_000) void run(entry, false);
  }, [entry]);

  const interval = opts.refetchInterval;
  useEffect(() => {
    if (!entry || !interval) return;
    const id = setInterval(() => { if (!document.hidden) void run(entry, false); }, interval);
    return () => clearInterval(id);
  }, [entry, interval]);

  const refetch = useCallback(async () => { if (entry) await run(entry, true); }, [entry]);
  return { data: snap.data, error: snap.error, loading: snap.loading, fetching: snap.fetching, refetch };
}

export interface MutationOptions<A, R> {
  /** Apply optimistic changes; return a rollback function (e.g. from setQueryData). */
  onMutate?: (arg: A) => (() => void) | void;
  onSuccess?: (result: R, arg: A) => void;
  onError?: (error: ApiError, arg: A) => void;
  /** Key prefixes to invalidate on success. */
  invalidate?: string[] | ((result: R, arg: A) => string[]);
  success?: string | ((result: R, arg: A) => string);
  /** Show an error toast (default true). */
  errorToast?: boolean;
}

export function useMutation<A, R>(fn: (arg: A) => Promise<R>, opts: MutationOptions<A, R> = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  /** Resolves to the result, or undefined when it failed (errors never throw). */
  const mutate = useCallback(async (arg: A): Promise<R | undefined> => {
    const o = optsRef.current;
    setLoading(true);
    setError(null);
    const rollback = o.onMutate?.(arg);
    try {
      const result = await fnRef.current(arg);
      const inv = typeof o.invalidate === 'function' ? o.invalidate(result, arg) : o.invalidate;
      if (inv?.length) invalidate(...inv);
      const msg = typeof o.success === 'function' ? o.success(result, arg) : o.success;
      if (msg) toast.success(msg);
      o.onSuccess?.(result, arg);
      return result;
    } catch (err) {
      if (typeof rollback === 'function') rollback();
      const e = toApiError(err);
      if (alive.current) setError(e);
      if (o.errorToast !== false && e.code !== 'unauthenticated') toast.error(e.message);
      o.onError?.(e, arg);
      return undefined;
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  return { mutate, loading, error };
}
