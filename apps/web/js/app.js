// The app: boot, routing, organization context, sign-in flows. Views are pure functions of this context.
import { h, clear, announce, focusTitle } from './dom.js';
import { createSession, parseAuthHash } from './session.js';
import { createAuthClient, MIN_PASSWORD } from './gotrue.js';
import { createApiClient, NO_ORG } from './api.js';
import { parseRoute, hrefFor, pageKeyFor, routeForPage, defaultOrg, AUTH_ROUTES } from './routes.js';
import { messageFor } from './messages.js';
import { switchOrganization } from '/packages/core/org-switch.mjs';
import * as authViews from './views/auth.js';
import { shellView } from './views/shell.js';
import { launcherView, appPlaceholderView, officeHomeView } from './views/launcher.js';
import { funnelsHomeView, funnelListView, funnelRecordView } from './views/funnels.js';
import { notFoundState, skeleton, button, pageTitle, needsDesign } from './views/common.js';

const cfg = window.L2F_CONFIG;
const root = document.getElementById('app');
const store = (() => { try { localStorage.setItem('l2f.t', '1'); localStorage.removeItem('l2f.t'); return localStorage; } catch { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; } })();
const tabStore = (() => { try { return sessionStorage; } catch { return store; } })();
const session = createSession({ storage: store });
const auth = createAuthClient({ baseUrl: cfg.supabaseUrl, publishableKey: cfg.publishableKey, redirectTo: `${location.origin}/` });
const api = createApiClient({ session, auth, onExpired: () => { if (session.signedIn() || session.get()) goExpired(); } });

let ctx = null;           // { orgs, active, perms, clients, apps }
let renderId = 0;
let notice = null;
let ready = false;

const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };
const goExpired = () => { if (parseRoute(location.hash).name !== 'expired') go('#/expired'); };

async function loadOrgContext(org) {
  api.setOrg(org.org_id);
  const [eff, cl, apps] = await Promise.all([api.call('access.effective', {}), api.call('clients.list', {}), api.call('launcher.list', {})]);
  ctx = {
    orgs: ctx?.orgs ?? [], active: org,
    perms: new Set(eff.ok ? eff.data.filter((p) => p.allowed).map((p) => p.permission_key) : []),
    clients: new Map(cl.ok ? cl.data.map((c) => [c.id, c.name]) : []),
    apps: apps.ok ? apps.data : [], appsError: apps.ok ? null : apps.error?.code,
  };
}

// ---- boot: restore the session, accept a pending invitation, load organizations
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

  const before = await api.call('org.list', {}, { org: NO_ORG });
  if (!before.ok) { ready = true; if (before.error?.code === 'session_expired') return goExpired(); return render({ bootError: before.error?.code }); }
  const pending = tabStore.getItem('l2f.invite');
  let list = before.data;
  if (pending) {
    const acc = await api.call('invitation.accept', { token: pending }, { org: NO_ORG });
    tabStore.removeItem('l2f.invite');
    if (!acc.ok) { ready = true; return render({ inviteFailed: true }); }
    const after = await api.call('org.list', {}, { org: NO_ORG });
    const known = new Set(before.data.map((o) => o.org_id));
    list = after.ok ? after.data : list;
    const joined = list.find((o) => !known.has(o.org_id));
    if (joined) list = list.map((o) => ({ ...o, is_active: o.org_id === joined.org_id }));
  }
  if (!list.length) { ctx = null; ready = true; go('#/no-org'); return; }
  ctx = { orgs: list };
  await loadOrgContext(list.find((o) => o.is_active) ?? defaultOrg(list));
  ready = true;
  const r = parseRoute(location.hash);
  go(AUTH_ROUTES.has(r.name) || r.name === 'home' || r.name === 'no-org' ? hrefFor.launcher() : location.hash);
}
async function refreshNow() { const c = session.get(); if (!c?.refresh) return false; const r = await auth.refresh(c.refresh); if (r.ok && r.data?.access_token) { session.set(r.data); return true; } return false; }

