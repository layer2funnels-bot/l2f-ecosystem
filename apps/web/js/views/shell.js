// The ecosystem shell (design 01 + 10 §C): colour bar, header (Launcher, organization switcher, search, notifications, profile),
// the app menu on top (tablet/desktop) and as a bottom bar (phone), and the content area.
import { h, icon, orgMark, orgColor, orgInk, roleLabel, initials, dialog } from '../ui.js';
import { OFFICE_PAGES, officeSection, hrefFor } from '../routes.js';
import { plateOf } from '../registry.js';

const SHORT = { Documents: 'Docs' };
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
  const sw = h('button', { type: 'button', class: 'sw', id: 'org-switcher', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': menuId, 'data-pending': 'false' },
    h('span', { class: 'mark', style: `background:${orgColor(active)};color:${orgInk(active)}` }, orgMark(active)),
    h('span', { class: 't' }, h('small', {}, 'Organization'), h('strong', {}, active.name)), icon('chev', 'chev'), h('span', { class: 'spin', 'aria-hidden': 'true' }));
  const menu = h('div', { class: 'menu', id: menuId, role: 'menu', 'aria-label': 'Switch organization', 'data-open': 'false' });
  const note = h('div', { id: 'org-note' });
  const close = (refocus) => { menu.dataset.open = 'false'; sw.setAttribute('aria-expanded', 'false'); if (refocus) sw.focus(); };
  const open = () => {
    menu.replaceChildren(h('div', { class: 'mh' }, 'Your organizations'), ...orgs.map((o) => {
      const cur = o.org_id === active.org_id;
      return h('button', { type: 'button', role: 'menuitemradio', class: 'opt', 'aria-checked': String(cur), tabindex: '-1', 'data-org': o.org_id, onclick: () => { close(false); if (!cur) onPick(o.org_id); else sw.focus(); } },
        h('span', { class: 'mk', style: `background:${orgColor(o)};color:${orgInk(o)}` }, orgMark(o)), h('span', { class: 'tx' }, h('strong', {}, o.name), h('small', {}, roleLabel(o.role))),
        cur ? h('span', { class: 'st' }, icon('check'), 'Current') : null);
    }), note, h('div', { class: 'mfoot' }, 'Switching keeps you on the same page where it exists. Nothing is copied between organizations.'));
    menu.dataset.open = 'true'; sw.setAttribute('aria-expanded', 'true');
    (menu.querySelector('[aria-checked=true]') ?? menu.querySelector('.opt'))?.focus();
  };
  sw.addEventListener('click', () => (menu.dataset.open === 'true' ? close(true) : open()));
  trap(menu, sw, close);
  onDocClick((e) => { if (menu.dataset.open === 'true' && !e.target.closest('.swwrap')) close(false); });
  return h('div', { class: 'swwrap' }, sw, menu);
}

/** Header grid button: "Back to Launcher" and every app this person may open here (Design v4 section 5). */
function appSwitcher({ catalog = [], registry, current, launcherCurrent }) {
  const btn = h('button', { type: 'button', class: 'iconbtn', id: 'app-switcher', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'apps-menu', 'aria-label': 'Open the app switcher' }, icon('grid'));
  const menu = h('div', { class: 'menu apps', id: 'apps-menu', role: 'menu', 'aria-label': 'Apps', 'data-open': 'false' });
  const close = (refocus) => { menu.dataset.open = 'false'; btn.setAttribute('aria-expanded', 'false'); if (refocus) btn.focus(); };
  const usable = catalog.filter((a) => a.state === 'available');
  btn.addEventListener('click', () => {
    if (menu.dataset.open === 'true') return close(true);
    menu.replaceChildren(
      h('a', { class: 'back', role: 'menuitem', href: '#/launcher', tabindex: '-1', onclick: () => close(false), ...(launcherCurrent ? { 'aria-current': 'page' } : {}) }, icon('arrow'), 'Back to Launcher'),
      usable.length ? h('div', { class: 'applist' }, ...usable.map((a) => h('a', { class: 'appitem', role: 'menuitem', tabindex: '-1', href: a.app_key === 'office' ? hrefFor.office() : hrefFor.app(a.app_key), 'data-app': a.app_key, onclick: () => close(false), ...(current === a.app_key ? { 'aria-current': 'page' } : {}) },
        plateOf(registry?.get(a.app_key) ?? { id: a.app_key }, 40), a.name))) : h('div', { class: 'mfoot' }, 'No other app is switched on for you here.'));
    menu.dataset.open = 'true'; btn.setAttribute('aria-expanded', 'true'); menu.querySelector('[role=menuitem]').focus();
  });
  trap(menu, btn, close);
  onDocClick((e) => { if (menu.dataset.open === 'true' && !e.target.closest('.apps-wrap')) close(false); });
  return h('div', { class: 'swwrap apps-wrap' }, btn, menu);
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

function profile({ email, name, onSignOut, theme, weather }) {
  const btn = h('button', { type: 'button', class: 'who', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'profile-menu', 'aria-label': `Your profile: ${name || email}` }, initials(name || email));
  const menu = h('div', { class: 'menu profile-menu', id: 'profile-menu', role: 'menu', 'aria-label': 'Your profile', 'data-open': 'false' });
  const close = (refocus) => { menu.dataset.open = 'false'; btn.setAttribute('aria-expanded', 'false'); if (refocus) btn.focus(); };
  btn.addEventListener('click', () => {
    if (menu.dataset.open === 'true') return close(true);
    const pref = theme?.pref?.() ?? 'system';
    const choose = (v) => h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(pref === v), tabindex: '-1', onclick: () => { theme.set(v); close(false); } }, { system: 'System', light: 'Light', dark: 'Dark' }[v]);
    menu.replaceChildren(...[h('div', { class: 'mh' }, 'Signed in as'), h('div', { class: 'mfoot', style: 'border:0;margin:0;color:var(--text);overflow-wrap:anywhere' }, email ?? ''),
      weather ? h('button', { type: 'button', role: 'menuitemcheckbox', class: 'opt opt-plain', 'aria-checked': String(weather.on()), tabindex: '-1', onclick: () => { close(false); weather.set(!weather.on()); } }, h('span', { class: 'tx' }, h('strong', {}, 'Weather on the Launcher'), h('small', {}, weather.on() ? 'On. Uses your location when you allow it.' : 'Off'))) : null,
      theme ? [h('div', { class: 'mh' }, 'Appearance'), h('div', { class: 'seg-theme', role: 'group', 'aria-label': 'Appearance' }, choose('system'), choose('light'), choose('dark'))] : null,
      h('button', { type: 'button', role: 'menuitem', class: 'opt opt-plain', tabindex: '-1', onclick: () => { close(false); onSignOut(); } }, h('span', { class: 'tx' }, h('strong', {}, 'Sign out')))].flat().filter(Boolean));
    menu.dataset.open = 'true'; btn.setAttribute('aria-expanded', 'true'); menu.querySelector('[role=menuitem]').focus();
  });
  trap(menu, btn, close);
  onDocClick((e) => { if (menu.dataset.open === 'true' && !e.target.closest('.profile-wrap')) close(false); });
  return h('div', { class: 'swwrap profile-wrap' }, btn, menu);
}

