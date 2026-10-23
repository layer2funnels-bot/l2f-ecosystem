// The app: boot, routing, organization context, sign-in flows and organization switching. Views are functions of this context.
import { h, put, announce, focusTitle } from './dom.js';
import { createSession, parseAuthHash } from './session.js';
import { createAuthClient } from './gotrue.js';
import { createApiClient, NO_ORG } from './api.js';
import { parseRoute, hrefFor, pageKeyFor, routeForPage, defaultOrg, AUTH_ROUTES, OFFICE_PAGES, FUNNEL_TYPES, appLabel } from './routes.js';
import { messageFor } from './messages.js';
import { dirty } from './dirty.js';
import { createTheme } from './theme.js';
import { loadRegistry } from './registry.js';
import { docView } from './modules/docs.js';
import { boardView } from './modules/whiteboard.js';
import { projectsView } from './modules/projects.js';
import { clientsView } from './modules/clients.js';
import { documentsView, teamView, appsView, projectsPointerView } from './views/office.js';
import { loadWeather, weatherOff, setWeatherOff } from './sky.js';
import { permissionSet, canWith, canAnywhereWith } from './perm.js';
import { switchOrganization } from '/packages/core/org-switch.mjs';
import { dialog, toast, btn, notice, skeleton, notFoundState, designBadge, icon } from './ui.js';
import * as authViews from './views/auth.js';
import { shellView } from './views/shell.js';
import { launcherView, appNotBuiltView } from './views/launcher.js';
import { officeHomeView } from './views/home.js';
import { adminView } from './views/admin.js';
import { funnelsHomeView, funnelListView, funnelRecordView } from './views/funnels.js';

const cfg = window.L2F_CONFIG;
const root = document.getElementById('app');
const store = (() => { try { localStorage.setItem('l2f.t', '1'); localStorage.removeItem('l2f.t'); return localStorage; } catch { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; } })();
const tabStore = (() => { try { sessionStorage.setItem('l2f.t', '1'); sessionStorage.removeItem('l2f.t'); return sessionStorage; } catch { return store; } })();
const session = createSession({ storage: store });
const auth = createAuthClient({ baseUrl: cfg.supabaseUrl, publishableKey: cfg.publishableKey, redirectTo: `${location.origin}/` });
const api = createApiClient({ session, auth, onExpired: () => { if (session.get()) goExpired(); } });

let ctx = null;           // { orgs, active, mine, clients, catalog }
let renderId = 0;
let banner = null;        // one message for the next render: { kind, icon, content, actions }
let ready = false;
let unavailable = null;   // { app, from } while an app isn't turned on in the organization we just switched to
let lastHash = location.hash;

const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };
const goExpired = () => {
  if (parseRoute(location.hash).name === 'expired') return;
  const r = parseRoute(location.hash);
  if (!AUTH_ROUTES.has(r.name)) tabStore.setItem('l2f.return', JSON.stringify({ hash: location.hash, label: returnLabel(r) }));
  go('#/expired');
};
const returnLabel = (r) => {
  const org = ctx?.active?.name; const page = OFFICE_PAGES.find((p) => p.key === ({ office: 'home', 'office-page': r.params.page, funnels: 'funnels', 'funnel-list': 'funnels', 'funnel-record': 'funnels', admin: 'admin' }[r.name]))?.label;
  return page && org ? `${page} in ${org}` : org ? `${org}` : null;
};

async function loadOrgContext(org) {
  api.setOrg(org.org_id);
  const [mine, cl, cat] = await Promise.all([api.call('access.mine', {}), api.call('clients.list', {}), api.call('launcher.catalog', {})]);
  ctx = {
    orgs: ctx?.orgs ?? [], active: org,
    mine: permissionSet(mine.ok ? mine.data : []),
    clients: new Map(cl.ok ? cl.data.map((c) => [c.id, c.name]) : []),
    catalog: cat.ok ? cat.data : [], catalogError: !cat.ok,
  };
}