// ---- account flows (return a plain-words error string, or null on success)
const authError = (r) => (r.offline ? messageFor('offline') : r.status === 429 ? messageFor('rate_limited') : null);
const appApi = {
  googleUrl: () => auth.googleUrl(),
  async signIn(email, password) {
    const r = await auth.signIn(email, password);
    if (authError(r)) return authError(r);
    if (!r.ok || !r.data?.access_token) return 'Email or password is not right.';   // same words for unknown email and wrong password
    session.set(r.data); await boot(); return null;
  },
  async signUp(email, password) {
    const r = await auth.signUp(email, password);
    if (authError(r)) return authError(r);
    if (r.ok && r.data?.access_token) { session.set(r.data); await boot(); return null; }
    if (r.ok) { go('#/check-email'); return null; }
    return r.status === 422 && /password/i.test(JSON.stringify(r.data ?? '')) ? `Choose a stronger password (at least ${MIN_PASSWORD} characters).` : 'We could not create that account. If you already have one, sign in instead.';
  },
  async recover(email) { const r = await auth.recover(email); if (authError(r)) return authError(r); root.replaceChildren(authViews.resetSentView()); focusTitle(root); return null; },
  async setNewPassword(password) {
    const c = session.get(); if (!c) return 'This reset link has expired. Ask for a new one.';
    const r = await auth.setPassword(c.access, password);
    if (authError(r)) return authError(r);
    if (!r.ok) return 'This reset link has expired. Ask for a new one.';
    await boot(); return null;
  },
  async signOut() { const c = session.get(); session.clear(); ctx = null; api.setOrg(null); if (c?.access) auth.signOut(c.access); go('#/signin'); },
  clearSessionQuietly() { session.clear(); ctx = null; },
  boot,
  async switchOrg(targetId) {
    const target = ctx.orgs.find((o) => o.org_id === targetId); if (!target || target.org_id === ctx.active.org_id) return;
    const route = parseRoute(location.hash);
    renderId++;                                   // anything still in flight for the old organization is now stale
    root.replaceChildren(shellView({ app: appApi, orgs: ctx.orgs, activeOrg: ctx.active, email: session.get()?.email, route, content: h('div', { 'aria-busy': 'true' }, h('p', { class: 'switching', role: 'status' }, `Switching to ${target.name}…`), skeleton(3)) }));
    announce(`Switching to ${target.name}`);
    let res;
    try {
      res = await switchOrganization({
        rpc: async (_n, a) => { const r = await api.call('org.switch', { org: a.p_org, app: a.p_app, ...(a.p_page ? { page: a.p_page } : {}) }); if (!r.ok) throw new Error('switch failed'); return r.data; },
        cache: api.cache, targetOrg: targetId, current: pageKeyFor(route),
      });
    } catch { notice = { kind: 'error', text: 'The switch did not go through, so nothing changed. Try again.', retry: () => appApi.switchOrg(targetId) }; return render(); }
    if (res.outcome === 'not_available') { notice = { kind: 'error', text: res.message }; return render(); }
    ctx.orgs = ctx.orgs.map((o) => ({ ...o, is_active: o.org_id === res.org }));
    await loadOrgContext(ctx.orgs.find((o) => o.org_id === res.org));
    announce(`Now in ${res.orgName}`);
    if (res.outcome === 'app_unavailable') {
      notice = { kind: 'warn', text: `${appNameFor(route)} isn't available to you in ${res.orgName}.`, actions: [['Switch back', () => appApi.switchOrg(target.org_id === res.org ? ctx.orgs.find((o) => o.org_id !== res.org)?.org_id : target.org_id)], ['Open another app', () => go(hrefFor.launcher())]], note: 'Ask an admin if you need access.' };
      return render();
    }
    notice = res.message ? { kind: 'info', text: res.message } : { kind: 'info', text: `Now in ${res.orgName}`, quiet: true };
    go(routeForPage(res.route.app, res.route.page));
  },
};
const appNameFor = (route) => ({ office: 'Office' }[pageKeyFor(route).app] ?? 'That app');

