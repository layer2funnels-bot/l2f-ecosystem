// Admin → Members and Access (design 05). Everything shown comes from the real permission catalog and the database; nothing is a sample.
// Rules enforced by the database and repeated here in plain words: the last owner can't be removed or demoted; only an owner changes an owner.
import { h, put, icon, pill, btn, link, dialog, toast, tabs, seg, field, notice, skeleton, errorState, emptyState, notFoundState } from '../ui.js';
import { hrefFor } from '../routes.js';
import { messageFor } from '../messages.js';

const LEVELS = ['owner', 'admin', 'editor', 'viewer'];
const LABEL = { owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };
const LEVEL_TEXT = { owner: 'Everything, including who else is an owner.', admin: 'Manages people and apps. Can’t change owners.', editor: 'Creates and edits records in the apps they’re given.', viewer: 'Can look, can’t change anything.' };
const RANK = Object.fromEntries(LEVELS.slice().reverse().map((r, i) => [r, i]));
const AREA = { platform: 'Admin', office: 'Office', funnels: 'Funnels records', clients: 'Clients', projects: 'Projects', drive: 'Drive', planner: 'Planner', portal: 'Client Portal' };
const areaOf = (permissionKey) => String(permissionKey).split('.')[0];      // the catalog groups by what a permission is about (funnels.*, clients.*), not by the app that hosts it
const areaName = (k) => AREA[k] ?? k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const EDIT_WORDS = new Set(['create', 'edit', 'manage', 'delete', 'write', 'update', 'share', 'archive', 'upload']);

const levelPill = (r) => pill(LABEL[r] ?? r, r === 'owner' ? 'pri' : '');
const statusPill = (s) => (s === 'active' ? pill('Active', 'ok', 'check') : s === 'invited' ? pill('Invited', 'warn', 'mail') : pill('Deactivated'));
const failText = (res) => (res.error?.code === 'not_found' ? 'That didn’t go through. Nothing was changed.' : messageFor(res.error?.code));

// ---- why chips (effective access): plain words for the database's reasons
export function reasonChips(reason) {
  const r = String(reason ?? '');
  if (r.startsWith('allow:role-')) return [`${LABEL[r.slice(11)] ?? 'Role'} level`];
  if (r === 'allow:owner-recovery') return ['Owner level'];
  if (r.startsWith('allow:level:')) return [`Level: ${r.slice(12)}`];
  if (r.startsWith('allow:override')) return ['Allowed directly'];
  if (r.startsWith('deny:override:deny-level:')) return ['Denied', 'Deny wins'];
  if (r.startsWith('deny:override')) return ['Denied directly', 'Deny wins'];
  if (r.startsWith('deny:level:')) return [`Denied by level: ${r.slice(11)}`, 'Deny wins'];
  if (r === 'deny:no-grant') return ['Not assigned'];
  if (r.startsWith('deny:role-floor-')) return [`Needs ${LABEL[r.slice(16)] ?? 'a higher'} level or above`];
  if (r === 'deny:app-not-available') return ['App not turned on'];
  if (r === 'deny:not-a-member') return ['Not a member'];
  return ['No access'];
}
// Folds the per-permission answers into one row per area: Can edit · Can view · No access.
export function foldEffective(rows) {
  const by = new Map();
  for (const x of rows) {
    const area = areaOf(x.permission_key);
    const a = by.get(area) ?? { area: areaName(area), edit: false, view: false, yes: new Set(), no: new Set() };
    const last = x.permission_key.split('.').pop();
    if (x.allowed) { if (EDIT_WORDS.has(last)) a.edit = true; else a.view = true; }
    for (const c of reasonChips(x.reason)) (x.allowed ? a.yes : a.no).add(c);
    by.set(area, a);
  }
  return [...by.values()].map((a) => {
    const result = a.edit ? 'edit' : a.view ? 'view' : 'none';
    const explicit = [...a.no].filter((c) => /^Denied|^Deny wins/.test(c));        // a real denial is always shown, it explains a missing ability
    const why = result === 'none' ? (explicit.length ? explicit : [...a.no]) : [...a.yes, ...explicit];
    return { area: a.area, result, why: [...new Set(why)].slice(0, 4).concat(why.length ? [] : ['Not assigned']) };
  });
}
// The Levels matrix is read from the permission catalog (the real rules): who gets what by default.
export function levelMatrix(perms) {
  const groups = new Map();
  for (const p of perms) {
    const need = Math.max(RANK[p.floor_role] ?? 0, RANK[p.default_role] ?? 0);
    const row = { text: p.description, cells: LEVELS.map((l) => RANK[l] >= need) };
    const area = areaOf(p.key ?? p.app_key);
    (groups.get(area) ?? groups.set(area, []).get(area)).push(row);
  }
  return [...groups].map(([app, rows]) => ({ app: areaName(app), rows }));
}

