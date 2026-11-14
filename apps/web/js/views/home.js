// Office Home, V8 (01_APPLICATIONS/01_OFFICE "Home"; prototype office5.js `VIEWS.office` home). Built with the prototype's own markup and
// class names inside `.v8p-oh`, styled by apps/web/pages/office-home.css (generated from the prototype CSS by scripts/build-page-css.mjs).
// Real data only, each part from the app that owns it, every query as the signed-in person (row rules decide what they may see):
//   My day        Projects tasks assigned to me (pm.mywork.list) + Planner goals whose update is due (planner.strategy.my_work); tick completes
//                 a Projects task in Projects; a Planner row opens the plan to post the update (it needs a value).
//   Waiting on you approvals I decide (approvals.list to_decide).        What's happening  pm.activity.org.feed (All / My projects / Clients).
//   Plans and goals the first favourite or active plan (planner.strategy.list_plans + get_plan).   Projects  pm.projects.list.
//   Owners and admins (Owner view): Client pipeline (clients.list), Team today (pm.workload.get), Organization health (members, storage, Portal).
// Replaces the V4 "Your work in …" page: My work and Deadlines live in My day, Needs your attention in Waiting on you, Recent updates in
// What's happening; shortcuts are the rail and the apps menu.
import { h, put, icon, skeleton, toast, errorState, initials, seg } from '../ui.js';
import { plateOf, loadRegistry } from '../registry.js';

const VIEW_KEY = 'l2f.office.view';
const DAY_KEY = 'l2f.office.day';
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } } };
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const CADENCE = { weekly: 7, fortnightly: 14, monthly: 30, quarterly: 91 };
const AV = ['#EF5235', '#6B4FF0', '#13A592', '#E9488F', '#F07C1A', '#2B5CF0', '#7FBF2A', '#EEBB12'];
const avColor = (id) => AV[[...String(id ?? '')].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
const av = (name, id) => h('span', { class: 'avatar', style: `--av:${avColor(id ?? name)}`, 'aria-hidden': 'true' }, initials(name));
const ago = (iso) => { const s = (Date.now() - new Date(iso)) / 1000; return s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : s < 86400 ? `${Math.round(s / 3600)} h` : s < 172800 ? 'Yesterday' : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };
const STATUS = { todo: 'To do', in_progress: 'In progress', in_review: 'Review', blocked: 'Blocked', done: 'Done' };
const PSTATUS = { on_track: ['On track', 'blue'], at_risk: ['At risk', 'warn'], off_track: ['Off track', 'warn'], on_hold: ['On hold', ''], complete: ['Complete', 'blue'] };
const PIPE = [['Leads', ['lead', 'proposal'], '#7C818D'], ['Active', ['active', 'paused'], '#2B63F6'], ['Past', ['past'], '#13A592'], ['Lost', null, '#BA3126']];

/** "Today", "Tomorrow", a weekday this week, a date, or "Overdue" (V8 due labels). */
export function dueLabel(due, today = new Date()) {
  if (!due) return ['', ''];
  const t = isoDay(today); if (due < t) return ['Overdue', 'od']; if (due === t) return ['Today', 'soon'];
  if (due === isoDay(addDays(today, 1))) return ['Tomorrow', ''];
  const d = new Date(`${due}T12:00:00`);
  return [(d - today) / 86400000 < 6.5 ? d.toLocaleDateString(undefined, { weekday: 'short' }) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), ''];
}
/** A feed line for a Projects activity record (same wording as the Projects app, shortened to the task). */
export function feedLine(a) {
  const d = a.data ?? {}; const t = a.taskTitle ? `“${a.taskTitle}”` : 'a task';
  switch (a.kind) {
    case 'task.created': return `created ${t}`;
    case 'task.commented': return `commented on ${t}`;
    case 'task.attachment': return `attached ${d.name ? `“${d.name}”` : 'a file'} to ${t}`;
    case 'task.trashed': return `moved ${t} to the trash`;
    case 'task.restored': return `restored ${t}`;
    case 'task.updated':
      if (d.field === 'status') return d.to === 'done' ? `completed ${t}` : `moved ${t} to ${STATUS[d.to] ?? d.to}`;
      if (d.field === 'assignees') return `changed who works on ${t}`;
      if (d.field === 'dueOn') return d.to ? `set ${t} due ${d.to}` : `cleared the due date of ${t}`;
      return `updated ${t}`;
    case 'project.created': return 'created the project';
    case 'project.updated': return 'updated the project';
    case 'project.archived': return 'archived the project';
    case 'project.member': return 'changed the project team';
    default: return `updated ${a.taskTitle ? t : 'the project'}`;
  }
}

