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
import { driveView } from './modules/drive.js';
import { publicView } from './modules/publicview.js';
import { portalView } from './modules/portal.js';
import { formsView } from './modules/forms.js';
import { ladderView } from './modules/ladder.js';
import { boardsView } from './modules/boards.js';
import { socialView } from './modules/social.js';
import { sheetView } from './modules/sheets.js';
import { imageView } from './modules/imageeditor.js';
import { pdfView } from './modules/pdfeditor.js';
import { plannerView, unmountPlanner, plannerMountedFor, plannerSection, PLANNER_PAGES } from './modules/planner.js';
import { strategiesListView, strategyView } from './views/strategies.js';
import { documentsView, teamView, appsView } from './views/office.js';
import { loadWeather, weatherOff, setWeatherOff } from './sky.js';
import { permissionSet, canWith, canAnywhereWith } from './perm.js';
import { switchOrganization } from '/packages/core/org-switch.mjs';
import { dialog, toast, btn, notice, skeleton, notFoundState, designBadge, icon, emptyState } from './ui.js';
import * as authViews from './views/auth.js';
import { shellView, markAppNav, setHeaderAvatar } from './views/shell.js';
import { profileView } from './views/profile.js';
import { launcherView, appNotBuiltView } from './views/launcher.js';
import { officeHomeView } from './views/home.js';
import { adminView } from './views/admin.js';
import { funnelsHomeView, funnelListView, funnelRecordView } from './views/funnels.js';