export function adminView({ api, live, org, role, route, rerender, go, clients }) {
  const isAdmin = role === 'owner' || role === 'admin';
  if (!isAdmin) return h('section', {}, notFoundState(hrefFor.office()));        // same screen as a page that doesn't exist (design 07)
  const tab = route.params.tab; const sub = route.params.sub ?? 'levels';
  const pane = h('div', { id: 'pane', role: 'tabpanel', 'aria-labelledby': `tab-${tab}` }, skeleton(4));
  const tabStrip = tabs([['members', 'Members'], ['access', 'Access'], ['storage', 'Storage']], tab, (k) => go(hrefFor.admin(k)), 'Admin sections');
  const section = h('section', {}, h('div', { class: 'crumb' }, `Office · Admin · ${org.name}`), h('h1', { 'data-page-title': true }, 'Admin'), h('p', { class: 'sub' }, `Who is in ${org.name}, what they can do, and how much file storage is used.`), tabStrip, pane);
  const run = (op, input) => api.call(op, input);
  const setPane = (...c) => { if (live()) put(pane, ...c); };

  // ------------------------------------------------------------ Members
  async function members() {
    const res = await run('members.list', {});
    if (!live()) return;
    if (!res.ok) return setPane(errorState(members));
    const list = res.data; const active = list.filter((m) => m.row_kind === 'member');
    const owners = active.filter((m) => m.role === 'owner' && m.status === 'active').length;
    const name = (m) => m.display_name || m.email || 'Someone';
    const rows = list.map((m) => h('tr', {},
      h('td', {}, h('div', { class: 'who2' }, h('span', { class: 'av', 'aria-hidden': 'true' }, name(m)[0].toUpperCase()), h('div', {}, h('b', {}, name(m), m.is_you ? ' (you)' : ''), h('div', { class: 'fine' }, m.email ?? '')))),
      h('td', { 'data-l': 'Level' }, levelPill(m.role)), h('td', { 'data-l': 'Status' }, statusPill(m.status)),
      h('td', {}, btn(['Manage', h('span', { class: 'sr' }, ` ${name(m)}`)], () => manage(m, owners), '', { 'data-manage': m.user_id ?? m.invitation_id }))));
    setPane(h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);margin-bottom:var(--space-3);flex-wrap:wrap' },
      h('p', { class: 'fine' }, `${list.length} ${list.length === 1 ? 'person' : 'people'}. Joining is by invitation only.`), btn([icon('plus'), 'Invite someone'], invite, 'pri', { id: 'invite' })),
    list.length ? h('div', { class: 'card tbl-wrap' }, h('table', { class: 'tbl stack' }, h('caption', { class: 'sr' }, `Members of ${org.name}`),
      h('thead', {}, h('tr', {}, h('th', {}, 'Person'), h('th', {}, 'Level'), h('th', {}, 'Status'), h('th', {}, h('span', { class: 'sr' }, 'Actions')))), h('tbody', {}, ...rows)))
      : emptyState({ title: 'No one yet', body: 'Invite someone to get started.', ic: 'user' }));
  }

  function invite() {
    const em = field({ id: 'ie', label: 'Email', type: 'email', autocomplete: 'off', inputmode: 'email' });
    const lv = field({ id: 'il', label: 'Level', options: LEVELS.filter((l) => l !== 'owner').map((l) => [l, LABEL[l]]), value: 'editor' });
    const hint = h('span', { class: 'hint', id: 'ild' }, LEVEL_TEXT.editor);
    lv.input.addEventListener('change', () => { hint.textContent = LEVEL_TEXT[lv.input.value]; });
    lv.el.insertBefore(hint, lv.el.querySelector('.err'));
    dialog({ title: 'Invite someone', wide: true, body: [em.el, lv.el, h('p', { class: 'fine' }, 'They’ll see nothing until they accept. You can change or cancel this any time.')],
      actions: [{ label: 'Send invitation', cls: 'pri', keep: true, on: async (close) => {
        em.ok(); const email = em.input.value.trim();
        if (!/^\S+@\S+\.\S+$/.test(email)) { em.error('Enter an email, like name@example.com.'); return false; }
        const r = await run('invitation.create', { email, kind: 'staff', role: lv.input.value });
        if (!r.ok) { em.error(failText(r)); return false; }
        close(); showInviteLink(email, r.data?.[0]?.token); members();
      } }, { label: 'Cancel' }] });
    em.input.focus();
  }
  // Email delivery is set up at go-live, so the invitation link is shown once for the admin to pass on.
  function showInviteLink(email, token) {
    if (!token) return toast(`Invitation saved for ${email}.`);
    const url = `${location.origin}/#/invite?token=${encodeURIComponent(token)}`;
    const f = field({ id: 'il2', label: 'Invitation link', value: url, readonly: true, hint: 'Email sending is switched on at go-live. Until then, send this link yourself. It only works for that email address.' });
    dialog({ title: `Invitation saved for ${email}`, wide: true, body: f.el, actions: [{ label: 'Copy link', cls: 'pri', keep: true, on: async () => { try { await navigator.clipboard.writeText(url); toast('Link copied.'); } catch { f.input.select(); toast('Select the link and copy it.', false); } return false; } }, { label: 'Done', focus: true }] });
    f.input.addEventListener('focus', () => f.input.select());
  }

  function manage(m, owners) {
    const nm = m.display_name || m.email;
    const isInvite = m.row_kind === 'invitation';
    const last = !isInvite && m.role === 'owner' && m.status === 'active' && owners <= 1;
    const ownerLock = role === 'admin' && m.role === 'owner';
    const lv = field({ id: 'ml', label: 'Level', options: LEVELS.map((l) => [l, LABEL[l]]), value: m.role, readonly: last || ownerLock || isInvite });
    const hint = h('span', { class: 'hint', id: 'mld' }, last ? '' : LEVEL_TEXT[m.role]); lv.el.insertBefore(hint, lv.el.querySelector('.err'));
    lv.input.addEventListener('change', () => { hint.textContent = LEVEL_TEXT[lv.input.value]; });
    const body = [lv.el,
      ownerLock ? notice('warn', 'lock', [h('b', {}, 'Only an owner can change an owner.'), ' You can still see this person’s level.']) : null,
      last ? notice('warn', 'lock', [h('b', {}, `${nm} is the only owner.`), ' An organization always needs one. Make someone else an owner first, then you can change this.']) : null,
      isInvite ? h('p', { class: 'fine' }, 'Invitation not accepted yet.') : null];
    const confirmThen = (verb) => dialog({ title: `${verb} ${nm}?`, body: h('p', {}, verb === 'Remove' ? `${nm} loses access to ${org.name} straight away. Their work stays here. You can invite them again later.`
      : verb === 'Reactivate' ? `${nm} can sign in to ${org.name} again.` : `${nm} can’t sign in to ${org.name} until you turn them back on. Nothing is deleted.`),
      actions: [{ label: verb, cls: verb === 'Reactivate' ? 'pri' : 'dng', on: async () => {
        const r = verb === 'Remove' ? await run('members.remove', { user: m.user_id }) : await run('members.setStatus', { user: m.user_id, status: verb === 'Reactivate' ? 'active' : 'deactivated' });
        if (!r.ok) { toast(failText(r), false); return; }
        toast(`${nm} ${verb === 'Remove' ? 'removed' : verb === 'Reactivate' ? 'is active again' : 'deactivated'}.`, verb === 'Reactivate'); members();
      } }, { label: 'Cancel', focus: true }] });
    const acts = ownerLock ? [{ label: 'Close', focus: true }] : [
      ...(!isInvite && !last ? [{ label: 'Save changes', cls: 'pri', on: async () => {
        if (lv.input.value === m.role) return;
        const r = await run('members.setRole', { user: m.user_id, role: lv.input.value });
        if (!r.ok) { toast(failText(r), false); return; }
        toast('Level updated.'); members();
      } }] : []),
      ...(isInvite ? [{ label: 'Cancel invitation', cls: 'dng', on: async () => { const r = await run('invitations.cancel', { id: m.invitation_id }); toast(r.ok ? 'Invitation cancelled.' : failText(r), false); members(); } }]
        : [{ label: m.status === 'deactivated' ? 'Reactivate' : 'Deactivate', keep: true, on: (close) => { if (last) { toast('The only owner can’t be deactivated.', false); return false; } close(); confirmThen(m.status === 'deactivated' ? 'Reactivate' : 'Deactivate'); } },
          { label: `Remove from ${org.name}`, cls: 'dng', keep: true, on: (close) => { if (last) { toast('The only owner can’t be removed.', false); return false; } close(); confirmThen('Remove'); } }]),
      { label: 'Close', focus: true }];
    dialog({ title: `Manage ${nm}`, wide: true, body, actions: acts });
  }

  // ------------------------------------------------------------ Access
  async function access() {
    const strip = h('div', { style: 'margin-bottom:var(--space-4)' }, seg([['levels', 'Levels'], ['assignments', 'Assignments'], ['effective', 'Effective access']], sub, (k) => go(hrefFor.admin('access', k)), 'Access views'));
    const body = h('div', {}, skeleton(4)); setPane(strip, body);
    if (sub === 'levels') return levels(body);
    if (sub === 'assignments') return assignments(body);
    return effective(body);
  }

  async function levels(body) {
    const [cat, custom] = await Promise.all([run('access.roles', {}), run('access.levels.list', {})]);
    if (!live()) return;
    if (!cat.ok) return put(body, errorState(access));
    const groups = levelMatrix(cat.data);
    const cell = (v) => h('td', {}, v ? h('span', { class: 'yes' }, icon('check'), h('span', { class: 'sr' }, 'Yes')) : [h('span', { class: 'no', 'aria-hidden': 'true' }, '–'), h('span', { class: 'sr' }, 'No')]);
    put(body, h('p', { class: 'fine', style: 'margin-bottom:var(--space-3)' }, 'Levels are the starting point. Assignments and denials refine them. ', h('b', {}, 'Deny always wins.')),
      h('div', { class: 'card tbl-wrap' }, h('table', { class: 'tbl' }, h('caption', { class: 'sr' }, 'What each level can do by default'),
        h('thead', {}, h('tr', {}, h('th', {}, 'Can they…'), ...LEVELS.map((l) => h('th', {}, LABEL[l])))),
        ...groups.map((g) => h('tbody', {}, h('tr', {}, h('th', { colspan: '5', scope: 'colgroup', style: 'background:var(--line);color:var(--ink)' }, g.app)), ...g.rows.map((r) => h('tr', {}, h('td', {}, r.text), ...r.cells.map(cell))))))),
      custom.ok && custom.data.length ? h('div', { style: 'margin-top:var(--space-5)' }, h('h3', {}, 'Levels you can assign'), h('p', { class: 'fine', style: 'margin:var(--space-1) 0 var(--space-3)' }, 'Extra levels for a single app or client. Give one to a person on the Assignments view.'),
        h('div', { class: 'card' }, h('ul', { class: 'rows' }, ...custom.data.map((l) => h('li', {}, h('span', {}, h('b', {}, l.name), h('br'), h('span', { class: 'fine' }, `${areaName(l.app_key)} · ${l.description ?? ''}`)), pill(`${l.permissions.length} abilities`)))))) : null,
      notice('info', 'info', 'The last owner can’t be removed or demoted. Every organization always has at least one.'));
  }

  async function assignments(body) {
    const [a, d, lv, ms] = await Promise.all([run('access.assignments.list', {}), run('access.denials.list', {}), run('access.levels.list', {}), run('members.list', {})]);
    if (!live()) return;
    if (!a.ok || !d.ok) return put(body, errorState(access));
    const where = (r) => (r.client_name ? `Client: ${r.client_name}` : r.project_id ? 'One project' : 'Whole organization');
    const items = [
      ...a.data.filter((x) => x.principal_type === 'user').map((x) => ({ kind: 'allow', person: x.person ?? 'Someone', level: x.level, app: x.app_key, where: where(x), from: 'Direct', remove: () => run('access.assignments.delete', { id: x.id }) })),
      ...d.data.map((x) => ({ kind: 'deny', person: x.person ?? 'Someone', level: x.level, app: x.app_key, where: where(x), from: x.reason ?? 'Direct', remove: () => run('access.denials.delete', { user: x.user_id, level: x.level_id, ...(x.client_id ? { client: x.client_id } : {}) }) }))];
    const people = ms.ok ? ms.data.filter((m) => m.row_kind === 'member' && m.status === 'active') : [];
    const table = items.length ? h('div', { class: 'card tbl-wrap' }, h('table', { class: 'tbl stack' }, h('caption', { class: 'sr' }, `Assignments in ${org.name}`),
      h('thead', {}, h('tr', {}, ...['Person', 'Access', 'Where', 'Comes from'].map((t) => h('th', {}, t)), h('th', {}, h('span', { class: 'sr' }, 'Remove')))),
      h('tbody', {}, ...items.map((x) => h('tr', {}, h('td', {}, h('b', {}, x.person)),
        h('td', { 'data-l': 'Access' }, x.kind === 'deny' ? pill(`Denied: ${x.level}`, 'bad', 'cross') : pill(`${areaName(x.app)} · ${x.level}`, 'pri')),
        h('td', { 'data-l': 'Where' }, x.where), h('td', { 'data-l': 'From', class: 'muted' }, x.from),
        h('td', {}, btn(['Remove', h('span', { class: 'sr' }, ` ${x.person} ${x.level}`)], () => dialog({ title: 'Remove this assignment?', body: h('p', {}, x.kind === 'deny' ? 'The restriction is lifted. Their other access stays as it is.' : 'Their other access stays as it is.'),
          actions: [{ label: 'Remove', cls: 'dng', on: async () => { const r = await x.remove(); toast(r.ok ? 'Assignment removed.' : failText(r), false); access(); } }, { label: 'Cancel', focus: true }] }))))))))
      : emptyState({ title: 'No assignments yet', body: 'Levels from the Levels view apply on their own. Add an assignment to give someone more, or take something away.', ic: 'key' });
    put(body, h('div', { style: 'display:flex;justify-content:space-between;gap:var(--space-3);margin-bottom:var(--space-3);flex-wrap:wrap' }, h('p', { class: 'fine' }, 'Give someone a level in one place, or take something away.'),
      btn([icon('plus'), 'Add assignment'], () => addAssignment(people, lv.ok ? lv.data : []), 'pri', { id: 'add-asg' })), table);
  }

  function addAssignment(people, levelList) {
    if (!people.length || !levelList.length) return toast('There is nobody or no level to choose from yet.', false);
    const who = field({ id: 'ap', label: 'Person', options: people.map((p) => [p.user_id, p.display_name || p.email]) });
    const lvl = field({ id: 'al', label: 'Level', options: levelList.map((l) => [l.id, `${areaName(l.app_key)} · ${l.name}`]) });
    const wh = field({ id: 'aw', label: 'Where', options: [['', 'Whole organization'], ...[...clients].map(([id, n]) => [id, `Client: ${n}`])] });
    const deny = h('input', { type: 'checkbox', id: 'ad' });
    const reason = field({ id: 'ar', label: 'Reason (kept in the audit history)', maxlength: 200 }); reason.el.hidden = true;
    deny.addEventListener('change', () => { reason.el.hidden = !deny.checked; });
    dialog({ title: 'Add assignment', wide: true, body: [who.el, lvl.el, wh.el, h('label', { class: 'chk', for: 'ad' }, deny, h('span', {}, h('b', {}, 'Deny instead'), h('br'), h('span', { class: 'fine' }, 'Blocks access here even if another rule allows it.'))), reason.el],
      actions: [{ label: 'Add', cls: 'pri', keep: true, on: async (close) => {
        reason.ok();
        const base = { user: who.input.value, level: lvl.input.value, ...(wh.input.value ? { client: wh.input.value } : {}) };
        if (deny.checked && !reason.input.value.trim()) { reason.error('Say why, in a few words.'); return false; }
        const r = deny.checked ? await run('access.denials.create', { ...base, reason: reason.input.value.trim() }) : await run('access.assignments.create', base);
        if (!r.ok) { toast(r.error?.code === 'invalid' ? 'That level can’t be given there. Pick a client for client levels, or the whole organization for the rest.' : failText(r), false); return false; }
        close(); toast(deny.checked ? 'Restriction added.' : 'Assignment added.'); access();
      } }, { label: 'Cancel' }] });
  }

  async function effective(body) {
    const ms = await run('members.list', {});
    if (!live()) return;
    if (!ms.ok) return put(body, errorState(access));
    const people = ms.data.filter((m) => m.row_kind === 'member');
    const pick = h('select', { id: 'ep' }, ...people.map((p) => h('option', { value: p.user_id }, p.display_name || p.email)));
    const out = h('div', {}, skeleton(3));
    const show = async () => {
      put(out, skeleton(3));
      const r = await run('access.effective', { user: pick.value });
      if (!live()) return;
      if (!r.ok) return put(out, errorState(show));
      const rows = foldEffective(r.data); const nm = pick.selectedOptions[0].textContent;
      put(out, h('div', { class: 'card tbl-wrap' }, h('table', { class: 'tbl stack' }, h('caption', { class: 'sr' }, `Effective access for ${nm}`),
        h('thead', {}, h('tr', {}, h('th', {}, 'Area'), h('th', {}, 'Result'), h('th', {}, 'Why'))),
        h('tbody', {}, ...rows.map((x) => h('tr', {}, h('td', {}, h('b', {}, x.area)),
          h('td', { 'data-l': 'Result' }, x.result === 'edit' ? pill('Can edit', 'ok', 'check') : x.result === 'view' ? pill('Can view', 'pri', 'eye') : pill('No access', 'bad', 'cross')),
          h('td', { 'data-l': 'Why' }, h('div', { class: 'why' }, ...x.why.map((w) => pill(w, /Deny|Denied/.test(w) ? 'bad' : ''))))))))),
      h('p', { class: 'fine', style: 'margin-top:var(--space-3)' }, 'This is the final answer the system gives, after levels, assignments and denials are combined.'));
    };
    pick.addEventListener('change', show);
    put(body, h('div', { class: 'fld', style: 'max-width:320px' }, h('label', { for: 'ep' }, 'Show access for'), pick), out);
    if (people.length) show(); else put(out, emptyState({ title: 'No members', ic: 'user' }));
  }

  // ------------------------------------------------------------ Storage: how much of the hard cap is used (the whole application shares one cap)
  const size = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} KB` : `${n} bytes`);
  async function storage() {
    const res = await run('storage.usage', {});
    if (!live()) return;
    if (!res.ok) return setPane(errorState(storage));
    const u = res.data[0]; const pct = u.cap_bytes ? Math.min(100, (u.total_bytes / u.cap_bytes) * 100) : 100;
    const level = pct >= 95 ? 'full' : pct >= 80 ? 'warn' : 'ok';
    const say = { ok: 'Plenty of room.', warn: 'Getting full. Delete files you no longer need, or plan for more storage.', full: 'Almost full. New uploads will be refused once the limit is reached.' }[level];
    const spaces = Object.entries(u.by_space ?? {});
    setPane(h('div', { class: 'card', 'data-storage': level, style: 'padding:var(--space-5);max-width:640px' },
      h('h2', { style: 'margin:0 0 var(--space-2)' }, 'File storage'),
      h('p', { id: 'storage-used', style: 'font-size:var(--text-lg);margin:0' }, h('b', {}, size(u.total_bytes)), ` of ${size(u.cap_bytes)} used`),
      h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)), 'aria-label': `Storage used: ${Math.round(pct)} percent`, style: 'height:10px;border-radius:5px;background:var(--line);margin:var(--space-3) 0;overflow:hidden' },
        h('div', { style: `height:100%;width:${pct.toFixed(1)}%;background:${level === 'ok' ? 'var(--primary)' : level === 'warn' ? 'var(--warn, #8a5200)' : 'var(--danger, #b42318)'}` })),
      h('p', { class: 'fine' }, say),
      h('p', { class: 'fine' }, 'The limit covers every organization on this system together. Only people with the Admin level see this page.'),
      h('table', { class: 'tbl', style: 'margin-top:var(--space-4)' }, h('caption', { class: 'sr' }, `Storage used by ${org.name}`),
        h('tbody', {}, h('tr', {}, h('th', { scope: 'row' }, `Used by ${org.name}`), h('td', { id: 'storage-org' }, size(u.org_bytes))),
          h('tr', {}, h('th', { scope: 'row' }, 'Files'), h('td', {}, String(u.files))), h('tr', {}, h('th', { scope: 'row' }, 'Stored versions'), h('td', {}, String(u.versions))),
          ...spaces.map(([k, v]) => h('tr', {}, h('th', { scope: 'row' }, { shared: 'Shared space', client: 'Client files', personal: 'Personal spaces' }[k] ?? k), h('td', {}, size(v))))))));
  }

  (tab === 'members' ? members : tab === 'storage' ? storage : access)();
  return section;
}