export function officeHomeView({ org, role, isAdmin, api, live, portalState, name, catalog = [] }) {
  const canOwn = role === 'owner' || isAdmin;
  const root = h('div', { class: 'v8p-office v8p-oh' });
  const pm = async (op, args = {}) => { const r = await api.call(`pm.${op}`, { args }); return r.ok ? r.data?.[0]?.r : null; };
  const plan = async (fn, args = {}) => { const r = await api.call(`planner.strategy.${fn}`, { args }); return r.ok ? r.data?.[0]?.r : null; };
  let view = canOwn && store.get(VIEW_KEY) !== 'member' ? 'owner' : 'member';
  let day = store.get(DAY_KEY) || 'today';
  let feedScope = 'all';
  

  // Every part appears at once with its own loading state and fills in when its data arrives (a slow source never holds up the page)
  const panel = (title, extra = [], cls = 'panel') => { const body = h('div', { class: 'rows' }, skeleton(2)); return { el: h('section', { class: cls }, h('div', { class: 'sec-h' }, h('h2', {}, title), ...extra), body), body }; };
  const fail = (body, retry) => body.replaceChildren(h('p', { class: 'hint', style: 'padding:14px 20px' }, 'This couldn’t load. ', h('a', { href: location.hash, onclick: (e) => { e.preventDefault(); body.replaceChildren(skeleton(2)); retry(); } }, 'Try again')));
  const empty = (body, text) => body.replaceChildren(h('p', { class: 'hint', style: 'padding:14px 20px' }, text));

  const draw = async () => {
    const regs = await loadRegistry(); const reg = (k) => regs?.get(k) ?? { id: k };
    const now = new Date(); const today = isoDay(now); const weekEnd = isoDay(addDays(now, 6));
    const date = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    const hour = now.getHours(); const greet = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    const first = (name || '').trim().split(/\s+/)[0];
    const counts = { today: null, waiting: null, plan: undefined };
    const summary = h('p', { class: 'sub' });
    const paintSummary = () => summary.replaceChildren(...(counts.today == null || counts.waiting == null ? ['Getting your day ready…'] : ['You have ', h('b', {}, `${counts.today} ${counts.today === 1 ? 'thing' : 'things'} today`), ', ',
      h('b', {}, `${counts.waiting} waiting on you`), ...(counts.plan ? [', and the growth plan is ', h('b', {}, counts.plan), '.'] : ['.'])]));
    paintSummary();

    // ---- My day
    const dayCount = h('span', { class: 'n' });
    const myDay = panel('My day', [dayCount, h('span', { class: 'grow' }), seg([['today', 'Today'], ['week', 'This week'], ['all', 'Everything']], day, (k) => { day = k; store.set(DAY_KEY, k); paintDay(); }, 'My day')]);
    myDay.el.append(h('p', { class: 'hint', style: 'padding:0 20px 14px' }, 'One list from Projects and Planner. Tick it here or open it where it lives.'));
    let all = null;
    const inDay = (x) => (day === 'all' ? true : x.due && (day === 'today' ? x.due <= today : x.due <= weekEnd));
    function paintDay() {
      if (!all) return;
      const list = all.filter(inDay); dayCount.textContent = String(list.length);
      if (!list.length) return empty(myDay.body, day === 'today' ? 'Nothing due today. Tasks assigned to you in Projects and Planner updates appear here.' : 'Nothing here yet.');
      myDay.body.replaceChildren(...list.map((x) => {
        const [label, cls] = dueLabel(x.due, now);
        const cbx = x.kind === 'projects'
          ? h('button', { class: 'cbx', role: 'checkbox', 'aria-checked': 'false', 'aria-label': `Mark ${x.title} done`, onclick: async (e) => {
            const b = e.currentTarget; b.disabled = true; b.setAttribute('aria-checked', 'true');
            const r = await api.call('pm.tasks.update', { args: { id: x.id, patch: { status: 'done' } } });
            if (!r.ok) { b.disabled = false; b.setAttribute('aria-checked', 'false'); toast('That task couldn’t be completed. Try again.', false); return; }
            all.splice(all.indexOf(x), 1); toast('Done. It’s ticked off in Projects too.'); paintDay();
          } }, h('i', {}, icon('check')))
          : h('a', { class: 'cbx', href: x.href, 'aria-label': `Post the update for ${x.title.replace('Post update: ', '')} in Planner` }, h('i', {}, icon('check')));
        return h('div', { class: 'row' }, cbx, h('a', { class: 'main', href: x.href }, h('b', {}, x.title), h('small', {}, plateOf(reg(x.kind), 16), ` ${x.sub ?? ''}`)), h('span', { class: `due ${cls}`.trim() }, label));
      }));
    }
    const loadDay = async () => {
      const [w, pw] = await Promise.all([api.call('my.work', { limit: 100 }), plan('my_work', { p_workspace: org.org_id })]);
      if (!w.ok && pw == null) return fail(myDay.body, loadDay);
      const tasks = (w.ok ? w.data : []).filter((t) => t.status !== 'done').map((t) => ({ kind: 'projects', id: t.id, title: t.title, sub: t.project_name, due: t.due_on, href: `#/projects/p/${t.project_id}/list?task=${t.id}` }));
      const updates = (pw?.goals ?? []).filter((g) => g.update_cadence && g.update_cadence !== 'none' && !g.completed_at).map((g) => {
        const last = new Date(g.last_update_at ?? g.created_at ?? now);
        return { kind: 'planner', id: g.id, title: `Post update: ${g.title}`, sub: g.plan_name, due: isoDay(addDays(last, CADENCE[g.update_cadence] ?? 30)), href: `#/planner/map?plan=${g.plan_id}&goal=${g.id}` };
      });
      all = [...tasks, ...updates].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
      counts.today = all.filter((x) => x.due && x.due <= today).length; paintSummary(); paintDay();
    };

    // ---- Waiting on you
    const waitN = h('span', { class: 'n' });
    const waiting = panel('Waiting on you', [waitN]);
    const loadWait = async () => {
      const r = await api.call('approvals.list', { mine: 'to_decide', status: 'pending' });
      if (!r.ok) return fail(waiting.body, loadWait);
      counts.waiting = r.data.length; waitN.textContent = String(r.data.length); paintSummary();
      if (!r.data.length) return empty(waiting.body, 'Nothing is waiting on you.');
      waiting.body.replaceChildren(...r.data.slice(0, 6).map((a) => h('a', { class: 'linkrow', href: a.client_id ? `#/clients/c/${a.client_id}/requests` : '#/office' }, plateOf(reg(a.client_id ? 'clients' : 'office'), 34),
        h('span', { class: 'main' }, h('b', {}, `“${a.title}” needs your decision`), h('small', {}, `${a.client_id ? 'Client approval' : 'Approval'}${a.due_on ? ` · due ${dueLabel(a.due_on, now)[0]}` : ''}`)), h('span', { class: 'btn ghost sm' }, 'Open'))));
    };

    // ---- What's happening
    const feedEl = h('ul', { class: 'feed' }, h('li', {}, skeleton(2)));
    const feedPanel = h('section', { class: 'panel' }, h('div', { class: 'sec-h' }, h('h2', {}, 'What’s happening'), h('span', { class: 'grow' }),
      seg([['all', 'All'], ['mine', 'My projects'], ['clients', 'Clients']], feedScope, (k) => { feedScope = k; loadFeed(); }, 'What’s happening')), feedEl, h('p', { class: 'hint', style: 'padding:0 20px 14px' }, 'Only from things you can open.'));
    async function loadFeed() {
      const f = await pm('activity.org.feed', { scope: feedScope, limit: 8 });
      if (f == null) return feedEl.replaceChildren(h('li', {}, h('div', { class: 'hint' }, 'The feed couldn’t load. ', h('a', { href: location.hash, onclick: (e) => { e.preventDefault(); loadFeed(); } }, 'Try again'))));
      feedEl.replaceChildren(...(f.items.length ? f.items.map((a) => h('li', {}, av(a.actor?.name ?? 'Someone', a.actor?.id),
        h('div', {}, h('b', {}, (a.actor?.name ?? 'Someone').split(' ')[0]), ` ${feedLine(a)}`, h('small', {}, plateOf(reg('projects'), 14), ` ${a.projectName} · ${ago(a.createdAt)}`))))
        : [h('li', {}, h('div', { class: 'hint' }, 'Nothing new yet.'))]));
    }

    // ---- Plans and goals
    const plans = h('section', { class: 'panel pulse' }, h('div', { class: 'sec-h' }, h('h2', {}, 'Plans and goals'), h('a', { class: 'linkbtn', href: '#/planner' }, 'Planner')), h('div', { style: 'padding:4px 20px 18px' }, skeleton(2)));
    const loadPlans = async () => {
      const box = plans.lastChild; const list = await plan('list_plans', { p_workspace: org.org_id });
      if (list == null) { counts.plan = null; paintSummary(); return fail(box, loadPlans); }
      const main = list.filter((p) => !p.archived_at).find((p) => p.favorite) ?? list.find((p) => !p.archived_at);
      if (!main) { counts.plan = null; paintSummary(); return box.replaceChildren(h('p', { class: 'hint' }, 'No plan yet. ', h('a', { href: '#/planner' }, 'Start one in Planner'), '.')); }
      counts.plan = (main.status_counts?.off_track ?? 0) > 0 ? 'off track' : (main.status_counts?.at_risk ?? 0) > 0 ? 'at risk' : 'on track'; paintSummary();
      const detail = await plan('get_plan', { p_plan: main.id }); const v = Math.round(main.progress ?? 0);
      box.replaceChildren(h('div', { style: 'display:flex;gap:16px;align-items:center' }, h('span', { class: 'ring', style: `--v:${v}` }, h('b', {}, `${v}%`)),
        h('div', {}, h('b', {}, main.name), h('p', { class: 'hint' }, [`${main.focus_area_count ?? 0} focus areas`, `${main.goal_count ?? 0} objectives`, main.next_review ? `next review ${new Date(`${main.next_review}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : null].filter(Boolean).join(' · ')))),
      h('div', { class: 'okr' }, ...(detail?.focus_areas ?? []).filter((f) => !f.archived_at).slice(0, 3).map((f) => {
        const goals = (detail?.goals ?? []).filter((g) => g.focus_area_id === f.id && !g.archived_at); const pv = goals.length ? Math.round(goals.reduce((n, g) => n + Number(g.progress ?? 0), 0) / goals.length) : 0;
        const risky = goals.some((g) => g.health === 'at_risk' || g.health === 'off_track');
        return h('div', {}, h('small', { class: 'muted' }, f.name), h('b', {}, goals[0]?.title ?? 'No objective yet'), h('span', { class: 'prog', style: `--v:${pv}%` }, h('i', { style: risky ? 'background:var(--warn)' : '' })));
      })));
    };

    // ---- Projects
    const projN = h('span', { class: 'n' });
    const projects = panel('Projects', [projN, h('a', { class: 'linkbtn', href: '#/projects/portfolio' }, 'Portfolio')]);
    const loadProjects = async () => {
      const r = await api.call('office.projects.list', {});
      if (!r.ok) return fail(projects.body, loadProjects);
      projN.textContent = `${r.data.length} live`;
      if (!r.data.length) return empty(projects.body, 'No live projects.');
      projects.body.replaceChildren(...r.data.slice(0, 4).map((p) => { const [st, k] = PSTATUS[p.status] ?? ['On track', 'blue'];
        return h('a', { class: 'linkrow', href: `#/projects/p/${p.id}/overview` }, h('span', { class: 'pdot', style: `--c:${p.color}` }),
          h('span', { class: 'main' }, h('b', {}, p.name), h('span', { class: 'prog', style: `--v:${p.progress}%;margin-top:6px` }, h('i'))), h('span', { class: `pill ${k}`.trim() }, st)); }));
    };

    const side = [plans, projects.el];
    const loads = [loadDay(), loadWait(), loadFeed(), loadPlans(), loadProjects()];
    if (view === 'owner') {
      const pipe = panel('Client pipeline', [h('a', { class: 'linkbtn', href: '#/clients' }, 'Clients')]);
      const team = panel('Team today', [h('a', { class: 'linkbtn', href: '#/office/team' }, 'Team')]);
      const health = h('section', { class: 'panel owner' }, h('div', { style: 'display:flex;gap:12px;align-items:center' }, plateOf(reg('portal'), 40), h('div', {}, h('p', { class: 'over' }, 'For owners and admins'), h('b', { style: 'font-size:15px' }, 'Organization health'))));
      side.push(pipe.el, team.el, health);
      const loadPipe = async () => {
        const [cl, lost] = await Promise.all([api.call('clients.list', {}), api.call('clients.list', { archived: true })]);
        if (!cl.ok) return fail(pipe.body, loadPipe);
        const n = (keys) => (keys ? cl.data.filter((c) => keys.includes(c.status ?? 'lead')).length : (lost.ok ? lost.data.length : 0));
        pipe.body.replaceWith(pipe.body = h('div', { class: 'pipe4' }, ...PIPE.map(([l, keys, c]) => h('a', { href: '#/clients' }, h('b', { style: `color:${c}` }, String(n(keys))), h('small', {}, l)))));
        pipe.el.append(h('p', { class: 'hint', style: 'padding:0 20px 14px' }, `${cl.data.length} clients in the pipeline. Lost counts archived clients.`));
      };
      const loadTeam = async () => {
        const wl = await pm('workload.get', { weeks: 1 });
        if (wl == null) return fail(team.body, loadTeam);
        if (!wl.people?.length) return empty(team.body, 'No teammates in Projects yet.');
        const cap = (wl.capacityMinutesPerWeek ?? 2400) / 60;
        team.body.replaceChildren(...wl.people.slice(0, 6).map((p) => { const hrs = Math.round((p.byWeek?.[0]?.minutes ?? 0) / 60);
          return h('a', { class: 'linkrow', href: '#/office/team' }, av(p.person?.name ?? '?', p.person?.id), h('span', { class: 'main' }, h('b', {}, p.person?.name ?? 'Teammate'), h('small', {}, `This week: ${p.byWeek?.[0]?.tasks ?? 0} tasks`)),
            h('span', { class: 'mini-bar', title: `${hrs} of ${cap} hours planned this week` }, h('i', { style: `--v:${Math.min(100, (hrs / cap) * 100)}%;${hrs > cap * 0.875 ? 'background:var(--warn)' : ''}` }))); }));
      };
      const loadHealth = async () => {
        const [mem, st] = await Promise.all([api.call('members.list', {}), api.call('storage.usage', {})]);
        const pending = mem.ok ? mem.data.filter((m) => m.row_kind === 'invitation').length : null;
        const used = st.ok ? st.data[0] : null; const gb = (b) => (b / 1e9).toFixed(1);
        health.append(h('a', { class: 'kv linkrow', style: 'min-height:44px;padding:0', href: '#/office/admin/members' }, icon('mail'), 'Invitations waiting', h('span', { class: 'pill brand', style: 'margin-left:auto' }, pending == null ? '—' : String(pending))),
          h('a', { class: 'kv linkrow', style: 'min-height:44px;padding:0', href: '#/office/admin' }, icon('db'), 'Storage', h('span', { class: 'pill', style: 'margin-left:auto' }, used ? `${gb(used.total_bytes)} of ${gb(used.cap_bytes)} GB` : '—')),
          h('div', { class: 'kv' }, icon('lock'), 'Client Portal', h('span', { class: 'pill', style: 'margin-left:auto' }, ...(portalState === 'available' ? ['On'] : [icon('lock'), 'Locked']))));
      };
      loads.push(loadPipe(), loadTeam(), loadHealth());
    }

    const hero = h('div', { class: 'o-hero' }, h('div', {}, h('p', { class: 'over' }, `${date} · ${org.name}`), h('h1', { 'data-page-title': true }, `Good ${greet}${first ? `, ${first}` : ''}.`), summary),
      canOwn ? h('div', { class: 'acts' }, seg([['owner', 'Owner view'], ['member', 'Team member view']], view, (k) => { view = k; store.set(VIEW_KEY, k); draw(); }, 'View')) : null);
    const ask = h('button', { class: 'askbar', type: 'button', 'aria-disabled': 'true', onclick: () => toast('The Office assistant is designed in Layer 2 Agents. It turns on after you approve the provider, cost and data rules.') },
      icon('sparkle'), h('span', {}, 'Ask Office: “What are my tasks today?”, “Which clients are waiting on us?”'), h('span', { class: 'pill' }, 'Assistant · later'));
    put(root, hero, ask, h('div', { class: 'o-grid' }, h('div', { class: 'stackcol' }, myDay.el, waiting.el, feedPanel), h('div', { class: 'stackcol' }, ...side)));
    await Promise.allSettled(loads);
  };
  draw();
  return root;
}