/** An app's own menu in the shell: a bar under the header (tablet/desktop) and a bottom bar (phone), the same for every app.
 *  `pages`: [{ key, label, icon, href }]; `cur`: the current key. The links carry data-key so the mark can move without a re-render. */
export function appNav(name, pages, cur) {
  const mark = (p) => ({ 'data-key': p.key, ...(p.key === cur ? { 'aria-current': 'page' } : {}) });
  const top = h('nav', { class: 'nav has-b', 'aria-label': `${name} sections` }, h('span', { class: 'appname' }, name),
    ...pages.map((p) => h('a', { href: p.href, ...mark(p) }, p.label)));
  const main = pages.length > 5 ? pages.slice(0, 4) : pages; const more = pages.length > 5 ? pages.slice(4) : [];
  const bottom = h('nav', { class: 'bnav', 'aria-label': `${name} sections` },
    ...main.map((p) => h('a', { href: p.href, ...mark(p) }, icon(p.icon), h('span', {}, SHORT[p.label] ?? p.label))),
    more.length ? h('button', { type: 'button', 'aria-haspopup': 'dialog', 'data-more': more.map((p) => p.key).join(' '), ...(more.some((p) => p.key === cur) ? { 'aria-current': 'page' } : {}),
      onclick: () => {
        const close = dialog({ title: `More in ${name}`, body: h('div', { class: 'sheet' }, ...more.map((p) => h('a', { class: 'btn', href: p.href, onclick: () => close(), ...(p.key === cur ? { 'aria-current': 'page' } : {}) }, icon(p.icon), p.label))), actions: [{ label: 'Close', focus: true }] });
      } }, icon('more'), h('span', {}, 'More')) : null);
  return { top, bottom };
}
/** Moves the current-page mark of the app menu on screen (an app that routes its own pages, like Planner, needs no shell re-render). */
export function markAppNav(cur) {
  for (const a of document.querySelectorAll('.nav a[data-key], .bnav a[data-key]')) { if (a.dataset.key === cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  for (const b of document.querySelectorAll('.bnav button[data-more]')) { if (b.dataset.more.split(' ').includes(cur)) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
}

export function officeNav(route, isAdmin) {
  return appNav('Office', OFFICE_PAGES.filter((p) => !p.adminOnly || isAdmin), officeSection(route));
}

export function shellView({ app, orgs, active, email, name, route, content, banner, isAdmin, inOffice, launcherCurrent, catalog, registry, currentApp, theme, weather, nav: appBar = null, notifications = null }) {
  offs.forEach((f) => f()); offs = [];
  const nav = appBar ?? (inOffice ? officeNav(route, isAdmin) : null);
  document.body.classList.toggle('hasb', Boolean(nav));
  return h('div', { class: 'app', 'data-org': active.slug ?? '' },
    h('a', { class: 'skip', href: '#main', onclick: (e) => { e.preventDefault(); const m = document.getElementById('main'); m.setAttribute('tabindex', '-1'); m.focus(); } }, 'Skip to content'),      // not a hash link: the address is the route
    h('div', { class: 'bar4' }),
    h('header', { class: 'hdr' },
      appSwitcher({ catalog, registry, current: currentApp, launcherCurrent }),
      switcher({ orgs, active, onPick: (id) => app.switchOrg(id) }),
      h('label', { class: 'search' }, icon('search'), h('span', { class: 'sr' }, 'Search this organization'),
        h('input', { type: 'search', placeholder: `Search ${active.name}`, disabled: true, 'aria-describedby': 'search-why', autocomplete: 'off' })),
      h('span', { class: 'sr', id: 'search-why' }, 'Search is not available yet. It arrives with the apps it searches.'),
      notifications ? bell(notifications) : h('span', { class: 'iconbtn hide-s', role: 'img', 'aria-label': 'Notifications are not available yet', 'aria-disabled': 'true', title: 'Notifications are not available yet' }, icon('bell')),
      profile({ email, name, onSignOut: () => app.signOut(), theme, weather })),
    nav?.top ?? null,
    h('main', { class: 'content', id: 'main', 'aria-busy': 'false' }, banner ?? null, content),
    nav?.bottom ?? null);
}
