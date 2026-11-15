// Tasks app (V8 01_APPLICATIONS/04_TASKS; prototype tasks6.js): Today with capture, Upcoming, Inbox, Teammates (People / Tasks I gave), a person,
// and lists with blocks, sub-tasks, completed tasks hidden in place, List · Board · Calendar, right-click menus, keyboard, timer, access.
// Markup and class names from the prototype; styles generated into pages/tasks.css (root .v8p-tasks). Data: tasks.* operations (migration 0059).
import { h, put, icon, btn, toast, dialog, skeleton, errorState, emptyState, notFoundState, avatar, roleLabel, initials } from '../ui.js';
import { plateOf, loadRegistry } from '../registry.js';
import { parseCapture, visibleTree, doneCount, dueChip, upcomingColumns, iso } from './tasksmodel.js';

const COLOURS = ['#0EA5A4', '#2B63F6', '#E8B820', '#FF8A6B', '#A898FF', '#13A592', '#E9488F', '#F07C1A'];
const ICONS = ['tasks', 'check', 'star', 'flag', 'target', 'rocket', 'heart', 'folder', 'team', 'cal'];
const TONES = ['#2B63F6', '#13A592', '#E8B820', '#FF8A6B', '#A898FF', '#5FDCCB', '#E9488F'];
const tone = (id) => TONES[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];
const OFFLINE_KEY = 'l2f.tasks.offline';
const state = { showDone: {}, view: {}, collapsed: new Set(), tab: 'people' };   // per list: show completed, List/Board/Calendar; collapsed parents; Teammates tab

