// Launcher (design 03): every app that exists, in the designed order, with its state taken from launcher.catalog (the real app registry
// and this person's access). Funnel Mapper Pro is a normal tile: it opens in the same tab.
import { h, icon, plate, dialog, toast, emptyState, errorState, designBadge, roleLabel } from '../ui.js';
import { hrefFor } from '../routes.js';

const META = {
  office: ['off', 'Home, plans, funnels, documents, team and admin for this organization.'],
  projects: ['prj', 'Tasks and project work. Your home and your work in one place.'],
  clients: ['cli', 'Your client list, delivery stages and internal notes.'],
  portal: ['por', 'What clients see and approve. Its own sign-in and address.'],
  drive: ['drv', 'Files and documents for the organization and for you.'],
  planner: ['pln', 'Strategy, goals, measures and reviews.'],
  forms: ['frm', 'Build forms and read the answers.'],
  value_ladder: ['vl', 'Map how your offers lead into each other.'],
  social_planner: ['soc', 'Draft, approve and schedule social posts.'],
  whiteboard: ['wb', 'A shared canvas for sketching and planning.'],
  layer2_agents: ['ag', 'AI helpers that draft work for you to approve.'],
  funnel_mapper_pro: ['fmp', 'Map funnels and model the numbers.'],
};
const BUILT = new Set(['office']);          // apps whose screens exist in this build

export function launcherView({ catalog, error, org, orgs, role, onSwitch, retry }) {
  const head = (sub) => h('div', { class: 'hero' }, plate(), h('div', {}, h('div', { class: 'crumb' }, 'Launcher'), h('h1', { 'data-page-title': true }, `Your apps in ${org.name}`), h('p', { class: 'sub', style: 'margin-bottom:0' }, sub)));
  if (error) return h('section', {}, head(''), errorState(retry));
  if (!catalog.length) return h('section', {}, head(''), emptyState({ title: 'No apps yet', body: 'No app is switched on for you in this organization. Ask an admin.', ic: 'grid' }));
  const sub = role === 'owner' || role === 'admin' ? `You’re ${role === 'owner' ? 'an owner' : 'an admin'} here, so you see every app that is set up.` : 'You see the apps your access level includes. Others aren’t shown.';

  const open = (a) => {
    const [, desc] = META[a.app_key] ?? ['gen', ''];
    if (a.state === 'locked') {
      return dialog({ title: `${a.name} is locked`, body: [h('p', {}, 'Clients can’t sign in yet. The Portal stays off until the security tests for client access pass. ', role === 'owner' ? 'Then you switch it on here.' : 'An owner switches it on when it’s ready.'),
        h('div', { class: 'notice warn', style: 'margin-top:var(--space-3)' }, icon('lock'), h('p', {}, 'Security checks: ', h('b', {}, 'not yet passed'), '. Nothing is visible to clients.'))], actions: [{ label: 'Close', focus: true }] });
    }
    if (a.state === 'coming_soon') {
      return dialog({ title: `${a.name}: coming soon`, body: h('p', {}, a.app_key === 'layer2_agents' ? 'AI helpers are planned. Nothing runs yet, and nothing will without your approval of the provider, cost and data rules.' : `${a.name} is planned. ${desc}`), actions: [{ label: 'Got it', focus: true }] });
    }
    if (a.state === 'not_set_up') {
      const other = orgs.find((o) => o.name === a.other_org);
      return dialog({ title: `${a.name} isn’t set up for ${org.name}`, body: h('p', {}, `${a.name} is on in ${a.other_org ?? 'another organization'}. You’re in ${org.name}, so there’s nothing to open here.`),
        actions: [...(other ? [{ label: `Switch to ${other.name}`, cls: 'pri', on: () => onSwitch(other.org_id) }] : []), { label: 'Ask an admin', on: () => toast('Message only for now. No request was sent.', false) }, { label: 'Close', focus: true }] });
    }
    if (a.app_key === 'funnel_mapper_pro') {
      if (a.launch_url) { location.href = a.launch_url; return; }          // same tab, as a regular app
      return dialog({ title: 'Funnel Mapper Pro isn’t connected yet', body: h('p', {}, 'Its address hasn’t been set. An owner adds it when Funnel Mapper Pro goes live.'), actions: [{ label: 'Close', focus: true }] });
    }
    location.hash = BUILT.has(a.app_key) ? hrefFor.office() : hrefFor.app(a.app_key);
  };
  const badge = (s) => (s === 'locked' ? h('span', { class: 'pill warn' }, icon('lock'), 'Locked') : s === 'coming_soon' ? h('span', { class: 'pill' }, 'Coming soon') : s === 'not_set_up' ? h('span', { class: 'pill' }, 'Not set up here') : null);
  const cls = { locked: 'locked', coming_soon: 'soon', not_set_up: 'off', available: 'ok' };
  return h('section', {}, head(sub), h('ul', { class: 'tiles' }, ...catalog.map((a, i) => {
    const [ic, desc] = META[a.app_key] ?? ['gen', ''];
    return h('li', {}, h('button', { type: 'button', class: `tile ${cls[a.state] ?? 'ok'}`, style: `--n:${i}`, 'data-app': a.app_key, onclick: () => open(a) },
      h('span', { class: 'top' }, h('span', { class: 'ico' }, icon(ic)), badge(a.state)), h('strong', {}, a.name),
      h('span', { class: 'd' }, a.state === 'not_set_up' ? `${a.name} isn’t set up for ${org.name}.` : desc)));
  })), h('div', { class: 'legend fine' }, h('span', {}, icon('lock'), 'Locked: an owner turns it on when ready'), h('span', {}, icon('info'), 'Greyed out: not set up for this organization')));
}

// An app that is on for this person but has no screens in this build yet (shared "not built" state, never a fake page).
export const appNotBuiltView = (name) => h('section', {}, designBadge(), h('div', { class: 'crumb' }, 'Apps'), h('h1', { 'data-page-title': true }, name),
  emptyState({ title: `${name} isn’t built yet`, body: 'Its design and screens come later. Nothing has been lost; the data layer is separate.', ic: 'clock', action: h('a', { class: 'btn pri', href: hrefFor.office() }, 'Go to Office Home') }));
export { roleLabel };
