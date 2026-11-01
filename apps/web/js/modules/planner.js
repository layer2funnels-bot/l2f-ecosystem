// Planner inside the shell. Planner is a React app built by apps/planner (scripts/build-web.mjs puts it at /planner/); its entry
// /planner/embed.js mounts it into an element under the shell's own header, organization switcher and theme. Every call goes
// through the shell's API client (same token, refresh and "session expired" screen); the organization is the shell's active one.
// Planner stays mounted while the person moves between its pages (it routes #/planner/... itself); an organization switch,
// sign-out or leaving Planner unmounts it, so nothing from one organization is ever on screen in another.
import { h, put } from '../dom.js';
import { btn, notice, skeleton } from '../ui.js';

let current = null;          // { orgId, el, unmount: Promise<() => void> | null }

/** Planner's menu, shown in the shell's app bar like Office's (Planner keeps its own tabs inside a section). */
export const PLANNER_PAGES = [
  { key: 'overview', label: 'Home', icon: 'home', href: '#/planner/overview', pages: ['overview'] },
  { key: 'mine', label: 'My work', icon: 'check', href: '#/planner/mine', pages: ['mine'] },
  { key: 'plans', label: 'Plans', icon: 'pln', href: '#/planner/plans', pages: ['plans', 'map', 'reviews', 'settings'] },
  { key: 'alignment', label: 'Alignment', icon: 'grid', href: '#/planner/alignment', pages: ['alignment'] },
  { key: 'reports', label: 'Reports', icon: 'star', href: '#/planner/reports', pages: ['reports', 'goals', 'metrics'] },
  { key: 'model', label: 'Strategy model', icon: 'key', href: '#/planner/model', pages: ['model', 'templates'], manage: true },
];
export const plannerSection = (page) => (PLANNER_PAGES.find((p) => p.pages.includes(page ?? 'overview')) ?? PLANNER_PAGES[0]).key;

export const plannerMountedFor = (orgId) => Boolean(current && current.orgId === orgId);

export function unmountPlanner() {
  if (!current) return;
  const { unmount } = current; current = null;
  unmount?.then((off) => off?.()).catch(() => { /* never mounted */ });
}

/** The element to put in the content area. The same element comes back while Planner stays mounted for this organization. */
export function plannerView({ api, org, orgs, me, loader = () => import('/planner/embed.js') }) {
  if (current?.orgId === org.org_id) return current.el;
  unmountPlanner();
  const el = h('div', { class: 'planner-mount', 'aria-busy': 'true' });
  const slot = h('div', {}, skeleton(4));
  const wrap = h('section', { class: 'planner-wrap' }, slot, el);
  const entry = { orgId: org.org_id, el: wrap, unmount: null };
  current = entry;
  const host = { org: org.org_id, me, orgs, call: (op, input, orgId) => api.call(op, input, { org: orgId }) };
  entry.unmount = loader().then(async (m) => {
    if (current !== entry) return null;                         // switched away while loading
    const off = await m.mount(el, host);
    if (current !== entry) { off(); return null; }
    slot.remove(); el.setAttribute('aria-busy', 'false');
    return off;
  }).catch(() => {
    if (current !== entry) return null;
    put(slot, notice('err', 'cross', [h('b', {}, 'Planner couldn’t load.'), ' Your plans are safe. Check your connection and try again.'], [btn('Try again', () => location.reload(), 'primary')]));
    return null;
  });
  return wrap;
}
