// Projects (V2, owner decision 11 Nov 2026: one project system) inside the shell. Projects is a React app built by
// apps/projects (scripts/build-web.mjs puts it at /projects/); its entry /projects/embed.js mounts it under the shell's own
// header, organization switcher and theme. Every call goes through the shell's API client (same token, refresh and
// "session expired" screen); the organization is the shell's active one. Projects routes its own pages under #/projects/…
// and stays mounted while the person moves between them; an organization switch, sign-out or leaving Projects unmounts it,
// so nothing from one organization is ever on screen in another.
import { h, put } from '../dom.js';
import { btn, notice, skeleton } from '../ui.js';

let current = null;          // { orgId, el, unmount: Promise<() => void> | null }

export const projectsMountedFor = (orgId) => Boolean(current && current.orgId === orgId);

export function unmountProjects() {
  if (!current) return;
  const { unmount } = current; current = null;
  unmount?.then((off) => off?.()).catch(() => { /* never mounted */ });
}

/** The element to put in the content area. The same element comes back while Projects stays mounted for this organization. */
export function projectsV2View({ api, org, orgs, me, loader = () => import('/projects/embed.js') }) {
  if (current?.orgId === org.org_id) return current.el;
  unmountProjects();
  const el = h('div', { class: 'projects-mount', 'aria-busy': 'true' });
  const slot = h('div', {}, skeleton(4));
  const wrap = h('section', { class: 'projects-wrap' }, el, slot);   // the app first: its top edge never moves when the placeholder goes
  wrap.__fullApp = true;                     // the shell drops its rail and frame: Projects' own sidebar is the menu
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
    put(slot, notice('err', 'cross', [h('b', {}, 'Projects couldn’t load.'), ' Your projects are safe. Check your connection and try again.'], [btn('Try again', () => location.reload(), 'primary')]));
    return null;
  });
  return wrap;
}
