// Favorite projects, per user + organization, kept in this browser's localStorage only.
import { useCallback, useSyncExternalStore } from 'react';
import { lsGet, lsSet } from './util.ts';

export const FAVORITES_NOTE = 'Favorites are saved in this browser only';

const keyOf = (userId: string, orgId: string) => `pm.favorites.${userId}.${orgId}`;
const cache = new Map<string, string[]>();
const listeners = new Set<() => void>();

function read(key: string): string[] {
  const hit = cache.get(key);
  if (hit) return hit;
  let list: string[] = [];
  try {
    const raw = lsGet(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) list = parsed.filter((x): x is string => typeof x === 'string');
  } catch { /* corrupt value: start over */ }
  cache.set(key, list);
  return list;
}
function write(key: string, list: string[]) {
  cache.set(key, list);
  lsSet(key, JSON.stringify(list));
  for (const l of [...listeners]) l();
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key?.startsWith('pm.favorites.')) { cache.delete(e.key); cb(); } };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(cb); window.removeEventListener('storage', onStorage); };
}

export function useFavorites(userId: string, orgId: string) {
  const key = keyOf(userId, orgId);
  const ids = useSyncExternalStore(subscribe, () => read(key));
  const toggle = useCallback((projectId: string) => {
    const cur = read(key);
    write(key, cur.includes(projectId) ? cur.filter((x) => x !== projectId) : [...cur, projectId]);
  }, [key]);
  const isFavorite = useCallback((projectId: string) => ids.includes(projectId), [ids]);
  return { ids, isFavorite, toggle };
}

/** Non-hook access for menus. */
export function isFavoriteNow(userId: string, orgId: string, projectId: string): boolean { return read(keyOf(userId, orgId)).includes(projectId); }
export function toggleFavoriteNow(userId: string, orgId: string, projectId: string): boolean {
  const key = keyOf(userId, orgId);
  const cur = read(key);
  const on = !cur.includes(projectId);
  write(key, on ? [...cur, projectId] : cur.filter((x) => x !== projectId));
  return on;
}