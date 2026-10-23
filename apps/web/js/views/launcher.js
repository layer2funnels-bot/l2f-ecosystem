// Launcher (design 03): every app that exists, in the designed order, with its state taken from launcher.catalog (the real app registry
// and this person's access). Funnel Mapper Pro is a normal tile: it opens in the same tab.
import { h, icon, dialog, toast, emptyState, errorState, designBadge, roleLabel } from '../ui.js';
import { hrefFor } from '../routes.js';
import { plateOf } from '../registry.js';
import { partOfDay, greeting, chipText, groupCatalog, findApps } from '../sky.js';

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

const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** The sky scene: decorative, hidden from assistive technology. `wx` is a condition name or null (time of day only). */
export const skyScene = () => h('div', { class: 'sky', 'aria-hidden': 'true' }, h('div', { class: 'stars' }), h('div', { class: 'orb' }), h('div', { class: 'fx cloud' }), h('div', { class: 'fx rain' }), h('div', { class: 'fx snow' }), h('div', { class: 'fx haze' }));
export const weatherChip = (w) => h('span', { class: 'wxchip', 'data-wx-chip': w.condition }, icon('info'), chipText(w));

export function launcherView({ catalog, error, org, orgs, role, name, registry, loadWeather: getWeather, now = () => new Date(), onSwitch, retry }) {
  const part = partOfDay(now().getHours());
  const root = h('section', { class: 'launcher', 'data-part': part, 'data-wx': 'none' }, skyScene());
  const chipSlot = h('div', { class: 'wxslot', 'aria-live': 'polite' });
  const head = (sub) => h('div', { class: 'skyhead' }, h('div', {}, h('p', { class: 'hi' }, greeting(part, name)), h('h1', { 'data-page-title': true }, `Your apps in ${org.name}`), h('p', { class: 'sub fine' }, sub)), chipSlot);
  const finish = (...kids) => { root.append(...kids); return root; };
  if (error) return finish(head(''), h('div', { class: 'shelf' }, errorState(retry)));
  if (!catalog.length) return finish(head(''), h('div', { class: 'shelf' }, emptyState({ title: 'No apps yet', body: 'No app is switched on for you in this organization. Ask an admin. If you were invited as a client, your portal opens once the team switches it on.', ic: 'grid' })));
  const sub = role === 'owner' || role === 'admin' ? `You’re ${role === 'owner' ? 'an owner' : 'an admin'} here, so you see every app that is set up.` : 'You see the apps your access level includes. Others aren’t shown.';
  if (getWeather) getWeather().then((w) => { if (!w || !root.isConnected) return; root.dataset.wx = w.condition; chipSlot.replaceChildren(weatherChip(w)); attrib.hidden = false; }).catch(() => {});
  const attrib = h('p', { class: 'attrib', hidden: true }, 'Weather: ', h('a', { href: 'https://www.met.no/en', target: '_blank', rel: 'noopener noreferrer' }, 'Data from MET Norway'), ' (', h('a', { href: 'https://creativecommons.org/licenses/by/4.0/', target: '_blank', rel: 'noopener noreferrer' }, 'CC BY 4.0'), '). Changed: reduced to a one-line summary. You can switch weather off in your profile menu.');

  const open = (a, tile) => {
    const [, desc] = META[a.app_key] ?? ['gen', ''];
    if (a.state === 'locked') {
      return dialog({ title: `${a.name} is locked`, body: [h('p', {}, 'Clients can’t sign in yet. The Portal stays off until the security tests for client access pass. ', role === 'owner' ? 'Then you switch it on here.' : 'An owner switches it on when it’s ready.'),
        h('div', { class: 'notice warn', style: 'margin-top:var(--space-3)' }, icon('lock'), h('p', {}, 'Security checks: ', h('b', {}, 'not yet passed'), '. Nothing is visible to clients.'))], actions: [{ label: 'Preview what clients will see', cls: 'pri', on: () => { location.hash = '#/portal'; } }, { label: 'Close', focus: true }] });
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
    const go = () => { location.hash = BUILT.has(a.app_key) ? hrefFor.office() : hrefFor.app(a.app_key); };
    if (!tile || reduceMotion()) return go();        // opening an app zooms it out of its icon; no motion if the person asked for none
    tile.classList.add('opening'); setTimeout(go, 170);
  };
  const badge = (s) => (s === 'locked' ? h('span', { class: 'pill warn' }, icon('lock'), 'Locked') : s === 'coming_soon' ? h('span', { class: 'pill' }, 'Coming soon') : s === 'not_set_up' ? h('span', { class: 'pill' }, 'Not set up') : null);
  const cls = { locked: 'locked', coming_soon: 'soon', not_set_up: 'off', available: 'ok' };
  const describe = (a) => (a.state === 'not_set_up' ? `${a.name} isn’t set up for ${org.name}.` : (META[a.app_key] ?? ['gen', ''])[1]);
  const find = h('input', { type: 'search', id: 'app-find', placeholder: 'Find an app', autocomplete: 'off', 'aria-label': 'Find an app' });
  const shelf = h('div', { class: 'shelf' });
  const draw = () => {
    const shown = findApps(catalog, find.value, describe);
    shelf.replaceChildren(...(shown.length ? groupCatalog(shown, registry).flatMap(([group, apps]) => [h('h2', {}, group),
      h('ul', { class: 'tiles' }, ...apps.map((a, i) => {
        const tile = h('button', { type: 'button', class: `tile ${cls[a.state] ?? 'ok'}`, style: `--n:${i}`, 'data-app': a.app_key, onclick: () => open(a, tile) },
          h('span', { class: 'top' }, h('span', { class: 'ico' }, plateOf(registry?.get(a.app_key) ?? { id: a.app_key }, 44, a.state)), badge(a.state)), h('strong', {}, a.name), h('span', { class: 'd' }, describe(a)));
        return h('li', {}, tile);
      }))]) : [emptyState({ title: 'No app matches', body: `Nothing called “${find.value.trim()}” here. Try another word.`, ic: 'search' })]),
      h('div', { class: 'legend fine' }, h('span', {}, icon('lock'), 'Locked: an owner turns it on when ready'), h('span', {}, icon('info'), 'Greyed out: not set up for this organization')), attrib);
  };
  find.addEventListener('input', draw);
  find.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); shelf.querySelector('.tile')?.click(); } else if (e.key === 'Escape' && find.value) { find.value = ''; draw(); } });
  // "/" jumps to the search box from anywhere on the Launcher (not while typing in a field)
  const slash = (e) => { if (e.key === '/' && !e.ctrlKey && !e.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) && root.isConnected) { e.preventDefault(); find.focus(); } };
  document.addEventListener('keydown', slash);
  draw();
  return finish(head(sub), h('div', { class: 'findwrap' }, h('label', {}, icon('search'), h('span', { class: 'sr' }, 'Find an app'), find, h('kbd', { 'aria-hidden': 'true' }, '/'))), shelf);
}

// An app that is on for this person but has no screens in this build yet (shared "not built" state, never a fake page).
export const appNotBuiltView = (name) => h('section', {}, designBadge(), h('div', { class: 'crumb' }, 'Apps'), h('h1', { 'data-page-title': true }, name),
  emptyState({ title: `${name} isn’t built yet`, body: 'Its design and screens come later. Nothing has been lost; the data layer is separate.', ic: 'clock', action: h('a', { class: 'btn pri', href: hrefFor.office() }, 'Go to Office Home') }));
export { roleLabel };