const cfg = window.L2F_CONFIG;
const root = document.getElementById('app');
const store = (() => { try { localStorage.setItem('l2f.t', '1'); localStorage.removeItem('l2f.t'); return localStorage; } catch { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; } })();
const tabStore = (() => { try { sessionStorage.setItem('l2f.t', '1'); sessionStorage.removeItem('l2f.t'); return sessionStorage; } catch { return store; } })();
const session = createSession({ storage: store });
// A pending invitation must survive the e-mail confirmation step: the confirmation link opens in a new tab (often another browser), so it is kept in
// local storage as well as in the tab, and it also rides on the confirmation link itself (?invite=...).
const inviteStore = {
  get: () => tabStore.getItem('l2f.invite') || (() => { try { return store.getItem('l2f.invite'); } catch { return null; } })(),
  set: (t) => { tabStore.setItem('l2f.invite', t); try { store.setItem('l2f.invite', t); } catch { /* private mode: the tab copy still works */ } },
  clear: () => { tabStore.removeItem('l2f.invite'); try { store.removeItem('l2f.invite'); } catch { /* none */ } },
};
const auth = createAuthClient({ baseUrl: cfg.supabaseUrl, publishableKey: cfg.publishableKey, redirectTo: `${location.origin}/` });
let slowDownShown = 0;
const api = createApiClient({ session, auth, onExpired: () => { if (session.get()) goExpired(); },
  onRateLimited: (secs) => { if (Date.now() - slowDownShown > 15000) { slowDownShown = Date.now(); toast(`${messageFor('rate_limited')}${secs ? ` (about ${secs} s)` : ''}`, false); } } });

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
let me = null;
let myInvites = [];                   // invitations waiting for this person's verified e-mail (found by the server, no link needed)
async function loadMine() {
  const r = await api.call('invitations.mine', {}, { org: NO_ORG }); const rows = r.ok ? r.data : [];
  for (const x of rows.filter((x) => x.already_member)) api.call('invitation.accept_mine', { id: x.id }, { org: NO_ORG });   // already in: just close it, nothing changes
  myInvites = rows.filter((x) => !x.already_member); return myInvites;
}                       // { name, photo } of the signed-in person, for the header avatar
const freshToken = async () => { if (session.needsRefresh()) await refreshNow(); return session.get()?.access; };
async function loadMe() { const r = await api.call('profile.get', {}, { org: NO_ORG }); const row = r.ok ? r.data?.[0] : null; me = { name: row?.display_name ?? session.get()?.name ?? null, photo: row?.avatar_data ?? null }; return me; }
async function boot() {
  const viaLink = new URLSearchParams(location.search).get('invite');
  if (viaLink) { inviteStore.set(viaLink); history.replaceState(null, '', location.pathname + location.hash); }
  const fromLink = parseAuthHash(location.hash);
  if (fromLink) {
    history.replaceState(null, '', location.pathname + location.search);        // tokens never stay in the URL
    if (fromLink.access_token) session.set({ access_token: fromLink.access_token, refresh_token: fromLink.refresh_token, expires_in: fromLink.expires_in });
    if (fromLink.type === 'recovery') { ready = true; go('#/reset'); return; }
  }
  const r0 = parseRoute(location.hash);
  if (r0.name === 'invite' && r0.query.token) { inviteStore.set(r0.query.token); history.replaceState(null, '', `${location.pathname}#/invite`); }
  if (r0.name === 'public') { ctx = null; ready = true; render(); return; }     // a public share link needs neither sign-in nor organizations
  if (!session.signedIn()) { ctx = null; ready = true; render(); return; }
  if (session.expired() && !(await refreshNow())) { ready = true; goExpired(); return; }

  if (!tabStore.getItem('l2f.touched')) { tabStore.setItem('l2f.touched', '1'); api.call('profile.touch', { name: session.get()?.name ?? undefined }, { org: NO_ORG }).then(() => loadMe().then(() => setHeaderAvatar(me))); }          // name and email for the member list, once per tab; failure is harmless
  const list = await loadOrgs();
  if (list === 'expired') return;
  if (list === null) { ready = true; return render({ bootError: true }); }
  const pending = inviteStore.get();
  if (!pending) await loadMine();
  if (!list.length && !pending && !myInvites.length) { ctx = null; ready = true; go('#/no-org'); return; }
  ctx = { orgs: list };
  if (list.length) await loadOrgContext(list.find((o) => o.is_active) ?? defaultOrg(list));
  ready = true;
  const r = parseRoute(location.hash);
  if (pending) return go('#/invite');
  if (myInvites.length && !tabStore.getItem('l2f.inv.seen')) { tabStore.setItem('l2f.inv.seen', '1'); return go('#/invite'); }
  const back = tabStore.getItem('l2f.return'); tabStore.removeItem('l2f.return');
  if (back && AUTH_ROUTES.has(r.name)) { try { return go(JSON.parse(back).hash); } catch { /* fall through */ } }
  go(AUTH_ROUTES.has(r.name) || r.name === 'home' || r.name === 'no-org' ? hrefFor.launcher() : location.hash);
}
let bootFailure = null;     // which call failed and how (status and error code only): shown on the load-error screen so a failure can be reported precisely
async function loadOrgs() {
  const res = await api.call('org.list', {}, { org: NO_ORG });
  if (!res.ok) { if (res.error?.code === 'session_expired') { ready = true; goExpired(); return 'expired'; } bootFailure = `org.list · ${res.status || 'no answer'} · ${res.error?.code ?? 'failed'}`; return null; }
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
    const inv = inviteStore.get();
    const r = await auth.signUp(email, password, name, inv ? `${location.origin}/?invite=${encodeURIComponent(inv)}` : undefined);
    const soft = offlineOrBusy(r); if (soft) return soft;
    if (r.ok && r.data?.access_token) { session.set(r.data); await boot(); return null; }
    // Supabase answers a sign-up for an address that already has an account with a look-alike success (no identities) and sends no e-mail.
    const existing = 'This email already has an account, so no confirmation email was sent. Sign in with it instead (use “Forgot password” if needed); your invitation will be waiting.';
    const u = r.data?.user ?? r.data;
    if (r.ok && Array.isArray(u?.identities) && u.identities.length === 0) return existing;
    if (r.status === 422 && /already|exists|registered/i.test(JSON.stringify(r.data ?? ''))) return existing;
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
  // ---- profile (everyone changes only their own)
  async getProfile() {
    const r = await api.call('profile.get', {}, { org: NO_ORG }); if (!r.ok) return { ok: false };
    const row = r.data?.[0] ?? {}; const c = session.get();
    return { ok: true, data: { name: row.display_name ?? c?.name ?? '', email: row.email ?? c?.email ?? '', photo: row.avatar_data ?? null } };
  },
  async saveProfile({ name, photo, clear_photo }) {
    const r = await api.call('profile.update', { ...(name ? { name } : {}), ...(photo ? { photo } : {}), ...(clear_photo ? { clear_photo: true } : {}) }, { org: NO_ORG });
    if (!r.ok) return { ok: false, message: r.status === 429 ? messageFor('rate_limited') : 'We couldn’t save that. Try again.' };
    if (name) { const tok = await freshToken(); if (tok) auth.updateUser(tok, { data: { full_name: name } }); const c = session.get(); if (c) session.set({ access_token: c.access, refresh_token: c.refresh, expires_at: c.expiresAt / 1000, user: { email: c.email, id: c.userId, user_metadata: { full_name: name } } }); }
    await loadMe(); setHeaderAvatar(me); return { ok: true };
  },
  async changeEmail(email) {
    const tok = await freshToken(); if (!tok) return { ok: false, message: 'Your sign-in has expired. Sign in again.' };
    const r = await auth.updateUser(tok, { email }); const soft = offlineOrBusy(r); if (soft) return { ok: false, message: soft };
    return r.ok ? { ok: true } : { ok: false, message: r.status === 422 ? 'That email can’t be used (it may already belong to another account). Try another one.' : r.status >= 500 ? 'We couldn’t send the confirmation email, so nothing was changed. Try again later.' : 'We couldn’t change the email. Try again.' };
  },
  async changePassword(password, nonce) {
    const tok = await freshToken(); if (!tok) return { ok: false, message: 'Your sign-in has expired. Sign in again.' };
    const r = await auth.updateUser(tok, { password, ...(nonce ? { nonce } : {}) }); const soft = offlineOrBusy(r); if (soft) return { ok: false, message: soft };
    if (r.ok) return { ok: true };
    const code = String(r.data?.error_code ?? r.data?.code ?? r.data?.msg ?? '');
    if (/reauthentication_needed/i.test(code) && !nonce) { await auth.reauthenticate(tok); return { ok: false, needCode: true, message: 'For your security, we emailed you a code. Enter it below to finish.' }; }
    if (/reauthentication_not_valid|nonce/i.test(code)) return { ok: false, needCode: true, message: 'That code didn’t work. Check the latest email and try again.' };
    return { ok: false, message: r.status === 422 ? 'Choose a stronger password, with a few more characters, and not your old one.' : 'We couldn’t change the password. Try again.' };
  },
  async signOutEverywhere() { const tok = await freshToken(); if (tok) await auth.signOut(tok, 'global'); return appApi.signOut(); },
  async signOut() { const c = session.get(); dirty.clear(); session.clear(); ctx = null; api.setOrg(null); tabStore.removeItem('l2f.return'); tabStore.removeItem('l2f.touched'); if (c?.access) auth.signOut(c.access); go('#/signin'); },
  useDifferentAccount() { session.clear(); ctx = null; go('#/signin'); },
  async recheck() { const list = await loadOrgs(); if (Array.isArray(list) && !list.length && (await loadMine()).length) { go('#/invite'); return true; } if (!Array.isArray(list) || !list.length) return false; ctx = { orgs: list }; await loadOrgContext(defaultOrg(list)); go(hrefFor.launcher()); return true; },
  async acceptMine(id) {
    const before = ctx?.orgs ?? [];
    const acc = await api.call('invitation.accept_mine', { id }, { org: NO_ORG });
    if (!acc.ok) { await loadMine(); return 'That invitation can’t be used any more. Ask for a new one.'; }
    myInvites = myInvites.filter((x) => x.id !== id);
    const list = await loadOrgs(); if (!Array.isArray(list)) return messageFor('failed');
    const known = new Set(before.map((o) => o.org_id));
    const joined = list.find((o) => !known.has(o.org_id)) ?? list[0];
    ctx = { orgs: list.map((o) => ({ ...o, is_active: o.org_id === joined.org_id })) };
    await loadOrgContext(ctx.orgs.find((o) => o.is_active));
    announce(`You joined ${joined.name}`); go(myInvites.length ? '#/invite' : hrefFor.office()); toast(`You joined ${joined.name}.`); return null;
  },
  async declineMine(id) {
    const r = await api.call('invitation.decline_mine', { id }, { org: NO_ORG }); myInvites = myInvites.filter((x) => x.id !== id);
    if (!r.ok) return messageFor('failed');
    go(myInvites.length ? '#/invite' : ctx?.orgs?.length ? hrefFor.launcher() : '#/no-org'); render(); return null;
  },
  laterMine() { go(ctx?.orgs?.length ? hrefFor.launcher() : '#/no-org'); },
  async acceptInvitation(token) {
    const before = ctx?.orgs ?? [];
    const acc = await api.call('invitation.accept', { token }, { org: NO_ORG });
    if (!acc.ok) { inviteStore.clear(); return 'That invitation can’t be used. Ask for a new one.'; }
    inviteStore.clear();
    const list = await loadOrgs(); if (!Array.isArray(list)) return messageFor('failed');
    const known = new Set(before.map((o) => o.org_id));
    const joined = list.find((o) => !known.has(o.org_id)) ?? list[0];
    ctx = { orgs: list.map((o) => ({ ...o, is_active: o.org_id === joined.org_id })) };
    await loadOrgContext(ctx.orgs.find((o) => o.is_active));
    announce(`You joined ${joined.name}`); go(hrefFor.office()); toast(`You joined ${joined.name}.`); return null;
  },
  async declineInvitation(token) {
    const r = await api.call('invitation.decline', { token }, { org: NO_ORG }); inviteStore.clear();
    if (!r.ok) return messageFor(r.error?.code);
    go(ctx?.orgs?.length ? hrefFor.launcher() : '#/no-org'); return null;
  },
  dismissInvitation() { inviteStore.clear(); go(ctx?.orgs?.length ? hrefFor.launcher() : '#/no-org'); },
  switchOrg: (targetId) => switchFlow(targetId),
};

