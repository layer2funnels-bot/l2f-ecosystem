// Projects: the shared Projects experience (home list, My Work, project workspace with List / Board / Calendar / Timeline / Docs / Whiteboards,
// task drawer with timer, smart search). One module so that the Projects app and, later, Office > Projects (V4-2) mount the very same screens and data.
// Everything goes through the permission-checked API; buttons follow `ctx.can`, the database decides. Logic lives in projectmodel.js (tested without a browser).
import { h, put, icon, btn, chip, dialog, drawer, toast, field, notice, skeleton, emptyState, errorState, noAccessState, seg, tabs, readOnlyNotice } from '../ui.js';
import { splitProjects, PROJECT_STATUS, TASK_STATUS, PRIORITY, label, byStatus, sortTasks, viewTasks, groupTasks, progress, monthGrid, monthTitle, shiftMonth, timeline, dueLabel, myWorkGroups, parseSearch, searchInput, duration, clock } from './projectmodel.js';
import { createBoard, BOARD_MIME } from './whiteboard.js';
import { emptyDoc, serialize } from './docmodel.js';
import { commentsPanel, activityPanel, followButton } from './collab.js';
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
  const newProject = (preset = null) => {
    const name = field({ id: 'np-name', label: 'Project name', maxlength: 200 });
    const client = h('select', { id: 'np-client', 'aria-label': 'Client' }, h('option', { value: '' }, 'Internal (no client)'), ...[...(ctx.clients ?? new Map())].filter(([cid]) => ctx.can('projects.project.create', cid)).map(([cid, n]) => h('option', { value: cid }, n)));
    const due = field({ id: 'np-due', label: 'Due date (optional)', type: 'date' });
    // start from a template: its sections, tasks, subtasks, checklists and tags, with dates moved to the chosen start
    const from = h('select', { id: 'np-from', 'aria-label': 'Start from' }, h('option', { value: '' }, 'A blank project'), ...(state.templates ?? []).map((t) => h('option', { value: t.id, ...(t.id === preset ? { selected: true } : {}) }, `Template: ${t.name}`)));
    const start = field({ id: 'np-start', label: 'Start date (moves the template\'s dates)', type: 'date', value: todayIso() });
    const showStart = () => { start.el.hidden = !from.value; due.el.hidden = Boolean(from.value); };
    from.addEventListener('change', showStart);
    dialog({ title: 'New project', body: [name.el, (state.templates ?? []).length ? h('div', { class: 'fld' }, h('label', { for: 'np-from' }, 'Start from'), from) : null, h('div', { class: 'fld' }, h('label', { for: 'np-client' }, 'For'), client), due.el, start.el].filter(Boolean),
      actions: [{ label: 'Create project', cls: 'pri', on: async () => {
        const nm = name.input.value.trim(); if (!nm) return name.error('Give the project a name.');
        const r = from.value ? await api.call('projects.duplicate', { id: from.value, name: nm, ...(client.value ? { client: client.value } : {}), ...(start.input.value ? { start_on: start.input.value } : {}) })
          : await api.call('projects.create', { name: nm, ...(client.value ? { client: client.value } : {}), ...(due.input.value ? { due_on: due.input.value } : {}) });
        if (!r.ok) { fail(r, 'create projects'); return false; }
        toast('Project created.'); go(hrefs.project(r.data[0].id));
      } }, { label: 'Cancel' }] });
  };

  // ---------------------------------------------------------------- home
  async function home() {
    put(main, h('div', { class: 'pj-head' }, h('div', {}, h('div', { class: 'crumbs fine' }, 'Projects'), h('h1', { 'data-page-title': true }, 'Projects')), ctx.canAnywhere('projects.project.create') ? btn('New project', newProject, 'pri') : null), skeleton(4));
    const [r, tr] = await Promise.all([loadProjects(), api.call('projects.list', { templates: true })]); if (!live()) return;
    if (!r.ok) return put(main, errorState(home));
    state.templates = tr.ok ? tr.data : [];
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
    const tplCard = (t) => h('div', { class: 'pj-card pj-tpl' }, h('div', { class: 'pj-card-top' }, h('strong', {}, t.name), chip('Template')), h('div', { class: 'fine muted' }, `${t.tasks_total} task${t.tasks_total === 1 ? '' : 's'}`),
      h('div', { class: 'pj-timeacts' }, ctx.canAnywhere('projects.project.create') ? btn('Use template', () => newProject(t.id), 'pri') : null, h('a', { class: 'btn', href: hrefs.project(t.id) }, 'Edit')));
    const tpls = state.templates.length ? h('section', { 'aria-labelledby': 'pj-tp', class: 'pj-tpls' }, h('h2', { id: 'pj-tp', class: 'pj-gh' }, 'Templates'), h('p', { class: 'fine muted' }, 'Start a project with these sections and tasks already in place. Make one from any project: Save as template.'), h('div', { class: 'pj-cards' }, ...state.templates.map(tplCard))) : null;
    main.append(seg([['open', 'Open'], ['all', 'All'], ['done', 'Done']], filter, (k) => { filter = k; draw(); }, 'Show projects'), list, tpls); draw();
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
    const [tr, sr] = await Promise.all([api.call('tasks.list', { project: p.id, archived: false }), api.call('sections.list', { project: p.id }), people()]); if (!live()) return;
    let sections = sr.ok ? sr.data : []; state.sections = sections;
    let tasks = tr.ok ? tr.data : []; state.projectTasks = tasks; const archived = Boolean(p.archived_at); const editable = canProject(p) && !archived; const tasksOk = canTask() && !archived;
    let tab = route.query.tab ?? 'overview'; let month = (() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() + 1 }; })();
    const body = h('div', { class: 'pj-body' });
    const reload = async () => { const x = await api.call('tasks.list', { project: p.id, archived: false }); if (x.ok) { tasks = x.data; state.projectTasks = tasks; } draw(); };
    const addTask = async (title, extra = {}) => { const t = title.trim(); if (!t) return; const x = await api.call('tasks.create', { project: p.id, title: t, ...extra }); if (x.ok) { toast('Task added.'); await reload(); } else fail(x, 'add tasks'); };
    const setStatus = async (t, status, position) => { const x = await api.call('tasks.update', { id: t.id, status, ...(position != null ? { position } : {}) }); if (x.ok) await reload(); else fail(x, 'change that task'); };
    const openTask = (t) => taskDrawer(t, p, { onChange: reload, canEdit: tasksOk });
    const tops = () => tasks.filter((t) => !t.parent_task_id);     // List and Board show tasks; subtasks live inside their task (Calendar and Timeline show both)

    const head = h('div', { class: 'pj-head' }, h('div', {}, h('div', { class: 'crumbs fine' }, h('a', { href: hrefs.home() }, 'Projects'), ' / ', p.client_id ? clientName(p.client_id) : 'Internal'),
      h('h1', { 'data-page-title': true }, p.name), h('div', { class: 'pj-meta' }, statusChip(p.status), p.is_template ? chip('Template', 'act') : null, p.due_on ? h('span', { class: 'fine muted' }, `Due ${dueLabel(p.due_on, todayIso())}`) : null, archived ? chip('Archived', 'warn') : null)),
      h('div', { class: 'pj-actions' }, editable ? btn('Edit details', () => editProject(p), '') : null, editable || archived ? projectMenu(p, archived) : null));
    const TABS = [['overview', 'Overview'], ['list', 'List'], ['board', 'Board'], ['calendar', 'Calendar'], ['timeline', 'Timeline'], ['docs', 'Docs'], ['whiteboards', 'Whiteboards']];
    const tabBar = tabs(TABS, TABS.some(([k]) => k === tab) ? tab : 'overview', (k) => { tab = k; history.replaceState(null, '', hrefs.project(p.id, k)); draw(); }, 'Project views');

    function draw() {
      const cur = TABS.some(([k]) => k === tab) ? tab : 'overview'; tabBar.querySelectorAll('[role=tab][data-k]').forEach((b) => { b.setAttribute('aria-selected', String(b.dataset.k === cur)); b.tabIndex = b.dataset.k === cur ? 0 : -1; });
      ({ overview, list, board, calendar, timelineTab, docs, whiteboards })[cur === 'timeline' ? 'timelineTab' : cur]();
    }
    const selected = new Set();           // tasks picked in the List for a change to all of them at once
    const taskRow = (t, { select = false } = {}) => h('li', { class: `pj-row${t.status === 'done' ? ' isdone' : ''}${selected.has(t.id) ? ' picked' : ''}` },
      select && tasksOk ? h('input', { type: 'checkbox', class: 'pj-pick', 'aria-label': `Select “${t.title}”`, ...(selected.has(t.id) ? { checked: true } : {}), onchange: (e) => { if (e.target.checked) selected.add(t.id); else selected.delete(t.id); draw(); } }) : null,
      h('button', { type: 'button', class: 'pj-check', 'aria-pressed': String(t.status === 'done'), 'aria-label': `${t.status === 'done' ? 'Reopen' : 'Mark done'}: ${t.title}`, ...(tasksOk ? { onclick: () => setStatus(t, t.status === 'done' ? 'todo' : 'done') } : { disabled: true }) }),
      h('button', { type: 'button', class: 'pj-title', onclick: () => openTask(t) }, t.title),
      ...(t.tags ?? []).slice(0, 3).map((g) => chip(g.name, `tag-${g.color}`)), t.assignee_id ? h('span', { class: 'fine muted' }, personName(t.assignee_id)) : null,
      t.subtasks_total ? h('span', { class: 'fine muted', title: 'Subtasks done' }, icon('check'), ` ${t.subtasks_done}/${t.subtasks_total}`) : null, t.checklist_total ? h('span', { class: 'fine muted', title: 'Checklist' }, `${t.checklist_done}/${t.checklist_total}`) : null,
      t.files_total ? h('span', { class: 'fine muted', title: 'Files' }, icon('doc'), ` ${t.files_total}`) : null, t.waiting_on && t.status !== 'done' ? chip(`Waiting on ${t.waiting_on}`, 'warn', 'clock') : null, t.repeat ? h('span', { class: 'fine muted', title: 'Repeats' }, '↻') : null,
      chip(label(PRIORITY, t.priority), t.priority === 'urgent' ? 'bad' : t.priority === 'high' ? 'warn' : ''), h('span', { class: `pj-due${t.status !== 'done' && t.due_on && t.due_on < todayIso() ? ' late' : ''}` }, t.due_on ? dueLabel(t.due_on, todayIso()) : ''));
    // a new task takes the group it is added in: its status, section, person or priority
    const addBox = (extra = {}, where = '') => tasksOk ? h('form', { class: 'pj-add', onsubmit: (e) => { e.preventDefault(); const i = e.target.elements.t; const v = i.value; i.value = ''; addTask(v, extra); } }, h('input', { name: 't', placeholder: 'Add a task', 'aria-label': `Add a task${where ? ` (${where})` : ''}`, maxlength: 300 }), btn('Add', null, '', { type: 'submit' })) : null;
    const extraFor = (by, key) => (by === 'status' ? { status: key } : by === 'section' && key ? { section: key } : by === 'assignee' && key ? { assignee: key } : by === 'priority' ? { priority: key } : {});

    // the List's choices are remembered per project on this device
    const VIEW_KEY = `pj.view.${p.id}`;
    const view = (() => { try { return { group: 'status', sort: 'manual', q: '', assignee: '', tag: '', hideDone: false, ...JSON.parse(localStorage.getItem(VIEW_KEY) || '{}'), q: '' }; } catch { return { group: 'status', sort: 'manual', q: '', assignee: '', tag: '', hideDone: false }; } })();
    const setView = (patch) => { Object.assign(view, patch); try { const { q: _q, ...keep } = view; localStorage.setItem(VIEW_KEY, JSON.stringify(keep)); } catch { /* not remembered */ } draw(); };
    const sectionOps = {
      add: () => { const nm = field({ id: 'ns-name', label: 'Section name', maxlength: 100 }); dialog({ title: 'New section', body: nm.el, actions: [{ label: 'Add section', cls: 'pri', on: async () => { const v = nm.input.value.trim(); if (!v) return nm.error('Give the section a name.'); const x = await api.call('sections.create', { project: p.id, name: v }); if (!x.ok) { fail(x, 'add sections'); return false; } sections.push(x.data[0]); state.sections = sections; if (view.group !== 'section') setView({ group: 'section' }); else draw(); } }, { label: 'Cancel' }] }); },
      rename: (sec) => { const nm = field({ id: 'rs-name', label: 'Section name', value: sec.name, maxlength: 100 }); dialog({ title: 'Rename section', body: nm.el, actions: [{ label: 'Save', cls: 'pri', on: async () => { const v = nm.input.value.trim(); if (!v) return nm.error('A section needs a name.'); const x = await api.call('sections.update', { id: sec.id, name: v }); if (!x.ok) { fail(x, 'rename sections'); return false; } sec.name = v; draw(); } }, { label: 'Cancel' }] }); },
      move: async (sec, by) => { const i = sections.indexOf(sec), j = i + by; if (j < 0 || j >= sections.length) return; [sections[i], sections[j]] = [sections[j], sections[i]]; draw(); await Promise.all(sections.map((x, n) => api.call('sections.update', { id: x.id, position: n }))); },
      remove: (sec) => dialog({ title: `Remove “${sec.name}”?`, body: h('p', {}, 'Its tasks stay in the project, under “No section”.'), actions: [{ label: 'Remove section', cls: 'pri', on: async () => { const x = await api.call('sections.delete', { id: sec.id }); if (!x.ok) { fail(x, 'remove sections'); return false; } sections = sections.filter((y) => y.id !== sec.id); state.sections = sections; await reload(); } }, { label: 'Cancel', focus: true }] }),
    };
    const toolbar = () => {
      const tagsSeen = [...new Map(tops().flatMap((t) => t.tags ?? []).map((g) => [g.id, g])).values()].sort((a, b) => a.name.localeCompare(b.name));
      const sel = (id, lbl, list, cur, on) => h('label', { class: 'pj-tool', for: id }, h('span', {}, lbl), h('select', { id, onchange: (e) => on(e.target.value) }, ...list.map(([k, t]) => h('option', { value: k, ...(k === cur ? { selected: true } : {}) }, t))));
      const search = h('input', { type: 'search', id: 'pj-q', placeholder: 'Find a task', value: view.q, 'aria-label': 'Find a task in this project', autocomplete: 'off' });
      search.addEventListener('input', () => { view.q = search.value; const pos = search.selectionStart; draw(); const again = body.querySelector('#pj-q'); again?.focus(); again?.setSelectionRange(pos, pos); });
      return h('div', { class: 'pj-toolbar', role: 'search' }, search,
        sel('pj-who', 'Person', [['', 'Anyone'], ...(state.people ?? []).map((x) => [x.user_id, x.is_you ? `${x.display_name} (you)` : x.display_name]), ['none', 'Unassigned']], view.assignee, (v) => setView({ assignee: v })),
        tagsSeen.length ? sel('pj-tag', 'Tag', [['', 'Any tag'], ...tagsSeen.map((g) => [g.id, g.name])], view.tag, (v) => setView({ tag: v })) : null,
        sel('pj-group', 'Group by', [['status', 'Status'], ['section', 'Section'], ['assignee', 'Person'], ['priority', 'Priority'], ['due', 'Due date']], view.group, (v) => setView({ group: v })),
        sel('pj-sort', 'Sort', [['manual', 'Manual order'], ['due', 'Due date'], ['priority', 'Priority'], ['title', 'Name'], ['newest', 'Newest']], view.sort, (v) => setView({ sort: v })),
        h('label', { class: 'pj-tool pj-toggle' }, h('input', { type: 'checkbox', ...(view.hideDone ? { checked: true } : {}), onchange: (e) => setView({ hideDone: e.target.checked }) }), h('span', {}, 'Hide done')),
        tasksOk ? btn([icon('plus'), 'Section'], sectionOps.add, '') : null);
    };
    // change every selected task at once (the database skips any the person may not edit)
    const bulkBar = () => {
      if (!selected.size || !tasksOk) return null;
      const run = async (patch, done) => { const x = await api.call('tasks.bulk', { ids: [...selected], ...patch }); if (!x.ok) return fail(x, 'change those tasks'); const n = x.data[0].n; toast(`${done} ${n} task${n === 1 ? '' : 's'}.`); if (n < selected.size) toast(`${selected.size - n} could not be changed by you.`, false); selected.clear(); await reload(); };
      const pick = (lbl, list, on) => h('select', { 'aria-label': lbl, onchange: (e) => { const v = e.target.value; e.target.value = ''; if (v) on(v); } }, h('option', { value: '' }, lbl), ...list.map(([k, t]) => h('option', { value: k }, t)));
      const due = h('input', { type: 'date', 'aria-label': 'Set due date', onchange: (e) => { if (e.target.value) run({ due_on: e.target.value }, 'New due date on'); } });
      return h('div', { class: 'pj-bulk', role: 'region', 'aria-label': 'Change selected tasks' }, h('b', {}, `${selected.size} selected`),
        btn('Mark done', () => run({ status: 'done' }, 'Marked done:'), 'pri'),
        pick('Status…', TASK_STATUS, (v) => run({ status: v }, 'Status changed on')),
        pick('Assign to…', [...(state.people ?? []).map((x) => [x.user_id, x.display_name]), ['none', 'Nobody']], (v) => run(v === 'none' ? { clear_assignee: true } : { assignee: v }, 'Reassigned')),
        pick('Priority…', PRIORITY, (v) => run({ priority: v }, 'Priority changed on')),
        sections.length ? pick('Section…', [...sections.map((x) => [x.id, x.name]), ['none', 'No section']], (v) => run(v === 'none' ? { clear_section: true } : { section: v }, 'Moved')) : null,
        due, btn('Archive', () => dialog({ title: `Archive ${selected.size} task${selected.size === 1 ? '' : 's'}?`, body: h('p', {}, 'They leave the lists. You can find and restore them with search (is:archived).'), actions: [{ label: 'Archive', cls: 'pri', on: () => run({ archive: true }, 'Archived') }, { label: 'Cancel', focus: true }] }), ''),
        btn('Clear', () => { selected.clear(); draw(); }, 'link'));
    };

    function overview() {
      const open = tasks.filter((t) => t.status !== 'done'); const late = open.filter((t) => t.due_on && t.due_on < todayIso()); const next = open.filter((t) => t.due_on).sort((a, b) => a.due_on.localeCompare(b.due_on)).slice(0, 5);
      const stat = (n, t, cls = '') => h('div', { class: `pj-stat ${cls}` }, h('b', {}, String(n)), h('span', {}, t));
      const hours = h('b', {}, '…'); api.call('time.summary', { project: p.id, from: '2000-01-01', to: '2999-12-31' }).then((x) => { if (live()) hours.textContent = duration((x.ok ? x.data : []).reduce((a, r2) => a + r2.seconds, 0)); });
      put(body, archived ? readOnlyNotice('This project is archived') : null, h('div', { class: 'pj-stats' }, stat(open.length, 'open tasks'), stat(tasks.length - open.length, 'done'), stat(late.length, 'overdue', late.length ? 'late' : ''), h('div', { class: 'pj-stat' }, hours, h('span', {}, 'time logged'))),
        bar(p), h('section', { class: 'pj-sec' }, h('h2', {}, 'About'), h('p', { class: p.description ? '' : 'muted' }, p.description || 'No description yet.')),
        h('section', { class: 'pj-sec' }, h('h2', {}, 'Coming up'), next.length ? h('ul', { class: 'pj-rows' }, ...next.map(taskRow)) : h('p', { class: 'muted' }, 'No dated tasks.')));
    }
    function list() {
      const shown = viewTasks(tops(), view);
      for (const id2 of [...selected]) if (!shown.some((t) => t.id === id2)) selected.delete(id2);   // only what is on screen stays selected
      const groups = groupTasks(shown, view.group, { sections, name: personName, today: todayIso() });
      const filtered = view.q || view.assignee || view.tag || view.hideDone;
      const head2 = (g) => {
        const sec = view.group === 'section' && g.key ? sections.find((x) => x.id === g.key) : null;
        return h('div', { class: 'pj-ghrow' }, h('h2', { class: 'pj-gh' }, g.title, h('span', { class: 'fine muted' }, ` ${g.tasks.length}`)),
          sec && tasksOk ? h('div', { class: 'pj-secacts' }, btn(['↑', h('span', { class: 'sr' }, ` Move ${sec.name} up`)], () => sectionOps.move(sec, -1), 'link'), btn(['↓', h('span', { class: 'sr' }, ` Move ${sec.name} down`)], () => sectionOps.move(sec, 1), 'link'),
            btn(['Rename', h('span', { class: 'sr' }, ` ${sec.name}`)], () => sectionOps.rename(sec), 'link'), btn(['Remove', h('span', { class: 'sr' }, ` ${sec.name}`)], () => sectionOps.remove(sec), 'link')) : null);
      };
      put(body, archived ? readOnlyNotice('This project is archived') : null, toolbar(), bulkBar(),
        filtered && !shown.length ? emptyState({ title: 'No tasks match', body: 'Change the filters above to see more.', ic: 'search' }) : null,
        ...groups.filter((g) => !filtered || g.tasks.length).map((g) => h('section', { class: 'pj-sec' }, head2(g),
          g.tasks.length ? h('ul', { class: 'pj-rows' }, ...g.tasks.map((t) => taskRow(t, { select: true }))) : h('p', { class: 'fine muted' }, 'Nothing here.'),
          view.group === 'due' ? null : addBox(extraFor(view.group, g.key), g.title))));
    }
    function board() {
      const bySection = view.board === 'section'; let dragId = null;
      const cols = bySection ? groupTasks(sortTasks(tops()), 'section', { sections }) : groupTasks(sortTasks(tops()), 'status');
      const moveTo = (t, key, list) => {
        const position = Math.min(100000, list.length ? Math.max(...list.map((x) => x.position)) + 1 : 0);
        if (!bySection) return t.status !== key && setStatus(t, key, position);
        if ((t.section_id ?? null) === key) return;
        api.call('tasks.update', key ? { id: t.id, section: key, position } : { id: t.id, clear_section: true, position }).then((x) => (x.ok ? reload() : fail(x, 'move that task')));
      };
      put(body, archived ? readOnlyNotice('This project is archived') : null,
        h('div', { class: 'pj-toolbar' }, seg([['status', 'Columns by status'], ['section', 'Columns by section']], bySection ? 'section' : 'status', (k) => setView({ board: k }), 'Board columns'), tasksOk && bySection ? btn([icon('plus'), 'Section'], sectionOps.add, '') : null),
        h('p', { class: 'fine muted pj-hint' }, tasksOk ? 'Drag a card to another column, or open it to change it.' : 'You can look at the board but not change it.'),
        h('div', { class: 'pj-board' }, ...cols.map((c) => { const col = h('div', { class: 'pj-col', 'data-key': c.key ?? '', role: 'group', 'aria-label': c.title },
          h('h2', { class: 'pj-gh' }, c.title, h('span', { class: 'fine muted' }, ` ${c.tasks.length}`)),
          ...c.tasks.map((t) => h('button', { type: 'button', class: 'pj-cardtask', draggable: tasksOk ? 'true' : 'false', 'data-id': t.id, onclick: () => openTask(t), ondragstart: (e) => { dragId = t.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); } },
            h('strong', {}, t.title), (t.tags ?? []).length ? h('span', { class: 'pj-cardtags' }, ...(t.tags ?? []).slice(0, 3).map((g) => chip(g.name, `tag-${g.color}`))) : null,
            h('span', { class: 'fine muted' }, [t.assignee_id ? personName(t.assignee_id) : '', t.due_on ? dueLabel(t.due_on, todayIso()) : '', t.subtasks_total ? `${t.subtasks_done}/${t.subtasks_total} subtasks` : ''].filter(Boolean).join(' · ')))),
          addBox(bySection ? (c.key ? { section: c.key } : {}) : { status: c.key }, c.title));
          if (tasksOk) { col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); }); col.addEventListener('dragleave', () => col.classList.remove('over'));
            col.addEventListener('drop', (e) => { e.preventDefault(); col.classList.remove('over'); const t = tasks.find((x) => x.id === (dragId ?? e.dataTransfer.getData('text/plain'))); dragId = null; if (t) moveTo(t, c.key, c.tasks); }); }
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
        : h('div', { class: 'pj-tlbar pj-timeacts' }), !tl ? null : h('div', { class: 'pj-tl', role: 'region', 'aria-label': 'Project timeline', tabindex: '0' }, h('div', { class: 'pj-tl-in', style: `width:${tl.px}px` }, h('div', { class: 'pj-ticks' }, ...tl.ticks.map((t) => h('span', { style: `left:${t.left}%` }, new Date(`${t.date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(tl.from.slice(0, 4) !== tl.to.slice(0, 4) ? { year: '2-digit' } : {}) })))),
          h('div', { class: 'pj-track' }, tl.today != null ? h('i', { class: 'pj-today', style: `left:${tl.today}%`, title: 'Today' }) : null, tl.project ? h('b', { class: 'pj-pbar', style: `left:${tl.project.left}%;width:${tl.project.width}%` }, p.name) : null),
          ...tl.marks.map((m) => h('div', { class: 'pj-track' }, h('button', { type: 'button', class: `pj-mark ${m.status}${m.overdue ? ' late' : ''}${m.width ? ' span' : ''}`, style: `left:${m.left}%${m.width ? `;width:${m.width}%` : ''}`, onclick: () => openTask(tasks.find((x) => x.id === m.id)) }, m.title))))));
      // open at today when there is work around today, otherwise at the first task
      const box = body.querySelector('.pj-tl'); const to = (pctLeft) => { if (box) box.scrollLeft = Math.max(0, (pctLeft / 100) * tl.px - 120); };
      if (box && tl) { const lefts = tl.marks.map((m) => m.left); const near = tl.today != null && lefts.some((l) => Math.abs(l - tl.today) * tl.days / 100 <= 30); to(near || !lefts.length ? tl.today ?? 0 : Math.min(...lefts));
        if (tl.today != null) body.querySelector('.pj-tlbar')?.append(btn('Today', () => to(tl.today), ''), lefts.length ? btn('First task', () => to(Math.min(...lefts)), '') : ''); }
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

  const copyProject = (p, asTemplate) => {
    const name = field({ id: 'cp-name', label: asTemplate ? 'Template name' : 'Name of the copy', value: asTemplate ? `${p.name} template` : `${p.name} (copy)`, maxlength: 200 });
    const start = field({ id: 'cp-start', label: 'Start date (moves the dates)', type: 'date', value: todayIso() });
    dialog({ title: asTemplate ? 'Save as template' : 'Duplicate project', body: [h('p', { class: 'fine muted' }, 'Copies the sections and open tasks, with their subtasks, checklists, tags and what they wait on. Comments, time and finished tasks stay here.'), name.el, asTemplate ? null : start.el].filter(Boolean),
      actions: [{ label: asTemplate ? 'Save template' : 'Duplicate', cls: 'pri', on: async () => {
        const nm = name.input.value.trim(); if (!nm) return name.error('Give it a name.');
        const r = await api.call('projects.duplicate', { id: p.id, name: nm, template: asTemplate, ...(p.client_id && !asTemplate ? { client: p.client_id } : {}), ...(!asTemplate && start.input.value ? { start_on: start.input.value } : {}) });
        if (!r.ok) { fail(r, asTemplate ? 'save templates' : 'copy this project'); return false; }
        toast(asTemplate ? 'Template saved. Find it on the Projects home.' : 'Project copied.'); go(hrefs.project(r.data[0].id));
      } }, { label: 'Cancel' }] });
  };
  const projectMenu = (p, archived) => h('div', { class: 'pj-menu' }, !archived && ctx.canAnywhere('projects.project.create') ? [btn('Duplicate', () => copyProject(p, false), ''), p.is_template ? null : btn('Save as template', () => copyProject(p, true), '')] : null, archived
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

  // one step of a task's history in words (activity_events: codes, dates and ids only)
  const describeStep = (a) => {
    const d = a.detail ?? {};
    switch (a.action) {
      case 'created': return 'created this task';
      case 'status': return `moved it from ${label(TASK_STATUS, d.from)} to ${label(TASK_STATUS, d.to)}`;
      case 'assigned': return `assigned it to ${personName(d.to)}`;
      case 'unassigned': return 'removed the assignee';
      case 'due': return d.to ? `set the due date to ${dueLabel(d.to, todayIso())}` : 'removed the due date';
      case 'renamed': return 'renamed it';
      case 'priority': return `set the priority to ${label(PRIORITY, d.to)}`;
      case 'archived': return 'archived it';
      case 'restored': return 'restored it';
      case 'commented': return 'commented';
      case 'subtask_added': return 'added a subtask';
      case 'unblocked': return 'finished the last task this was waiting on';
      default: return 'changed it';
    }
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
    const start = h('input', { id: 'td-start', type: 'date', value: t.start_on ?? '', ...(canEdit ? {} : { disabled: true }), onchange: (e) => save(e.target.value ? { start_on: e.target.value } : { clear_start: true }) });
    const REPEATS = [['', 'Does not repeat'], ['daily', 'Every day'], ['weekdays', 'Every weekday'], ['weekly', 'Every week'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Every month'], ['yearly', 'Every year']];
    const repeat = h('select', { id: 'td-repeat', ...(canEdit ? {} : { disabled: true }), onchange: (e) => { if (e.target.value && !t.due_on) { e.target.value = ''; return toast('Give the task a due date first: the next one is due a step after it.', false); } save(e.target.value ? { repeat: e.target.value } : { clear_repeat: true }); } },
      ...REPEATS.map(([k, l]) => h('option', { value: k, ...((t.repeat ?? '') === k ? { selected: true } : {}) }, l)));
    // what this task waits on (tasks of the same project)
    const depBox = h('div', { class: 'pj-deps' });
    const drawDeps = async () => {
      const r = await api.call('tasks.deps.list', { task: t.id }); const deps = r.ok ? r.data : [];
      const open = deps.filter((d) => d.status !== 'done').length;
      const pool = (state.projectTasks ?? []).filter((x) => x.id !== t.id && !deps.some((d) => d.id === x.id) && x.status !== 'done');
      put(depBox, open ? notice('warn', 'clock', [h('b', {}, `Waiting on ${open} task${open === 1 ? '' : 's'}.`), ' Its assignee is told when they are done.']) : null,
        deps.length ? h('ul', { class: 'pj-rows' }, ...deps.map((d) => h('li', { class: `pj-row${d.status === 'done' ? ' isdone' : ''}` }, icon(d.status === 'done' ? 'check' : 'clock'), h('span', { class: 'pj-title' }, d.title), h('span', { class: 'fine muted' }, label(TASK_STATUS, d.status)),
          canEdit ? btn(['Remove', h('span', { class: 'sr' }, ` ${d.title}`)], async () => { const x = await api.call('tasks.deps.remove', { task: t.id, depends_on: d.id }); if (x.ok) { drawDeps(); onChange(); } else fail(x, 'change that'); }, 'link') : null))) : h('p', { class: 'fine muted' }, 'Not waiting on anything.'),
        canEdit && pool.length ? h('label', { class: 'pj-tool' }, h('span', {}, 'Waits on'), h('select', { 'aria-label': 'Add a task this one waits on', onchange: async (e) => { const v = e.target.value; e.target.value = ''; if (!v) return; const x = await api.call('tasks.deps.add', { task: t.id, depends_on: v }); if (x.ok) { drawDeps(); onChange(); } else toast(x.status === 422 ? 'That would make the tasks wait on each other.' : 'That didn’t work.', false); } },
          h('option', { value: '' }, 'Choose a task…'), ...pool.map((x) => h('option', { value: x.id }, x.title)))) : null);
    };
    const secs = state.sections ?? [];
    const sectionField = secs.length && !t.parent_task_id ? h('div', { class: 'fld' }, h('label', { for: 'td-sec' }, 'Section'), h('select', { id: 'td-sec', ...(canEdit ? {} : { disabled: true }), onchange: (e) => save(e.target.value ? { section: e.target.value } : { clear_section: true }) },
      h('option', { value: '' }, 'No section'), ...secs.map((x) => h('option', { value: x.id, ...(x.id === t.section_id ? { selected: true } : {}) }, x.name)))) : null;
    // tags: type a name to add (an existing organization tag is reused), × to remove
    const tagBox = h('div', { class: 'pj-tags' });
    const drawTags = async () => {
      const all = await api.call('tags.list', {}); const cur = t.tags ?? [];
      const listId = `tags-${t.id}`;
      put(tagBox, h('div', { class: 'pj-taglist' }, ...cur.map((g) => h('span', { class: `chip tag-${g.color}` }, g.name, canEdit ? h('button', { type: 'button', class: 'chip-x', 'aria-label': `Remove tag ${g.name}`, onclick: async () => { const x = await api.call('tasks.tags.remove', { task: t.id, tag: g.id }); if (x.ok) { t = { ...t, tags: cur.filter((y) => y.id !== g.id) }; drawTags(); onChange(); } else fail(x, 'change tags'); } }, '×') : null)),
        cur.length ? null : h('span', { class: 'fine muted' }, 'No tags.')),
        canEdit ? h('form', { class: 'pj-add', onsubmit: async (e) => { e.preventDefault(); const i = e.target.elements.g; const v = i.value.trim(); if (!v) return; i.value = ''; const x = await api.call('tasks.tags.add', { task: t.id, name: v }); if (x.ok) { if (!cur.some((y) => y.id === x.data[0].id)) t = { ...t, tags: [...cur, x.data[0]] }; drawTags(); onChange(); } else fail(x, 'add tags'); } },
          h('input', { name: 'g', list: listId, placeholder: 'Add a tag', 'aria-label': 'Add a tag', maxlength: 40, autocomplete: 'off' }), h('datalist', { id: listId }, ...(all.ok ? all.data : []).map((g) => h('option', { value: g.name }))), btn('Add', null, '', { type: 'submit' })) : null);
    };
    // files: Drive files of this project (they stay in Drive; the task points at them)
    const fileBox = h('div', { class: 'pj-files' });
    const drawFiles = async () => {
      const r = await api.call('tasks.files.list', { task: t.id }); const files = r.ok ? r.data : [];
      const href = (f) => (f.mime_type === BOARD_MIME ? `#/board/${f.id}` : f.kind === 'document' ? `#/doc/${f.id}` : null);
      const download = async (f) => { const x = await api.call('drive.files.download', { id: f.id }); if (x.ok && x.data[0]?.url) location.href = x.data[0].url; else fail(x, 'open that file'); };
      put(fileBox, files.length ? h('ul', { class: 'pj-rows' }, ...files.map((f) => h('li', { class: 'pj-row' }, icon(f.mime_type === BOARD_MIME ? 'wb' : 'doc'),
        href(f) ? h('a', { class: 'pj-title', href: href(f) }, f.name) : h('button', { type: 'button', class: 'pj-title', onclick: () => download(f) }, f.name),
        canEdit ? btn(['Detach', h('span', { class: 'sr' }, ` ${f.name}`)], async () => { const x = await api.call('tasks.files.detach', { task: t.id, file: f.id }); if (x.ok) { drawFiles(); onChange(); } else fail(x, 'detach that file'); }, 'link') : null))) : h('p', { class: 'fine muted' }, 'No files. Files you attach stay in Drive, in this project.'),
        canEdit ? h('div', { class: 'pj-timeacts' }, btn('Attach a project file', () => attachFile(t, p, files, () => { drawFiles(); onChange(); }), ''), ctx.canAnywhere('drive.file.upload') ? btn('Upload a file', () => uploadToTask(t, p, () => { drawFiles(); onChange(); }), '') : null) : null);
    };
    const notes = h('textarea', { id: 'td-notes', rows: 5, maxlength: '20000', ...(canEdit ? {} : { readonly: true }) }); notes.value = t.notes ?? ''; notes.addEventListener('change', () => save({ notes: notes.value }));
    const checklist = h('div', { class: 'pj-check-list' });
    const drawChecklist = async () => { const r = await api.call('checklist.list', { task: t.id }); if (!r.ok) return;
      put(checklist, h('ul', { class: 'pj-rows' }, ...r.data.map((c) => h('li', { class: 'pj-row' }, h('input', { type: 'checkbox', checked: c.done, 'aria-label': c.label, ...(canEdit ? { onchange: async (e) => { await api.call('checklist.update', { id: c.id, done: e.target.checked }); onChange(); } } : { disabled: true }) }), h('span', {}, c.label), canEdit ? btn(['Remove', h('span', { class: 'sr' }, ` ${c.label}`)], async () => { await api.call('checklist.delete', { id: c.id }); drawChecklist(); onChange(); }, 'link') : null))),
        canEdit ? h('form', { class: 'pj-add', onsubmit: async (e) => { e.preventDefault(); const i = e.target.elements.l; const v = i.value.trim(); if (!v) return; i.value = ''; await api.call('checklist.add', { task: t.id, label: v }); drawChecklist(); onChange(); } }, h('input', { name: 'l', placeholder: 'Add a checklist item', 'aria-label': 'Add a checklist item', maxlength: 500 }), btn('Add', null, '', { type: 'submit' })) : null); };
    // timer for this task + logged time
    const timeBox = h('div', { class: 'pj-time' });
    const drawTime = async () => { const r = await api.call('time.list', { task: t.id }); const secs = (r.ok ? r.data : []).reduce((a, e) => a + (e.seconds ?? 0), 0); const running = state.timer && state.timer.task_id === t.id;
      put(timeBox, h('div', {}, h('b', {}, duration(secs)), h('span', { class: 'fine muted' }, ' logged on this task')),
        canTime() ? h('div', { class: 'pj-timeacts' }, running ? btn('Stop timer', async () => { const x = await api.call('time.stop', {}); if (x.ok) { state.timer = null; paintTimer(); drawTime(); } else fail(x, 'stop that timer'); }, 'pri') : btn('Start timer', async () => { const x = await api.call('time.start', { project: p.id, task: t.id }); if (x.ok) { await loadTimer(); drawTime(); } else if (x.status === 409 || x.status === 422) toast('A timer is already running. Stop it first.', false); else fail(x, 'start a timer'); }, ''),
          btn('Log time by hand', () => logTime(t, p, drawTime), '')) : null); };
    // subtasks: real tasks (own assignee, due date, comments); added here, opened like any task
    const archivedProject = Boolean(p.archived_at);
    const subtasks = h('div', { class: 'pj-subtasks' });
    const drawSubtasks = async () => {
      const r = await api.call('tasks.list', { project: p.id, parent: t.id, archived: false }); if (!r.ok) return put(subtasks, h('p', { class: 'fine muted' }, 'Subtasks couldn’t be loaded.'));
      put(subtasks, r.data.length ? h('ul', { class: 'pj-rows' }, ...r.data.map((s2) => h('li', { class: `pj-row${s2.status === 'done' ? ' isdone' : ''}` },
        h('button', { type: 'button', class: 'pj-check', 'aria-pressed': String(s2.status === 'done'), 'aria-label': `${s2.status === 'done' ? 'Reopen' : 'Mark done'}: ${s2.title}`, ...(canEdit ? { onclick: async () => { const x = await api.call('tasks.update', { id: s2.id, status: s2.status === 'done' ? 'todo' : 'done' }); if (x.ok) { drawSubtasks(); onChange(); } else fail(x, 'change that subtask'); } } : { disabled: true }) }),
        h('button', { type: 'button', class: 'pj-title', onclick: () => { closeDrawer(); taskDrawer(s2, p, { onChange, canEdit }); } }, s2.title),
        s2.assignee_id ? h('span', { class: 'fine muted' }, personName(s2.assignee_id)) : null, h('span', { class: `pj-due${s2.status !== 'done' && s2.due_on && s2.due_on < todayIso() ? ' late' : ''}` }, s2.due_on ? dueLabel(s2.due_on, todayIso()) : '')))) : h('p', { class: 'fine muted' }, 'No subtasks. Break this task into steps that each have their own owner and date.'),
        canEdit ? h('form', { class: 'pj-add', onsubmit: async (e) => { e.preventDefault(); const i = e.target.elements.s; const v = i.value.trim(); if (!v) return; i.value = ''; const x = await api.call('tasks.create', { project: p.id, parent: t.id, title: v }); if (x.ok) { drawSubtasks(); onChange(); } else fail(x, 'add subtasks'); } }, h('input', { name: 's', placeholder: 'Add a subtask', 'aria-label': 'Add a subtask', maxlength: 300 }), btn('Add', null, '', { type: 'submit' })) : null);
    };
    const share = p.client_id && ctx.can('projects.record.share', p.client_id) ? h('label', { class: 'pj-share' }, h('input', { type: 'checkbox', checked: t.client_visible, onchange: async (e) => { const r = await api.call('tasks.share', { id: t.id, visible: e.target.checked }); if (!r.ok) { e.target.checked = !e.target.checked; fail(r, 'share that task'); } else onChange(); } }), ' Show this task to the client') : null;
    const body = [h('div', { class: 'fld' }, h('label', { for: 'td-title' }, 'Task'), title), saved, sel('td-status', 'Status', TASK_STATUS, t.status, 'status'), sel('td-prio', 'Priority', PRIORITY, t.priority, 'priority'), h('div', { class: 'fld' }, h('label', { for: 'td-who' }, 'Assigned to'), who), h('div', { class: 'fld' }, h('label', { for: 'td-start' }, 'Start'), start), h('div', { class: 'fld' }, h('label', { for: 'td-due' }, 'Due'), due), h('div', { class: 'fld' }, h('label', { for: 'td-repeat' }, 'Repeat'), repeat), sectionField,
      h('div', { class: 'fld' }, h('label', { for: 'td-notes' }, 'Notes'), notes),
      h('h3', {}, 'Waiting on'), depBox, h('h3', {}, 'Tags'), tagBox, ...(t.parent_task_id ? [] : [h('h3', {}, 'Subtasks'), subtasks]), h('h3', {}, 'Files'), fileBox, h('h3', {}, 'Checklist'), checklist, h('h3', {}, 'Time'), timeBox, share,
      h('h3', {}, 'Comments'), commentsPanel({ api, type: 'project_task', id: t.id, people: state.people ?? [], canComment: !archivedProject && ctx.canAnywhere('projects.task.comment') }),
      (() => { const hist = activityPanel({ api, type: 'project_task', id: t.id, describe: describeStep }); return h('details', { class: 'pj-history', ontoggle: (e) => { if (e.target.open) hist.load(); } }, h('summary', {}, 'History'), hist); })()];
    title.id = 'td-title';
    body.unshift(h('div', { class: 'pj-drawer-top' }, t.parent_task_id ? btn('↑ Back to the parent task', async () => { const x = await api.call('tasks.get', { id: t.parent_task_id }); if (x.ok) { closeDrawer(); taskDrawer(x.data[0], p, { onChange, canEdit }); } else fail(x, 'open that task'); }, 'link') : h('span'), followButton({ api, type: 'project_task', id: t.id })));
    const closeDrawer = drawer({ title: t.parent_task_id ? 'Subtask' : 'Task', label: `Task: ${t.title}`, body, actions: canEdit ? [{ label: 'Archive task', on: async () => { const r = await api.call('tasks.archive', { id: t.id }); if (!r.ok) { fail(r, 'archive that task'); return; } toast('Task archived.'); onChange(); } }, { label: 'Done', cls: 'pri' }] : [{ label: 'Close', cls: 'pri' }] });
    drawChecklist(); drawTime(); drawTags(); drawFiles(); drawDeps(); if (!t.parent_task_id) drawSubtasks();
  }
  // pick one of the project's Drive files to attach to the task
  async function attachFile(t, p, already, after) {
    const r = await api.call('drive.project.files', { project: p.id }); if (!r.ok) return fail(r, 'list this project\'s files');
    const have = new Set(already.map((f) => f.id)); const files = r.data.filter((f) => !have.has(f.id));
    const close = dialog({ title: 'Attach a project file', wide: true, body: files.length ? h('ul', { class: 'pj-rows' }, ...files.map((f) => h('li', { class: 'pj-row' }, icon(f.mime_type === BOARD_MIME ? 'wb' : 'doc'), h('span', { class: 'pj-title' }, f.name),
      btn(['Attach', h('span', { class: 'sr' }, ` ${f.name}`)], async () => { const x = await api.call('tasks.files.attach', { task: t.id, file: f.id }); if (x.ok) { toast('File attached.'); close(); after(); } else fail(x, 'attach that file'); }, 'pri')))) : h('p', { class: 'muted' }, 'This project has no other files yet. Upload one, or make a document in the Docs tab.'), actions: [{ label: 'Close' }] });
  }
  // upload into the project's own place in Drive (the client's space for a client project, the shared Drive otherwise), then attach it
  function uploadToTask(t, p, after) {
    const picker = h('input', { type: 'file', class: 'sr', tabindex: '-1', 'aria-hidden': 'true' });
    picker.addEventListener('change', async () => {
      const file = picker.files[0]; picker.remove(); if (!file) return;
      const where = p.client_id ? { space: 'client', client: p.client_id } : { space: 'shared' };
      toast(`Uploading ${file.name}…`);
      const sig = await api.call('drive.uploads.sign', { ...where, name: file.name, size_bytes: Math.max(1, file.size), mime_type: file.type || 'application/octet-stream' });
      if (!sig.ok || !sig.data[0]) return toast(sig.status === 422 ? 'The storage limit is reached.' : 'You can’t upload files here.', false);
      const target = sig.data[0];
      const sent = await fetch(target.url, { method: target.method || 'PUT', headers: target.headers ?? {}, body: file }).then((x) => x.ok, () => false);
      if (!sent) return toast('The upload failed. Try again.', false);
      const c = await api.call('drive.files.create', { ...where, project: p.id, app: 'projects', name: file.name, kind: 'file', mime_type: file.type || 'application/octet-stream', size_bytes: Math.max(1, file.size), storage_path: target.path });
      if (!c.ok) return toast('The file was uploaded but could not be added.', false);
      const a = await api.call('tasks.files.attach', { task: t.id, file: c.data[0].id });
      if (!a.ok) return fail(a, 'attach that file');
      toast(`${file.name} attached.`); after();
    });
    document.body.append(picker); picker.click();
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
