// Projects: the shared Projects experience (home list, My Work, project workspace with List / Board / Calendar / Timeline / Docs / Whiteboards,
// task drawer with timer, smart search). One module so that the Projects app and, later, Office > Projects (V4-2) mount the very same screens and data.
// Everything goes through the permission-checked API; buttons follow `ctx.can`, the database decides. Logic lives in projectmodel.js (tested without a browser).
import { h, put, icon, btn, chip, dialog, drawer, toast, field, notice, skeleton, emptyState, errorState, noAccessState, seg, tabs, readOnlyNotice } from '../ui.js';
import { splitProjects, PROJECT_STATUS, TASK_STATUS, PRIORITY, label, byStatus, progress, monthGrid, monthTitle, shiftMonth, timeline, dueLabel, myWorkGroups, parseSearch, searchInput, duration, clock } from './projectmodel.js';
import { createBoard, BOARD_MIME } from './whiteboard.js';
import { emptyDoc, serialize } from './docmodel.js';
const DOC_MIME = 'application/vnd.l2f.doc+json';

export const makeHrefs = (base = '#/projects') => ({ home: () => base, mine: () => `${base}/mine`, project: (id, tab) => `${base}/p/${id}${tab && tab !== 'overview' ? `?tab=${tab}` : ''}`, task: (id, task, tab) => `${base}/p/${id}?${tab ? `tab=${tab}&` : ''}task=${task}` });
export const hrefs = makeHrefs();
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const opts = (list, cur) => list.map(([k, t]) => h('option', { value: k, ...(k === cur ? { selected: true } : {}) }, t));