// ---- unsaved work: ask before leaving the page or switching organization (nothing is ever lost silently)
async function askUnsaved(next) {
  const e = dirty.get();                       // save first and leave; the dialog only appears when that save does not work
  if (e) { let ok = false; try { ok = await e.save(); } catch { ok = false; } if (ok) { dirty.clear(); next(); return; } }
  dialog({ title: 'You have unsaved changes', body: h('p', {}, 'Save them before you leave, or they’ll be lost.'), role: 'alertdialog',
    actions: [{ label: 'Save and leave', cls: 'primary', keep: true, on: async (close) => { const ok = await dirty.get()?.save(); if (!ok) return false; close(); dirty.clear(); next(); } },
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
      actions: [{ label: 'Save and switch', cls: 'primary', keep: true, on: async (close) => { const ok = await e.save(); if (!ok) return false; close(); dirty.clear(); doSwitch(target); } },
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
  unmountPlanner();                                         // Planner holds the old organization's plans: gone before the switch is even confirmed
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
    banner = { kind: 'err', icon: 'cross', content: [h('b', {}, `Couldn’t switch to ${target.name}.`), ` The connection dropped before we could confirm your access. You’re still in ${from.name} and nothing was changed or lost.`], actions: [btn('Try again', () => switchFlow(target.org_id), 'primary'), btn('Dismiss', () => { banner = null; render(); })] };
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
  else if (route.name === 'planner' && (route.query.plan || route.query.goal))   // a plan or objective is a record: it stays in the organization it belongs to
    banner = { kind: 'info', icon: 'info', content: [h('b', {}, `That plan belongs to ${from.name}, so it isn’t here.`), ` We’ve taken you to Planner in ${res.orgName}.`], actions: [btn(`Switch back to ${from.name}`, () => switchFlow(from.org_id))] };
  else toastLater = `Now in ${res.orgName} · ${pageLabel(parseRoute(dest))}`;                  // outcome 1
  announce(`Switched to ${res.orgName}. ${pageLabel(parseRoute(dest))}.`);
  if (location.hash === dest) render(); else location.hash = dest;
}
let toastLater = null;
const pageLabel = (r) => (r.name === 'launcher' ? 'Launcher' : r.name === 'planner' ? 'Planner' : OFFICE_PAGES.find((p) => p.key === ({ office: 'home', 'office-page': r.params.page, funnels: 'funnels', 'funnel-list': 'funnels', 'funnel-record': 'funnels', admin: 'admin' }[r.name]))?.label ?? 'Office');

// ---- rendering
const bannerEl = () => {
  if (!banner) return null; const b = banner; banner = null;
  return notice(b.kind, b.icon, b.content, b.actions ?? []);
};
const centered = (...c) => h('div', { class: 'authwrap' }, h('main', { class: 'authnarrow', id: 'main' }, h('div', { class: 'card', style: 'padding:32px' }, ...c)));

// Planner isn't open to this person here (not switched on, coming soon, or no grant): say so plainly, in the shell's words.
function plannerOffView(org, entry) {
  const soon = entry?.state === 'coming_soon';
  return h('section', {}, h('div', { class: 'crumb' }, 'Apps'), h('h1', { 'data-page-title': true }, 'Planner'),
    emptyState({ title: soon ? 'Planner is coming soon' : `Planner isn’t available to you in ${org.name}`,
      body: soon ? 'It isn’t switched on yet. Nothing has been lost.' : `Ask an ${org.name} admin for access, or switch to another organization at the top of the page.`,
      ic: 'lock', action: h('a', { class: 'btn pri', href: hrefFor.office() }, 'Go to Office Home') }));
}

// The header bell: the unread count is kept for a minute (it is shown on every page; one request per page change would slow every app down)
const bell = { n: null, at: 0, org: null };
const notifications = {
  async count(fresh = false) {
    const org = ctx?.active?.org_id;
    if (!fresh && bell.org === org && Date.now() - bell.at < 60000) return bell.n;
    const r = await api.call('notifications.unread', {}); bell.org = org; bell.at = Date.now(); bell.n = r.ok ? r.data[0].n : null; return bell.n;
  },
  async list() { const r = await api.call('notifications.list', { limit: 30 }); return r.ok ? r.data : null; },
  async read(ids) { await api.call('notifications.read', ids === 'all' ? { all: true } : { ids }); bell.at = 0; },
  href: (r) => `#/projects/p/${r.project_id}?task=${r.entity_id}`,
};

const theme = createTheme(); theme.apply();
async function render(opts = {}) {
  const id = ++renderId; const live = () => id === renderId;
  const route = parseRoute(location.hash);
  if (route.name !== 'planner' || !session.signedIn() || unavailable) unmountPlanner();
  document.body.classList.remove('hasb');
  theme.setOrg(null);
  if (!ready) { put(root, centered(skeleton(3))); return; }
  if (opts.bootError) { put(root, centered(h('h1', { 'data-page-title': true }, 'We couldn’t load this'), h('p', { class: 'sub' }, 'Your work is safe. Check your connection and try again.'), bootFailure ? h('p', { class: 'fine muted' }, `Reference: ${bootFailure}`) : null, btn('Try again', () => boot(), 'primary'))); return focusTitle(root); }

  if (route.name === 'public') { document.body.classList.remove('hasb'); put(root, publicView({ token: route.params.token })); return; }
  // signed-out and account screens
  if (!session.signedIn()) {
    const inv = inviteStore.get();
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
    const token = inviteStore.get();
    put(root, centered(skeleton(3)));
    const p = token ? await api.call('invitation.preview', { token }, { org: NO_ORG }) : null;
    if (!live()) return;
    if (!token || !p?.ok || !p.data.length) {      // no link (or a link for another address): offer what the server finds for this verified e-mail
      if (!myInvites.length) await loadMine(); if (!live()) return;
      if (myInvites.length) { if (token) inviteStore.clear(); put(root, authViews.invitesMineView({ app: appApi, invites: myInvites, email: session.get()?.email })); return focusTitle(root); }
    }
    put(root, authViews.inviteView({ app: appApi, token, preview: p?.ok ? p.data[0] : null, email: session.get()?.email })); return focusTitle(root);
  }
  if (route.name === 'profile' && !ctx?.active) { put(root, centered(profileView({ app: appApi, me }))); document.title = 'Your profile'; return focusTitle(root); }
  if (route.name === 'no-org' || !ctx?.active) { put(root, authViews.noOrgView(appApi, session.get()?.email)); return focusTitle(root); }

  // inside the ecosystem
  const org = ctx.active;
  const registry = await loadRegistry(); if (!live()) return;   // before any view starts: a view that finished loading before it was attached to the page would drop its own result
  theme.setOrg(org);
  const role = org.role; const isAdmin = role === 'owner' || role === 'admin';
  const c = {
    api, orgName: org.name, isOwner: role === 'owner', userId: session.get()?.userId, userName: session.get()?.name, clients: ctx.clients, catalog: ctx.catalog, live, announce, go, guard, rerender: () => render(),
    can: (p, clientId) => canWith(ctx.mine, p, clientId), canAnywhere: (p) => canAnywhereWith(ctx.mine, p),
    clientsWhere: (p) => [...ctx.clients].filter(([cid]) => canWith(ctx.mine, p, cid)),
  };
  const inOffice = ['office', 'office-page', 'funnels', 'strategies', 'strategy', 'funnel-list', 'funnel-record', 'admin'].includes(route.name);
  let content; let nav = null;
  if (unavailable && route.name !== 'launcher') {
    const u = unavailable;
    content = h('div', { class: 'unavail' }, h('div', { class: 'ic' }, icon('warn')), h('h2', { 'data-page-title': true }, `${u.app} isn’t turned on for ${org.name}`),
      h('p', {}, `You’re now in ${org.name}. ${u.app} is only set up for ${u.from}, so there’s nothing to show here. Nothing from ${u.from} is on this screen.`),
      h('div', { class: 'acts' }, btn(`Go to ${org.name} Office Home`, () => { unavailable = null; go(hrefFor.office()); }, 'primary'), btn(`Switch back to ${u.from}`, () => { unavailable = null; switchFlow(u.fromId); })),
      h('p', { style: 'margin:var(--space-4) 0 0;font-size:14px' }, `Need it here? `, btn(`Ask an ${org.name} admin`, () => toast('Message only for now. No request was sent.', false), 'link'), ' · ', h('a', { class: 'btn link', href: hrefFor.launcher(), onclick: () => { unavailable = null; } }, 'Browse all apps')));
  } else {
    switch (route.name) {
      case 'home': case 'launcher': case 'signin': case 'signup': case 'check-email': case 'forgot': case 'invite':
        content = launcherView({ catalog: ctx.catalog, error: ctx.catalogError, org, orgs: ctx.orgs, role, name: session.get()?.name, registry, loadWeather: () => loadWeather({ api, store: localStorage }), onSwitch: (i) => switchFlow(i), retry: async () => { await loadOrgContext(org); render(); } }); break;
      case 'profile': content = profileView({ app: appApi, me }); break;
      case 'office': content = officeHomeView({ org, role, isAdmin, api, live, portalState: ctx.catalog.find((a) => a.app_key === 'portal')?.state }); break;
      case 'office-page': {
        const pg = route.params.page;
        if (pg === 'documents') content = documentsView({ api, ctx: c });
        else if (pg === 'team') content = teamView({ api, ctx: c });
        else if (pg === 'apps') content = appsView({ catalog: ctx.catalog, registry, org, orgs: ctx.orgs });
        else if (pg === 'projects') content = projectsView({ api, ctx: c, base: '#/office/projects', embedded: true, route: { view: route.params.view ?? 'home', id: route.params.id, query: route.query } });
        else content = appNotBuiltView(OFFICE_PAGES.find((p) => p.key === pg)?.label ?? 'This page');
        break;
      }
      case 'funnels': content = funnelsHomeView(c); break;
      case 'strategies': content = strategiesListView(c); break;
      case 'strategy': content = strategyView(c, route.params.id); break;
      case 'funnel-list': content = funnelListView(c, route.params.type); break;
      case 'funnel-record': content = funnelRecordView(c, route.params.type, route.params.id); break;
      case 'doc': content = docView({ api, id: route.params.id, ctx: c }); break;
      case 'social': content = socialView({ api, ctx: c, route: { view: route.params.view, id: route.params.id, query: route.query } }); break;
      case 'boards': content = boardsView({ api, ctx: c, route: { query: route.query } }); break;
      case 'ladder': content = ladderView({ api, ctx: c, route: { view: route.params.view, id: route.params.id, query: route.query } }); break;
      case 'forms': content = formsView({ api, ctx: c, route: { view: route.params.view, id: route.params.id } }); break;
      case 'portal': content = portalView({ api, ctx: c, route: { client: route.params.client, page: route.params.page } }); break;
      case 'drive': content = driveView({ api, ctx: c, route: { view: route.params.view, space: route.params.space, folder: route.params.folder, token: route.params.token } }); break;
      case 'sheet': content = sheetView({ api, id: route.params.id, ctx: c }); break;
      case 'image': content = imageView({ api, id: route.params.id, ctx: c }); break;
      case 'pdf': content = pdfView({ api, id: route.params.id, ctx: c }); break;
      case 'clients': content = clientsView({ api, ctx: c, route: { view: route.params.view, id: route.params.id, query: route.query } }); break;
      case 'projects': content = projectsView({ api, ctx: c, route: { view: route.params.view, id: route.params.id, query: route.query } }); break;
      case 'board': content = boardView({ api, id: route.params.id, ctx: c }); break;
      case 'planner': {
        // the database refuses Planner without the app switched on here and the person's grant; this only explains it instead of mounting an app that can show nothing
        const entry = ctx.catalog.find((a) => a.app_key === 'planner');
        if (!ctx.catalogError && entry?.state !== 'available') { unmountPlanner(); content = plannerOffView(org, entry); break; }
        const s = session.get();
        content = plannerView({ api, org, orgs: ctx.orgs, me: { id: s?.userId, name: s?.name || s?.email || 'You' } });
        /* the Planner menu comes from appnav.js */
        break;
      }
      case 'admin': content = adminView({ api, live, org, role, route, rerender: () => render(), go, clients: ctx.clients }); break;
      case 'app': content = appNotBuiltView(ctx.catalog.find((a) => a.app_key === route.params.app)?.name ?? appLabel(route.params.app)); break;
      default: content = notFoundState(hrefFor.office());
    }
  }
  const view = shellView({ app: appApi, orgs: ctx.orgs, active: org, email: session.get()?.email, name: session.get()?.name, route, content, banner: bannerEl(), isAdmin, inOffice, launcherCurrent: route.name === 'launcher' || route.name === 'home',
    notifications: org.member_kind === 'client' ? null : notifications,
    catalog: ctx.catalog, registry, currentApp: inOffice ? 'office' : route.name === 'doc' || route.name === 'sheet' || route.name === 'image' || route.name === 'pdf' || route.name === 'drive' ? 'drive' : route.name === 'board' ? 'whiteboard' : route.name === 'projects' ? 'projects' : route.name === 'clients' ? 'clients' : route.name === 'portal' ? 'portal' : route.name === 'forms' ? 'forms' : route.name === 'ladder' ? 'value_ladder' : route.name === 'boards' ? 'whiteboard' : route.name === 'social' ? 'social_planner' : route.name === 'planner' ? 'planner' : route.name === 'app' ? route.params.app : null, theme,
    me, weather: { on: () => !weatherOff(localStorage), set: (on) => { setWeatherOff(localStorage, !on); try { sessionStorage.removeItem('l2f.wx'); } catch { /* none */ } render(); } } });
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
  const from = parseRoute(lastHash), to = parseRoute(location.hash);
  lastHash = location.hash;
  // moving between Planner's own pages: Planner routes itself, so the shell only moves its menu mark (no remount, no reload of the plan)
  if (from.name === 'planner' && to.name === 'planner' && ready && session.signedIn() && !unavailable && ctx?.active && plannerMountedFor(ctx.active.org_id)) {
    document.querySelector('#main > .notice')?.remove();         // a shell message lasts one page, as in every other app
    return markAppNav(plannerSection(to.params.page));
  }
  window.scrollTo(0, 0); render();       // a new page starts at the top, as the design's navigation does
});
window.addEventListener('beforeunload', (e) => { if (dirty.isDirty()) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('offline', () => announce('You are offline. Changes will not be saved.'));
document.addEventListener('keydown', (e) => {                      // "/" focuses search where search exists
  if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName ?? '')) { const s = document.querySelector('.search input:not(:disabled)'); if (s) { e.preventDefault(); s.focus(); } }
});
render();
boot();