// ---- rendering
function noticeEl() {
  if (!notice) return null;
  const n = notice; notice = null;
  return h('div', { class: `notice ${n.kind}`, role: n.kind === 'error' || n.kind === 'warn' ? 'alert' : 'status' }, h('p', {}, n.text, n.note ? ` ${n.note}` : ''),
    ...(n.actions ?? []).map(([t, f]) => button(t, f, 'secondary')), n.retry ? button('Try again', n.retry, 'secondary') : null);
}

function render(opts = {}) {
  const id = ++renderId;
  const live = () => id === renderId;
  const route = parseRoute(location.hash);
  document.documentElement.dataset.theme = 'neutral';
  if (!ready) { clear(root).append(h('main', { class: 'auth-wrap' }, skeleton(3))); return; }

  if (opts.inviteFailed) { clear(root).append(authViews.inviteFailedView(appApi)); return focusTitle(root); }
  if (opts.bootError) { clear(root).append(h('main', { class: 'auth-wrap' }, h('div', { class: 'auth-card' }, h('h1', { 'data-page-title': true }, 'Something went wrong'), h('p', {}, messageFor(opts.bootError)), button('Try again', () => boot(), 'primary')))); return focusTitle(root); }

  // signed-out and account screens
  const signedIn = session.signedIn();
  const inv = tabStore.getItem('l2f.invite');
  if (!signedIn) {
    const views = { signup: () => authViews.signUpView({ app: appApi, invite: inv }), forgot: () => authViews.forgotView({ app: appApi }), 'check-email': authViews.checkEmailView,
      expired: () => authViews.expiredView(appApi), invite: () => authViews.inviteView({ app: appApi, token: inv, signedIn: false }), reset: () => authViews.signInView({ app: appApi, invite: inv }) };
    const v = views[route.name] ?? (() => authViews.signInView({ app: appApi, invite: inv }));
    if (!views[route.name] && route.name !== 'signin') { location.hash = '#/signin'; return; }
    clear(root).append(v()); return focusTitle(root);
  }
  if (route.name === 'expired') { clear(root).append(authViews.expiredView(appApi)); return focusTitle(root); }
  if (route.name === 'reset') { clear(root).append(authViews.resetView({ app: appApi })); return focusTitle(root); }
  if (route.name === 'no-org' || !ctx?.active) { clear(root).append(authViews.noOrgView(appApi, session.get()?.email)); return focusTitle(root); }

  // inside the ecosystem
  document.documentElement.dataset.theme = ctx.active.slug === 'aurj' ? 'aurj' : 'l2f';
  const c = {
    api, orgName: ctx.active.name, clients: ctx.clients, can: (p) => ctx.perms.has(p), live, announce, go,
    fmpUrl: ctx.apps.find((a) => a.app_key === 'funnel_mapper_pro')?.launch_url ?? null, rerender: () => render(),
  };
  let content;
  switch (route.name) {
    case 'home': case 'launcher': case 'signin': case 'signup': case 'check-email': case 'forgot': case 'invite':
      content = ctx.appsError ? h('section', {}, pageTitle('Your apps'), notFoundState()) : launcherView({ apps: ctx.apps, orgName: ctx.active.name }); break;
    case 'office': content = officeHomeView(ctx.active.name); break;
    case 'funnels': content = funnelsHomeView(c); break;
    case 'funnel-list': content = funnelListView(c, route.params.type); break;
    case 'funnel-record': content = funnelRecordView(c, route.params.type, route.params.id); break;
    case 'app': content = appPlaceholderView(route.params.app, ctx.apps.find((a) => a.app_key === route.params.app)?.name); break;
    default: content = h('section', {}, needsDesign(), pageTitle('Not found'), notFoundState(h('a', { class: 'btn secondary', href: hrefFor.launcher() }, 'Go to your apps')));
  }
  clear(root).append(shellView({ app: appApi, orgs: ctx.orgs, activeOrg: ctx.active, email: session.get()?.email, route, content, notice: noticeEl() }));
  focusTitle(root);
}

window.addEventListener('hashchange', () => render());
window.addEventListener('offline', () => announce('You are offline. Changes will not be saved.'));
render();
boot();
