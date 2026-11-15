// The ecosystem shell (design 01 + 10 §C): colour bar, header (Launcher, organization switcher, search, notifications, profile),
// the app menu on top (tablet/desktop) and as a bottom bar (phone), and the content area.
import { h, icon, orgMarkEl, roleLabel, initials, dialog } from '../ui.js';
import { hrefFor, appLabel } from '../routes.js';
import { plateOf } from '../registry.js';
import { appNav } from '../appnav.js';
import { clickedInside } from '../dom.js';

let offs = [];      // document-level listeners belong to the shell that is on screen; a new render removes the old ones
const onDocClick = (fn) => { document.addEventListener('click', fn); offs.push(() => document.removeEventListener('click', fn)); };
const trap = (menu, button, onClose) => {                 // arrow keys move, Esc closes and returns focus, Tab leaves
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll('[role^=menuitem]')]; const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(true); }
    else if (e.key === 'Tab') onClose(false);
  });
};

function switcher({ orgs, active, onPick, compact = false }) {
  const menuId = 'org-menu';
  // V8 rail: the organization's logo alone, its name in the accessible label and tooltip; the Launcher keeps the wide button
  const sw = compact
    ? h('button', { type: 'button', class: 'orgbtn orgsw r-org', id: 'org-switcher', title: `${active.name} · switch organization`, 'aria-label': `${active.name}: switch organization`, 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': menuId, 'data-pending': 'false' },
      orgMarkEl(active, 34), h('strong', { class: 'sr' }, active.name), h('span', { class: 'spin', 'aria-hidden': 'true' }))
    : h('button', { type: 'button', class: 'orgbtn orgsw', id: 'org-switcher', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': menuId, 'data-pending': 'false' },
      orgMarkEl(active, 28),
      h('span', { class: 't' }, h('strong', {}, active.name)), icon('chev', 'chev'), h('span', { class: 'spin', 'aria-hidden': 'true' }));
  const menu = h('div', { class: 'menu', id: menuId, role: 'menu', 'aria-label': 'Switch organization', 'data-open': 'false' });
  const note = h('div', { id: 'org-note' });
  const close = (refocus) => { menu.dataset.open = 'false'; sw.setAttribute('aria-expanded', 'false'); if (refocus) sw.focus(); };
  const open = () => {
    menu.replaceChildren(h('div', { class: 'mh' }, 'Your organizations'), ...orgs.map((o) => {
      const cur = o.org_id === active.org_id;
      return h('button', { type: 'button', role: 'menuitemradio', class: 'opt', 'aria-checked': String(cur), tabindex: '-1', 'data-org': o.org_id, onclick: () => { close(false); if (!cur) onPick(o.org_id); else sw.focus(); } },
        orgMarkEl(o, 36), h('span', { class: 'tx' }, h('strong', {}, o.name), h('small', {}, roleLabel(o.role))),
        cur ? h('span', { class: 'st' }, icon('check'), 'Current') : null);
    }), note, h('div', { class: 'mfoot' }, 'Switching keeps you on the same page where it exists. Nothing is copied between organizations.'));
    menu.dataset.open = 'true'; sw.setAttribute('aria-expanded', 'true');
    (menu.querySelector('[aria-checked=true]') ?? menu.querySelector('.opt'))?.focus();
  };
  sw.addEventListener('click', () => (menu.dataset.open === 'true' ? close(true) : open()));
  trap(menu, sw, close);
  onDocClick((e) => { if (menu.dataset.open === 'true' && !clickedInside(e, '.swwrap')) close(false); });
  return h('div', { class: 'orgwrap swwrap' }, sw, menu);
}

/** The grid button: "Back to Launcher" and every app this person may open here (Design v4 section 5). `suffix` keeps ids unique when the phone header repeats it. */
function appSwitcher({ catalog = [], registry, launcherCurrent, suffix = '', currentApp = null }) {
  const btn = h('button', { type: 'button', class: 'launch-btn', id: `app-switcher${suffix}`, 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': `apps-menu${suffix}`, 'aria-label': 'Open the app switcher' }, icon('grid'));
  const menu = h('div', { class: 'menu appmenu apps', id: `apps-menu${suffix}`, role: 'menu', 'aria-label': 'Apps', 'data-open': 'false' });
  const close = (refocus) => { menu.dataset.open = 'false'; btn.setAttribute('aria-expanded', 'false'); if (refocus) btn.focus(); };
  const usable = catalog.filter((a) => a.state === 'available');
  btn.addEventListener('click', () => {
    if (menu.dataset.open === 'true') return close(true);
    menu.replaceChildren(
      // V8 apps menu (prototype .appmenu): Launcher row with its shortcut, a 3-column grid of 38 px marks, the current app marked, a hint
      h('a', { class: 'home back', role: 'menuitem', href: '#/launcher', tabindex: '-1', onclick: () => close(false), ...(launcherCurrent ? { 'aria-current': 'page' } : {}) },
        h('span', { class: 'mini' }, icon('grid')), h('span', { class: 'grow' }, 'Launcher'), h('kbd', { 'aria-label': 'Shortcut: G then L' }, 'G L')),
      usable.length ? h('div', { class: 'grid applist' }, ...usable.map((a) => h('a', { class: 'appitem', 'data-app': a.app_key, role: 'menuitem', tabindex: '-1', href: a.app_key === 'office' ? hrefFor.office() : hrefFor.app(a.app_key), onclick: () => close(false), ...(a.app_key === currentApp ? { 'aria-current': 'true' } : {}) },
        plateOf(registry?.get(a.app_key) ?? { id: a.app_key }, 38), a.name))) : h('div', { class: 'mfoot' }, 'No other app is switched on for you here.'),
      usable.length ? h('p', { class: 'hint' }, 'Ctrl-click or middle-click opens an app in a new tab.') : null);
    menu.dataset.open = 'true'; btn.setAttribute('aria-expanded', 'true'); menu.querySelector('[role=menuitem]').focus();
  });
  trap(menu, btn, close);
  onDocClick((e) => { if (menu.dataset.open === 'true' && !clickedInside(e, `.apps-wrap${suffix}`)) close(false); });
  return h('div', { class: `appsw swwrap apps-wrap apps-wrap${suffix}` }, btn, menu);
}

/** V8 notifications (02_GLOBAL_SHELL §6, migration 0054): the bell opens one inbox for every app, in this organization only.
 * notifications: { count(fresh) -> n|null, list(group, app) -> rows|null, read(ids|'all'), href(row) }. */
const KIND = { assigned: 'assigned you', mentioned: 'mentioned you on', commented: 'commented on', completed: 'completed', unblocked: 'unblocked', due_changed: 'changed the due date of' };
const GROUPS = [['all', 'All'], ['mentions', 'Mentions'], ['assigned', 'Assigned'], ['approvals', 'Approvals'], ['updates', 'Updates']];
const APP_NAME = { projects: 'Projects', drive: 'Drive', clients: 'Clients', planner: 'Planner', tasks: 'Tasks', forms: 'Forms', social: 'Social Planner', office: 'Office' };
const noteText = (r) => (r.title && !KIND[r.kind] ? [h('b', {}, r.actor_name), ` ${r.title}`] : [h('b', {}, r.actor_name), ` ${KIND[r.kind] ?? 'updated'} “${r.title}”`]);
const ago = (iso) => { const s = (Date.now() - new Date(iso)) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };
function bell(notifications, registry) {
  const badge = h('span', { class: 'badge', hidden: true, 'aria-hidden': 'true' });
  const b = h('button', { type: 'button', class: 'iconbtn', id: 'bell', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': 'Notifications' }, icon('bell'), badge);
  const paintCount = (n) => { badge.hidden = !n; badge.textContent = n > 99 ? '99+' : String(n ?? ''); b.setAttribute('aria-label', n ? `Notifications, ${n} unread` : 'Notifications'); };
  notifications.count().then(paintCount);
  let panel = null;
  const close = () => { if (!panel) return; panel.remove(); panel = null; b.setAttribute('aria-expanded', 'false'); b.focus(); };
  b.addEventListener('click', () => {
    if (panel) return close();
    let group = 'all', app = null;
    const list = h('div', { class: 'nfx-list', role: 'list' });
    const kinds = h('div', { class: 'nfx-kinds', role: 'tablist', 'aria-label': 'Kind' });
    const apps = h('div', { class: 'nfx-apps', role: 'group', 'aria-label': 'App' });
    const markAll = h('button', { type: 'button', class: 'btn link', onclick: async () => { await notifications.read('all'); paintCount(0); list.querySelectorAll('.unread').forEach((x) => x.classList.remove('unread')); } }, 'Mark all read');
    const load = async () => {
      kinds.replaceChildren(...GROUPS.map(([k, l]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(k === group), onclick: () => { group = k; load(); } }, l)));
      list.replaceChildren(h('p', { class: 'nfx-hint', role: 'status' }, 'Loading…'));
      const rows = await notifications.list(group, app);
      if (!panel) return;
      const seen = [...new Set((rows ?? []).map((r) => r.app))];
      apps.replaceChildren(...(seen.length > 1 || app ? [h('button', { type: 'button', 'aria-pressed': String(!app), onclick: () => { app = null; load(); } }, 'All apps'),
        ...[...new Set([...seen, ...(app ? [app] : [])])].map((k) => h('button', { type: 'button', 'aria-pressed': String(app === k), onclick: () => { app = k; load(); } }, plateOf(registry?.get(k) ?? { id: k }, 16), APP_NAME[k] ?? k))] : []));
      if (rows == null) return list.replaceChildren(h('p', { class: 'nfx-hint' }, 'Notifications couldn’t be loaded. Try again in a moment.'));
      if (!rows.length) return list.replaceChildren(h('div', { class: 'nfx-empty' }, icon('bell'), h('b', {}, group === 'all' ? 'You’re all caught up' : 'Nothing here'), h('span', {}, 'New mentions, assignments, approvals and shares appear here.')));
      list.replaceChildren(...rows.map((r) => h('a', { class: `nfx-item${r.read_at ? '' : ' unread'}`, role: 'listitem', href: notifications.href(r),
        onclick: () => { close(); if (!r.read_at) notifications.read([r.id]).then(() => notifications.count(true).then(paintCount)); } },
        h('span', { class: 'avatar', 'aria-hidden': 'true' }, initials(r.actor_name)),
        h('span', { class: 'nfx-tx' }, h('span', { class: 'nfx-line' }, ...noteText(r)),
          h('small', {}, plateOf(registry?.get(r.app) ?? { id: r.app }, 16), ` ${APP_NAME[r.app] ?? r.app}${r.context ? ` · ${r.context}` : ''} · ${ago(r.created_at)}`)),
        r.read_at ? null : h('i', { class: 'nfx-dot', 'aria-label': 'Unread' }))));
    };
    panel = h('aside', { class: 'nfx', role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Notifications', onkeydown: (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } } },
      h('header', { class: 'nfx-head' }, h('h2', {}, 'Notifications'), markAll, h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Close notifications', onclick: close }, icon('x'))),
      kinds, apps, list,
      h('footer', { class: 'nfx-foot' }, h('a', { href: '#/profile/notifications', onclick: () => close() }, icon('gear'), 'Notification settings: choose which apps reach you')));
    document.body.append(panel); b.setAttribute('aria-expanded', 'true'); load();
    panel.querySelector('[role=tab]')?.focus();
  });
  onDocClick((e) => { if (panel && !clickedInside(e, panel, b)) close(); });   // the filters re-render on click: see clickedInside
  return h('div', { class: 'swwrap bell-wrap' }, b);
}

const avatarBits = (text, photo) => (photo ? [h('img', { src: photo, alt: '' })] : [initials(text)]);
/** Updates the header avatar in place after a photo or name change (no re-render of the page the person is on). */
export function setHeaderAvatar(me) { for (const b of document.querySelectorAll('.profile-wrap .who')) b.replaceChildren(...avatarBits(me?.name || b.getAttribute('aria-label') || '?', me?.photo)); }
/** The keyboard shortcuts that work everywhere (profile menu "Keyboard shortcuts", or the ? key). */
export const SHORTCUTS = [['Ctrl K', 'Search everything'], ['G then L', 'Open the Launcher'], ['/', 'Find an app on the Launcher, or search in the app'], ['?', 'Show these shortcuts'], ['Esc', 'Close a menu, panel or dialog']];
export function shortcutsDialog() {
  return dialog({ title: 'Keyboard shortcuts', key: 'shortcuts', body: h('dl', { class: 'kbds' }, ...SHORTCUTS.flatMap(([k, t]) => [h('dt', {}, ...k.split(' ').map((x) => (x === 'then' ? ' then ' : h('kbd', {}, x)))), h('dd', {}, t)])), actions: [{ label: 'Close', cls: 'primary', focus: true }] });
}

// V8 profile menu (prototype .menu.railmenu, measured): photo, name and email; My profile; Appearance (Light, Dark; System kept from
// before, owner rule: no feature removed without approval); Keyboard shortcuts with its ? key; Sign out. The prototype's
// "Weather on the Launcher" switch is left out on purpose (owner, 14 Nov: weather changes on its own, no switch).
function profile({ email, name, photo, onSignOut, theme }) {
  const btn = h('button', { type: 'button', class: 'who avatar', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'profile-menu', 'aria-label': `Your profile: ${name || email}` }, ...avatarBits(name || email, photo));
  const menu = h('div', { class: 'menu profile-menu pm8', id: 'profile-menu', role: 'menu', 'aria-label': 'Your profile', 'data-open': 'false' });
  const close = (refocus) => { menu.dataset.open = 'false'; btn.setAttribute('aria-expanded', 'false'); if (refocus) btn.focus(); };
  btn.addEventListener('click', () => {
    if (menu.dataset.open === 'true') return close(true);
    const pref = theme?.pref?.() ?? 'system';
    const choose = (v, ic, label) => h('button', { type: 'button', class: 'pm8-theme', role: 'menuitemradio', 'aria-checked': String(pref === v), tabindex: '-1', onclick: () => { theme.set(v); close(false); } }, icon(ic), label);
    const photoEl = h('span', { class: 'pm8-photo', 'aria-hidden': 'true' }, ...avatarBits(name || email, btn.querySelector('img')?.src ?? photo));
    menu.replaceChildren(...[
      h('div', { class: 'pm8-who' }, photoEl, h('div', {}, h('b', {}, name || email || ''), name ? h('small', {}, email ?? '') : null)),
      h('a', { class: 'pm8-link', role: 'menuitem', href: '#/profile', tabindex: '-1', onclick: () => close(false) }, icon('user'), 'My profile'),
      theme ? h('div', { class: 'pm8-app', role: 'group', 'aria-label': 'Appearance' }, h('p', { class: 'over' }, 'Appearance'), choose('light', 'sun', 'Light'), choose('dark', 'moon', 'Dark'), choose('system', 'desk', 'Same as this device')) : null,
      h('button', { type: 'button', class: 'pm8-link', role: 'menuitem', tabindex: '-1', onclick: () => { close(false); shortcutsDialog(); } }, icon('info'), 'Keyboard shortcuts', h('kbd', {}, '?')),
      h('button', { type: 'button', class: 'pm8-link', role: 'menuitem', tabindex: '-1', onclick: () => { close(false); onSignOut(); } }, icon('logout'), 'Sign out'),
    ].filter(Boolean));
    menu.dataset.open = 'true'; btn.setAttribute('aria-expanded', 'true'); menu.querySelector('[role=menuitem]').focus();
  });
  trap(menu, btn, close);
  onDocClick((e) => { if (menu.dataset.open === 'true' && !clickedInside(e, '.profile-wrap')) close(false); });
  return h('div', { class: 'swwrap profile-wrap' }, btn, menu);
}

/** V8 ecosystem rail (02_GLOBAL_SHELL §1): organization, all apps, pinned apps, then search, notifications and the profile at the bottom.
 * The same in every app. Every app link is a real <a href> so Ctrl-click, middle-click and "Open in new tab" work. */
const PINNED = ['office', 'projects', 'tasks', 'clients', 'drive', 'planner'];
const appHref = (k) => (k === 'office' ? hrefFor.office() : hrefFor.app(k));
function rail({ sw, catalog = [], registry, currentApp, bellEl, who, onSearch }) {
  const usable = new Map(catalog.filter((a) => a.state === 'available').map((a) => [a.app_key, a]));
  const keys = PINNED.filter((k) => usable.has(k)); if (currentApp && usable.has(currentApp) && !keys.includes(currentApp)) keys.push(currentApp);
  const search = onSearch ? h('button', { type: 'button', class: 'r-btn', id: 'rail-search', title: 'Search everything (Ctrl K)', 'aria-label': 'Search everything', 'aria-keyshortcuts': 'Control+K', onclick: () => onSearch() }, icon('search'))
    : h('button', { type: 'button', class: 'r-btn', id: 'rail-search', 'aria-disabled': 'true', 'aria-describedby': 'search-why', title: 'Search is not available for client accounts', 'aria-label': 'Search everything' }, icon('search'));
  return h('nav', { class: 'rail', 'aria-label': 'Ecosystem' },
    h('div', { class: 'r-wrap' }, sw),
    h('div', { class: 'r-wrap' }, appSwitcher({ catalog, registry, launcherCurrent: false, currentApp })),
    h('span', { class: 'r-div', 'aria-hidden': 'true' }),
    h('div', { class: 'r-apps' }, ...keys.map((k) => { const a = usable.get(k); return h('a', { class: 'r-app', href: appHref(k), title: a.name, 'aria-label': a.name, 'data-app': k, ...(k === currentApp ? { 'aria-current': 'page' } : {}) }, plateOf(registry?.get(k) ?? { id: k }, 30)); })),
    h('span', { class: 'r-sp' }),
    search, h('span', { class: 'sr', id: 'search-why' }, 'Search is not available for client accounts.'),
    h('div', { class: 'r-wrap r-bell' }, bellEl),
    h('div', { class: 'r-wrap r-me' }, who));
}

/** Phone (≤760 px): the rail is hidden; the organization mark in the app bar opens this sheet with everything the rail holds. */
function accountSheet({ orgs, active, catalog = [], registry, notifications, app, theme, email, name, onSearch }) {
  const close = dialog({ title: 'Apps and account', wide: false, body: h('div', { class: 'acct-sheet' },
    h('a', { class: 'btn', href: '#/launcher', onclick: () => close() }, icon('home'), 'Launcher'),
    onSearch ? h('button', { type: 'button', class: 'btn', onclick: () => { close(); onSearch(); } }, icon('search'), 'Search everything') : null,
    notifications ? h('button', { type: 'button', class: 'btn', onclick: () => { close(); document.getElementById('bell')?.click(); } }, icon('bell'), 'Notifications') : null,   // the inbox drawer (the rail with the bell is hidden on phones)
    h('h3', { class: 'over' }, 'Your organizations'),
    ...orgs.map((o) => h('button', { type: 'button', class: 'btn opt-org', 'aria-pressed': String(o.org_id === active.org_id), onclick: () => { close(); if (o.org_id !== active.org_id) app.switchOrg(o.org_id); } }, orgMarkEl(o, 24), h('span', {}, o.name), h('small', {}, roleLabel(o.role)))),
    h('h3', { class: 'over' }, 'Apps'),
    h('div', { class: 'acct-apps' }, ...catalog.filter((a) => a.state === 'available').map((a) => h('a', { class: 'appitem', 'data-app': a.app_key, href: appHref(a.app_key), onclick: () => close() }, plateOf(registry?.get(a.app_key) ?? { id: a.app_key }, 34), a.name))),
    h('h3', { class: 'over' }, email || name || 'Account'),
    h('a', { class: 'btn', href: '#/profile', onclick: () => close() }, icon('user'), 'Your profile'),
    theme ? h('div', { class: 'seg-theme', role: 'group', 'aria-label': 'Appearance' }, ...['system', 'light', 'dark'].map((v) => h('button', { type: 'button', 'aria-pressed': String((theme.pref?.() ?? 'system') === v), onclick: () => { theme.set(v); close(); } }, { system: 'System', light: 'Light', dark: 'Dark' }[v]))) : null,
    h('button', { type: 'button', class: 'btn', onclick: () => { close(); app.signOut(); } }, 'Sign out')),
  actions: [{ label: 'Close', focus: true }] });
}

const SIDECOL = 'l2f.sidecol';
const sideCollapsed = () => { try { return localStorage.getItem(SIDECOL) === '1'; } catch { return false; } };

const sideLink = (it, current) => {
  const a = h('a', { href: it.href, 'data-key': it.key, ...(it.key === current && !it.kids ? { 'aria-current': 'page' } : {}), ...(it.kids && it.key === current ? { 'aria-expanded': 'true' } : {}) }, icon(it.icon), h('span', {}, it.label));
  if (!it.kids) return a;
  // an item with pages of its own (Office > Funnels) opens its sub-menu while it is the current section
  return h('div', { class: 'grp' }, a, it.key === current ? h('div', { class: 'sub' }, ...it.kids.map((k) => h('a', { href: k.href, ...(k.key === it.kid ? { 'aria-current': 'page' } : {}) }, icon(k.icon), h('span', {}, k.label)))) : null);
};

/** The bottom bar on phones: the first four pages, then More (a sheet) when there are more than five. */
function bottomBar(items, current, appName = '') {
  const main = items.length > 5 ? items.slice(0, 4) : items; const more = items.length > 5 ? items.slice(4) : [];
  return h('nav', { class: 'bbar', 'aria-label': 'Sections' },
    ...main.map((p) => h('a', { href: p.href, 'data-key': p.key, ...(p.key === current ? { 'aria-current': 'page' } : {}) }, h('span', { class: 'pillic' }, icon(p.icon)), p.short)),
    more.length ? h('button', { type: 'button', 'aria-haspopup': 'dialog', ...(more.some((p) => p.key === current) ? { 'aria-current': 'page' } : {}),
      onclick: () => {
        const close = dialog({ title: `More in ${appName}`, body: h('div', { class: 'bsheet' }, ...more.map((p) => h('a', { class: 'btn', href: p.href, onclick: () => close(), ...(p.key === current ? { 'aria-current': 'page' } : {}) }, icon(p.icon), p.label))), actions: [{ label: 'Close', focus: true }] });
      } }, h('span', { class: 'pillic' }, icon('more')), 'More') : null);
}

export function shellView({ onSearch = null, app, orgs, active, email, name, route, content, banner, isAdmin, inOffice, launcherCurrent, catalog, registry, currentApp, theme, me = null, notifications = null, timer = null }) {
  offs.forEach((f) => f()); offs = [];
  document.body.classList.remove('hasb');
  const sw = launcherCurrent ? switcher({ orgs, active, onPick: (id) => app.switchOrg(id) }) : null;
  const who = profile({ email, name, photo: me?.photo, onSignOut: () => app.signOut(), theme });
  const skip = h('a', { class: 'skip', href: '#main', onclick: (e) => { e.preventDefault(); const m = document.getElementById('main'); m.setAttribute('tabindex', '-1'); m.focus(); } }, 'Skip to content');      // not a hash link: the address is the route
  if (launcherCurrent) {
    // Design v4 section 8: the Launcher is the sky itself. Its top row carries the organization switcher and the profile; there is no header bar.
    content.querySelector('[data-slot=org]')?.replaceWith(sw); const whoSlot = content.querySelector('[data-slot=who]');
    if (whoSlot) {   // V8 Launcher header: search, bell, profile (light/dark lives in the profile menu and Profile › Appearance)
      const sbtn = onSearch ? h('button', { type: 'button', class: 'themebtn', id: 'launcher-search', 'aria-label': 'Search everything', title: 'Search everything (Ctrl K)', onclick: () => onSearch() }, icon('search')) : null;
      whoSlot.replaceWith(h('span', { class: 'l-right' }, sbtn, notifications ? bell(notifications, registry) : null, who));   // V8: search, bell, profile (light/dark lives in the profile menu and Profile › Appearance)
    } else whoSlot?.replaceWith(who);
    return h('div', { class: 'app in-launcher', 'data-org': active.slug ?? '' }, skip, content, banner ?? null);
  }
  const manifest = registry?.get(currentApp);
  const appName = manifest?.name ?? catalog.find((a) => a.app_key === currentApp)?.name ?? appLabel(currentApp);
  // A full-screen app (Projects) brings its own sidebar: the shell keeps only its header (with the app switcher in it),
  // and the app fills everything below, edge to edge. No second menu, no frame around the app.
  const full = Boolean(content.__fullApp);
  // V8 "focused layout" (Your profile): the rail and a title bar with Back, no app sidebar and no app menu
  const focused = !full ? content.__focused ?? null : null;
  const { items, current } = full || focused ? { items: [], current: null } : appNav(currentApp, route, { isAdmin });
  const here = items.find((i) => i.key === current);
  // V8: the organization switcher, app switcher, notifications and profile live in the rail (no profile footer in the sidebar: it looked clickable and wasn't)
  const swRail = switcher({ orgs, active, onPick: (id) => app.switchOrg(id), compact: true });
  const theRail = rail({ onSearch, sw: swRail, catalog, registry, currentApp, bellEl: notifications ? bell(notifications, registry) : h('span', { class: 'r-btn', role: 'img', 'aria-label': 'Notifications are not available yet', 'aria-disabled': 'true', title: 'Notifications are not available yet' }, icon('bell')), who });
  const side = h('aside', { class: 'side', 'aria-label': `${appName} menu` },
    h('div', { class: 'side-top' }, plateOf(manifest ?? { id: currentApp }, 30), h('b', {}, appName)),
    items.length ? h('nav', { class: 'nav', 'aria-label': appName }, ...items.filter((i) => !i.phoneOnly).map((i) => sideLink(i, current))) : null,
    content.__side ?? null);                 // an app may lift its own list (Projects: the project list) into the sidebar
  const crumb = h('div', { class: 'crumb', 'aria-label': 'You are here' });
  const paintCrumb = () => {
    // V4: the app's first page shows the app name alone ("Clients"); Office and deeper pages add the page ("Office / Home", "Drive / Trash")
    const extra = content.__crumbs ?? (here && items.length > 1 && (here !== items[0] || currentApp === 'office') ? [[here.label]] : []);
    crumb.replaceChildren(h('b', { style: 'white-space:nowrap' }, appName), ...extra.map(([label, href]) => h('span', {}, '/ ', href ? h('a', { href }, label) : label)));
  };
  paintCrumb();
  const onCrumbs = (e) => { if (e.detail.root === content) paintCrumb(); };
  document.addEventListener('l2f:crumbs', onCrumbs); offs.push(() => document.removeEventListener('l2f:crumbs', onCrumbs));
  // V8 app bar (52 px): phone organization mark (apps-and-account sheet), collapse sidebar, crumbs. Search, bell, organization and profile are in the rail.
  const shellEl = h('div', { class: full ? 'shell v8 is-full' : focused ? 'shell v8 focused' : `shell v8${sideCollapsed() ? ' sidecol' : ''}`, 'data-app': currentApp ?? '' });
  const collapse = full || focused ? null : h('button', { type: 'button', class: 'iconbtn hide-m sidetoggle', 'aria-label': 'Collapse sidebar', title: 'Collapse sidebar', 'aria-pressed': String(sideCollapsed()),
    onclick: (e) => { const on = !shellEl.classList.contains('sidecol'); shellEl.classList.toggle('sidecol', on); e.currentTarget.setAttribute('aria-pressed', String(on)); try { localStorage.setItem(SIDECOL, on ? '1' : '0'); } catch { /* private window: not remembered */ } } }, icon('layers'));
  const sheetBtn = h('button', { type: 'button', class: 'iconbtn only-m acct-btn', id: 'acct-sheet-btn', 'aria-haspopup': 'dialog', 'aria-label': `Apps and account (${active.name})`,
    onclick: () => accountSheet({ orgs, active, catalog, registry, notifications, app, theme, email, name, onSearch }) }, orgMarkEl(active, 26));
  // V8 focused top bar (prototype .fbar5, measured): 48 px, Back (mirrored chevron), Apps, 26 px photo, title 15 / 700 and a 12 px line
  const header = focused
    ? h('header', { class: 'hdr bar focusbar' }, sheetBtn, h('a', { class: 'iconbtn hdr-back', href: focused.back ?? '#/launcher', 'aria-label': 'Back', title: 'Back' }, icon('right')),
      appSwitcher({ catalog, registry, launcherCurrent: false, suffix: '-f', currentApp }),
      h('span', { class: 'focusbar-photo', 'aria-hidden': 'true' }, ...avatarBits(name || email, me?.photo)),
      h('div', { class: 'hdr-ttl' }, h('b', {}, focused.title), focused.sub ? h('small', {}, focused.sub) : null),
      h('div', { class: 'focusbar-acts' }, ...(focused.actions ?? [])))   // V8 focusBar `right`: Cancel · Save draft · Create …
    : h('header', { class: full ? 'hdr bar is-full' : 'hdr bar' }, sheetBtn, collapse,
      full ? h('span', { class: 'hdr-app' }, plateOf(manifest ?? { id: currentApp }, 26)) : null, crumb,
      h('span', { class: 'hdr-grow' }), timer ? timerPill(timer, currentApp) : null, content.__barRight ?? null);   // an app may add its own bar actions (Tasks: Add task)
  shellEl.append(theRail, ...(full || focused ? [] : [side]), h('div', { class: 'main' }, header, h('main', { class: full ? 'content flush wide is-full' : 'content', id: 'main', 'aria-busy': 'false' }, banner ?? null, content)));
  return h('div', { class: 'app', 'data-org': active.slug ?? '' }, skip, shellEl, items.length ? bottomBar(items, current, appName) : null);
}

/** V8 (04_TASKS §1): one running timer per person across Tasks and Projects, shown as a pill in the app bar (name, h:mm:ss, stop).
 *  Projects shows its own pill for its own timer, so there the shell only shows a Tasks timer. Re-reads on the 'l2f:timer' event. */
function timerPill(timer, currentApp) {
  const box = h('span', { class: 'tpill-box' }); let tick = null; let painted = false;
  const fmt = (s) => `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const paint = async () => {
    if (painted && !box.isConnected) { document.removeEventListener('l2f:timer', paint); return; } painted = true; const r = await timer.running().catch(() => null); clearInterval(tick);
    const t = r?.ok ? r.data?.[0] : null;
    if (!t || (currentApp === 'projects' && t.app === 'projects')) return box.replaceChildren();
    const clock = h('b', { class: 'mono' }); const since = new Date(t.started_at).getTime(); const upd = () => { clock.textContent = fmt(Math.max(0, Math.floor((Date.now() - since) / 1000))); }; upd(); tick = setInterval(() => (box.isConnected ? upd() : clearInterval(tick)), 1000);
    box.replaceChildren(h('span', { class: 'tpill' }, h('i', { class: 'rec', 'aria-hidden': 'true' }), h('a', { class: 'tp-n', href: t.href, title: t.title }, t.title), clock,
      h('button', { type: 'button', class: 'tp-stop', 'aria-label': `Stop the timer on ${t.title}`, onclick: async () => { await timer.stop(); document.dispatchEvent(new CustomEvent('l2f:timer')); } }, icon('pause'))));
  };
  document.addEventListener('l2f:timer', paint); paint();
  return box;
}

/** Moves the current-page mark of the app menu on screen (Planner routes its own pages, so the shell does not re-render). */
export function markAppNav(cur) {
  for (const a of document.querySelectorAll('.side .nav a[data-key], .bbar a[data-key]')) { if (a.dataset.key === cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
}
