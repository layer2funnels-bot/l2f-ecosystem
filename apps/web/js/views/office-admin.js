// Office › Admin, V8 (prototype office6.js `adminPage`): People · Teammate access · Client access · Roles · Storage & versions · Branding · Audit log,
// and a page per person. Owners and admins only (everyone else gets the not-found screen). Every switch is checked again by the database (migration 0058):
// nobody changes their own access or an owner's; the Client Access Matrix is for owners AND admins (owner decision, 15 Nov 2026); branding is owners only.
// The V4 dialogs stay in use (invite, manage a member or invitation, client portal contacts, access levels and assignments) through adminView({ parts: true }).
import { h, put, icon, btn, toast, dialog, skeleton, errorState, emptyState, notFoundState, avatar, roleLabel } from '../ui.js';
import { hrefFor } from '../routes.js';
import { plateOf, loadRegistry } from '../registry.js';
import { adminView, emailLine } from './admin.js';

const TABS = [['people', 'People'], ['teammates', 'Teammate access'], ['clients', 'Client access'], ['roles', 'Roles'], ['storage', 'Storage & versions'], ['branding', 'Branding'], ['audit', 'Audit log']];
export const ADMIN_V8_TABS = TABS.map(([k]) => k);
const RANK = { viewer: 1, editor: 2, admin: 3, owner: 4 }; const LV = ['No access', 'Viewer', 'Editor', 'Admin'];
const ago = (iso) => { if (!iso || iso.startsWith('-')) return '—'; const s = (Date.now() - new Date(iso)) / 1000; return s < 120 ? 'Now' : s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.round(s / 3600)} h` : s < 172800 ? 'Yesterday' : `${Math.round(s / 86400)} days ago`; };
const size = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.round((b ?? 0) / 1e3)} KB`);
const toggle = (on, label, onChange, disabled = false) => { const t = h('button', { class: 'toggle', type: 'button', role: 'switch', 'aria-checked': String(Boolean(on)), 'aria-label': label, ...(disabled ? { disabled: true, 'aria-disabled': 'true' } : {}) });
  t.addEventListener('click', async (e) => { e.stopPropagation(); if (disabled) return; const v = t.getAttribute('aria-checked') !== 'true'; t.setAttribute('aria-checked', String(v)); t.disabled = true; const ok = await onChange(v); t.disabled = false; if (!ok) t.setAttribute('aria-checked', String(!v)); }); return t; };