// ---- boot: restore the session, load organizations, show a pending invitation
async function boot() {
  const fromLink = parseAuthHash(location.hash);
  if (fromLink) {
    history.replaceState(null, '', location.pathname + location.search);        // tokens never stay in the URL
    if (fromLink.access_token) session.set({ access_token: fromLink.access_token, refresh_token: fromLink.refresh_token, expires_in: fromLink.expires_in });
    if (fromLink.type === 'recovery') { ready = true; go('#/reset'); return; }
  }
  const r0 = parseRoute(location.hash);
  if (r0.name === 'invite' && r0.query.token) { tabStore.setItem('l2f.invite', r0.query.token); history.replaceState(null, '', `${location.pathname}#/invite`); }
  if (!session.signedIn()) { ctx = null; ready = true; render(); return; }
  if (session.expired() && !(await refreshNow())) { ready = true; goExpired(); return; }

  if (!tabStore.getItem('l2f.touched')) { tabStore.setItem('l2f.touched', '1'); api.call('profile.touch', { name: session.get()?.name ?? undefined }, { org: NO_ORG }); }          // name and email for the member list, once per tab; failure is harmless
  const list = await loadOrgs();
  if (list === 'expired') return;
  if (list === null) { ready = true; return render({ bootError: true }); }
  const pending = tabStore.getItem('l2f.invite');
  if (!list.length && !pending) { ctx = null; ready = true; go('#/no-org'); return; }
  ctx = { orgs: list };
  if (list.length) await loadOrgContext(list.find((o) => o.is_active) ?? defaultOrg(list));
  ready = true;
  const r = parseRoute(location.hash);
  if (pending) return go('#/invite');
  const back = tabStore.getItem('l2f.return'); tabStore.removeItem('l2f.return');
  if (back && AUTH_ROUTES.has(r.name)) { try { return go(JSON.parse(back).hash); } catch { /* fall through */ } }
  go(AUTH_ROUTES.has(r.name) || r.name === 'home' || r.name === 'no-org' ? hrefFor.launcher() : location.hash);
}
async function loadOrgs() {
  const res = await api.call('org.list', {}, { org: NO_ORG });
  if (!res.ok) { if (res.error?.code === 'session_expired') { ready = true; goExpired(); return 'expired'; } return null; }
  return res.data;
}
async function refreshNow() { const c = session.get(); if (!c?.refresh) return false; const r = await auth.refresh(c.refresh); if (r.ok && r.data?.access_token) { session.set(r.data); return true; } return false; }

