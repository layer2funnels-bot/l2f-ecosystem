// Hash routing: #/planner/<page>?plan=<id>&goal=<id>. The same URLs work when Office hosts Planner or when it runs alone,
// survive a refresh, and carry the plan and open goal (never the organization: that comes from the signed-in context).
import { useCallback, useEffect, useState } from 'react';

export type Page = 'overview' | 'mine' | 'plans' | 'map' | 'reviews' | 'settings' | 'alignment' | 'reports' | 'goals' | 'metrics' | 'model' | 'templates';

/** Every screen with its plain name (used for the page title). */
export const PAGES: { page: Page; label: string }[] = [
  { page: 'overview', label: 'Home' }, { page: 'mine', label: 'My work' }, { page: 'plans', label: 'Plans' }, { page: 'map', label: 'Planner' },
  { page: 'reviews', label: 'Reviews' }, { page: 'settings', label: 'Plan settings' }, { page: 'alignment', label: 'Alignment' }, { page: 'reports', label: 'Summary' },
  { page: 'goals', label: 'All objectives' }, { page: 'metrics', label: 'Metrics' }, { page: 'model', label: 'Strategy model' }, { page: 'templates', label: 'Templates' },
];

export interface NavTab { label: string; page: Page; params?: Record<string, string> }
export interface NavGroup { key: string; label: string; icon: string; home: Page; pages: Page[]; admin?: boolean; tabs?: NavTab[] }

/** The whole menu: six plain items. Each item with sub-pages shows them as tabs, nothing more. */
export const NAV: NavGroup[] = [
  { key: 'home', label: 'Home', icon: 'home', home: 'overview', pages: ['overview'] },
  { key: 'mine', label: 'My work', icon: 'check', home: 'mine', pages: ['mine'] },
  { key: 'plans', label: 'Plans', icon: 'plans', home: 'plans', pages: ['plans', 'map', 'reviews', 'settings'],
    tabs: [{ label: 'Planner', page: 'map' }, { label: 'Timeline', page: 'map', params: { view: 'timeline' } }, { label: 'Reviews', page: 'reviews' }, { label: 'Settings', page: 'settings' }] },
  { key: 'alignment', label: 'Alignment', icon: 'tree', home: 'alignment', pages: ['alignment'] },
  { key: 'reports', label: 'Reports', icon: 'chart', home: 'reports', pages: ['reports', 'goals', 'metrics'],
    tabs: [{ label: 'Summary', page: 'reports' }, { label: 'All objectives', page: 'goals' }, { label: 'Metrics', page: 'metrics' }] },
  { key: 'model', label: 'Strategy model', icon: 'model', home: 'model', pages: ['model', 'templates'], admin: true,
    tabs: [{ label: 'Strategy map', page: 'model' }, { label: 'Objective kinds', page: 'model', params: { tab: 'kinds' } }, { label: 'KPI types', page: 'model', params: { tab: 'kpis' } }, { label: 'Focus areas', page: 'model', params: { tab: 'focus' } }, { label: 'Time horizons', page: 'model', params: { tab: 'horizons' } }, { label: 'Templates', page: 'templates' }] },
];

/** Screens that work on one selected plan. The others (lists, alignment, model, my work) span the organization. */
export const PLAN_PAGES: Page[] = ['overview', 'map', 'reviews', 'settings', 'reports', 'goals', 'metrics'];

export interface Route { page: Page; params: Record<string, string> }

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = raw.split('?');
  const seg = path.split('/').filter(Boolean);
  const first = seg[0] === 'planner' ? seg[1] : seg[0];
  const page = (PAGES.find((p) => p.page === first)?.page ?? 'overview') as Page;
  return { page, params: Object.fromEntries(new URLSearchParams(query)) };
}

export function buildHash(page: Page, params: Record<string, string | null | undefined> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return `#/planner/${page}${s ? '?' + s : ''}`;
}

/** Planner only reacts to its own addresses: once the shell has moved to another app, a late hash change must not pull the address back. */
export const isPlannerHash = (hash: string) => /^#\/planner(\/|$|\?)/.test(hash);

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => { if (isPlannerHash(window.location.hash)) setRoute(parseHash(window.location.hash)); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const navigate = useCallback((page: Page, params: Record<string, string | null | undefined> = {}, opts: { replace?: boolean } = {}) => {
    if (opts.replace && !isPlannerHash(window.location.hash)) return;          // the shell is already on another page
    const hash = buildHash(page, params);
    if (opts.replace) window.history.replaceState(null, '', hash); else window.location.hash = hash;
    setRoute(parseHash(hash));
  }, []);
  /** Changes only some parameters of the current route (e.g. open a goal) without losing the rest. */
  const patch = useCallback((changes: Record<string, string | null>, opts: { replace?: boolean } = {}) => {
    if (!isPlannerHash(window.location.hash)) return;
    const cur = parseHash(window.location.hash);
    const next: Record<string, string | null | undefined> = { ...cur.params, ...changes };
    navigate(cur.page, next, opts);
  }, [navigate]);
  return { route, navigate, patch };
}
