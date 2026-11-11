// The ecosystem shell (design 01 + 10 §C): colour bar, header (Launcher, organization switcher, search, notifications, profile),
// the app menu on top (tablet/desktop) and as a bottom bar (phone), and the content area.
import { h, icon, orgMarkEl, roleLabel, initials, dialog } from '../ui.js';
import { hrefFor, appLabel } from '../routes.js';
import { plateOf } from '../registry.js';
import { appNav } from '../appnav.js';

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

function switcher({ orgs, active, onPick }) {
  const menuId = 'org-menu';
  const sw = h('button', { type: 'button', class: 'orgbtn orgsw', id: 'org-switcher', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': menuId, 'data-pending': 'false' },
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
  onDocClick((e) => { if (menu.dataset.open === 'true' && !e.target.closest('.swwrap')) close(false); });
  return h('div', { class: 'orgwrap swwrap' }, sw, menu);
}

/** The grid button: "Back to Launcher" and every app this person may open here (Design v4 section 5). `suffix` keeps ids unique when the phone header repeats it. */
function appSwitcher({ catalog = [], registry, launcherCurrent, suffix = '' }) {
  const btn = h('button', { type: 'button', class: 'launch-btn', id: `app-switcher${suffix}`, 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': `apps-menu${suffix}`, 'aria-label': 'Open the app switcher' }, icon('grid'));
  const menu = h('div', { class: 'menu appmenu apps', id: `apps-menu${suffix}`, role: 'menu', 'aria-label': 'Apps', 'data-open': 'false' });
  const close = (refocus) => { menu.dataset.open = 'false'; btn.setAttribute('aria-expanded', 'false'); if (refocus) btn.focus(); };
  const usable = catalog.filter((a) => a.state === 'available');
  btn.addEventListener('click', () => {
    if (menu.dataset.open === 'true') return close(true);
    menu.replaceChildren(
      h('a', { class: 'home back', role: 'menuitem', href: '#/launcher', tabindex: '-1', onclick: () => close(false), ...(launcherCurrent ? { 'aria-current': 'page' } : {}) }, h('span', { class: 'mini' }, icon('home')), 'Back to Launcher'),
      usable.length ? h('div', { class: 'grid applist' }, ...usable.map((a) => h('a', { class: 'appitem', 'data-app': a.app_key, role: 'menuitem', tabindex: '-1', href: a.app_key === 'office' ? hrefFor.office() : hrefFor.app(a.app_key), onclick: () => close(false) },
        plateOf(registry?.get(a.app_key) ?? { id: a.app_key }, 40), a.name))) : h('div', { class: 'mfoot' }, 'No other app is switched on for you here.'));
    menu.dataset.open = 'true'; btn.setAttribute('aria-expanded', 'true'); menu.querySelector('[role=menuitem]').focus();
  });
  trap(menu, btn, close);
  onDocClick((e) => { if (menu.dataset.open === 'true' && !e.target.closest(`.apps-wrap${suffix}`)) close(false); });
  return h('div', { class: `appsw swwrap apps-wrap apps-wrap${suffix}` }, btn, menu);
}

/** The header bell (migration 0034): what needs you in this organization. notifications: { count() -> n|null, list() -> rows|null, read(ids|'all'), href(row) }. */
const KIND = { assigned: 'assigned you', mentioned: 'mentioned you on', commented: 'commented on', completed: 'completed' };
const noteText = (r) => (r.kind === 'unblocked' ? `“${r.title}” can start: ${r.actor_name} finished what it was waiting on` : `${r.actor_name} ${KIND[r.kind] ?? 'updated'} “${r.title}”`);
function bell(notifications) {
  const badge = h('span', { class: 'badge', hidden: true, 'aria-hidden': 'true' });
  const b = h('button', { type: 'button', class: 'iconbtn', id: 'bell', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': 'bell-menu', 'aria-label': 'Notifications' }, icon('bell'), badge);
  const menu = h('div', { class: 'menu bell-menu', id: 'bell-menu', role: 'region', 'aria-label': 'Notifications', 'data-open': 'false' });
  const paintCount = (n) => { badge.hidden = !n; badge.textContent = n > 99 ? '99+' : String(n ?? ''); b.setAttribute('aria-label', n ? `Notifications, ${n} unread` : 'Notifications'); };
  const close = (refocus) => { menu.dataset.open = 'false'; b.setAttribute('aria-expanded', 'false'); if (refocus) b.focus(); };
  notifications.count().then(paintCount);
  b.addEventListener('click', async () => {
    if (menu.dataset.open === 'true') return close(true);
    menu.replaceChildren(h('div', { class: 'mh' }, 'Notifications'), h('p', { class: 'mfoot' }, 'Loading…'));
    menu.dataset.open = 'true'; b.setAttribute('aria-expanded', 'true');
    const rows = await notifications.list();
    const unread = (rows ?? []).filter((r) => !r.read_at).map((r) => r.id);
    const item = (r) => h('a', { class: `opt bell-item${r.read_at ? '' : ' unread'}`, href: notifications.href(r), tabindex: '0', onclick: () => { close(false); if (!r.read_at) notifications.read([r.id]).then(() => notifications.count(true).then(paintCount)); } },
      h('span', { class: 'tx' }, h('strong', {}, noteText(r)), h('small', {}, `${r.project_name} · ${new Date(r.created_at).toLocaleString()}`)));
    menu.replaceChildren(h('div', { class: 'mh bell-head' }, 'Notifications', unread.length ? h('button', { type: 'button', class: 'btn link', onclick: async () => { await notifications.read('all'); paintCount(0); menu.querySelectorAll('.unread').forEach((x) => x.classList.remove('unread')); } }, 'Mark all read') : null),
      ...(rows == null ? [h('p', { class: 'mfoot' }, 'Notifications couldn’t be loaded.')] : rows.length ? rows.map(item) : [h('p', { class: 'mfoot' }, 'You’re all caught up.')]));
    (menu.querySelector('a.opt') ?? menu).focus?.();
  });
  menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(true); } });
  onDocClick((e) => { if (menu.dataset.open === 'true' && !e.target.closest('.bell-wrap')) close(false); });
  return h('div', { class: 'swwrap bell-wrap' }, b, menu);
}

const avatarBits = (text, photo) => (photo ? [h('img', { src: photo, alt: '' })] : [initials(text)]);
/** Updates the header avatar in place after a photo or name change (no re-render of the page the person is on). */
export function setHeaderAvatar(me) { for (const b of document.querySelectorAll('.profile-wrap .who')) b.replaceChildren(...avatarBits(me?.name || b.getAttribute('aria-label') || '?', me?.photo)); }
function profile({ email, name, photo, onSignOut, theme, weather }) {
  const btn = h('button', { type: 'button', class: 'who avatar', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'profile-menu', 'aria-label': `Your profile: ${name || email}` }, ...avatarBits(name || email, photo));
  const menu = h('div', { class: 'menu profile-menu', id: 'profile-menu', role: 'menu', 'aria-label': 'Your profile', 'data-open': 'false' });
  const close = (refocus) => { menu.dataset.open = 'false'; btn.setAttribute('aria-expanded', 'false'); if (refocus) btn.focus(); };
  btn.addEventListener('click', () => {
    if (menu.dataset.open === 'true') return close(true);
    const pref = theme?.pref?.() ?? 'system';
    const choose = (v) => h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(pref === v), tabindex: '-1', onclick: () => { theme.set(v); close(false); } }, { system: 'System', light: 'Light', dark: 'Dark' }[v]);
    menu.replaceChildren(...[h('a', { class: 'opt opt-plain', role: 'menuitem', href: '#/profile', tabindex: '-1', onclick: () => close(false) }, h('span', { class: 'tx' }, h('strong', {}, 'Your profile'), h('small', {}, 'Name, photo, email, password'))), h('div', { class: 'mh' }, 'Signed in as'), h('div', { class: 'mfoot', style: 'border:0;margin:0;color:var(--text);overflow-wrap:anywhere' }, email ?? ''),
      weather ? h('button', { type: 'button', role: 'menuitemcheckbox', class: 'opt opt-plain', 'aria-checked': String(weather.on()), tabindex: '-1', onclick: () => { close(false); weather.set(!weather.on()); } }, h('span', { class: 'tx' }, h('strong', {}, 'Weather on the Launcher'), h('small', {}, weather.on() ? 'On. Uses your location when you allow it.' : 'Off'))) : null,
      theme ? [h('div', { class: 'mh' }, 'Appearance'), h('div', { class: 'seg-theme', role: 'group', 'aria-label': 'Appearance' }, choose('system'), choose('light'), choose('dark'))] : null,
      h('button', { type: 'button', role: 'menuitem', class: 'opt opt-plain', tabindex: '-1', onclick: () => { close(false); onSignOut(); } }, h('span', { class: 'tx' }, h('strong', {}, 'Sign out')))].flat().filter(Boolean));
    menu.dataset.open = 'true'; btn.setAttribute('aria-expanded', 'true'); menu.querySelector('[role=menuitem]').focus();
  });
  trap(menu, btn, close);
  onDocClick((e) => { if (menu.dataset.open === 'true' && !e.target.closest('.profile-wrap')) close(false); });
  return h('div', { class: 'swwrap profile-wrap' }, btn, menu);
}

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

export function shellView({ app, orgs, active, email, name, route, content, banner, isAdmin, inOffice, launcherCurrent, catalog, registry, currentApp, theme, weather, me = null, notifications = null }) {
  offs.forEach((f) => f()); offs = [];
  document.body.classList.remove('hasb');
  const sw = switcher({ orgs, active, onPick: (id) => app.switchOrg(id) });
  const who = profile({ email, name, photo: me?.photo, onSignOut: () => app.signOut(), theme, weather });
  const skip = h('a', { class: 'skip', href: '#main', onclick: (e) => { e.preventDefault(); const m = document.getElementById('main'); m.setAttribute('tabindex', '-1'); m.focus(); } }, 'Skip to content');      // not a hash link: the address is the route
  if (launcherCurrent) {
    // Design v4 section 8: the Launcher is the sky itself. Its top row carries the organization switcher and the profile; there is no header bar.
    content.querySelector('[data-slot=org]')?.replaceWith(sw); const whoSlot = content.querySelector('[data-slot=who]');
    if (whoSlot && theme) {   // the Launcher header has a quick light/dark switch (Design v4); everywhere else it lives in the profile menu
      const dark = () => document.documentElement.dataset.theme === 'dark';
      const tb = h('button', { type: 'button', class: 'themebtn', 'aria-label': dark() ? 'Switch to light theme' : 'Switch to dark theme', onclick: () => { theme.set(dark() ? 'light' : 'dark'); paint(); } });
      const paint = () => { tb.replaceChildren(icon(dark() ? 'sun' : 'moon')); tb.setAttribute('aria-label', dark() ? 'Switch to light theme' : 'Switch to dark theme'); }; paint();
      whoSlot.replaceWith(h('span', { class: 'l-right' }, tb, who));
    } else whoSlot?.replaceWith(who);
    return h('div', { class: 'app in-launcher', 'data-org': active.slug ?? '' }, skip, content, banner ?? null);
  }
  const manifest = registry?.get(currentApp);
  const appName = manifest?.name ?? catalog.find((a) => a.app_key === currentApp)?.name ?? appLabel(currentApp);
  // A full-screen app (Projects) brings its own sidebar: the shell keeps only its header (with the app switcher in it),
  // and the app fills everything below, edge to edge. No second menu, no frame around the app.
  const full = Boolean(content.__fullApp);
  const { items, current } = full ? { items: [], current: null } : appNav(currentApp, route, { isAdmin });
  const here = items.find((i) => i.key === current);
  const search = h('label', { class: 'search' }, icon('search'), h('span', { class: 'sr' }, 'Search this organization'),
    h('input', { type: 'search', placeholder: `Search ${active.name}`, disabled: true, 'aria-describedby': 'search-why', autocomplete: 'off' }));
  const side = h('aside', { class: 'side' },
    h('div', { class: 'side-top' }, appSwitcher({ catalog, registry, launcherCurrent: false }), plateOf(manifest ?? { id: currentApp }, 34), h('b', {}, appName)),
    items.length ? h('nav', { class: 'nav', 'aria-label': appName }, ...items.map((i) => sideLink(i, current))) : null,
    content.__side ?? null,                  // an app may lift its own list (Projects: the project list) into the rail
    h('div', { class: 'side-foot' }, h('span', { class: 'avatar', 'aria-hidden': 'true' }, initials(name || email)), h('div', {}, h('b', {}, name || email || ''), h('small', {}, `${roleLabel(active.role)} · ${active.name}`))));
  const crumb = h('div', { class: 'crumb', 'aria-label': 'You are here' });
  const paintCrumb = () => {
    // V4: the app's first page shows the app name alone ("Clients"); Office and deeper pages add the page ("Office / Home", "Drive / Trash")
    const extra = content.__crumbs ?? (here && items.length > 1 && (here !== items[0] || currentApp === 'office') ? [[here.label]] : []);
    crumb.replaceChildren(h('b', { style: 'white-space:nowrap' }, appName), ...extra.map(([label, href]) => h('span', {}, '/ ', href ? h('a', { href }, label) : label)));
  };
  paintCrumb();
  const onCrumbs = (e) => { if (e.detail.root === content) paintCrumb(); };
  document.addEventListener('l2f:crumbs', onCrumbs); offs.push(() => document.removeEventListener('l2f:crumbs', onCrumbs));
  const header = h('header', { class: full ? 'hdr is-full' : 'hdr' },
    full ? h('span', { class: 'hdr-app' }, appSwitcher({ catalog, registry, launcherCurrent: false, suffix: '-f' }), plateOf(manifest ?? { id: currentApp }, 30))
      : h('span', { class: 'only-m' }, appSwitcher({ catalog, registry, launcherCurrent: false, suffix: '-m' })),
    crumb,
    search, h('span', { class: 'sr', id: 'search-why' }, 'Search is not available yet. It arrives with the apps it searches.'),
    notifications ? bell(notifications) : h('span', { class: 'iconbtn hide-s', role: 'img', 'aria-label': 'Notifications are not available yet', 'aria-disabled': 'true', title: 'Notifications are not available yet' }, icon('bell')),
    sw, who);
  return h('div', { class: 'app', 'data-org': active.slug ?? '' }, skip,
    full ? h('div', { class: 'shell is-full' }, h('div', { class: 'main' }, header, h('main', { class: 'content flush wide is-full', id: 'main', 'aria-busy': 'false' }, banner ?? null, content)))
      : h('div', { class: 'shell' }, side, h('div', { class: 'main' }, header, h('main', { class: 'content', id: 'main', 'aria-busy': 'false' }, banner ?? null, content))),
    items.length ? bottomBar(items, current, appName) : null);
}

/** Moves the current-page mark of the app menu on screen (Planner routes its own pages, so the shell does not re-render). */
export function markAppNav(cur) {
  for (const a of document.querySelectorAll('.side .nav a[data-key], .bbar a[data-key]')) { if (a.dataset.key === cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
}