// ---- account flows
const offlineOrBusy = (r) => (r.offline ? messageFor('offline') : r.status === 429 ? messageFor('rate_limited') : null);
const appApi = {
  go,
  googleReady: () => Boolean(cfg.googleEnabled),
  googleUrl: () => auth.googleUrl(),
  async signIn(email, password, { returnTo } = {}) {
    const r = await auth.signIn(email, password);
    const soft = offlineOrBusy(r); if (soft) return { title: soft, body: '' };
    if (!r.ok || !r.data?.access_token) return {};                                  // same words for an unknown email and a wrong password
    session.set(r.data);
    if (returnTo) tabStore.setItem('l2f.return', JSON.stringify({ hash: returnTo }));
    await boot(); return null;
  },
  async signUp(name, email, password) {
    const r = await auth.signUp(email, password, name);
    const soft = offlineOrBusy(r); if (soft) return soft;
    if (r.ok && r.data?.access_token) { session.set(r.data); await boot(); return null; }
    if (r.ok) { authViews.authState.email = email; authViews.authState.from = 'signup'; go('#/check-email'); return null; }
    return r.status === 422 && /password/i.test(JSON.stringify(r.data ?? '')) ? 'Choose a stronger password, with a few more characters.' : 'We couldn’t create that account. If you already have one, sign in instead.';
  },
  async resend(email, from) {
    const r = from === 'reset' ? await auth.recover(email) : await auth.resend(email);
    return r.ok ? null : 'failed';
  },
  async recover(email) {
    const r = await auth.recover(email); const soft = offlineOrBusy(r); if (soft) return soft;
    authViews.authState.email = email; authViews.authState.from = 'reset'; go('#/check-email'); return null;          // identical whether or not the account exists
  },
  async setNewPassword(password) {
    const c = session.get(); if (!c) return 'This reset link has expired. Ask for a new one.';
    const r = await auth.setPassword(c.access, password); const soft = offlineOrBusy(r); if (soft) return soft;
    return r.ok ? null : 'This reset link has expired. Ask for a new one.';
  },
  async continueAfterReset() { await boot(); },
  async signOut() { const c = session.get(); dirty.clear(); session.clear(); ctx = null; api.setOrg(null); tabStore.removeItem('l2f.return'); tabStore.removeItem('l2f.touched'); if (c?.access) auth.signOut(c.access); go('#/signin'); },
  useDifferentAccount() { session.clear(); ctx = null; go('#/signin'); },
  async recheck() { const list = await loadOrgs(); if (!Array.isArray(list) || !list.length) return false; ctx = { orgs: list }; await loadOrgContext(defaultOrg(list)); go(hrefFor.launcher()); return true; },
  async acceptInvitation(token) {
    const before = ctx?.orgs ?? [];
    const acc = await api.call('invitation.accept', { token }, { org: NO_ORG });
    if (!acc.ok) { tabStore.removeItem('l2f.invite'); return 'That invitation can’t be used. Ask for a new one.'; }
    tabStore.removeItem('l2f.invite');
    const list = await loadOrgs(); if (!Array.isArray(list)) return messageFor('failed');
    const known = new Set(before.map((o) => o.org_id));
    const joined = list.find((o) => !known.has(o.org_id)) ?? list[0];
    ctx = { orgs: list.map((o) => ({ ...o, is_active: o.org_id === joined.org_id })) };
    await loadOrgContext(ctx.orgs.find((o) => o.is_active));
    announce(`You joined ${joined.name}`); go(hrefFor.office()); toast(`You joined ${joined.name}.`); return null;
  },
  async declineInvitation(token) {
    const r = await api.call('invitation.decline', { token }, { org: NO_ORG }); tabStore.removeItem('l2f.invite');
    if (!r.ok) return messageFor(r.error?.code);
    go(ctx?.orgs?.length ? hrefFor.launcher() : '#/no-org'); return null;
  },
  dismissInvitation() { tabStore.removeItem('l2f.invite'); go(ctx?.orgs?.length ? hrefFor.launcher() : '#/no-org'); },
  switchOrg: (targetId) => switchFlow(targetId),
};

// ---- unsaved work: ask before leaving the page or switching organization (nothing is ever lost silently)
function askUnsaved(next) {
  dialog({ title: 'You have unsaved changes', body: h('p', {}, 'Save them before you leave, or they’ll be lost.'), role: 'alertdialog',
    actions: [{ label: 'Save and leave', cls: 'pri', keep: true, on: async (close) => { const ok = await dirty.get()?.save(); if (!ok) return false; close(); dirty.clear(); next(); } },
      { label: 'Discard and leave', on: () => { dirty.clear(); next(); } }, { label: 'Keep editing', focus: true }] });
}
const guard = (next) => (dirty.isDirty() ? askUnsaved(next) : next());

