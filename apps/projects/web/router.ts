// Hash router. Inside the ecosystem shell every Projects address lives under #/projects (the shell routes #/projects/* here):
//   #/projects (home)  #/projects/my-work  #/projects/all  #/projects/p/:id/:view?task=..  #/projects/workload
//   #/projects/portfolio  #/projects/search?q=  #/projects/trash
// Inside the app paths are written without the prefix ('/home', '/projects', '/p/..'); parseHash removes it and to()/links add it.
import { useMemo, useSyncExternalStore } from 'react';

export type RouteName = 'home' | 'my-work' | 'projects' | 'project' | 'workload' | 'portfolio' | 'search' | 'trash' | 'not-found';
export const PROJECT_VIEWS = ['overview', 'list', 'board', 'calendar', 'timeline', 'docs'] as const;
export type ProjectViewId = (typeof PROJECT_VIEWS)[number];

export interface Route {
  name: RouteName;
  /** Path without query, e.g. /p/abc/list */
  path: string;
  projectId: string | null;
  /** Raw view segment from the URL (null when absent). */
  view: string | null;
  /** Open task id from ?task= (null when none). */
  task: string | null;
  /** ?q= for search. */
  q: string;
  params: URLSearchParams;
}

export const PREFIX = '#/projects';
const toShell = (p: string) => to(p);
/** Turn an app path ('#/p/x', '/home', '#/projects?tab=..') into the shell address under #/projects. */
export function to(path: string): string {
  if (path.startsWith(PREFIX + '/') || path === PREFIX || path.startsWith(PREFIX + '?')) return path;
  let p = path.replace(/^#/, '');
  if (!p.startsWith('/')) p = '/' + p;
  if (p === '/home' || p.startsWith('/home?')) p = p.slice('/home'.length);
  else if (p === '/projects' || p.startsWith('/projects?')) p = '/all' + p.slice('/projects'.length);
  return PREFIX + p;
}
/** The app path of a shell address ('#/projects/all?tab=x' → '/projects?tab=x'). */
function fromShell(hash: string): string {
  let raw = hash.replace(/^#/, '');
  if (raw === '/projects' || raw.startsWith('/projects/') || raw.startsWith('/projects?')) raw = raw.slice('/projects'.length);
  if (raw === '/all' || raw.startsWith('/all?') || raw.startsWith('/all/')) raw = '/projects' + raw.slice('/all'.length);
  if (raw === '' || raw.startsWith('?')) raw = '/home' + raw;
  return raw;
}

export function parseHash(hash: string): Route {
  const raw = fromShell(hash) || '/home';
  const qi = raw.indexOf('?');
  const path = (qi >= 0 ? raw.slice(0, qi) : raw).replace(/\/+$/, '') || '/home';
  const params = new URLSearchParams(qi >= 0 ? raw.slice(qi + 1) : '');
  const seg = path.split('/').filter(Boolean);
  const base = { path, projectId: null, view: null, task: params.get('task'), q: params.get('q') ?? '', params };
  switch (seg[0]) {
    case 'home': return { ...base, name: 'home' };
    case 'my-work': return { ...base, name: 'my-work' };
    case 'projects': return { ...base, name: 'projects' };
    case 'workload': return { ...base, name: 'workload' };
    case 'portfolio': return { ...base, name: 'portfolio' };
    case 'search': return { ...base, name: 'search' };
    case 'trash': return { ...base, name: 'trash' };
    case 'p':
      if (seg[1]) return { ...base, name: 'project', projectId: decodeURIComponent(seg[1]), view: seg[2] ?? null };
      return { ...base, name: 'not-found' };
    default: return { ...base, name: 'not-found' };
  }
}

export const links = {
  home: to('#/home'),
  myWork: to('#/my-work'),
  projects: to('#/projects'),
  workload: to('#/workload'),
  portfolio: to('#/portfolio'),
  trash: to('#/trash'),
  search: (q?: string) => to(q ? `#/search?q=${encodeURIComponent(q)}` : '#/search'),
  project: (id: string, view?: string | null, task?: string | null) =>
    to(`#/p/${encodeURIComponent(id)}${view ? `/${view}` : ''}${task ? `?task=${encodeURIComponent(task)}` : ''}`),
};

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return useMemo(() => parseHash(hash), [hash]);
}

export function navigate(dest: string, opts: { replace?: boolean } = {}): void {
  const target = toShell(dest);
  if (window.location.hash === target) return;
  if (opts.replace) {
    history.replaceState(null, '', target);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = target;
  }
}

/** Set or clear one query parameter on the current hash. */
export function setHashParam(key: string, value: string | null, opts: { replace?: boolean } = {}): void {
  const r = parseHash(window.location.hash);
  const params = new URLSearchParams(r.params);
  if (value === null) params.delete(key); else params.set(key, value);
  const qs = params.toString();
  navigate(`#${r.path}${qs ? `?${qs}` : ''}`, opts);
}

/** Open the task drawer over the current page. */
export function openTask(taskId: string): void { setHashParam('task', taskId); }
/** Close the task drawer (removes ?task=). */
export function closeTask(): void { setHashParam('task', null, { replace: true }); }