export function tasksView({ api, ctx, route, org = null }) {
  const page = route.params?.page ?? 'today'; const id = route.params?.id ?? null;
  const root = h('div', { class: 'v8p-tasks' }); const body = h('div', {}, skeleton(4)); root.append(body);
  const call = (op, input = {}) => api.call(op, input);
  const fail = (r, what = 'save that') => toast(r?.status === 404 || r?.status === 403 ? 'You can’t change that here.' : `Couldn’t ${what}. Try again.`, false);
  let home = null; let team = []; let reg = (k) => ({ id: k });
  const people = () => team.map((p) => ({ id: p.user_id, name: p.display_name || p.email || 'Someone' }));
  const nameOf = (uid) => (uid === ctx.userId ? (ctx.userName || 'You') : team.find((p) => p.user_id === uid)?.display_name) || 'Someone';
  const av = (uid, size = 22) => { const a = avatar(nameOf(uid), size); a.style.setProperty('--av', tone(uid)); a.title = nameOf(uid); return a; };
  const listById = (lid) => home?.lists.find((l) => l.id === lid);
  const scoped = (...c) => h('div', { class: 'v8p-tasks' }, ...c);   // dialogs and menus live outside the page: keep the scoped styles

  // ---------------------------------------------------------------- sidebar (lists) and app bar (Add task)
  const side = h('div', { class: 'v8p-tasks tside' });
  root.__side = side;
  root.__barRight = btn([icon('plus'), h('span', { class: 'hide-m' }, 'Add task')], () => addTaskDialog({}), 'primary sm', { id: 'tasks-add' });
  const paintSide = () => {
    if (!home) return;
    const group = (space) => { const folders = home.folders.filter((f) => f.space === space); const lists = home.lists.filter((l) => l.space === space);
      const row = (l) => h('a', { href: `#/tasks/list/${l.id}`, ...(page === 'list' && id === l.id ? { 'aria-current': 'page' } : {}), 'data-list': l.id, oncontextmenu: (e) => { e.preventDefault(); listMenu(l, e.clientX, e.clientY); } },
        h('span', { class: 'tl-ic', style: `--c:${l.colour}` }, icon(l.icon)), h('span', {}, l.name), h('span', { class: 'count' }, l.open ? String(l.open) : ''));
      return [...lists.filter((l) => !l.folder_id || !folders.some((f) => f.id === l.folder_id)).map(row),
        // a folder is a row in the tree (not a card): open/close, its lists indented under it, + adds a list inside, ⋯ for the rest
        ...folders.map((f) => { const inside = lists.filter((l) => l.folder_id === f.id); const canAdd = f.level !== 'view';
          return h('details', { class: 'tfold', open: !state.closedFolders?.has(f.id), ontoggle: (e) => { state.closedFolders ??= new Set(); if (e.currentTarget.open) state.closedFolders.delete(f.id); else state.closedFolders.add(f.id); } },
            h('summary', { class: 'tfold-h', oncontextmenu: (e) => { e.preventDefault(); folderMenu(f, e.clientX, e.clientY); } }, h('span', { class: 'tw' }, icon('down')), icon('folder'), h('span', { class: 'nm' }, f.name), h('span', { class: 'count' }, inside.length ? String(inside.length) : ''),
              canAdd ? h('button', { class: 'iconbtn xs fa', type: 'button', 'aria-label': `New list in ${f.name}`, title: `New list in ${f.name}`, onclick: (e) => { e.preventDefault(); e.stopPropagation(); newListDialog({ folder: f }); } }, icon('plus')) : null,
              h('button', { class: 'iconbtn xs fa', type: 'button', 'aria-label': `Folder menu: ${f.name}`, onclick: (e) => { e.preventDefault(); e.stopPropagation(); const b = e.currentTarget.getBoundingClientRect(); folderMenu(f, b.left - 180, b.bottom + 4); } }, icon('more'))),
            h('div', { class: 'tfold-in' }, ...inside.map(row), inside.length ? null : (canAdd ? h('button', { class: 'tfold-empty', type: 'button', onclick: () => newListDialog({ folder: f }) }, icon('plus'), 'Add a list to this folder') : h('p', { class: 'tfold-empty' }, 'No lists yet')))); })]; };
    side.replaceChildren(
      h('details', { class: 'coll', open: true }, h('summary', { class: 'side-sec sx' }, icon('down'), icon('lock'), ' Personal'), h('div', { class: 'side-list' }, ...group('personal'))),
      h('details', { class: 'coll', open: true }, h('summary', { class: 'side-sec sx' }, icon('down'), icon('team'), ` Team · ${ctx.orgName}`), h('div', { class: 'side-list' }, ...group('team'))),
      h('button', { class: 'addrow', type: 'button', onclick: () => newListDialog() }, icon('plus'), 'New list or folder'));
    for (const [k, n] of [['today', home.counts.today], ['inbox', home.counts.inbox]]) { const a = document.querySelector(`.side .nav a[data-key="${k}"]`); if (a) { a.querySelector('.count')?.remove(); if (n) a.append(h('span', { class: 'count' }, String(n))); } }
  };
  const refreshHome = async () => { const r = await call('tasks.home'); if (r.ok) { home = r.data[0]; paintSide(); } return r; };

  // ---------------------------------------------------------------- context menu (V8 .ctx): Esc closes, arrows move, long-press on touch
  let openMenu = null;
  function ctxMenu(items, x, y) {
    openMenu?.(); const el = h('div', { class: 'ctx', role: 'menu', style: `position:fixed;left:${Math.min(x, innerWidth - 250)}px;top:${Math.min(y, innerHeight - 40 - items.length * 34)}px;z-index:80` });
    const close = () => { el.remove(); document.removeEventListener('pointerdown', away, true); openMenu = null; }; const away = (e) => { if (!el.contains(e.target)) close(); };
    for (const it of items) { if (it === '-') { el.append(h('hr', { role: 'separator' })); continue; }
      const [ic, label, on, cls, key] = it; el.append(h('button', { type: 'button', role: 'menuitem', class: cls ?? '', onclick: () => { close(); on(); } }, icon(ic), h('span', {}, label), key ? h('kbd', {}, key) : null)); }
    el.addEventListener('keydown', (e) => { const b = [...el.querySelectorAll('button')]; const i = b.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key === 'ArrowDown') { e.preventDefault(); b[(i + 1) % b.length].focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); b[(i - 1 + b.length) % b.length].focus(); } });
    root.append(el); el.querySelector('button')?.focus(); setTimeout(() => document.addEventListener('pointerdown', away, true), 0); openMenu = close;
  }
  const longPress = (el, fn) => { let t = null; el.addEventListener('touchstart', (e) => { const p = e.touches[0]; t = setTimeout(() => fn(p.clientX, p.clientY), 550); }, { passive: true }); for (const ev of ['touchend', 'touchmove', 'touchcancel']) el.addEventListener(ev, () => clearTimeout(t), { passive: true }); };

  // ---------------------------------------------------------------- dialogs
  // V8 people picker (tasks6 `newlist`): a row of toggle chips (avatar + first name). With access levels, each chosen person gets a small
  // Can edit / Can view switch underneath; "Everyone" chooses the whole team. You are not in the list: the creator always has access.
  function peoplePicker(selected = [], { levels = null } = {}) {
    const sel = new Map(selected.map((s) => (typeof s === 'string' ? [s, 'edit'] : [s.user, s.level])));
    const others = () => people().filter((p) => !levels || p.id !== ctx.userId);
    const q = h('input', { placeholder: levels ? 'Find people' : 'Search people', 'aria-label': 'Search people', type: 'search' });
    const chipsEl = h('div', { class: 'chipsel ppchips' }); const lvEl = h('div', { class: 'pplv' });
    const paint = () => {
      const t = q.value.trim().toLowerCase(); const all = others(); const everyone = all.length > 0 && all.every((p) => sel.has(p.id));
      chipsEl.replaceChildren(...(levels && all.length > 1 && !t ? [h('button', { type: 'button', class: 'chip sm', 'aria-pressed': String(everyone), onclick: () => { if (everyone) for (const p of all) sel.delete(p.id); else for (const p of all) if (!sel.has(p.id)) sel.set(p.id, 'edit'); paint(); } }, icon('team'), 'Everyone')] : []),
        ...all.filter((p) => !t || p.name.toLowerCase().includes(t)).map((p) => h('button', { type: 'button', class: 'chip sm', 'aria-pressed': String(sel.has(p.id)), title: p.name,
          onclick: () => { if (sel.has(p.id)) sel.delete(p.id); else sel.set(p.id, 'edit'); paint(); } }, av(p.id, 18), all.filter((o) => o.name.split(' ')[0] === p.name.split(' ')[0]).length > 1 ? p.name : p.name.split(' ')[0])));
      if (!all.length) chipsEl.replaceChildren(h('p', { class: 'hint' }, 'No teammates to add yet.'));
      lvEl.replaceChildren(...(levels ? all.filter((p) => sel.has(p.id)).map((p) => h('div', { class: 'pplv-row' }, av(p.id, 22), h('span', { class: 'grow' }, p.name),
        h('div', { class: 'seg3 xs', role: 'radiogroup', 'aria-label': `${p.name}: access` }, ...[['edit', 'Can edit'], ['view', 'Can view']].map(([k, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(sel.get(p.id) === k), onclick: () => { sel.set(p.id, k); paint(); } }, l))))) : []));
    };
    q.addEventListener('input', paint); paint();
    return { el: [people().length > 8 ? h('label', { class: 'inp sm', style: 'margin:8px 0' }, icon('search'), q) : null, chipsEl, lvEl].filter(Boolean), value: () => [...sel].map(([user, level]) => (levels ? { user, level } : user)) };
  }
  function addTaskDialog({ due = null, list = null, forUser = null }) {
    const text = h('input', { placeholder: 'What needs doing? e.g. “Call Harry tomorrow 3pm !high”', 'aria-label': 'Task' }); const pick = peoplePicker(forUser ? [forUser] : []);
    const ls = h('select', { 'aria-label': 'List' }, h('option', { value: '' }, 'Inbox (sort later)'), ...(home?.lists ?? []).filter((l) => ['owner', 'edit'].includes(l.level)).map((l) => h('option', { value: l.id }, `${l.name}${l.space === 'team' ? ' · Team' : ''}`)));
    ls.value = list ?? (forUser ? '' : home?.mine ?? '');
    const dd = h('input', { type: 'date', 'aria-label': 'Due date', value: due ?? '' });
    dialog({ title: 'Add a task', body: scoped(h('div', { class: 'field', style: 'margin-top:12px' }, h('label', {}, 'Task'), text), h('div', { class: 'field' }, h('label', {}, 'For'), ...pick.el),
      h('div', { class: 'row2' }, h('div', { class: 'field' }, h('label', {}, 'List'), ls), h('div', { class: 'field' }, h('label', {}, 'Due'), dd))),
    actions: [{ label: 'Add task', cls: 'primary', on: async () => {
      const p = parseCapture(text.value, { people: people(), lists: home?.lists ?? [] }); if (!p.title) { toast('Write the task first.', false); return false; }
      const assignees = [...new Set([...pick.value(), ...p.people])];
      const r = await call('tasks.items.create', { title: p.title, ...(p.list ?? ls.value ? { list: p.list ?? ls.value } : {}), ...(dd.value || p.due_date ? { due_date: dd.value || p.due_date } : {}), ...(p.due_time ? { due_time: p.due_time } : {}), priority: p.priority, ...(assignees.length ? { assignees } : {}) });
      if (!r.ok) { fail(r, 'add the task'); return false; } toast(assignees.length > 1 ? `Added for ${assignees.length} people.` : 'Task added.'); await refreshHome(); render(); } }, { label: 'Cancel' }] });
    setTimeout(() => text.focus(), 0);
  }
  function accessDialog({ list = null, folder = null, name, current = [] }) {
    const pick = peoplePicker(current, { levels: true });
    dialog({ title: `Who can open “${name}”`, body: scoped(...pick.el, h('p', { class: 'hint' }, 'Applies to every block and task in this list. Folders pass access to the lists inside.')),
      actions: [{ label: 'Save access', cls: 'primary', on: async () => { const r = await call('tasks.access.set', { ...(list ? { list } : { folder }), entries: pick.value() }); if (!r.ok) { fail(r, 'save access'); return false; } toast('Access saved.'); render(); } }, { label: 'Cancel' }] });
  }
  function newListDialog({ folder: preset = null } = {}) {
    let kind = 'list'; const name = h('input', { 'aria-label': 'Name', maxlength: 120 }); const canTeam = ctx.canAnywhere('tasks.team.create');
    const where = h('select', { 'aria-label': 'Where' }, h('option', { value: 'personal' }, 'Personal · only you'), ...(canTeam ? [h('option', { value: 'team' }, `Team · ${ctx.orgName}`)] : []));
    const folderSel = h('select', { 'aria-label': 'Folder' }, h('option', { value: '' }, 'No folder'), ...(home?.folders ?? []).map((f) => h('option', { value: f.id }, `${f.name} · ${f.space === 'team' ? 'Team' : 'Personal'}`)));
    const pick = peoplePicker([], { levels: true }); const ppl = h('div', { class: 'field' }, h('label', {}, 'People'), ...pick.el);
    const seg = h('div', { class: 'seg3', style: 'margin-top:12px', role: 'radiogroup' }); const fRow = h('div', { class: 'field' }, h('label', {}, 'Folder'), folderSel);
    const hintEl = h('p', { class: 'hint' });
    const paint = () => { seg.replaceChildren(...[['list', 'tasks', 'List'], ['folder', 'folder', 'Folder']].map(([k, ic, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(kind === k), onclick: () => { kind = k; paint(); } }, icon(ic), l)));
      hintEl.textContent = kind === 'folder' ? 'A folder groups lists, like “Clients” holding one list per client. People you add here can open every list inside it.' : 'A list holds tasks in blocks. Put it in a folder to keep related lists together.';
      // the folder choice follows "Where": a personal list goes in a personal folder, a team list in a team folder
      const sp = where.value; for (const o of folderSel.options) if (o.value) o.hidden = (home?.folders ?? []).find((f) => f.id === o.value)?.space !== sp; if (folderSel.selectedOptions[0]?.hidden) folderSel.value = '';
      ppl.hidden = sp !== 'team'; fRow.hidden = kind === 'folder' || !folderSel.querySelectorAll('option:not([hidden])').length || folderSel.options.length < 2; };
    if (preset) { where.value = preset.space; folderSel.value = preset.id; }
    where.addEventListener('change', paint); paint();
    dialog({ title: preset ? `New list in ${preset.name}` : 'New list or folder', body: scoped(preset ? null : seg, preset ? null : hintEl, h('div', { class: 'field' }, h('label', {}, 'Name'), name), h('div', { class: 'field' }, h('label', {}, 'Where'), where), fRow, ppl),
      actions: [{ label: 'Create', cls: 'primary', on: async () => {
        if (!name.value.trim()) { toast('Give it a name.', false); return false; }
        const f = folderSel.value ? home.folders.find((x) => x.id === folderSel.value) : null; const space = f ? f.space : where.value;
        const r = await call(kind === 'folder' ? 'tasks.folders.create' : 'tasks.lists.create', { name: name.value.trim(), space, ...(kind === 'list' && f ? { folder: f.id } : {}) });
        if (!r.ok) { fail(r, 'create it'); return false; }
        if (space === 'team' && pick.value().length) await call('tasks.access.set', { [kind === 'folder' ? 'folder' : 'list']: r.data[0].id, entries: pick.value() });
        toast('Created.'); await refreshHome(); if (kind === 'list') ctx.go(`#/tasks/list/${r.data[0].id}`); } }, { label: 'Cancel' }] });
    setTimeout(() => name.focus(), 0);
  }
  function listMenu(l, x, y) {
    const own = l.level === 'owner'; const edit = ['owner', 'edit'].includes(l.level);
    ctxMenu([
      ...(edit ? [['edit', 'Rename', () => rename('list', l)], ['brand', 'Icon and colour', () => looks(l)]] : []),
      ['copy', 'Duplicate', async () => { const r = await call('tasks.lists.duplicate', { id: l.id }); if (!r.ok) return fail(r, 'duplicate'); toast('Duplicated.'); await refreshHome(); ctx.go(`#/tasks/list/${r.data[0].id}`); }],
      ...(l.space === 'team' && edit ? [['share', 'Share / access', async () => { const g = await call('tasks.lists.get', { id: l.id }); accessDialog({ list: l.id, name: l.name, current: (g.data?.[0]?.access ?? []).filter((a) => a.via === 'list').map((a) => ({ user: a.user_id, level: a.level })) }); }]] : []),
      ...(own && (home?.folders ?? []).some((f) => f.space === l.space) ? [['folder', 'Move to folder…', () => {
        ctxMenu([...(home.folders.filter((f) => f.space === l.space && f.id !== l.folder_id).map((f) => ['folder', f.name, async () => { const u = await call('tasks.lists.update', { id: l.id, folder: f.id }); if (!u.ok) return fail(u, 'move it'); toast(`Moved to ${f.name}.`); await refreshHome(); render(); }])),
          ...(l.folder_id ? [['x', 'Out of the folder', async () => { const u = await call('tasks.lists.update', { id: l.id, no_folder: true }); if (!u.ok) return fail(u, 'move it'); toast('Moved out of the folder.'); await refreshHome(); render(); }]] : [])], x, y); }]] : []),
      ...(edit ? [['projects', 'Turn into a project', () => turnIntoProject(l)]] : []),
      ...(own && !l.is_default ? ['-', ['archive', 'Archive', async () => { const r = await call('tasks.lists.update', { id: l.id, archived: true }); if (!r.ok) return fail(r, 'archive'); toast('Archived.'); await refreshHome(); if (id === l.id) ctx.go('#/tasks/today'); }, 'danger']] : []),
    ], x, y);
  }
  function folderMenu(f, x, y) {
    ctxMenu([...(f.level !== 'view' ? [['plus', 'New list in this folder', () => newListDialog({ folder: f })]] : []), ['edit', 'Rename', () => rename('folder', f)], ...(f.space === 'team' ? [['share', 'Share / access', () => accessDialog({ folder: f.id, name: f.name })]] : []),
      ['archive', 'Archive folder', async () => { const r = await call('tasks.folders.update', { id: f.id, archived: true }); if (!r.ok) return fail(r, 'archive'); toast('Folder archived. Its lists stay.'); refreshHome(); }, 'danger']], x, y);
  }
  function rename(kind, o) {
    const i = h('input', { value: o.name, maxlength: 120, 'aria-label': 'Name' });
    dialog({ title: `Rename ${kind}`, body: scoped(h('div', { class: 'field', style: 'margin-top:12px' }, i)), actions: [{ label: 'Save', cls: 'primary', on: async () => {
      const r = await call(kind === 'folder' ? 'tasks.folders.update' : 'tasks.lists.update', { id: o.id, name: i.value.trim() }); if (!r.ok) { fail(r, 'rename'); return false; } await refreshHome(); render(); } }, { label: 'Cancel' }] });
  }
  function looks(l) {
    let c = l.colour; let ic = l.icon; const box = h('div', {});
    const paint = () => box.replaceChildren(h('div', { class: 'chiprow' }, ...COLOURS.map((x) => h('button', { type: 'button', class: 'chip sm', 'aria-pressed': String(x === c), 'aria-label': `Colour ${x}`, onclick: () => { c = x; paint(); } }, h('span', { class: 'tl-ic', style: `--c:${x}` })))),
      h('div', { class: 'chiprow', style: 'margin-top:8px' }, ...ICONS.map((x) => h('button', { type: 'button', class: 'chip sm', 'aria-pressed': String(x === ic), 'aria-label': `Icon ${x}`, onclick: () => { ic = x; paint(); } }, icon(x)))));
    paint();
    dialog({ title: 'Icon and colour', body: scoped(box), actions: [{ label: 'Save', cls: 'primary', on: async () => { const r = await call('tasks.lists.update', { id: l.id, colour: c, icon: ic }); if (!r.ok) { fail(r); return false; } await refreshHome(); render(); } }, { label: 'Cancel' }] });
  }
  async function pickProject(title) {
    const r = await call('pm.projects.list', { args: { scope: 'active' } }); const ps = r.ok ? (r.data?.[0]?.r ?? []) : [];
    if (!ps.length) { toast('No project you can add tasks to.', false); return null; }
    return new Promise((resolve) => { const s = h('select', { 'aria-label': 'Project' }, ...ps.filter((p) => !p.archived && !p.isTemplate && !p.archivedAt).map((p) => h('option', { value: p.id }, p.name)));
      dialog({ title, body: scoped(h('div', { class: 'field', style: 'margin-top:12px' }, h('label', {}, 'Project'), s), h('p', { class: 'hint' }, 'It moves into Projects and leaves a link here.')), onClose: () => resolve(null),
        actions: [{ label: 'Send', cls: 'primary', on: () => resolve(s.value) }, { label: 'Cancel', on: () => resolve(null) }] }); });
  }
  async function sendToProject(it) {
    const pid = await pickProject('Send to a project'); if (!pid) return;
    const base = { projectId: pid, title: it.title, ...(it.due_date ? { dueOn: String(it.due_date).slice(0, 10) } : {}), ...(it.priority === 'high' ? { priority: 'high' } : {}) };
    let r = await call('pm.tasks.create', { args: { ...base, ...(it.assignees?.length ? { assigneeIds: it.assignees } : {}) } });
    if (!r.ok && it.assignees?.length) r = await call('pm.tasks.create', { args: base });   // assignees who aren't in that project: send it unassigned
    const pt = r.ok ? r.data?.[0]?.r : null; if (!pt?.id) return fail(r, 'send it');
    const u = await call('tasks.items.update', { id: it.id, done: true, project_task: pt.id, project: pid }); if (!u.ok) return fail(u);
    toast('Sent to Projects; it links back here.'); render();
  }
  async function turnIntoProject(l) {
    const g = await call('tasks.lists.get', { id: l.id }); const open = (g.data?.[0]?.items ?? []).filter((x) => !x.done_at && !x.parent_id && !x.private);
    const r = await call('pm.projects.create', { args: { name: l.name } }); const p = r.ok ? r.data?.[0]?.r : null; if (!p?.id) return fail(r, 'create the project');
    for (const it of open) { const t = await call('pm.tasks.create', { args: { projectId: p.id, title: it.title, ...(it.due_date ? { dueOn: String(it.due_date).slice(0, 10) } : {}) } }); if (t.ok && t.data?.[0]?.r?.id) await call('tasks.items.update', { id: it.id, done: true, project_task: t.data[0].r.id, project: p.id }); }
    toast(`Project “${l.name}” created with ${open.length} task${open.length === 1 ? '' : 's'}.`); ctx.go(`#/projects/p/${p.id}/list`);
  }
  function dueDialog(it) {
    const d = h('input', { type: 'date', value: it.due_date ?? '', 'aria-label': 'Date' }); const t = h('input', { type: 'time', value: it.due_time?.slice(0, 5) ?? '', 'aria-label': 'Time' });
    dialog({ title: 'Due date', body: scoped(h('div', { class: 'row2', style: 'margin-top:12px' }, h('div', { class: 'field' }, h('label', {}, 'Date'), d), h('div', { class: 'field' }, h('label', {}, 'Time (optional)'), t))),
      actions: [{ label: 'Save', cls: 'primary', on: () => upd(it, d.value ? { due_date: d.value, due_time: t.value || '' } : { clear_due: true }) }, { label: 'No date', on: () => upd(it, { clear_due: true }) }, { label: 'Cancel' }] });
  }
  function assignDialog(it) {
    const pick = peoplePicker(it.assignees ?? []);
    dialog({ title: 'Assign people', body: scoped(...pick.el, h('p', { class: 'hint' }, 'Everyone ticked is responsible. Tick several at once.')),
      actions: [{ label: 'Assign', cls: 'primary', on: async () => { const v = pick.value(); const ok = await upd(it, { assignees: v }); if (ok) toast(v.length ? `Assigned to ${v.length} ${v.length === 1 ? 'person' : 'people'}.` : 'Nobody assigned.'); } }, { label: 'Cancel' }] });
  }

  // ---------------------------------------------------------------- task actions
  async function upd(it, patch, quiet = true) { const r = await call('tasks.items.update', { id: it.id, ...patch }); if (!r.ok || !r.data?.[0]) { fail(r); return false; } Object.assign(it, r.data[0]); if (!quiet) toast('Saved.'); render(); return true; }
  async function complete(it, el) {
    const on = !it.done_at; const r = await call('tasks.items.update', { id: it.id, done: on }); if (!r.ok || !r.data?.[0]) return fail(r);
    Object.assign(it, r.data[0]); document.dispatchEvent(new CustomEvent('l2f:timer'));
    if (on && !(id && state.showDone[id]) && el) { el.classList.add('done'); toast('Done. Hidden from the list; “Show completed” brings it back in place.'); setTimeout(() => { refreshHome(); render(); }, 600); }
    else { refreshHome(); render(); }
  }
  async function del(it) {
    const snap = { ...it }; const r = await call('tasks.items.delete', { id: it.id }); if (!r.ok) return fail(r, 'delete');
    await refreshHome(); render();
    dialogToastUndo(async () => { const back = await call('tasks.items.create', { id: snap.id, title: snap.title, ...(snap.list_id ? { list: snap.list_id } : {}), ...(snap.block_id ? { block: snap.block_id } : {}), ...(snap.parent_id ? { parent: snap.parent_id } : {}),
      ...(snap.due_date ? { due_date: snap.due_date } : {}), ...(snap.due_time ? { due_time: snap.due_time.slice(0, 5) } : {}), priority: snap.priority, private: snap.private, notes: snap.notes, ...(snap.assignees?.length ? { assignees: snap.assignees } : {}) });
    if (!back.ok) return fail(back, 'undo'); await refreshHome(); render(); toast('Restored.'); });
  }
  const dialogToastUndo = (undo) => toast('Deleted.', true, { label: 'Undo', on: undo });   // V8: "Deleted. Undo?"

  async function timer(it) {
    const run = await call('timer.running'); const cur = run.ok ? run.data?.[0] : null;
    const r = cur?.app === 'tasks' && cur.ref === it.id ? await call('tasks.timer.stop') : await call('tasks.timer.start', { item: it.id });
    if (!r.ok) return fail(r, 'start the timer');
    toast(cur?.app === 'tasks' && cur.ref === it.id ? 'Timer stopped and logged.' : 'Timer started. It stays in the top bar.'); document.dispatchEvent(new CustomEvent('l2f:timer')); render();
  }
  function taskMenu(it, list, x, y) {
    const edit = !list || ['owner', 'edit'].includes(list.level) || it.created_by === ctx.userId;
    const blocks = list?.blocks ?? [];
    ctxMenu([
      ['check', it.done_at ? 'Mark not done' : 'Complete', () => complete(it), '', 'Ctrl Enter'], ['timer', 'Start timer', () => timer(it)],
      ...(edit && list ? [['plus', 'Add sub-task', () => addBelow(it, list, { child: true })]] : []),
      ...(edit ? [['users', 'Assign people…', () => assignDialog(it)], ['cal', 'Due date…', () => dueDialog(it)], ['flag', it.priority === 'high' ? 'Normal priority' : 'High priority', () => upd(it, { priority: it.priority === 'high' ? 'normal' : 'high' })]] : []),
      ...(edit && list?.space === 'personal' ? [['lock', it.private ? 'Make visible' : 'Make private', async () => { if (await upd(it, { private: !it.private })) toast(it.private ? 'Only you can see it now.' : 'Visible again.'); }]] : []),
      '-',
      ...(edit && blocks.length > 1 ? [['layers', 'Move to block…', () => ctxMenu(blocks.filter((b) => b.id !== it.block_id).map((b) => ['layers', b.name, () => upd(it, { block: b.id, no_parent: true })]), x + 20, y)]] : []),
      ...(edit ? [['folder', 'Move to list…', () => ctxMenu([...(home?.lists ?? []).filter((l) => l.id !== it.list_id && ['owner', 'edit'].includes(l.level)).map((l) => ['tasks', l.name, async () => { if (await upd(it, { list: l.id })) { toast(`Moved to ${l.name}.`); refreshHome(); } }]),
        ['inbox', 'Inbox', () => upd(it, { to_inbox: true })]], x + 20, y)], ['projects', 'Send to a project', () => sendToProject(it)]] : []),
      ...(edit && list ? [['copy', 'Duplicate', async () => { const r = await call('tasks.items.create', { list: list.id, block: it.block_id, after: it.id, title: it.title, priority: it.priority, private: it.private, ...(it.due_date ? { due_date: it.due_date } : {}), ...(it.parent_id ? { parent: it.parent_id } : {}) }); if (!r.ok) return fail(r); toast('Duplicated.'); render(); }]] : []),
      ['link', 'Copy link', async () => { try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/tasks/list/${it.list_id ?? ''}?task=${it.id}`); toast('Link copied.'); } catch { toast('Couldn’t copy.', false); } }],
      ...(edit ? ['-', ['trash', 'Delete', () => del(it), 'danger', 'Del']] : []),
    ], x, y);
  }
  // one create at a time per place: on a slow connection a second Enter or click must not make a second task (live, 15 Nov 2026: duplicates)
  const creating = new Set(); const once = async (key, fn) => { if (creating.has(key)) return; creating.add(key); try { return await fn(); } finally { creating.delete(key); } };
  async function addBelow(it, list, { child = false } = {}) { return once(`below:${it.id}`, () => addBelow1(it, list, { child })); }
  async function addBelow1(it, list, { child = false } = {}) {
    const r = await call('tasks.items.create', { list: list.id, block: it.block_id ?? undefined, ...(child ? { parent: it.id } : { after: it.id, ...(it.parent_id ? { parent: it.parent_id } : {}) }), title: 'New task' });
    if (!r.ok) return fail(r, 'add a task'); state.focus = r.data[0].id; refreshHome(); render();
  }

  // ---------------------------------------------------------------- one task row (outline)
  function row(it, list, { depth = 0, kids = false, path = '' } = {}) {
    const edit = !list || ['owner', 'edit'].includes(list.level) || it.created_by === ctx.userId; const can = edit || (it.assignees ?? []).includes(ctx.userId);
    const runningHere = state.running?.app === 'tasks' && state.running.ref === it.id;
    const t = h('span', { class: 'ol-t', contenteditable: String(edit), spellcheck: 'false', role: 'textbox', 'aria-label': `Task: ${it.title}` }, it.title);
    const li = h('li', { class: `ol-i ${it.done_at ? 'done' : ''}`.trim(), 'data-task': it.id, 'data-path': path });
    const cb = h('button', { class: 'ol-cb', type: 'button', role: 'checkbox', 'aria-checked': String(Boolean(it.done_at)), 'aria-label': `Complete ${it.title}`, disabled: !can, onclick: () => complete(it, li) }, h('i', {}, icon('check')));
    const due = dueChip(it.due_date, it.due_time);
    li.append(h('div', { class: 'ol-row', style: `--d:${depth}` }, h('span', { class: 'grip', 'aria-hidden': 'true' }, icon('grip')),
      kids ? h('button', { class: 'ol-tw', type: 'button', 'aria-label': state.collapsed.has(it.id) ? 'Expand' : 'Collapse', 'aria-expanded': String(!state.collapsed.has(it.id)), onclick: () => { if (state.collapsed.has(it.id)) state.collapsed.delete(it.id); else state.collapsed.add(it.id); render(); } }, icon('down')) : h('span', { class: 'ol-tw' }),
      cb, t, it.private ? h('span', { class: 'pill', style: 'height:20px' }, icon('lock'), 'Private') : null,
      it.project_task_id ? h('a', { class: 'pill blue', style: 'height:20px', href: `#/projects/p/${it.project_id}/list?task=${it.project_task_id}`, title: 'Sent to Projects' }, icon('projects'), 'In Projects') : null,
      it.assignees?.length ? h('span', { class: 'av-stack sm' }, ...it.assignees.slice(0, 4).map((u) => av(u, 22))) : null,
      it.priority === 'high' ? h('span', { class: 'pflag', style: '--c:#F07C1A', title: 'High priority' }, icon('flag')) : null,
      due ? h('span', { class: `due-c ${due.tone}`.trim() }, due.text) : null,
      it.list_name && !list ? h('small', { class: 'muted' }, it.list_name) : null,
      h('button', { class: `iconbtn xs ol-timer ${runningHere ? 'on' : ''}`.trim(), type: 'button', title: runningHere ? 'Stop timer' : 'Start timer', 'aria-label': runningHere ? `Stop timer on ${it.title}` : `Start timer on ${it.title}`, onclick: () => timer(it) }, icon(runningHere ? 'pause' : 'timer')),
      h('button', { class: 'iconbtn xs ol-more', type: 'button', 'aria-label': `Task menu: ${it.title}`, onclick: (e) => { const b = e.currentTarget.getBoundingClientRect(); taskMenu(it, list, b.left - 200, b.bottom + 4); } }, icon('more'))));
    li.addEventListener('contextmenu', (e) => { e.preventDefault(); taskMenu(it, list, e.clientX, e.clientY); });
    longPress(li, (x, y) => taskMenu(it, list, x, y));
    // phone: swipe right to complete
    let sx = null; li.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true }); li.addEventListener('touchend', (e) => { if (sx != null && e.changedTouches[0].clientX - sx > 90 && can) complete(it, li); sx = null; }, { passive: true });
    if (edit) {
      const save = async () => { const v = t.textContent.trim(); if (v && v !== it.title) { const r = await call('tasks.items.update', { id: it.id, title: v }); if (r.ok && r.data?.[0]) Object.assign(it, r.data[0]); else fail(r); } else if (!v) t.textContent = it.title; };
      t.addEventListener('blur', save);
      t.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); await save(); complete(it, li); }
        else if (e.key === 'Enter') { e.preventDefault(); await save(); if (list) addBelow(it, list); }
        else if (e.key === 'Escape') { e.preventDefault(); t.blur(); }   // V8: Esc leaves editing (what was typed is kept)
        else if (e.key === 'Tab' && list) { e.preventDefault(); await save(); const sib = state.siblings?.get(it.id);
          if (e.shiftKey) { if (it.parent_id) { const parent = list.items.find((x) => x.id === it.parent_id); state.focus = it.id; await upd(it, parent?.parent_id ? { parent: parent.parent_id, position: parent.position + 0.5 } : { no_parent: true, position: (parent?.position ?? 0) + 0.5 }); } }
          else if (sib?.prev) { state.focus = it.id; await upd(it, { parent: sib.prev.id, position: 1e6 }); } }
        else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && list) { e.preventDefault(); const sib = state.siblings?.get(it.id); const other = e.key === 'ArrowUp' ? sib?.prev : sib?.next; if (!other) return;
          state.focus = it.id; await call('tasks.items.update', { id: other.id, position: it.position }); await upd(it, { position: other.position }); }
      });
    }
    if (state.focus === it.id) setTimeout(() => { t.focus(); const r = document.createRange(); r.selectNodeContents(t); const s = getSelection(); s.removeAllRanges(); s.addRange(r); state.focus = null; }, 0);
    return li;
  }

  // ---------------------------------------------------------------- pages
  const head = (ic, colour, title, sub, ...right) => h('div', { class: 'tl-head' }, h('span', { class: 'tl-ic big', style: `--c:${colour}` }, icon(ic)), h('div', {}, h('h1', { class: 't1', 'data-page-title': true }, title), sub ? h('p', { class: 'hint' }, ...[sub].flat()) : null), ...(right.length ? [h('span', { class: 'grow' }), ...right] : []));
  const capture = () => {
    const inp = h('input', { id: 'tcapi', placeholder: 'Add a task… e.g. “Call Harry tomorrow 3pm @Sana !high”', 'aria-label': 'Add a task', autocomplete: 'off' });
    inp.addEventListener('keydown', async (e) => { if (e.key !== 'Enter' || !inp.value.trim()) return; e.preventDefault();
      const p = parseCapture(inp.value, { people: people(), lists: home?.lists ?? [] }); if (!p.title) return;
      const input = { title: p.title, list: p.list ?? home?.mine, due_date: p.due_date ?? iso(new Date()), ...(p.due_time ? { due_time: p.due_time } : {}), priority: p.priority, ...(p.people.length ? { assignees: p.people } : {}) };
      if (!navigator.onLine) { queueOffline(input); inp.value = ''; return toast('You’re offline. Saved here; it’s added when you’re back online.'); }
      // the box empties at once (the next task can be typed straight away); if saving fails, what was typed comes back
      const typed = inp.value; inp.value = '';
      const r = await call('tasks.items.create', input); if (!r.ok) { if (!inp.value) inp.value = typed; return fail(r, 'add the task'); } toast('Added to Today.'); await refreshHome(); render(); });
    return h('div', { class: 'capture' }, h('span', {}, icon('plus')), inp, h('kbd', {}, 'Enter'));
  };
  async function today() {
    const t = iso(new Date());
    const [r, mw, pw, R] = await Promise.all([call('tasks.today', { today: t }), call('my.work', { limit: 40 }), org?.org_id ? call('planner.strategy.my_work', { args: { p_workspace: org.org_id } }) : null, loadRegistry().catch(() => null)]); if (!ctx.live()) return;
    const CAD = { weekly: 7, fortnightly: 14, monthly: 30, quarterly: 91 };   // Planner goals whose update is due (as Office Home)
    const planner = ((pw?.ok ? pw.data?.[0]?.r : null)?.goals ?? []).filter((g) => g.update_cadence && g.update_cadence !== 'none' && !g.completed_at).map((g) => { const d = new Date(g.last_update_at ?? g.created_at ?? Date.now()); d.setDate(d.getDate() + (CAD[g.update_cadence] ?? 30));
      return { app: 'planner', title: `Post update: ${g.title}`, sub: g.plan_name, due: iso(d), href: `#/planner/map?plan=${g.plan_id}&goal=${g.id}` }; }).filter((g) => g.due <= t);
    if (R) reg = (k) => R.get(k) ?? { id: k };
    if (!r.ok) return put(body, errorState(render));
    const other = [...(mw.ok ? mw.data : []).filter((x) => x.due_on && String(x.due_on).slice(0, 10) <= t).map((x) => ({ app: 'projects', title: x.title, sub: x.project_name ?? 'Projects', due: String(x.due_on).slice(0, 10), href: `#/projects/p/${x.project_id}/list?task=${x.id}` })), ...planner].slice(0, 8);
    const items = r.data;
    put(body, head('sun', '#FFB547', 'Today', `${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} · your lists plus work assigned to you in Projects and Planner.`), capture(),
      h('div', { class: 'tdoc' }, h('section', { class: 'tblock' }, h('div', { class: 'tb-h' }, h('h2', {}, 'From your lists'), h('span', { class: 'cnt' }, String(items.length))),
        items.length ? h('ul', { class: 'outline' }, ...items.map((it) => row(it, null))) : h('p', { class: 'hint', style: 'padding:6px 4px' }, 'Nothing due today.')),
      h('section', { class: 'tblock' }, h('div', { class: 'tb-h' }, h('h2', {}, 'From other apps'), h('span', { class: 'hint', style: 'margin-left:auto' }, 'Tick them where they live')),
        ...(other.length ? other.map((x) => { const d = dueChip(x.due); return h('a', { class: 'linkrow', href: x.href }, plateOf(reg(x.app), 24), h('span', { class: 'main' }, h('b', {}, x.title), h('small', {}, x.sub)), d ? h('span', { class: `due-c ${d.tone}`.trim() }, d.text) : null); })
          : [h('p', { class: 'hint', style: 'padding:6px 4px' }, 'Nothing due from Projects or Planner.')]))));
    body.querySelector('#tcapi')?.focus();
  }
  async function upcoming() {
    const cols = upcomingColumns(new Date()); const r = await call('tasks.today', { today: iso(new Date()), days: 13 }); if (!ctx.live()) return;
    if (!r.ok) return put(body, errorState(render));
    const by = (c) => r.data.filter((x) => (c.key === 'today' ? x.due_date <= c.to : x.due_date >= c.from && x.due_date <= c.to));
    put(body, h('div', { class: 'ph6' }, h('h1', { class: 't1', 'data-page-title': true }, 'Upcoming')), h('div', { class: 'upc' }, ...cols.map((c) => { const xs = by(c);
      return h('section', { class: 'card6' }, h('header', {}, h('h2', {}, c.label), h('span', { class: 'cnt' }, String(xs.length))),
        ...(xs.length ? xs.map((x) => h('a', { class: 'mrow pad-s', href: `#/tasks/list/${x.list_id ?? ''}`, style: 'color:inherit;text-decoration:none' }, h('span', { class: 'tl-ic', style: `--c:${x.list_colour ?? '#0EA5A4'}` }, icon(x.list_icon ?? 'tasks')), h('b', {}, x.title))) : [h('p', { class: 'hint pad-s' }, 'Nothing yet.')]),
        h('button', { class: 'addt', type: 'button', onclick: () => addTaskDialog({ due: c.from }) }, icon('plus'), 'Add')); })));
  }
  async function inbox() {
    const r = await call('tasks.inbox'); if (!ctx.live()) return; if (!r.ok) return put(body, errorState(render));
    const move = (it, x, y) => ctxMenu((home?.lists ?? []).filter((l) => ['owner', 'edit'].includes(l.level)).map((l) => ['tasks', l.name, async () => { if (await upd(it, { list: l.id })) { toast(`Moved to ${l.name}.`); refreshHome(); } }]), x, y);
    put(body, h('div', { class: 'ph6' }, h('div', {}, h('h1', { class: 't1', 'data-page-title': true }, 'Inbox'), h('p', { class: 'hint' }, 'Quick captures without a list, and tasks other apps send you (from a meeting, an avatar’s next steps, an email). Sort them when you have a minute.'))),
      r.data.length ? h('div', { class: 'tdoc' }, h('ul', { class: 'outline' }, ...r.data.map((it) => h('li', { class: 'ol-i', 'data-task': it.id }, h('div', { class: 'ol-row' },
        h('button', { class: 'ol-cb', type: 'button', role: 'checkbox', 'aria-checked': 'false', 'aria-label': `Complete ${it.title}`, onclick: () => complete(it) }, h('i', {}, icon('check'))), h('span', { class: 'ol-t' }, it.title),
        h('small', { class: 'muted' }, it.source_app ? `From ${it.source_app}` : 'Captured here'),
        h('button', { class: 'btn quiet sm', type: 'button', onclick: (e) => { const b = e.currentTarget.getBoundingClientRect(); move(it, b.left - 120, b.bottom + 4); } }, 'Move to list')))))) : emptyState({ title: 'Inbox zero', body: 'Captures without a list land here.', ic: 'inbox' }));
  }
  async function teammates() {
    const r = await call('tasks.teammates'); if (!ctx.live()) return; if (!r.ok) return put(body, errorState(render));
    const { can, people: ps, stats } = r.data[0]; const st = new Map(stats.map((s) => [s.user_id, s]));
    const tabs = h('div', { class: 'tabs6', role: 'tablist' }, ...[['people', 'People'], ['given', 'Tasks I gave']].map(([k, l]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(state.tab === k), onclick: () => { state.tab = k; render(); } }, l)));
    let pane;
    if (state.tab === 'given') {
      const g = await call('tasks.gave'); if (!ctx.live()) return;
      pane = g.ok && g.data.length ? h('div', { class: 'tbl6' }, h('div', { class: 'thd' }, ...['Task', 'To', 'List', 'Due', 'Status', ''].map((x) => h('span', {}, x))),
        ...g.data.map((x) => h('div', { class: 'tr' }, h('span', { class: 't1c' }, h('b', {}, x.title)), h('span', {}, av(x.user_id)), h('span', {}, x.list_name ?? 'Inbox'), h('span', {}, dueChip(x.due_date)?.text ?? '—'),
          h('span', {}, h('span', { class: `pill ${x.done_at ? '' : 'blue'}`.trim() }, x.done_at ? 'Done' : 'Open')), h('span'))))
        : emptyState({ title: 'You haven’t given anyone a task yet', body: 'Use Add task › For, or open a teammate and Give a task.', ic: 'users' });
    } else {
      pane = !can ? h('div', { class: 'notice plain' }, icon('lock'), h('span', {}, 'You can give tasks to anyone. Seeing teammates’ lists needs the feature “See teammates’ tasks” (an owner or admin can switch it on).'))
        : h('div', { class: 'cardgrid' }, ...ps.map((p) => { const s = st.get(p.user_id) ?? { open: 0, due_today: 0 }; return h('a', { class: 'card6 pad-s', href: `#/tasks/teammates/${p.user_id}` },
          h('span', { style: 'display:flex;gap:10px;align-items:center' }, av(p.user_id, 40), h('span', {}, h('b', {}, p.display_name || p.email), h('small', { class: 'muted', style: 'display:block' }, roleLabel(p.role)))),
          h('div', { class: 'kpirow two', style: 'margin-top:10px' }, h('div', { class: 'kpi' }, h('b', {}, String(s.open)), h('small', {}, 'Open')), h('div', { class: 'kpi' }, h('b', {}, String(s.due_today)), h('small', {}, 'Due today')))); }));
    }
    put(body, h('div', { class: 'ph6' }, h('div', {}, h('h1', { class: 't1', 'data-page-title': true }, 'Teammates'), h('p', { class: 'hint' }, 'What each person is working on. Visible to people with “See teammates’ tasks”.'))), tabs, pane);
  }
  async function person() {
    const r = await call('tasks.person', { user: id }); if (!ctx.live()) return;
    if (!r.ok) return put(body, errorState(render)); const p = r.data?.[0]; if (!p) return put(body, notFoundState('#/tasks/teammates', 'Back to Teammates'));
    const own = p.items.filter((x) => x.kind === 'own'); const given = p.items.filter((x) => x.kind === 'given'); const first = (p.display_name || 'They').split(' ')[0];
    const card = (title, xs, giver) => h('section', { class: 'card6' }, h('header', {}, h('h2', {}, title), h('span', { class: 'cnt' }, String(xs.length))),
      xs.length ? h('ul', { class: 'outline pad-s' }, ...xs.map((x) => h('li', { class: 'ol-i' }, h('div', { class: 'ol-row' }, h('span', { class: 'ol-cb', 'aria-hidden': 'true' }, h('i')), h('span', { class: 'ol-t' }, x.title, giver && x.given_by ? h('small', { class: 'muted' }, ` · from ${nameOf(x.given_by)}`) : null),
        x.list_name ? h('small', { class: 'muted' }, x.list_name) : null, x.due_date ? h('span', { class: `due-c ${dueChip(x.due_date).tone}`.trim() }, dueChip(x.due_date).text) : null)))) : h('p', { class: 'hint pad-s' }, 'Nothing open you can see.'));
    put(body, h('a', { class: 'btn quiet sm backlink', href: '#/tasks/teammates' }, h('span', { style: 'display:inline-flex;transform:scaleX(-1)' }, icon('right')), 'Teammates'),
      h('div', { class: 'tl-head', style: 'margin-top:8px' }, av(p.user_id, 48), h('div', {}, h('h1', { class: 't1', 'data-page-title': true }, p.display_name || p.email), h('p', { class: 'hint' }, `Lists ${first} made for themself, and tasks others gave them. Private items show as a count.`)),
        h('span', { class: 'grow' }), btn([icon('plus'), 'Give a task'], () => addTaskDialog({ forUser: p.user_id }), 'primary sm')),
      h('div', { class: 'grid-h' }, card('Their lists', own), card('Given by others', given, true)),
      p.private_count ? h('p', { class: 'hint', style: 'margin-top:8px' }, icon('lock'), ` ${p.private_count} private task${p.private_count === 1 ? '' : 's'} not shown.`) : null);
    root.__crumbs = [['Teammates', '#/tasks/teammates'], [p.display_name || p.email]]; document.dispatchEvent(new CustomEvent('l2f:crumbs', { detail: { root } }));
  }
  async function listPage() {
    const r = await call('tasks.lists.get', { id }); if (!ctx.live()) return;
    if (!r.ok && r.status !== 404) return put(body, errorState(render)); const l = r.data?.[0];
    if (!l) return put(body, notFoundState('#/tasks/today', 'Go to Today'));
    const edit = ['owner', 'edit'].includes(l.level); const v = state.view[l.id] ?? 'list'; const show = Boolean(state.showDone[l.id]);
    const who = [...new Set([l.owner_id, ...l.access.map((a) => a.user_id)])];
    root.__crumbs = [[l.space === 'team' ? 'Team' : 'Personal'], [l.name]]; document.dispatchEvent(new CustomEvent('l2f:crumbs', { detail: { root } }));
    const header = head(l.icon, l.colour, l.name, l.space === 'personal' ? [icon('lock'), ' Only you can see this list.'] : [icon('team'), ` Shared with ${who.length} ${who.length === 1 ? 'person' : 'people'}.`],
      l.space === 'team' ? h('button', { class: 'mng', type: 'button', disabled: !edit, onclick: () => accessDialog({ list: l.id, name: l.name, current: l.access.filter((a) => a.via === 'list').map((a) => ({ user: a.user_id, level: a.level })) }) }, h('span', { class: 'av-stack sm' }, ...who.slice(0, 4).map((u) => av(u, 22))), 'Manage access')
        : h('button', { class: 'btn ghost sm', type: 'button', onclick: () => toast('Personal lists are only yours. Make a Team list to share.') }, icon('share'), 'Share'),
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'List menu', onclick: (e) => { const b = e.currentTarget.getBoundingClientRect(); listMenu({ ...l, open: 0 }, b.left - 200, b.bottom + 4); } }, icon('more')));
    const vsw = h('div', { class: 'vsw', role: 'radiogroup', 'aria-label': 'View' }, ...[['list', 'List', 'list'], ['board', 'Board', 'board'], ['cal', 'Calendar', 'cal']].map(([k, lb, ic]) => h('button', { type: 'button', 'aria-pressed': String(v === k), onclick: () => { state.view[l.id] = k; render(); } }, icon(ic), lb)));
    let view;
    if (v === 'list') {
      const n = doneCount(l.items); state.siblings = new Map();
      const blockEl = (b) => { const its = l.items.filter((x) => x.block_id === b.id || (!b.id && !x.block_id)); const ids = new Set(its.map((x) => x.id)); const sub = l.items.filter((x) => x.parent_id && !ids.has(x.id) && its.some((p) => p.id === x.parent_id));
        const tree = visibleTree([...its.filter((x) => !x.parent_id || ids.has(x.parent_id)), ...sub], { showDone: show });
        const rows = []; const hide = new Set();
        for (const x of tree) { if (x.parent_id && hide.has(x.parent_id)) { hide.add(x.id); continue; } if (state.collapsed.has(x.id)) hide.add(x.id);
          const kids = l.items.some((y) => y.parent_id === x.id && (show || !y.done_at)); rows.push(row(x, l, { depth: x.depth, kids })); }
        const sibs = (pid) => tree.filter((x) => (x.parent_id ?? null) === pid);
        for (const x of tree) { const s = sibs(x.parent_id ?? null); const i = s.findIndex((y) => y.id === x.id); state.siblings.set(x.id, { prev: s[i - 1], next: s[i + 1] }); }
        const openN = its.filter((x) => !x.done_at && !x.parent_id).length;
        const hname = h('h2', { contenteditable: String(edit && Boolean(b.id)), spellcheck: 'false' }, b.name);
        hname.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); hname.blur(); } });
        hname.addEventListener('blur', async () => { const nv = hname.textContent.trim(); if (b.id && nv && nv !== b.name) { const x = await call('tasks.blocks.update', { id: b.id, name: nv }); if (x.ok) b.name = nv; else fail(x); } else hname.textContent = b.name; });
        const collapsed = b.collapsed;
        return h('section', { class: 'tblock' }, h('div', { class: 'tb-h' }, h('button', { class: 'iconbtn xs', type: 'button', 'aria-label': collapsed ? 'Expand block' : 'Collapse block', 'aria-expanded': String(!collapsed), onclick: async () => { if (!b.id) return; b.collapsed = !b.collapsed; render(); await call('tasks.blocks.update', { id: b.id, collapsed: b.collapsed }); } }, h('span', { style: collapsed ? 'display:inline-flex;transform:rotate(-90deg)' : 'display:inline-flex' }, icon('down'))),
          hname, h('span', { class: 'cnt' }, String(openN)),
          edit && b.id ? h('button', { class: 'iconbtn xs', type: 'button', 'aria-label': `Block menu: ${b.name}`, onclick: (e) => { const r2 = e.currentTarget.getBoundingClientRect(); ctxMenu([['edit', 'Rename', () => { hname.focus(); }],
            ['up', 'Move up', async () => { const i = l.blocks.indexOf(b); if (i > 0) { await call('tasks.blocks.update', { id: b.id, position: l.blocks[i - 1].position - 0.5 }); render(); } }],
            ['down', 'Move down', async () => { const i = l.blocks.indexOf(b); if (i < l.blocks.length - 1) { await call('tasks.blocks.update', { id: b.id, position: l.blocks[i + 1].position + 0.5 }); render(); } }],
            '-', ['trash', 'Delete block', () => dialog({ title: `Delete “${b.name}”?`, body: h('p', {}, `Its ${its.length} task${its.length === 1 ? '' : 's'} are deleted too.`), actions: [{ label: 'Delete block', cls: 'dng', on: async () => { const x = await call('tasks.blocks.delete', { id: b.id }); if (!x.ok) { fail(x, 'delete'); return false; } refreshHome(); render(); } }, { label: 'Cancel' }] }), 'danger']], r2.left - 180, r2.bottom + 4); } }, icon('more')) : null),
        collapsed ? null : h('ul', { class: 'outline' }, ...rows),
        !collapsed && edit ? h('button', { class: 'addt', type: 'button', onclick: async (ev) => { const me = ev.currentTarget; if (me.disabled) return; me.disabled = true; const x = await call('tasks.items.create', { list: l.id, ...(b.id ? { block: b.id } : {}), title: 'New task' }); me.disabled = false; if (!x.ok) return fail(x, 'add a task'); state.focus = x.data[0].id; refreshHome(); render(); } }, icon('plus'), 'Add task') : null); };
      const blocks = [...l.blocks, ...(l.items.some((x) => !x.block_id && !x.parent_id) ? [{ id: null, name: 'More', position: 1e9 }] : [])];
      view = h('div', { class: 'tdoc' }, ...(l.items.length || blocks.length ? blocks.map(blockEl) : []),
        !l.items.some((x) => !x.done_at) && !n ? h('p', { class: 'hint', style: 'text-align:center;padding:10px' }, 'Add your first task.') : null,
        edit ? h('button', { class: 'addblock', type: 'button', onclick: async (ev) => { const me = ev.currentTarget; if (me.disabled) return; me.disabled = true; const x = await call('tasks.blocks.create', { list: l.id, name: 'New block' }); me.disabled = false; if (!x.ok) return fail(x, 'add a block'); toast('Block added. Click its name to rename.'); render(); } }, icon('plus'), 'Add block') : null,
        // V8: one Show/Hide completed (n) control at the bottom of every list, always there (hiding never deletes anything)
        h('button', { class: 'showdone', type: 'button', 'aria-pressed': String(show), disabled: !n && !show, title: n ? '' : 'No completed tasks in this list yet', onclick: () => { state.showDone[l.id] = !show; render(); } }, `${show ? 'Hide' : 'Show'} completed (${n})`),
        h('p', { class: 'hint', style: 'text-align:center;margin-top:10px' }, `Created by ${l.owner_id === ctx.userId ? 'you' : l.owner_name} · ${l.space === 'team' ? `shared with ${who.length} ${who.length === 1 ? 'person' : 'people'}` : 'only you'}`));
    } else if (v === 'board') {
      const top = l.items.filter((x) => !x.parent_id); const t = iso(new Date());
      const card = (x) => h('div', { class: `kcard k6c ${x.done_at ? 'done' : ''}`.trim(), 'data-task': x.id, oncontextmenu: (e) => { e.preventDefault(); taskMenu(x, l, e.clientX, e.clientY); } }, h('b', {}, x.title),
        h('span', { class: 'foot' }, x.assignees?.[0] ? av(x.assignees[0], 20) : null, dueChip(x.due_date, x.due_time)?.text ?? ''));
      const colEl = (title, xs, muted, onDrop) => { const c = h('div', { class: `kcol ${muted ? 'muted' : ''}`.trim() }, h('div', { class: 'kcol-h' }, h('b', {}, title), h('span', { class: 'cnt' }, String(xs.length))), ...xs.map(card));
        if (edit) { c.addEventListener('dragover', (e) => e.preventDefault()); c.addEventListener('drop', (e) => { e.preventDefault(); const tid = e.dataTransfer.getData('text/task'); const it = l.items.find((x) => x.id === tid); if (it) onDrop(it); }); }
        for (const k of c.querySelectorAll('.kcard')) { k.draggable = edit; k.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/task', k.dataset.task)); }
        return c; };
      view = h('div', { class: 'kanban k6' }, colEl('To do', top.filter((x) => !x.done_at && x.due_date !== t), false, (it) => upd(it, { done: false, clear_due: it.due_date === t })),
        colEl('Today', top.filter((x) => !x.done_at && x.due_date === t), false, (it) => upd(it, { done: false, due_date: t })), colEl('Done', top.filter((x) => x.done_at), true, (it) => complete(it)));
    } else {
      const start = new Date(); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); const t = iso(new Date());
      view = h('div', { class: 'cal c6' }, ...['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => h('div', { class: 'dh' }, d)), ...Array.from({ length: 14 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); const k = iso(d);
        const c = h('div', { class: `dc ${k === t ? 'today' : ''}`.trim(), 'data-date': k }, h('span', { class: 'dn' }, String(d.getDate())), ...l.items.filter((x) => x.due_date === k && !x.done_at).map((x) => h('span', { class: 'ev', style: `--c:${l.colour}`, draggable: String(edit), ondragstart: (e) => e.dataTransfer.setData('text/task', x.id), oncontextmenu: (e) => { e.preventDefault(); taskMenu(x, l, e.clientX, e.clientY); } }, x.title)));
        if (edit) { c.addEventListener('dragover', (e) => e.preventDefault()); c.addEventListener('drop', (e) => { e.preventDefault(); const it = l.items.find((x) => x.id === e.dataTransfer.getData('text/task')); if (it) upd(it, { due_date: k }); });
          c.addEventListener('dblclick', () => addTaskDialog({ due: k, list: l.id })); }
        return c; }));
    }
    put(body, header, h('div', { class: 'tb6' }, vsw, h('span', { class: 'grow' }), h('span', { class: 'hint hide-m' }, v === 'cal' ? 'Drag a task to another day. Double-click a day to add.' : 'Tip: right-click any task.')), view);
    const ti = new URLSearchParams(location.hash.split('?')[1] ?? '').get('task'); if (ti) body.querySelector(`[data-task="${CSS.escape(ti)}"]`)?.scrollIntoView({ block: 'center' });
  }

  // phone (V8: bottom bar Today · Upcoming · Inbox · Teammates · More): every list and folder, as the sidebar shows them on a computer
  async function allLists() {
    paintSide(); const copy = side.cloneNode(true); copy.classList.remove('tside');
    copy.querySelector('.addrow')?.addEventListener('click', () => newListDialog());
    put(body, h('div', { class: 'ph6' }, h('h1', { class: 't1', 'data-page-title': true }, 'Lists')), h('div', { class: 'card6 pad-s tside' }, ...copy.childNodes));
  }

  // ---------------------------------------------------------------- offline capture queue (V8 brief §6)
  function queueOffline(input) { try { const q = JSON.parse(localStorage.getItem(OFFLINE_KEY) ?? '[]'); q.push({ ...input, id: crypto.randomUUID() }); localStorage.setItem(OFFLINE_KEY, JSON.stringify(q.slice(-100))); } catch { /* storage off */ } }
  async function flushOffline() { let q = []; try { q = JSON.parse(localStorage.getItem(OFFLINE_KEY) ?? '[]'); } catch { return; } if (!q.length) return;
    const left = []; for (const x of q) { const r = await call('tasks.items.create', x); if (!r.ok && r.status !== 409) left.push(x); }
    try { localStorage.setItem(OFFLINE_KEY, JSON.stringify(left)); } catch { /* storage off */ } if (q.length > left.length) { toast(`${q.length - left.length} task${q.length - left.length === 1 ? '' : 's'} captured offline added.`); refreshHome(); render(); } }
  addEventListener('online', flushOffline, { once: true });

  // ---------------------------------------------------------------- render
  let busy = 0;
  async function render() {
    const n = ++busy; const run = await call('timer.running'); if (n !== busy || !ctx.live()) return; state.running = run.ok ? run.data?.[0] ?? null : null;
    const t = setTimeout(() => { if (n === busy && body.querySelector('.skel')) put(body, errorState(render)); }, 10000);   // nothing spins forever
    try { await ({ today, upcoming, inbox, teammates: id ? person : teammates, list: listPage, lists: allLists }[page] ?? today)(); } finally { clearTimeout(t); }
  }
  (async () => {
    const [hr, tm] = await Promise.all([refreshHome(), call('team.list')]); if (!ctx.live()) return;
    team = tm.ok ? tm.data : [];
    if (!hr.ok) return put(body, hr.status === 404 || hr.status === 403 ? notFoundState('#/launcher', 'Go to the Launcher') : errorState(() => ctx.rerender()));
    await render(); if (navigator.onLine) flushOffline();
  })();
  return root;
}