// ---- organization switching (design 01: six outcomes)
function switchFlow(targetId) {
  const target = ctx.orgs.find((o) => o.org_id === targetId);
  if (!target || target.org_id === ctx.active.org_id) return;
  const sw = () => root.querySelector('#org-switcher');
  if (dirty.isDirty()) {
    const e = dirty.get();
    dialog({ title: 'Save your changes before switching?', role: 'alertdialog',
      body: [h('p', {}, `You have unsaved changes in `, h('b', {}, e.label), `. They can’t come with you to ${target.name}.`), h('p', { class: 'fine', style: 'margin-top:var(--space-3)' }, `If saving fails, you stay in ${ctx.active.name} and your changes are kept.`)],
      actions: [{ label: 'Save and switch', cls: 'pri', keep: true, on: async (close) => { const ok = await e.save(); if (!ok) return false; close(); dirty.clear(); doSwitch(target); } },
        { label: 'Discard and switch', on: () => { dirty.clear(); doSwitch(target); } },
        { label: 'Stay here', on: () => { announce(`Staying in ${ctx.active.name}. Your changes are kept.`); sw()?.focus(); } }] });
    announce('You have unsaved changes. Choose Save and switch, Discard and switch, or Stay here.');
    return;
  }
  doSwitch(target);
}
async function doSwitch(target) {
  const route = parseRoute(location.hash); const from = ctx.active;
  const mine = pageKeyFor(route);
  renderId++;                                               // anything still in flight for the old organization is now stale
  const button = root.querySelector('#org-switcher');
  if (button) { button.dataset.pending = 'true'; button.disabled = true; }
  const main = root.querySelector('#main');
  if (main) { main.setAttribute('aria-busy', 'true'); put(main, skeleton(4)); }               // the old organization's data is gone from the screen before the new one shows
  announce(`Switching to ${target.name}. Clearing ${from.name} data.`);
  let res;
  try {
    res = await switchOrganization({
      rpc: async (_n, a) => { const r = await api.call('org.switch', { org: a.p_org, app: a.p_app, ...(a.p_page ? { page: a.p_page } : {}) }); if (!r.ok) throw new Error('switch failed'); return r.data; },
      cache: api.cache, targetOrg: target.org_id, current: mine,
    });
  } catch {
    banner = { kind: 'err', icon: 'cross', content: [h('b', {}, `Couldn’t switch to ${target.name}.`), ` The connection dropped before we could confirm your access. You’re still in ${from.name} and nothing was changed or lost.`], actions: [btn('Try again', () => switchFlow(target.org_id), 'pri'), btn('Dismiss', () => { banner = null; render(); })] };
    announce(`Could not switch to ${target.name}. You are still in ${from.name}.`);
    return render();
  }
  if (res.outcome === 'not_available') {                    // outcome 4: nothing changes
    banner = { kind: 'warn', icon: 'lock', content: [h('b', {}, `You’re not a member of ${target.name}.`), ` Membership is by invitation only. Ask a ${target.name} owner to invite you. You’re still in ${from.name}; nothing has changed.`] };
    announce(`You are not a member of ${target.name}. Nothing has changed.`);
    return render();
  }
  ctx.orgs = ctx.orgs.map((o) => ({ ...o, is_active: o.org_id === res.org }));
  await loadOrgContext(ctx.orgs.find((o) => o.org_id === res.org));
  unavailable = null;
  if (res.outcome === 'app_unavailable') {                  // outcome 3: stay put and explain
    unavailable = { app: appLabel(mine.app), from: from.name, fromId: from.org_id };
    announce(`You are now in ${res.orgName}. ${unavailable.app} is not turned on here.`);
    return render();
  }
  const dest = routeForPage(res.route.app, res.route.page);
  if (res.outcome === 'record_not_carried') {               // outcome 2
    const where = route.name === 'funnel-record' ? FUNNEL_TYPES.find((t) => t.key === route.params.type).full : 'the list';
    banner = { kind: 'info', icon: 'info', content: [h('b', {}, `That item belongs to ${from.name}, so it isn’t here.`), ` We’ve taken you to ${where} in ${res.orgName}.`], actions: [btn(`Switch back to ${from.name}`, () => switchFlow(from.org_id))] };
  } else if (res.outcome === 'page_unavailable') banner = { kind: 'warn', icon: 'lock', content: res.message };
  else toastLater = `Now in ${res.orgName} · ${pageLabel(parseRoute(dest))}`;                  // outcome 1
  announce(`Switched to ${res.orgName}. ${pageLabel(parseRoute(dest))}.`);
  if (location.hash === dest) render(); else location.hash = dest;
}
let toastLater = null;
const pageLabel = (r) => (r.name === 'launcher' ? 'Launcher' : OFFICE_PAGES.find((p) => p.key === ({ office: 'home', 'office-page': r.params.page, funnels: 'funnels', 'funnel-list': 'funnels', 'funnel-record': 'funnels', admin: 'admin' }[r.name]))?.label ?? 'Office');

// ---- rendering
const bannerEl = () => {
  if (!banner) return null; const b = banner; banner = null;
  return notice(b.kind, b.icon, b.content, b.actions ?? []);
};
const centered = (...c) => h('div', { class: 'authwrap' }, h('main', { class: 'auth', id: 'main' }, h('div', { class: 'card', style: 'padding:var(--space-6)' }, ...c)));