export function adminV8View({ api, ctx, org, role, route, go }) {
  if (role !== 'owner' && role !== 'admin') return h('section', {}, notFoundState(hrefFor.office()));
  const isOwner = role === 'owner'; const tab = route.params.v8 ?? 'people'; const person = route.params.person;
  const root = h('div', { class: 'v8p-office' }); const body = h('div', {}, skeleton(4)); const live = ctx.live;
  const parts = adminView({ api, live, org, role, route: { params: { tab: 'access', sub: route.params.sub ?? 'levels' } }, rerender: ctx.rerender, go, clients: ctx.clients, parts: true });
  const call = (op, input = {}) => api.call(op, input);
  const failed = (r) => toast(r.status === 403 || r.status === 404 ? 'You can’t change that.' : 'Couldn’t save that. Try again.', false);
  const regP = loadRegistry().catch(() => null); const reg = async () => { const r = await regP; return (k) => r?.get(k) ?? { id: k }; };
  const staffApps = () => (ctx.catalog ?? []).filter((a) => a.state === 'available' && a.scope !== 'portal');

  // ---------------- People
  async function people() {
    const [m, counts, cl] = await Promise.all([call('members.list'), call('access.apps.counts'), call('clients.access.list')]); if (!live()) return;
    if (!m.ok) return put(body, errorState(people));
    const cnt = new Map((counts.data ?? []).map((x) => [x.user_id, x])); const contacts = (cl.ok ? cl.data : []).filter((c) => !['revoked', 'declined'].includes(c.status));   // ended relationships are not people here (their history stays in Client access)
    const emails = new Set(contacts.map((c) => (c.email ?? '').toLowerCase()).filter(Boolean));
    const owners = m.data.filter((x) => x.row_kind === 'member' && x.role === 'owner' && x.status === 'active').length;
    const name = (x) => x.display_name || x.email || 'Someone';
    let filter = 'all'; const q = h('input', { placeholder: 'Search people', 'aria-label': 'Search people', type: 'search' }); const tbl = h('div', { class: 'tbl6' });
    const rows = [...m.data.map((x) => ({ kind: 'team', both: emails.has((x.email ?? '').toLowerCase()), x })), ...contacts.map((c) => ({ kind: 'client', x: c }))];
    const rel = (k) => h('span', { class: `rel ${k === 'Client' ? 'client' : ''}`.trim() }, icon(k === 'Client' ? 'portal' : 'team'), k);
    const paint = () => { const t = q.value.trim().toLowerCase();
      const list = rows.filter((r) => (filter === 'all' || (filter === 'team' && r.kind === 'team') || (filter === 'client' && (r.kind === 'client' || r.both)) || (filter === 'both' && r.both)) && (!t || `${name(r.x)} ${r.x.email ?? ''} ${r.x.client_name ?? ''}`.toLowerCase().includes(t)));
      tbl.replaceChildren(h('div', { class: 'thd' }, ...['Person', 'Relationship', 'Role', 'Apps', 'Status', 'Last active'].map((x) => h('span', {}, x))), ...list.map((r) => {
        if (r.kind === 'client') { const c = r.x; return h('div', { class: 'tr' }, h('span', { class: 't1c' }, avatar(c.person_name || c.email || 'C', 26), h('b', {}, c.person_name || c.email)), h('span', {}, rel('Client')), h('span', {}, c.client_name ?? ''), h('span', { class: 'mono' }, '—'),
          h('span', {}, h('span', { class: 'pill' }, c.status === 'active' ? 'Portal locked' : ({ invited: 'Invited', suspended: 'Suspended' })[c.status] ?? c.status ?? '')), h('span', {}, '—')); }
        const x = r.x; const c = cnt.get(x.user_id); const all = x.role === 'owner' || x.role === 'admin';
        const cells = [h('span', { class: 't1c' }, avatar(name(x), 26), h('span', { style: 'min-width:0;overflow:hidden' }, h('b', { style: 'display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, name(x), x.is_you ? ' (you)' : ''), x.row_kind === 'invitation' && x.email_status ? h('small', { class: 'muted', style: 'display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', 'data-email-status': x.email_status }, emailLine(x)) : null)), h('span', {}, rel('Teammate'), r.both ? [' ', rel('Client')] : null), h('span', {}, roleLabel(x.role)),
          h('span', { class: 'mono' }, all ? 'All' : String(c?.apps ?? 0)), h('span', {}, h('span', { class: `pill ${x.status === 'active' ? 'blue' : ''}`.trim() }, x.row_kind === 'invitation' ? (x.status === 'expired' ? 'Expired' : 'Invited') : x.status === 'active' ? 'Active' : 'Deactivated')), h('span', {}, ago(c?.last_used_at))];
        return x.row_kind === 'member' ? h('a', { class: 'tr', href: `#/office/admin/person/${x.user_id}` }, ...cells) : h('button', { class: 'tr', type: 'button', style: 'text-align:left;width:100%;border:0;background:none;font:inherit;color:inherit', onclick: () => parts.manage(x, owners) }, ...cells); }));
      if (!list.length) tbl.append(h('p', { class: 'hint', style: 'padding:14px' }, 'No one matches.')); };
    const chips = h('div', { class: 'chips6' }); const paintChips = () => chips.replaceChildren(...[['all', 'Everyone', rows.length], ['team', 'Teammates', rows.filter((r) => r.kind === 'team').length], ['client', 'Clients', rows.filter((r) => r.kind === 'client' || r.both).length], ['both', 'Both', rows.filter((r) => r.both).length]]
      .map(([k, l, n]) => h('button', { type: 'button', 'aria-pressed': String(filter === k), onclick: () => { filter = k; paintChips(); paint(); } }, `${l} ${n}`)));
    q.addEventListener('input', paint); paintChips(); paint();
    put(body, h('div', { class: 'tb6' }, h('label', { class: 'inp sm' }, icon('search'), q), chips, h('span', { class: 'grow' }), btn([icon('plus'), 'Invite'], () => parts.invite(), 'primary sm', { id: 'invite' })), tbl,
      h('p', { class: 'hint', style: 'margin-top:8px' }, 'One person, one sign-in. A person can be a teammate and a client at once; each relationship has its own access. Invitations open to resend or cancel.'));
  }

  // ---------------- one person: relationships, app and feature access, check access
  let personSeq = 0;   // switching people quickly: only the latest person's answer may paint (an older, slower answer would show the wrong switches)
  async function personPage(uid, selector) {
    const my = ++personSeq; if (selector) put(body, selector, skeleton(4));
    const [m, eff, grants, ov, perms, cl, R] = await Promise.all([call('members.list'), call('access.effective', { user: uid }), call('access.apps.of', { user: uid }), call('access.features.of', { user: uid }), call('access.roles'), call('clients.access.list'), reg()]); if (!live() || my !== personSeq) return;
    if (!m.ok || !eff.ok || !grants.ok || !ov.ok || !perms.ok) return put(body, selector ?? null, errorState(() => personPage(uid, selector)));
    const mem = (m.data ?? []).find((x) => x.row_kind === 'member' && x.user_id === uid); if (!mem) return put(body, emptyState({ title: 'This person isn’t in the organization', body: 'They may have been removed.', action: h('a', { class: 'btn', href: '#/office/admin/people' }, 'All people') }));
    const owners = m.data.filter((x) => x.row_kind === 'member' && x.role === 'owner' && x.status === 'active').length;
    const locked = mem.is_you || mem.role === 'owner'; const all = mem.role === 'owner' || mem.role === 'admin';
    const allowed = new Map((eff.data ?? []).map((e) => [e.permission_key, e])); const changed = new Map((ov.data ?? []).map((o) => [o.permission_key, o.effect])); const has = new Set((grants.data ?? []).map((g) => g.app_key));
    const client = (cl.data ?? []).find((c) => (c.email ?? '').toLowerCase() === (mem.email ?? '').toLowerCase());
    const roleSel = h('select', { class: 'sel sm', 'aria-label': 'Role', disabled: locked }, ...['admin', 'editor', 'viewer', ...(mem.role === 'owner' ? ['owner'] : [])].map((r) => h('option', { value: r }, roleLabel(r)))); roleSel.value = mem.role;
    roleSel.addEventListener('change', async () => { const r = await call('members.setRole', { user: uid, role: roleSel.value }); if (!r.ok) { roleSel.value = mem.role; return failed(r); } toast('Role changed. Access starts from the new role.'); personPage(uid, selector); });
    const feats = (app) => (perms.data ?? []).filter((p) => p.app_key === app || (app === 'office' && ['funnels', 'platform'].includes(p.app_key)));
    // every feature switch on the page, so that after any saved change all of them are re-read from the server (the switch shows what is saved, never a guess)
    const featEls = new Map(); const roleGives = (p) => RANK[mem.role] >= RANK[p.default_role ?? 'owner'];
    const paintFeat = (key) => { const x = featEls.get(key); if (!x) return; const e = allowed.get(key); x.sw.setAttribute('aria-checked', String(Boolean(e?.allowed))); x.pill.textContent = changed.has(key) ? 'Changed' : e?.allowed ? 'From role' : 'Off by role'; };
    const resync = async () => { const [e2, o2, g2] = await Promise.all([call('access.effective', { user: uid }), call('access.features.of', { user: uid }), call('access.apps.of', { user: uid })]); if (!live() || my !== personSeq) return;
      if (e2.ok) { allowed.clear(); for (const e of e2.data) allowed.set(e.permission_key, e); } if (o2.ok) { changed.clear(); for (const o of o2.data) changed.set(o.permission_key, o.effect); }
      if (g2.ok) { has.clear(); for (const g of g2.data) has.add(g.app_key); for (const [k, s] of appEls) if (!s.disabled) s.setAttribute('aria-checked', String(all || has.has(k))); }
      for (const k of featEls.keys()) paintFeat(k); resetBtn.hidden = locked || !changed.size; };
    const appEls = new Map();
    const accm = h('div', { class: 'accm' }, ...staffApps().map((a) => { const fs = feats(a.app_key); const man = R(a.app_key);
      const sw = toggle(all || has.has(a.app_key), `${a.name} access`, async (v) => { const r = await call('access.app.set', { user: uid, app: a.app_key, on: v }); if (!r.ok) { failed(r); resync(); return false; } toast(`${a.name} ${v ? 'on' : 'off'} for ${mem.display_name || 'them'}. Saved and logged.`); resync(); return true; }, locked || all);
      appEls.set(a.app_key, sw);
      const det = h('details', { class: 'acc-row' }, h('summary', {}, sw, plateOf(man, 26), h('b', {}, a.name), h('span', { class: 'grow' }), all ? h('span', { class: 'pill', style: 'height:20px' }, `${roleLabel(mem.role)}: all apps`) : null, fs.length ? [h('span', { class: 'fcount' }, `${fs.length} features`), icon('down')] : null),
        fs.length ? h('div', { class: 'feat' }, ...fs.map((p) => {
          const pillEl = h('span', { class: 'pill', style: 'height:20px' });
          // back to what the role gives = remove the exception (not a second, identical exception)
          const fsw = toggle(allowed.get(p.key)?.allowed, p.description, async (v) => { const r = await call('access.feature.set', { user: uid, permission: p.key, effect: v === roleGives(p) ? 'reset' : v ? 'allow' : 'deny' }); if (!r.ok) { failed(r); resync(); return false; } toast('Saved and logged. Enforced by the server on the next request.'); resync(); return true; }, locked || p.floor_role === 'owner' && !isOwner);
          featEls.set(p.key, { sw: fsw, pill: pillEl }); paintFeat(p.key);
          return h('div', { class: 'tg-row' }, h('span', {}, p.description), pillEl, fsw); })) : null);
      return det; }));
    const reset = async (e) => { e.currentTarget.disabled = true; const rs = await Promise.all([...changed.keys()].map((k) => call('access.feature.set', { user: uid, permission: k, effect: 'reset' })));
      if (rs.some((r) => !r.ok)) failed(rs.find((r) => !r.ok)); else toast('Back to what the role gives.'); await resync(); e.currentTarget.disabled = false; };
    const resetBtn = btn('Reset to role', reset, 'quiet sm'); resetBtn.hidden = locked || !changed.size;
    const ask = h('input', { placeholder: 'Can they… e.g. delete a project', 'aria-label': 'Check access', type: 'search' }); const answers = h('div', {});
    const paintAsk = () => { const t = ask.value.trim().toLowerCase(); const list = (perms.data ?? []).filter((p) => !t || `${p.description} ${p.key}`.toLowerCase().includes(t)).slice(0, t ? 12 : 4);
      answers.replaceChildren(...list.map((p) => { const e = allowed.get(p.key); return h('div', { class: 'why' }, h('b', {}, p.description), h('span', { class: `pill ${e?.allowed ? 'blue' : 'danger'}` }, e?.allowed ? 'Yes' : 'No'), h('small', {}, changed.has(p.key) ? 'Changed for this person' : e?.reason ? String(e.reason).replace(/_/g, ' ') : `From the ${roleLabel(mem.role)} role`)); })); };
    ask.addEventListener('input', paintAsk); paintAsk();
    put(body, selector ?? null, h('div', { class: 'grid-h' }, h('div', { class: 'stackcol' },
      h('section', { class: 'card6 pad-s' }, h('div', { style: 'display:flex;gap:12px;align-items:center' }, avatar(mem.display_name || mem.email, 48), h('div', { class: 'grow' }, h('b', { style: 'font-size:17px' }, mem.display_name || mem.email), h('p', { class: 'hint' }, `One identity · ${mem.email ?? ''}`)),
        btn('Manage', () => parts.manage(mem, owners), 'ghost sm')),
        h('p', { class: 'sec-t' }, 'Relationships'), h('div', { class: 'relcards' }, h('div', { class: 'relcard' }, h('span', { class: 'wic', style: '--c:#2B63F6' }, icon('team')), h('div', { class: 'grow' }, h('b', {}, `Teammate in ${org.name}`), h('small', {}, `Role: ${roleLabel(mem.role)}${locked ? (mem.is_you ? ' · you can’t change your own' : ' · owners keep full access') : ''}`)), roleSel),
          client ? h('div', { class: 'relcard' }, h('span', { class: 'wic', style: '--c:#13A592' }, icon('portal')), h('div', { class: 'grow' }, h('b', {}, `Client contact · ${client.client_name ?? ''}`), h('small', {}, 'Client apps are set per client')), h('a', { class: 'btn ghost sm', href: '#/office/admin/clients' }, 'Client access')) : null)),
      h('section', { class: 'card6' }, h('header', {}, h('h2', {}, 'App and feature access'), h('span', { class: 'hint' }, all ? 'Owners and admins have every app; features follow the role.' : 'Starts from the role. Change any app, then open it for features.')), accm,
        h('div', { class: 'pad-s', style: 'display:flex;gap:8px;align-items:center' }, h('span', { class: 'hint grow' }, 'Each switch saves at once and is logged.'), resetBtn))),
    h('div', { class: 'stackcol' }, h('section', { class: 'card6 pad-s' }, h('p', { class: 'sec-t', style: 'margin-top:0' }, icon('eye'), 'Check access'), h('label', { class: 'inp sm' }, icon('search'), ask), answers),
      h('div', { class: 'notice plain', style: 'font-size:13px' }, icon('shield'), h('span', {}, 'Hiding a button is not security. Every switch here is checked by the server and the database.')))));
  }
  async function teammates() {
    const m = await call('members.list'); if (!live()) return; if (!m.ok) return put(body, errorState(teammates));
    const list = m.data.filter((x) => x.row_kind === 'member' && x.status === 'active'); if (!list.length) return put(body, emptyState({ title: 'No teammates yet' }));
    const sel = h('select', { class: 'sel sm', 'aria-label': 'Teammate' }, ...list.map((x) => h('option', { value: x.user_id }, x.display_name || x.email))); const first = list.find((x) => !x.is_you && x.role !== 'owner') ?? list[0]; sel.value = first.user_id;
    const bar = h('div', { class: 'tb6' }, h('span', { class: 'tx2' }, 'Teammate'), sel, h('span', { class: 'hint' }, 'Owners and admins can change teammate access.'));
    sel.addEventListener('change', () => personPage(sel.value, bar)); personPage(sel.value, bar);
  }

  // ---------------- Client Access Matrix (owners AND admins)
  async function clientsTab() {
    const [cl, mx, R] = await Promise.all([call('clients.list'), call('clients.apps.matrix'), reg()]); if (!live()) return;
    if (!cl.ok || !mx.ok) return put(body, errorState(clientsTab));
    const apps = (ctx.catalog ?? []).filter((a) => a.app_key !== 'office' && a.app_key !== 'clients' && a.lifecycle !== 'retired'); const { defaults, cells } = mx.data[0];
    const cell = new Map(cells.map((c) => [`${c.client_id}:${c.app_key}`, c.enabled])); const def = new Set(defaults);
    const clients = cl.data.filter((c) => !c.archived_at);
    const grid = h('div', { class: 'cagrid', style: `--n:${apps.length}` }, h('div', { class: 'cahead' }, h('span', {}, 'Client'), ...apps.map((a) => h('span', { title: a.name }, plateOf(R(a.app_key), 24)))),
      ...clients.map((c) => h('div', { class: 'carow' }, h('span', {}, h('b', {}, c.name), h('small', {}, c.contact_name ?? c.stage ?? '')), ...apps.map((a) => { const k = `${c.id}:${a.app_key}`; const on = cell.has(k) ? cell.get(k) : def.has(a.app_key);
        const b = h('button', { type: 'button', class: `cell ${on ? 'on' : ''}`.trim(), 'aria-pressed': String(on), 'aria-label': `${a.name} for ${c.name}: ${on ? 'on' : 'off'}` }, on ? icon('check') : '');
        b.addEventListener('click', async () => { if (b.disabled) return; const v = !b.classList.contains('on'); b.disabled = true; b.classList.add('busy'); const r = await call('clients.apps.set', { client: c.id, app: a.app_key, enabled: v }); b.disabled = false; b.classList.remove('busy'); if (!r.ok) return failed(r);
          b.classList.toggle('on', v); b.setAttribute('aria-pressed', String(v)); b.setAttribute('aria-label', `${a.name} for ${c.name}: ${v ? 'on' : 'off'}`); b.replaceChildren(...(v ? [icon('check')] : [])); toast(`${a.name} ${v ? 'on' : 'off'} for ${c.name}. Saved and logged.`); }); return b; }))));
    const editDefaults = () => { const boxes = apps.map((a) => { const i = h('input', { type: 'checkbox', ...(def.has(a.app_key) ? { checked: true } : {}) }); return [a, i]; });
      dialog({ title: 'Default client apps', body: [h('p', { class: 'hint' }, 'New clients get these apps. A client you changed by hand keeps its own choice.'), ...boxes.map(([a, i]) => h('label', { class: 'chk' }, i, ` ${a.name}`))], actions: [{ label: 'Save defaults', cls: 'primary', on: async () => {
        const r = await call('clients.apps.defaults.set', { apps: boxes.filter(([, i]) => i.checked).map(([a]) => a.app_key) }); if (!r.ok) { failed(r); return false; } toast('Default client apps updated.'); clientsTab(); } }, { label: 'Cancel' }] }); };
    put(body, h('p', { class: 'tx2', style: 'margin-bottom:10px' }, 'Clients get their own workspace with these apps by default. Turn any app off for one client. Owners and admins can change this.'),
      clients.length ? grid : emptyState({ title: 'No clients yet', body: 'Clients you add in the Clients app appear here.' }),
      h('div', { class: 'tb6', style: 'margin-top:12px' }, h('span', { class: 'hint grow' }, 'Each change saves at once and is logged. The Client Portal is still locked: nothing is visible to clients until it opens.'), btn('Edit defaults', editDefaults, 'ghost sm')),
      h('h2', { style: 'margin:22px 0 10px' }, 'Client Portal contacts'), parts.pane);
    parts.clientAccess();
  }

  // ---------------- Roles (what each role starts with, per app) and the V4 access levels
  async function roles() {
    const [p, R] = await Promise.all([call('access.roles'), reg()]); if (!live()) return; if (!p.ok) return put(body, errorState(roles));
    const apps = [...new Set(p.data.map((x) => x.app_key))]; const name = (k) => (ctx.catalog ?? []).find((a) => a.app_key === k)?.name ?? (k === 'platform' ? 'Organization' : k[0].toUpperCase() + k.slice(1));
    const lv = (app, r) => { const ps = p.data.filter((x) => x.app_key === app); const n = ps.filter((x) => RANK[r] >= RANK[x.default_role]).length; return n === 0 ? 0 : n === ps.length ? 3 : n / ps.length >= 0.5 ? 2 : 1; };
    put(body, h('div', { class: 'tb6' }, h('span', { class: 'grow tx2' }, 'Roles are starting points; people can have exceptions.'), h('a', { class: 'btn primary sm', href: '#/office/admin/access/levels' }, icon('plus'), 'New role')),
      h('div', { class: 'tbl6 roles' }, h('div', { class: 'thd' }, ...['App', 'Owner', 'Admin', 'Editor', 'Viewer'].map((x) => h('span', {}, x)), h('span')),
        ...apps.map((a) => h('div', { class: 'tr' }, h('span', { class: 't1c' }, plateOf(R(a), 22), h('b', {}, name(a))), ...['owner', 'admin', 'editor', 'viewer'].map((r) => { const v = lv(a, r); return h('span', {}, h('span', { class: `lv lv${v}` }, LV[v])); }), h('span')))),
      h('div', { class: 'tb6', style: 'margin-top:12px' }, h('span', { class: 'hint grow' }, 'Access levels, assignments and the full history:'), ...[['levels', 'Access levels'], ['assignments', 'Assignments'], ['effective', 'Effective access'], ['history', 'History']].map(([k, l]) => h('a', { class: 'btn quiet sm', href: `#/office/admin/access/${k}` }, l))));
  }
  function accessV4() { put(body, parts.pane); parts.access(); }

  // ---------------- Storage
  async function storage() {
    const r = await call('storage.usage'); if (!live()) return; if (!r.ok || !r.data?.[0]) return put(body, errorState(storage));
    const u = r.data[0]; const cap = u.cap_bytes || 1; const COLORS = { shared: '#6B4FF0', client: '#EF5235', personal: '#2B63F6', funnel_mapper: '#FFC633', versions: '#7E5BF2' };
    const NAMES = { shared: 'Shared space', client: 'Client files', personal: 'Personal spaces', funnel_mapper: 'Funnel Mapper images' };
    const spaces = Object.entries(u.by_space ?? {}).filter(([, v]) => v > 0);
    put(body, h('div', { class: 'grid-h' }, h('section', { class: 'card6 pad-s' }, h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline' }, h('b', { class: 't2' }, size(u.total_bytes)), h('span', { class: 'tx2' }, `of ${size(u.cap_bytes)}`)),
      h('div', { class: 'stack-bar', role: 'img', 'aria-label': `${Math.round((u.total_bytes / cap) * 100)}% of storage used` }, ...spaces.map(([k, v]) => h('i', { style: `--v:${((v / cap) * 100).toFixed(1)}%;--c:${COLORS[k] ?? '#9AA0AA'}` }))),
      h('div', { class: 'legend' }, ...spaces.map(([k, v]) => h('span', {}, h('i', { style: `--c:${COLORS[k] ?? '#9AA0AA'}` }), `${NAMES[k] ?? k} `, h('b', {}, size(v)))))),
    h('section', { class: 'card6 pad-s' }, h('p', { class: 'sec-t', style: 'margin-top:0' }, `${org.name}`), h('div', { class: 'mrow' }, h('b', {}, 'Used by this organization'), h('span', { class: 'grow' }), h('span', { class: 'mono' }, size(u.org_bytes))),
      h('div', { class: 'mrow' }, h('b', {}, 'Files'), h('span', { class: 'grow' }), h('span', { class: 'mono' }, String(u.files))), h('div', { class: 'mrow' }, h('b', {}, 'Stored versions'), h('span', { class: 'grow' }), h('span', { class: 'mono' }, String(u.versions))))),
    h('section', { class: 'card6', style: 'margin-top:14px' }, h('header', {}, h('h2', {}, 'How each file type saves and keeps history')), h('div', { class: 'tbl6 flat' }, h('div', { class: 'thd' }, ...['File type', 'Saving', 'History', '', '', ''].map((x) => h('span', {}, x))),
      ...[['Documents', 'Autosaves as you type', 'Every saved version, listed in the document’s history'], ['Spreadsheets and boards', 'Autosaves as you work', 'Every saved version'], ['Images and PDFs', 'Saves when you press Save', 'Each save is a new version; the uploaded original is kept'], ['Other files', 'Uploading again adds a version', 'Every version until you delete it']]
        .map((r2) => h('div', { class: 'tr' }, h('span', { class: 't1c' }, h('b', {}, r2[0])), h('span', { class: 'tx2' }, r2[1]), h('span', { class: 'tx2' }, r2[2]), h('span'), h('span'), h('span')))),
      h('div', { class: 'pad-s' }, h('p', { class: 'hint' }, 'The limit covers every organization on this system together. Versions count towards it.'))));
  }

  // ---------------- Branding (owners change; admins see)
  async function branding() {
    const r = await call('branding.get'); if (!live()) return; if (!r.ok) return put(body, errorState(branding));
    const b = r.data?.[0] ?? {}; const img = (src, alt, hgt) => (src ? h('img', { src, alt, style: `height:${hgt}px;max-width:220px;object-fit:contain` }) : null);
    const mark = img(b.brand_icon, `${org.name} icon`, 40) ?? h('span', { class: 'plate', style: '--s:40px' }, org.name[0]);
    const upload = (slot, label, maxKB) => btn([icon('upload'), label], () => { const i = h('input', { type: 'file', accept: 'image/png,image/svg+xml,image/webp,image/jpeg', onchange: async () => { const f = i.files?.[0]; if (!f) return;
      if (f.size > maxKB * 1024) return toast(`That image is over ${maxKB} KB. Use a smaller file.`, false);
      const data = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(f); });
      const x = await call('branding.set', { slot, data }); if (!x.ok) return failed(x); toast(`${label.replace('Replace ', '')} updated.`); branding(); } }); i.click(); }, 'ghost sm', isOwner ? {} : { disabled: true, 'aria-disabled': 'true' });
    put(body, isOwner ? null : h('div', { class: 'notice', style: 'margin-bottom:12px' }, icon('lock'), h('span', {}, 'Only owners can change branding.')),
      h('div', { class: 'grid-h' }, h('section', { class: 'card6 pad-s' }, h('div', { style: 'display:flex;gap:12px;align-items:center;margin-bottom:12px' }, mark, h('b', { style: 'font-size:17px' }, org.name)),
        h('p', { class: 'sec-t' }, 'Logo'), h('div', { class: 'brandprev' }, h('div', { class: 'bp light' }, img(b.brand_icon, '', 40), img(b.brand_wordmark, org.name, 28) ?? h('b', { style: 'font:600 18px var(--font-d)' }, org.name)),
          h('div', { class: 'bp dark' }, img(b.brand_icon, '', 40), img(b.brand_wordmark_dark ?? b.brand_wordmark, org.name, 28) ?? h('b', { style: 'font:600 18px var(--font-d);color:#F3F1EB' }, org.name))),
        h('div', { class: 'chiprow' }, upload('icon', 'Replace icon', 220), upload('wordmark', 'Replace wordmark', 220), upload('wordmark_dark', 'Wordmark for dark backgrounds', 220), upload('favicon', 'Favicon', 90)),
        h('p', { class: 'hint' }, 'Square icon shows in the rail, Launcher and switcher; the wordmark on sign-in and exports. We fit it inside a rounded tile and never stretch it.'))));
  }

  // ---------------- Audit log
  async function audit() {
    const [a, t] = await Promise.all([call('audit.recent', { limit: 100 }), call('team.list')]); if (!live()) return; if (!a.ok) return put(body, errorState(audit));
    const who = new Map((t.data ?? []).map((m) => [m.user_id, m.display_name]));
    const say = (x) => { const [tbl, op] = String(x.action).split('.'); const verb = { insert: 'Added', update: 'Changed', delete: 'Removed' }[op];
      const THING = { memberships: 'a membership', app_grants: 'app access', workspace_apps: 'an app for the organization', client_app_access: 'a client’s app', client_app_defaults: 'default client apps', permission_overrides: 'a feature switch', access_assignments: 'an access assignment', access_levels: 'an access level', workspaces: 'the organization', files: 'a file' };
      if (verb) return `${verb} ${THING[tbl] ?? tbl.replace(/_/g, ' ')}`;
      return { 'access.feature.allow': 'Switched a feature on', 'access.feature.deny': 'Switched a feature off', 'access.feature.reset': 'Reset a feature to the role', 'access.review.keep': 'Kept access after review', 'branding.replace': 'Replaced the organization logo', 'branding.remove': 'Removed the organization logo' }[x.action] ?? x.action.replace(/[._]/g, ' '); };
    put(body, a.data.length ? h('div', { class: 'tbl6' }, h('div', { class: 'thd' }, ...['When', 'Who', 'What', '', '', ''].map((x) => h('span', {}, x))),
      ...a.data.map((x) => h('div', { class: 'tr' }, h('span', {}, new Date(x.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })), h('span', { class: 't1c' }, avatar(who.get(x.actor_id) ?? 'System', 22), h('small', {}, who.get(x.actor_id) ?? 'System')), h('span', { class: 't1c' }, h('b', {}, say(x))), h('span'), h('span'), h('span'))))
      : emptyState({ title: 'Nothing logged yet' }));
  }

  const title = person ? null : 'Admin';
  const head = h('div', { class: 'ph6' }, h('div', {}, h('h1', { class: 't1', 'data-page-title': true }, title ?? 'Person'), h('p', { class: 'hint' }, `Who is in ${org.name}, what they can open, and why.`)));
  const strip = person ? h('a', { class: 'btn quiet sm backlink', href: '#/office/admin/people' }, h('span', { style: 'display:inline-flex;transform:scaleX(-1)' }, icon('right')), 'All people')
    : h('div', { class: 'tabs6', role: 'tablist' }, ...TABS.map(([k, l]) => h('a', { href: `#/office/admin/${k}`, role: 'tab', 'aria-selected': String(k === (tab === 'access' ? 'roles' : tab)) }, l)));
  put(root, head, strip, body);
  if (person) { personPage(person); call('members.list').then((m) => { const x = (m.data ?? []).find((y) => y.user_id === person); if (x && live()) head.querySelector('h1').textContent = x.display_name || x.email; }); }
  else ({ people, teammates, clients: clientsTab, roles, storage, branding, audit, access: accessV4 }[tab] ?? people)();
  // the V4 dialogs refresh their own pane when they finish: reload this tab then
  new MutationObserver(() => { if (!live()) return; if (person) personPage(person); else if (tab === 'people') people(); else if (tab === 'teammates') teammates(); }).observe(parts.pane, { childList: true });
  return root;
}