export function projectsView({ api, ctx, route, base = '#/projects', embedded = false }) {
  const hrefs = makeHrefs(base);
  const root = h('section', { class: 'pj' });
  const main = h('div', { class: 'pj-main', id: 'pj-main' });
  const state = { people: null, projects: [], timer: null, tick: null };
  const live = () => ctx.live() && root.isConnected;
  const go = (hash) => ctx.go(hash);
  const clientName = (id) => ctx.clients?.get?.(id) ?? 'Client';
  const canProject = (p) => ctx.can('projects.project.edit', p?.client_id) || ctx.canAnywhere('projects.project.edit');
  const canTask = () => ctx.canAnywhere('projects.task.edit') || ctx.canAnywhere('projects.task.create');
  const canTime = () => ctx.canAnywhere('projects.time.create');
  const fail = (r, what = 'save that') => toast(r?.status === 404 ? `You can’t ${what} here.` : (r?.message ?? 'Something went wrong. Try again.'), false);

  // ---------------------------------------------------------------- shared pieces
  const projectChip = (p) => (p.client_id ? chip(clientName(p.client_id), 'act') : chip('Internal'));
  const statusChip = (s) => chip(label(PROJECT_STATUS, s), s === 'done' ? 'ok' : s === 'on_hold' ? 'warn' : '');
  const bar = (p) => h('div', { class: 'pj-progress', role: 'img', 'aria-label': `${progress(p)} percent of tasks done` }, h('i', { style: `width:${progress(p)}%` }));
  const people = async () => { if (!state.people) { const r = await api.call('projects.people', {}); state.people = r.ok ? r.data : []; } return state.people; };
  const personName = (id) => (state.people ?? []).find((x) => x.user_id === id)?.display_name ?? 'Someone';

  // running timer, shown on every Projects page
  const timerBar = h('div', { class: 'pj-timer', hidden: true, role: 'status' });
  const paintTimer = () => {
    const t = state.timer; timerBar.hidden = !t; clearInterval(state.tick); if (!t) return;
    const clk = h('b', { class: 'mono' }, clock(t.started_at, Date.now()));
    timerBar.replaceChildren(icon('clock'), 'Timer running ', clk, btn('Stop', async () => { const r = await api.call('time.stop', {}); if (r.ok) { toast('Timer stopped.'); state.timer = null; paintTimer(); } else fail(r, 'stop that timer'); }, 'pri'));
    state.tick = setInterval(() => { if (!live()) return clearInterval(state.tick); clk.textContent = clock(t.started_at, Date.now()); }, 1000);
  };
  const loadTimer = async () => { const r = await api.call('time.running', {}); if (live()) { state.timer = r.ok ? r.data[0] ?? null : null; paintTimer(); } };

  // ---------------------------------------------------------------- sidebar (active projects) and header
  const side = h('nav', { class: 'pj-side', 'aria-label': 'Projects' });
  // the sidebar and the home list use the same two labelled sections: client projects (grouped by client) and the organization's own (internal) projects
  const sideGroups = (cur) => {
    const sp = splitProjects(state.projects.filter((p) => !p.archived_at && p.status !== 'done'), clientName, ctx.orgName);
    const link = (p) => h('li', {}, h('a', { class: 'pj-link', href: hrefs.project(p.id), ...(cur === p.id ? { 'aria-current': 'page' } : {}) }, p.name));
    return [
      h('h2', {}, 'Client projects'),
      sp.clients.length ? h('div', {}, ...sp.clients.map((g) => h('div', { class: 'pj-group' }, h('h3', { class: 'pj-gname' }, g.name), h('ul', {}, ...g.projects.slice(0, 15).map(link))))) : h('p', { class: 'fine muted pj-none' }, 'None yet'),
      h('h2', {}, sp.internalTitle),
      sp.internal.length ? h('ul', {}, ...sp.internal.slice(0, 30).map(link)) : h('p', { class: 'fine muted pj-none' }, 'None yet')];
  };
  const paintSide = (cur) => {
    side.replaceChildren(
      h('a', { class: 'pj-link', href: hrefs.home(), ...(route.view === 'home' ? { 'aria-current': 'page' } : {}) }, icon('prj'), 'Projects'),
      h('a', { class: 'pj-link', href: hrefs.mine(), ...(route.view === 'mine' ? { 'aria-current': 'page' } : {}) }, icon('check'), 'My Work'),
      h('button', { type: 'button', class: 'pj-link', onclick: () => openSearch() }, icon('search'), 'Search', h('kbd', { 'aria-hidden': 'true' }, 'Ctrl K')),
      ...sideGroups(cur));
  };
  const loadProjects = async () => { const r = await api.call('projects.list', { scope: 'all' }); if (live()) { state.projects = r.ok ? r.data : []; paintSide(route.id); } return r; };

  // ---------------------------------------------------------------- new project
  const newProject = () => {
    const name = field({ id: 'np-name', label: 'Project name', maxlength: 200 });
    const client = h('select', { id: 'np-client', 'aria-label': 'Client' }, h('option', { value: '' }, 'Internal (no client)'), ...[...(ctx.clients ?? new Map())].filter(([cid]) => ctx.can('projects.project.create', cid)).map(([cid, n]) => h('option', { value: cid }, n)));
    const due = field({ id: 'np-due', label: 'Due date (optional)', type: 'date' });
    dialog({ title: 'New project', body: [name.el, h('div', { class: 'fld' }, h('label', { for: 'np-client' }, 'For'), client), due.el],
      actions: [{ label: 'Create project', cls: 'pri', on: async () => {
        const nm = name.input.value.trim(); if (!nm) return name.error('Give the project a name.');
        const r = await api.call('projects.create', { name: nm, ...(client.value ? { client: client.value } : {}), ...(due.input.value ? { due_on: due.input.value } : {}) });
        if (!r.ok) { fail(r, 'create projects'); return false; }
        toast('Project created.'); go(hrefs.project(r.data[0].id));
      } }, { label: 'Cancel' }] });
  };

  // ---------------------------------------------------------------- home
  async function home() {
    put(main, h('div', { class: 'pj-head' }, h('div', {}, h('div', { class: 'crumbs fine' }, 'Projects'), h('h1', { 'data-page-title': true }, 'Projects')), ctx.canAnywhere('projects.project.create') ? btn('New project', newProject, 'pri') : null), skeleton(4));
    const r = await loadProjects(); if (!live()) return;
    if (!r.ok) return put(main, errorState(home));
    const head = main.firstChild; put(main, head);
    let filter = 'open';
    const list = h('div', { class: 'pj-sections' });
    const card = (p) => h('a', { class: 'pj-card', href: hrefs.project(p.id) }, h('div', { class: 'pj-card-top' }, h('strong', {}, p.name), statusChip(p.status)), h('div', { class: 'pj-card-sub' }, projectChip(p), p.due_on ? h('span', { class: 'fine muted' }, `Due ${dueLabel(p.due_on, todayIso())}`) : null), bar(p), h('div', { class: 'fine muted' }, `${p.tasks_done} of ${p.tasks_total} tasks done`));
    const draw = () => {
      const shown = state.projects.filter((p) => !p.archived_at && (filter === 'all' || (filter === 'open' ? p.status !== 'done' : p.status === filter)));
      if (!shown.length) return put(list, state.projects.length ? emptyState({ title: 'No projects match', body: 'Try another filter, or search for archived work with Ctrl K.', ic: 'search' }) : emptyState({ title: 'No projects yet', body: ctx.canAnywhere('projects.project.create') ? 'Create the first project to start planning work.' : 'Nothing has been shared with you yet.', ic: 'prj', first: true, action: ctx.canAnywhere('projects.project.create') ? btn('New project', newProject, 'pri') : null }));
      const sp = splitProjects(shown, clientName, ctx.orgName);
      put(list,
        h('section', { 'aria-labelledby': 'pj-cp' }, h('h2', { id: 'pj-cp', class: 'pj-gh' }, 'Client projects'),
          sp.clients.length ? sp.clients.map((g) => h('div', { class: 'pj-group' }, h('h3', { class: 'pj-gname' }, g.name), h('div', { class: 'pj-cards' }, ...g.projects.map(card)))) : h('p', { class: 'muted' }, 'No client projects match.')),
        h('section', { 'aria-labelledby': 'pj-ip' }, h('h2', { id: 'pj-ip', class: 'pj-gh' }, sp.internalTitle),
          sp.internal.length ? h('div', { class: 'pj-cards' }, ...sp.internal.map(card)) : h('p', { class: 'muted' }, `No ${ctx.orgName} projects match.`)));
    };
    main.append(seg([['open', 'Open'], ['all', 'All'], ['done', 'Done']], filter, (k) => { filter = k; draw(); }, 'Show projects'), list); draw();
  }

  // ---------------------------------------------------------------- my work
  async function mine() {
    put(main, h('div', { class: 'pj-head' }, h('div', {}, h('div', { class: 'crumbs fine' }, 'Projects'), h('h1', { 'data-page-title': true }, 'My Work'))), skeleton(4));
    await loadProjects(); const r = await api.call('my.work', {}); if (!live()) return;
    if (!r.ok) return put(main, errorState(mine));
    const groups = myWorkGroups(r.data, todayIso()); const body = h('div', { class: 'pj-mine' });
    const done = async (row, li) => { const x = await api.call('tasks.update', { id: row.id, status: 'done' }); if (x.ok) { li.remove(); toast('Marked done.'); } else fail(x, 'change that task'); };
    body.append(...(groups.length ? groups.map(([k, title, rows]) => h('section', {}, h('h2', { class: `pj-gh ${k}` }, title, h('span', { class: 'fine muted' }, ` ${rows.length}`)), h('ul', { class: 'pj-rows' }, ...rows.map((row) => { const li = h('li', { class: 'pj-row' },
      h('button', { type: 'button', class: 'pj-check', 'aria-label': `Mark “${row.title}” done`, onclick: () => done(row, li) }), h('a', { class: 'pj-title', href: hrefs.task(row.project_id, row.id) }, row.title), h('span', { class: 'fine muted' }, row.project_name), chip(label(PRIORITY, row.priority), row.priority === 'urgent' ? 'bad' : row.priority === 'high' ? 'warn' : ''), h('span', { class: `pj-due${row.overdue ? ' late' : ''}` }, dueLabel(row.due_on, todayIso()))); return li; }))))
      : [emptyState({ title: 'Nothing assigned to you', body: 'Tasks assigned to you across all projects appear here.', ic: 'check', first: true })]));
    main.append(body);
  }

  // ---------------------------------------------------------------- project workspace
  async function project() {
    put(main, skeleton(4)); await loadProjects();
    const r = await api.call('projects.get', { id: route.id }); if (!live()) return;
    if (!r.ok) return put(main, r.status === 404 ? noAccessState({ action: h('a', { class: 'btn', href: hrefs.home() }, 'Back to Projects') }) : errorState(project));
    const p = r.data[0]; paintSide(p.id);
    const tr = await api.call('tasks.list', { project: p.id, archived: false }); if (!live()) return;
    let tasks = tr.ok ? tr.data : []; const archived = Boolean(p.archived_at); const editable = canProject(p) && !archived; const tasksOk = canTask() && !archived;
    let tab = route.query.tab ?? 'overview'; let month = (() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() + 1 }; })();
    const body = h('div', { class: 'pj-body' });
    const reload = async () => { const x = await api.call('tasks.list', { project: p.id, archived: false }); if (x.ok) tasks = x.data; draw(); };
    const addTask = async (title, extra = {}) => { const t = title.trim(); if (!t) return; const x = await api.call('tasks.create', { project: p.id, title: t, ...extra }); if (x.ok) { toast('Task added.'); await reload(); } else fail(x, 'add tasks'); };
    const setStatus = async (t, status, position) => { const x = await api.call('tasks.update', { id: t.id, status, ...(position != null ? { position } : {}) }); if (x.ok) await reload(); else fail(x, 'change that task'); };
    const openTask = (t) => taskDrawer(t, p, { onChange: reload, canEdit: tasksOk });

    const head = h('div', { class: 'pj-head' }, h('div', {}, h('div', { class: 'crumbs fine' }, h('a', { href: hrefs.home() }, 'Projects'), ' / ', p.client_id ? clientName(p.client_id) : 'Internal'),
      h('h1', { 'data-page-title': true }, p.name), h('div', { class: 'pj-meta' }, statusChip(p.status), p.due_on ? h('span', { class: 'fine muted' }, `Due ${dueLabel(p.due_on, todayIso())}`) : null, archived ? chip('Archived', 'warn') : null)),
      h('div', { class: 'pj-actions' }, editable ? btn('Edit details', () => editProject(p), '') : null, editable || archived ? projectMenu(p, archived) : null));
    const TABS = [['overview', 'Overview'], ['list', 'List'], ['board', 'Board'], ['calendar', 'Calendar'], ['timeline', 'Timeline'], ['docs', 'Docs'], ['whiteboards', 'Whiteboards']];
    const tabBar = tabs(TABS, TABS.some(([k]) => k === tab) ? tab : 'overview', (k) => { tab = k; history.replaceState(null, '', hrefs.project(p.id, k)); draw(); }, 'Project views');
    tabBar.append(h('button', { type: 'button', role: 'tab', class: 'pj-soon', 'aria-disabled': 'true', tabindex: '-1', title: 'Comments and activity arrive with the notification layer', onclick: (e) => e.preventDefault() }, 'Activity ', h('small', {}, 'Soon')));

    function draw() {
      const cur = TABS.some(([k]) => k === tab) ? tab : 'overview'; tabBar.querySelectorAll('[role=tab][data-k]').forEach((b) => { b.setAttribute('aria-selected', String(b.dataset.k === cur)); b.tabIndex = b.dataset.k === cur ? 0 : -1; });
      ({ overview, list, board, calendar, timelineTab, docs, whiteboards })[cur === 'timeline' ? 'timelineTab' : cur]();
    }
    const taskRow = (t) => h('li', { class: `pj-row${t.status === 'done' ? ' isdone' : ''}` },
      h('button', { type: 'button', class: 'pj-check', 'aria-pressed': String(t.status === 'done'), 'aria-label': `${t.status === 'done' ? 'Reopen' : 'Mark done'}: ${t.title}`, ...(tasksOk ? { onclick: () => setStatus(t, t.status === 'done' ? 'todo' : 'done') } : { disabled: true }) }),
      h('button', { type: 'button', class: 'pj-title', onclick: () => openTask(t) }, t.title), t.assignee_id ? h('span', { class: 'fine muted' }, personName(t.assignee_id)) : null,
      t.checklist_total ? h('span', { class: 'fine muted' }, `${t.checklist_done}/${t.checklist_total}`) : null, chip(label(PRIORITY, t.priority), t.priority === 'urgent' ? 'bad' : t.priority === 'high' ? 'warn' : ''), h('span', { class: `pj-due${t.status !== 'done' && t.due_on && t.due_on < todayIso() ? ' late' : ''}` }, t.due_on ? dueLabel(t.due_on, todayIso()) : ''));
    const addBox = (status) => tasksOk ? h('form', { class: 'pj-add', onsubmit: (e) => { e.preventDefault(); const i = e.target.elements.t; const v = i.value; i.value = ''; addTask(v, { status }); } }, h('input', { name: 't', placeholder: 'Add a task', 'aria-label': `Add a task (${label(TASK_STATUS, status)})`, maxlength: 300 }), btn('Add', null, '', { type: 'submit' })) : null;

    function overview() {
      const open = tasks.filter((t) => t.status !== 'done'); const late = open.filter((t) => t.due_on && t.due_on < todayIso()); const next = open.filter((t) => t.due_on).sort((a, b) => a.due_on.localeCompare(b.due_on)).slice(0, 5);
      const stat = (n, t, cls = '') => h('div', { class: `pj-stat ${cls}` }, h('b', {}, String(n)), h('span', {}, t));
      const hours = h('b', {}, '…'); api.call('time.summary', { project: p.id, from: '2000-01-01', to: '2999-12-31' }).then((x) => { if (live()) hours.textContent = duration((x.ok ? x.data : []).reduce((a, r2) => a + r2.seconds, 0)); });
      put(body, archived ? readOnlyNotice('This project is archived') : null, h('div', { class: 'pj-stats' }, stat(open.length, 'open tasks'), stat(tasks.length - open.length, 'done'), stat(late.length, 'overdue', late.length ? 'late' : ''), h('div', { class: 'pj-stat' }, hours, h('span', {}, 'time logged'))),
        bar(p), h('section', { class: 'pj-sec' }, h('h2', {}, 'About'), h('p', { class: p.description ? '' : 'muted' }, p.description || 'No description yet.')),
        h('section', { class: 'pj-sec' }, h('h2', {}, 'Coming up'), next.length ? h('ul', { class: 'pj-rows' }, ...next.map(taskRow)) : h('p', { class: 'muted' }, 'No dated tasks.')));
    }
    function list() {
      put(body, archived ? readOnlyNotice('This project is archived') : null, ...TASK_STATUS.map(([k, title]) => { const rows = byStatus(tasks)[k];
        return h('section', { class: 'pj-sec' }, h('h2', { class: 'pj-gh' }, title, h('span', { class: 'fine muted' }, ` ${rows.length}`)), rows.length ? h('ul', { class: 'pj-rows' }, ...rows.map(taskRow)) : h('p', { class: 'fine muted' }, 'Nothing here.'), addBox(k)); }));
    }
    function board() {
      const cols = byStatus(tasks); let dragId = null;
      put(body, archived ? readOnlyNotice('This project is archived') : null, h('p', { class: 'fine muted pj-hint' }, tasksOk ? 'Drag a card to another column, or open it to change its status.' : 'You can look at the board but not change it.'),
        h('div', { class: 'pj-board' }, ...TASK_STATUS.map(([k, title]) => { const col = h('div', { class: 'pj-col', 'data-status': k, role: 'group', 'aria-label': title },
          h('h2', { class: 'pj-gh' }, title, h('span', { class: 'fine muted' }, ` ${cols[k].length}`)),
          ...cols[k].map((t) => h('button', { type: 'button', class: 'pj-cardtask', draggable: tasksOk ? 'true' : 'false', 'data-id': t.id, onclick: () => openTask(t), ondragstart: (e) => { dragId = t.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); } },
            h('strong', {}, t.title), h('span', { class: 'fine muted' }, [t.assignee_id ? personName(t.assignee_id) : '', t.due_on ? dueLabel(t.due_on, todayIso()) : ''].filter(Boolean).join(' · ')))), addBox(k));
          if (tasksOk) { col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); }); col.addEventListener('dragleave', () => col.classList.remove('over'));
            col.addEventListener('drop', (e) => { e.preventDefault(); col.classList.remove('over'); const t = tasks.find((x) => x.id === (dragId ?? e.dataTransfer.getData('text/plain'))); dragId = null; if (t && t.status !== k) setStatus(t, k, Math.min(100000, cols[k].length ? Math.max(...cols[k].map((x) => x.position)) + 1 : 0)); }); }
          return col; })));
    }
    function calendar() {
      const grid = monthGrid(month.year, month.month, tasks, { today: todayIso() });
      put(body, archived ? readOnlyNotice('This project is archived') : null, h('div', { class: 'pj-calbar' }, btn('Previous month', () => { month = shiftMonth(month.year, month.month, -1); calendar(); }), h('h2', { 'aria-live': 'polite' }, monthTitle(month.year, month.month)), btn('Next month', () => { month = shiftMonth(month.year, month.month, 1); calendar(); })),
        h('div', { class: 'pj-cal', role: 'grid', 'aria-label': monthTitle(month.year, month.month) }, ...['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => h('div', { class: 'pj-dow', role: 'columnheader' }, d)),
          ...grid.flat().map((c) => h('div', { class: `pj-day${c.inMonth ? '' : ' out'}${c.today ? ' today' : ''}`, role: 'gridcell', 'aria-label': c.date }, h('span', { class: 'pj-dn' }, String(Number(c.date.slice(8)))), ...c.tasks.slice(0, 3).map((t) => h('button', { type: 'button', class: `pj-chipt ${t.status}`, onclick: () => openTask(t), title: t.title }, t.title)), c.tasks.length > 3 ? h('span', { class: 'fine muted' }, `+${c.tasks.length - 3} more`) : null))));
    }
    function timelineTab() {
      const tl = timeline(p, tasks, todayIso());
      put(body, archived ? readOnlyNotice('This project is archived') : null, !tl ? emptyState({ title: 'No dates yet', body: 'Give the project a start and due date, or add due dates to tasks, to see the timeline.', ic: 'clock' })
        : h('div', { class: 'pj-tl', role: 'img', 'aria-label': 'Project timeline' }, h('div', { class: 'pj-ticks' }, ...tl.ticks.map((t) => h('span', { style: `left:${t.left}%` }, t.date.slice(5)))),
          h('div', { class: 'pj-track' }, tl.today != null ? h('i', { class: 'pj-today', style: `left:${tl.today}%`, title: 'Today' }) : null, tl.project ? h('b', { class: 'pj-pbar', style: `left:${tl.project.left}%;width:${tl.project.width}%` }, p.name) : null),
          ...tl.marks.map((m) => h('div', { class: 'pj-track' }, h('button', { type: 'button', class: `pj-mark ${m.status}${m.overdue ? ' late' : ''}`, style: `left:${m.left}%`, onclick: () => openTask(tasks.find((x) => x.id === m.id)) }, m.title)))));
    }
    async function files(kind) {
      put(body, skeleton(3)); const r2 = await api.call('drive.project.files', { project: p.id, kind: 'document', mime: kind === 'board' ? BOARD_MIME : DOC_MIME }); if (!live()) return;
      if (!r2.ok) return put(body, errorState(() => files(kind)));
      const rows = r2.data.filter((f) => (kind === 'board') === (f.mime_type === BOARD_MIME));
      const mk = async () => {
        const nm = field({ id: 'nf-name', label: kind === 'board' ? 'Whiteboard name' : 'Document name', value: kind === 'board' ? 'New whiteboard' : 'Untitled document', maxlength: 200 });
        dialog({ title: kind === 'board' ? 'New whiteboard' : 'New document', body: nm.el, actions: [{ label: 'Create', cls: 'pri', on: async () => {
          const name = nm.input.value.trim(); if (!name || /[\/\\]/.test(name)) return nm.error('Use a name without slashes.');
          const ctxSpace = p.client_id ? { space: 'client', client: p.client_id, project: p.id } : { space: 'shared', project: p.id };
          const x = kind === 'board' ? await createBoard(api, name, ctxSpace) : await api.call('drive.files.create', { app: 'projects', ...ctxSpace, name, kind: 'document', mime_type: DOC_MIME, body: serialize(emptyDoc()) });
          if (!x.ok) { fail(x, 'add files'); return false; } go(kind === 'board' ? `#/board/${x.data[0].id}` : `#/doc/${x.data[0].id}`);
        } }, { label: 'Cancel' }] });
      };
      put(body, archived ? readOnlyNotice('This project is archived') : null, h('div', { class: 'pj-calbar' }, h('h2', {}, kind === 'board' ? 'Whiteboards' : 'Docs'), tasksOk && ctx.canAnywhere('drive.file.upload') ? btn(kind === 'board' ? 'New whiteboard' : 'New document', mk, 'pri') : null),
        rows.length ? h('ul', { class: 'pj-rows' }, ...rows.map((f) => h('li', { class: 'pj-row' }, icon(kind === 'board' ? 'wb' : 'doc'), h('a', { class: 'pj-title', href: kind === 'board' ? `#/board/${f.id}` : `#/doc/${f.id}` }, f.name), h('span', { class: 'fine muted' }, `Version ${f.current_version}`), h('span', { class: 'fine muted' }, new Date(f.updated_at).toLocaleDateString()))))
          : emptyState({ title: kind === 'board' ? 'No whiteboards yet' : 'No documents yet', body: `${kind === 'board' ? 'Boards' : 'Documents'} made here belong to this project and open inside it. They are not listed in Drive unless you add them there.`, ic: kind === 'board' ? 'wb' : 'doc', first: true }));
    }
    const docs = () => files('doc'), whiteboards = () => files('board');
    put(main, head, tabBar, body); draw();
    if (route.query.task) { const t = tasks.find((x) => x.id === route.query.task); if (t) openTask(t); }
  }

  const projectMenu = (p, archived) => h('div', { class: 'pj-menu' }, archived
    ? btn('Restore project', async () => { const r = await api.call('projects.restore', { id: p.id }); if (r.ok) { toast('Project restored.'); go(hrefs.project(p.id)); } else fail(r, 'restore this project'); })
    : btn('Archive project', () => dialog({ title: 'Archive this project?', body: h('p', {}, 'It leaves the lists and your dashboards. You can still find it with search (is:archived) and restore it.'), actions: [{ label: 'Archive', cls: 'pri', on: async () => { const r = await api.call('projects.archive', { id: p.id }); if (!r.ok) { fail(r, 'archive this project'); return false; } toast('Project archived.'); go(hrefs.home()); } }, { label: 'Cancel', focus: true }] })));
  const editProject = (p) => {
    const name = field({ id: 'ep-name', label: 'Name', value: p.name, maxlength: 200 }); const desc = field({ id: 'ep-desc', label: 'Description', value: p.description ?? '', rows: 4 });
    const st = h('select', { id: 'ep-status', 'aria-label': 'Status' }, ...opts(PROJECT_STATUS, p.status)); const start = field({ id: 'ep-start', label: 'Start', type: 'date', value: p.start_on ?? '' }); const due = field({ id: 'ep-due', label: 'Due', type: 'date', value: p.due_on ?? '' });
    dialog({ title: 'Edit project', wide: true, body: [name.el, desc.el, h('div', { class: 'fld' }, h('label', { for: 'ep-status' }, 'Status'), st), start.el, due.el],
      actions: [{ label: 'Save', cls: 'pri', on: async () => { const nm = name.input.value.trim(); if (!nm) return name.error('A project needs a name.');
        const r = await api.call('projects.update', { id: p.id, name: nm, description: desc.input.value, status: st.value, ...(start.input.value ? { start_on: start.input.value } : {}), ...(due.input.value ? { due_on: due.input.value } : {}) });
        if (!r.ok) { fail(r, 'change this project'); return false; } toast('Saved.'); project(); } }, { label: 'Cancel' }] });
  };

  // ---------------------------------------------------------------- task drawer
  async function taskDrawer(t0, p, { onChange, canEdit }) {
    await people(); let t = t0; const saved = h('span', { class: 'fine muted', role: 'status', 'aria-live': 'polite' });
    const save = async (patch) => { const r = await api.call('tasks.update', { id: t.id, ...patch }); if (r.ok) { t = r.data[0]; saved.textContent = 'Saved.'; onChange(); } else { saved.textContent = ''; fail(r, 'change that task'); } };
    const title = h('input', { class: 'doctitle', value: t.title, maxlength: '300', 'aria-label': 'Task title', ...(canEdit ? {} : { readonly: true }) });
    title.addEventListener('change', () => { const v = title.value.trim(); if (!v) { title.value = t.title; return; } save({ title: v }); });
    const sel = (id, lbl, list, cur, key) => h('div', { class: 'fld' }, h('label', { for: id }, lbl), h('select', { id, ...(canEdit ? {} : { disabled: true }), onchange: (e) => save({ [key]: e.target.value }) }, ...opts(list, cur)));
    const who = h('select', { id: 'td-who', ...(canEdit ? {} : { disabled: true }), onchange: (e) => save(e.target.value ? { assignee: e.target.value } : { clear_assignee: true }) }, h('option', { value: '' }, 'Unassigned'), ...(state.people ?? []).map((x) => h('option', { value: x.user_id, ...(x.user_id === t.assignee_id ? { selected: true } : {}) }, x.is_you ? `${x.display_name} (you)` : x.display_name)));
    const due = h('input', { id: 'td-due', type: 'date', value: t.due_on ?? '', ...(canEdit ? {} : { disabled: true }), onchange: (e) => save(e.target.value ? { due_on: e.target.value } : { clear_due: true }) });
    const notes = h('textarea', { id: 'td-notes', rows: 5, maxlength: '20000', ...(canEdit ? {} : { readonly: true }) }); notes.value = t.notes ?? ''; notes.addEventListener('change', () => save({ notes: notes.value }));
    const checklist = h('div', { class: 'pj-check-list' });
    const drawChecklist = async () => { const r = await api.call('checklist.list', { task: t.id }); if (!r.ok) return;
      put(checklist, h('ul', { class: 'pj-rows' }, ...r.data.map((c) => h('li', { class: 'pj-row' }, h('input', { type: 'checkbox', checked: c.done, 'aria-label': c.label, ...(canEdit ? { onchange: async (e) => { await api.call('checklist.update', { id: c.id, done: e.target.checked }); onChange(); } } : { disabled: true }) }), h('span', {}, c.label), canEdit ? btn(['Remove', h('span', { class: 'sr' }, ` ${c.label}`)], async () => { await api.call('checklist.delete', { id: c.id }); drawChecklist(); onChange(); }, 'link') : null))),
        canEdit ? h('form', { class: 'pj-add', onsubmit: async (e) => { e.preventDefault(); const i = e.target.elements.l; const v = i.value.trim(); if (!v) return; i.value = ''; await api.call('checklist.add', { task: t.id, label: v }); drawChecklist(); onChange(); } }, h('input', { name: 'l', placeholder: 'Add a subtask', 'aria-label': 'Add a subtask', maxlength: 500 }), btn('Add', null, '', { type: 'submit' })) : null); };
    // timer for this task + logged time
    const timeBox = h('div', { class: 'pj-time' });
    const drawTime = async () => { const r = await api.call('time.list', { task: t.id }); const secs = (r.ok ? r.data : []).reduce((a, e) => a + (e.seconds ?? 0), 0); const running = state.timer && state.timer.task_id === t.id;
      put(timeBox, h('div', {}, h('b', {}, duration(secs)), h('span', { class: 'fine muted' }, ' logged on this task')),
        canTime() ? h('div', { class: 'pj-timeacts' }, running ? btn('Stop timer', async () => { const x = await api.call('time.stop', {}); if (x.ok) { state.timer = null; paintTimer(); drawTime(); } else fail(x, 'stop that timer'); }, 'pri') : btn('Start timer', async () => { const x = await api.call('time.start', { project: p.id, task: t.id }); if (x.ok) { await loadTimer(); drawTime(); } else if (x.status === 409 || x.status === 422) toast('A timer is already running. Stop it first.', false); else fail(x, 'start a timer'); }, ''),
          btn('Log time by hand', () => logTime(t, p, drawTime), '')) : null); };
    const share = p.client_id && ctx.can('projects.record.share', p.client_id) ? h('label', { class: 'pj-share' }, h('input', { type: 'checkbox', checked: t.client_visible, onchange: async (e) => { const r = await api.call('tasks.share', { id: t.id, visible: e.target.checked }); if (!r.ok) { e.target.checked = !e.target.checked; fail(r, 'share that task'); } else onChange(); } }), ' Show this task to the client') : null;
    const body = [h('div', { class: 'fld' }, h('label', { for: 'td-title' }, 'Task'), title), saved, sel('td-status', 'Status', TASK_STATUS, t.status, 'status'), sel('td-prio', 'Priority', PRIORITY, t.priority, 'priority'), h('div', { class: 'fld' }, h('label', { for: 'td-who' }, 'Assigned to'), who), h('div', { class: 'fld' }, h('label', { for: 'td-due' }, 'Due'), due),
      h('div', { class: 'fld' }, h('label', { for: 'td-notes' }, 'Notes'), notes), h('h3', {}, 'Subtasks'), checklist, h('h3', {}, 'Time'), timeBox, share,
      h('div', { class: 'pj-soon-row' }, btn('Suggest with AI', null, '', { disabled: true, 'aria-disabled': 'true', title: 'Not available: no AI provider is switched on' }), btn('Comments', null, '', { disabled: true, 'aria-disabled': 'true', title: 'Comments arrive with the notification layer' }))];
    title.id = 'td-title';
    drawer({ title: 'Task', label: `Task: ${t.title}`, body, actions: canEdit ? [{ label: 'Archive task', on: async () => { const r = await api.call('tasks.archive', { id: t.id }); if (!r.ok) { fail(r, 'archive that task'); return; } toast('Task archived.'); onChange(); } }, { label: 'Done', cls: 'pri' }] : [{ label: 'Close', cls: 'pri' }] });
    drawChecklist(); drawTime();
  }
  const logTime = (t, p, after) => {
    const mins = field({ id: 'lt-min', label: 'Minutes', type: 'number', value: '30' }); const note = field({ id: 'lt-note', label: 'Note (optional)', maxlength: 500 });
    dialog({ title: 'Log time', body: [mins.el, note.el], actions: [{ label: 'Log', cls: 'pri', on: async () => { const m = Math.round(Number(mins.input.value)); if (!(m >= 1 && m <= 1440)) return mins.error('Enter minutes between 1 and 1440.');
      const end = new Date(); const start = new Date(end.getTime() - m * 60000);
      const r = await api.call('time.log', { project: p.id, task: t.id, started_at: start.toISOString(), ended_at: end.toISOString(), ...(note.input.value ? { note: note.input.value } : {}) });
      if (!r.ok) { fail(r, 'log time'); return false; } toast('Time logged.'); after(); } }, { label: 'Cancel' }] });
  };

  // ---------------------------------------------------------------- smart search (Ctrl/Cmd-K)
  function openSearch() {
    const input = h('input', { type: 'search', class: 'cmdk-in', placeholder: 'Search projects, tasks and docs. Try is:archived, @me, overdue', 'aria-label': 'Search Projects', autocomplete: 'off', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'cmdk-list' });
    const list = h('ul', { class: 'cmdk-list', id: 'cmdk-list', role: 'listbox', 'aria-label': 'Results' }); let items = []; let sel = -1; let timer = null; let close = () => {};
    const chips = h('div', { class: 'cmdk-chips' }, ...[['', 'All'], ['is:project', 'Projects'], ['is:task', 'Tasks'], ['is:doc', 'Docs'], ['is:archived', 'Archived'], ['@me', 'Assigned to me'], ['overdue', 'Overdue']].map(([f, t]) => h('button', { type: 'button', class: 'chip', onclick: () => { const cur = input.value.split(/\s+/).filter(Boolean); if (!f) input.value = cur.filter((w) => !/^(is:|@me|overdue)/i.test(w)).join(' '); else if (!cur.includes(f)) input.value = [...cur, f].join(' '); input.focus(); run(); } }, t)));
    const paint = () => list.replaceChildren(...(items.length ? items.map((r, n) => h('li', { role: 'option', id: `cmdk-${n}`, 'aria-selected': String(n === sel), class: n === sel ? 'sel' : '', onclick: () => pick(r) }, icon(r.kind === 'project' ? 'prj' : r.kind === 'task' ? 'check' : r.mime_type === BOARD_MIME ? 'wb' : 'doc'), h('span', { class: 'cmdk-t' }, r.label), h('span', { class: 'fine muted' }, r.kind === 'project' ? 'Project' : `${r.kind === 'task' ? 'Task' : r.mime_type === BOARD_MIME ? 'Whiteboard' : 'Doc'} · ${r.sub}`), r.archived ? chip('Archived', 'warn') : null)) : [h('li', { class: 'cmdk-empty' }, input.value.trim() ? 'No match. Add is:archived to look in archived work.' : 'Nothing yet.')]));
    const pick = (r) => { close(); go(r.kind === 'project' ? hrefs.project(r.id) : r.kind === 'task' ? hrefs.task(r.project_id, r.id) : r.mime_type === BOARD_MIME ? `#/board/${r.id}` : `#/doc/${r.id}`); };
    const run = async () => { const r = await api.call('projects.search', searchInput(parseSearch(input.value))); if (!r.ok) { items = []; return paint(); } items = r.data; sel = items.length ? 0 : -1; paint(); input.setAttribute('aria-activedescendant', sel >= 0 ? `cmdk-${sel}` : ''); };
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 180); });
    input.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length) return; sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; paint(); input.setAttribute('aria-activedescendant', `cmdk-${sel}`); list.children[sel]?.scrollIntoView({ block: 'nearest' }); } else if (e.key === 'Enter' && items[sel]) { e.preventDefault(); pick(items[sel]); } });
    close = dialog({ title: 'Search', wide: true, body: [input, chips, list], actions: [{ label: 'Close' }] }); run(); input.focus();
  }
  const key = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { if (!root.isConnected) { document.removeEventListener('keydown', key); return; } e.preventDefault(); openSearch(); } };
  document.addEventListener('keydown', key);

  // ---------------------------------------------------------------- mount
  root.append(timerBar, h('div', { class: 'pj-grid' }, side, main)); paintSide(route.id); loadTimer();
  (route.view === 'mine' ? mine : route.view === 'project' ? project : home)();
  return root;
}