const theme = createTheme(); theme.apply();
async function render(opts = {}) {
  const id = ++renderId; const live = () => id === renderId;
  const route = parseRoute(location.hash);
  document.body.classList.remove('hasb');
  theme.setOrg(null);
  if (!ready) { put(root, centered(skeleton(3))); return; }
  if (opts.bootError) { put(root, centered(h('h1', { 'data-page-title': true }, 'We couldn’t load this'), h('p', { class: 'sub' }, 'Your work is safe. Check your connection and try again.'), btn('Try again', () => boot(), 'pri'))); return focusTitle(root); }

  // signed-out and account screens
  if (!session.signedIn()) {
    const inv = tabStore.getItem('l2f.invite');
    const views = { signup: () => authViews.signUpView({ app: appApi, invite: inv }), forgot: () => authViews.forgotView({ app: appApi }), 'check-email': () => authViews.checkEmailView({ app: appApi }),
      expired: () => authViews.expiredView({ app: appApi, returnTo: null, email: null }), invite: () => authViews.signInView({ app: appApi, invite: true }), reset: () => authViews.signInView({ app: appApi, invite: inv }) };
    const v = views[route.name] ?? (() => authViews.signInView({ app: appApi, invite: inv }));
    if (!views[route.name] && route.name !== 'signin') { location.hash = '#/signin'; return; }
    put(root, v()); document.title = 'Sign in · Layer2Funnels + Aurj'; return focusTitle(root);
  }
  if (route.name === 'expired') {
    let back = null; try { back = JSON.parse(tabStore.getItem('l2f.return') || 'null'); } catch { /* none */ }
    put(root, authViews.expiredView({ app: appApi, returnTo: back, email: session.get()?.email })); return focusTitle(root);
  }
  if (route.name === 'reset') { put(root, authViews.resetView({ app: appApi })); return focusTitle(root); }
  if (opts.inviteFailed) { put(root, authViews.inviteFailedView(appApi)); return focusTitle(root); }
  if (route.name === 'invite') {
    const token = tabStore.getItem('l2f.invite');
    put(root, centered(skeleton(3)));
    const p = token ? await api.call('invitation.preview', { token }, { org: NO_ORG }) : null;
    if (!live()) return;
    put(root, authViews.inviteView({ app: appApi, token, preview: p?.ok ? p.data[0] : null, email: session.get()?.email })); return focusTitle(root);
  }
  if (route.name === 'no-org' || !ctx?.active) { put(root, authViews.noOrgView(appApi, session.get()?.email)); return focusTitle(root); }

  // inside the ecosystem
  const org = ctx.active;
  theme.setOrg(org);
  const role = org.role; const isAdmin = role === 'owner' || role === 'admin';
  const c = {
    api, orgName: org.name, clients: ctx.clients, live, announce, go, guard, rerender: () => render(),
    can: (p, clientId) => canWith(ctx.mine, p, clientId), canAnywhere: (p) => canAnywhereWith(ctx.mine, p),
    clientsWhere: (p) => [...ctx.clients].filter(([cid]) => canWith(ctx.mine, p, cid)),
  };
  const inOffice = ['office', 'office-page', 'funnels', 'funnel-list', 'funnel-record', 'admin'].includes(route.name);
  let content;
  if (unavailable && route.name !== 'launcher') {
    const u = unavailable;
    content = h('div', { class: 'unavail' }, h('div', { class: 'ic' }, icon('warn')), h('h2', { 'data-page-title': true }, `${u.app} isn’t turned on for ${org.name}`),
      h('p', {}, `You’re now in ${org.name}. ${u.app} is only set up for ${u.from}, so there’s nothing to show here. Nothing from ${u.from} is on this screen.`),
      h('div', { class: 'acts' }, btn(`Go to ${org.name} Office Home`, () => { unavailable = null; go(hrefFor.office()); }, 'pri'), btn(`Switch back to ${u.from}`, () => { unavailable = null; switchFlow(u.fromId); })),
      h('p', { style: 'margin:var(--space-4) 0 0;font-size:14px' }, `Need it here? `, btn(`Ask an ${org.name} admin`, () => toast('Message only for now. No request was sent.', false), 'link'), ' · ', h('a', { class: 'btn link', href: hrefFor.launcher(), onclick: () => { unavailable = null; } }, 'Browse all apps')));
  } else {
    switch (route.name) {
      case 'home': case 'launcher': case 'signin': case 'signup': case 'check-email': case 'forgot': case 'invite':
        content = launcherView({ catalog: ctx.catalog, error: ctx.catalogError, org, orgs: ctx.orgs, role, name: session.get()?.name, registry: await loadRegistry(), loadWeather: () => loadWeather({ api, store: localStorage }), onSwitch: (i) => switchFlow(i), retry: async () => { await loadOrgContext(org); render(); } }); break;
      case 'office': content = officeHomeView({ org, role, isAdmin, api, live, portalState: ctx.catalog.find((a) => a.app_key === 'portal')?.state }); break;
      case 'office-page': {
        const pg = route.params.page;
        if (pg === 'documents') content = documentsView({ api, ctx: c });
        else if (pg === 'team') content = teamView({ api, ctx: c });
        else if (pg === 'apps') content = appsView({ catalog: ctx.catalog, registry: await loadRegistry(), org, orgs: ctx.orgs });
        else if (pg === 'projects') content = projectsPointerView(org);
        else content = appNotBuiltView(OFFICE_PAGES.find((p) => p.key === pg)?.label ?? 'This page');
        break;
      }
      case 'funnels': content = funnelsHomeView(c); break;
      case 'funnel-list': content = funnelListView(c, route.params.type); break;
      case 'funnel-record': content = funnelRecordView(c, route.params.type, route.params.id); break;
      case 'doc': content = docView({ api, id: route.params.id, ctx: c }); break;
      case 'clients': content = clientsView({ api, ctx: c, route: { view: route.params.view, id: route.params.id, query: route.query } }); break;
      case 'projects': content = projectsView({ api, ctx: c, route: { view: route.params.view, id: route.params.id, query: route.query } }); break;
      case 'board': content = boardView({ api, id: route.params.id, ctx: c }); break;
      case 'admin': content = adminView({ api, live, org, role, route, rerender: () => render(), go, clients: ctx.clients }); break;
      case 'app': content = appNotBuiltView(ctx.catalog.find((a) => a.app_key === route.params.app)?.name ?? appLabel(route.params.app)); break;
      default: content = notFoundState(hrefFor.office());
    }
  }
  const view = shellView({ app: appApi, orgs: ctx.orgs, active: org, email: session.get()?.email, name: session.get()?.name, route, content, banner: bannerEl(), isAdmin, inOffice, launcherCurrent: route.name === 'launcher' || route.name === 'home',
    catalog: ctx.catalog, registry: await loadRegistry(), currentApp: inOffice ? 'office' : route.name === 'doc' ? 'drive' : route.name === 'board' ? 'whiteboard' : route.name === 'projects' ? 'projects' : route.name === 'clients' ? 'clients' : route.name === 'app' ? route.params.app : null, theme,
    weather: { on: () => !weatherOff(localStorage), set: (on) => { setWeatherOff(localStorage, !on); try { sessionStorage.removeItem('l2f.wx'); } catch { /* none */ } render(); } } });
  put(root, view, designBadge('Built to design'));
  document.title = `${pageLabel(route)} · ${org.name}`;
  if (toastLater) { toast(toastLater); toastLater = null; }
  focusTitle(root);
}

window.addEventListener('hashchange', () => {
  if (dirty.isDirty() && location.hash !== lastHash) {            // leaving a page with unsaved changes: put the address back and ask
    const target = location.hash; history.replaceState(null, '', lastHash || '#/');
    return askUnsaved(() => go(target));
  }
  lastHash = location.hash; render();
});
window.addEventListener('beforeunload', (e) => { if (dirty.isDirty()) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('offline', () => announce('You are offline. Changes will not be saved.'));
document.addEventListener('keydown', (e) => {                      // "/" focuses search where search exists
  if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName ?? '')) { const s = document.querySelector('.search input:not(:disabled)'); if (s) { e.preventDefault(); s.focus(); } }
});
render();
boot();
