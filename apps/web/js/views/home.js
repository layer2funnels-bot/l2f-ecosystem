// Office Home (design 04). "My work", "Deadlines" and the review notice come from Projects and Planner (my.work, projects.deadlines, planner.overview);
// what the person may not see simply isn't there, and a block with nothing to show keeps its designed empty state.
import { h, put, icon, pill, emptyState, skeleton } from '../ui.js';
import { hrefFor } from '../routes.js';

const shortDate = (iso) => { const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`); const days = Math.round((d - new Date(new Date().toDateString())) / 86400000); return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days > 1 && days < 7 ? d.toLocaleDateString(undefined, { weekday: 'short' }) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
const STATUS = { todo: 'Not started', doing: 'In progress', blocked: 'Blocked', done: 'Done' };
const eb = (ic, title, body) => h('div', { class: 'eb' }, icon(ic), h('span', {}, title ? h('b', { style: 'color:var(--ink)' }, title) : null, title ? h('br') : null, body));

export function officeHomeView({ org, role, isAdmin, api, live, portalState }) {
  const head = (id, text) => h('h3', { id, style: 'padding:var(--space-4) var(--space-5) 0' }, text);
  const workBox = h('section', { class: 'card', 'aria-labelledby': 'h2x' }, head('h2x', 'My work'), skeleton(2));
  const dlBox = h('section', { class: 'card', 'aria-labelledby': 'h3x' }, head('h3x', 'Deadlines'), skeleton(2));
  const noticeBox = h('div', {});
  (async () => {
    const [w, d, p] = await Promise.all([api.call('my.work', { limit: 5 }), api.call('projects.deadlines', { days: 14 }), api.call('planner.overview', { days: 14 })]);
    if (!live()) return;
    const work = w.ok ? w.data : [];
    put(workBox, head('h2x', 'My work'), work.length
      ? work.map((t) => h('div', { class: 'item' }, h('div', {}, h('b', {}, t.title), h('span', { class: 'm' }, `${t.project_name}${t.due_on ? ` · Due ${shortDate(t.due_on)}` : ''}`)), h('span', { class: `pill ${t.overdue ? 'warn' : t.status === 'doing' ? 'pri' : ''}` }, t.overdue ? 'Overdue' : STATUS[t.status] ?? t.status)))
      : eb('home', 'Nothing assigned to you.', `When someone gives you a task in ${org.name}, it appears here with its due date.`));
    const dl = d.ok ? d.data.slice(0, 6) : [];
    put(dlBox, head('h3x', 'Deadlines'), dl.length ? dl.map((x) => h('div', { class: 'dl' }, h('span', {}, x.label), h('b', {}, shortDate(x.due_on)))) : eb('clock', null, 'No deadlines in the next two weeks.'));
    const o = p.ok ? p.data[0] : null;
    if (o && (o.reviews_overdue > 0 || o.reviews_due > 0)) {
      put(noticeBox, h('div', { class: 'notice warn', role: 'status' }, icon('clock'), h('p', {}, h('b', {}, 'Coming up:'), o.reviews_overdue > 0 ? ` ${o.reviews_overdue} Planner review${o.reviews_overdue === 1 ? ' is' : 's are'} overdue.` : '', o.reviews_due > 0 ? ` ${o.reviews_due} due in the next two weeks${o.next_review_on ? `, the next ${shortDate(o.next_review_on)}` : ''}.` : '')));
    }
  })();
  const adminBox = h('section', { class: 'card', 'aria-labelledby': 'h5' }, h('h3', { id: 'h5', style: 'padding:var(--space-4) var(--space-5) 0' }, 'For owners and admins'), skeleton(1));
  if (isAdmin) {
    (async () => {
      const r = await api.call('members.list', {});
      if (!live()) return;
      const waiting = r.ok ? r.data.filter((m) => m.row_kind === 'invitation').length : null;
      put(adminBox, h('h3', { id: 'h5', style: 'padding:var(--space-4) var(--space-5) 0' }, 'For owners and admins'),
        h('div', { class: 'dl' }, h('span', {}, waiting === null ? 'Invitations can’t be loaded right now' : `${waiting} invitation${waiting === 1 ? '' : 's'} waiting`), h('a', { class: 'btn link', href: hrefFor.admin('members') }, 'Review')),
        portalState ? h('div', { class: 'dl' }, h('span', {}, portalState === 'locked' ? 'Client Portal is locked' : 'Client Portal is on'), portalState === 'locked' ? pill('Locked', 'warn', 'lock') : pill('On', 'ok', 'check')) : null);
    })();
  }
  return h('section', {}, h('div', { class: 'crumb' }, `Office · ${org.name}`), h('h1', { 'data-page-title': true }, 'Home'), h('p', { class: 'sub' }, `Your work in ${org.name}.`), noticeBox,
    h('div', { class: 'split' },
      h('div', { class: 'grid' },
        h('section', { class: 'card', 'aria-labelledby': 'h1x' }, h('h3', { id: 'h1x', style: 'padding:var(--space-4) var(--space-5) 0' }, 'Needs your attention'), eb('check', 'Nothing needs you right now.', 'Approvals and reviews assigned to you show up here.')),
        workBox),
      h('div', { class: 'grid' },
        dlBox,
        h('section', { class: 'card', 'aria-labelledby': 'h4x' }, h('h3', { id: 'h4x', style: 'padding:var(--space-4) var(--space-5) 0' }, 'Recent updates'), h('p', { class: 'sec' }, 'Only from things you can open.'), eb('info', null, 'No updates yet today.')),
        isAdmin ? adminBox : null,
        h('section', { class: 'card', 'aria-labelledby': 'h6x' }, h('h3', { id: 'h6x', style: 'padding:var(--space-4) var(--space-5) 0' }, 'Shortcuts'),
          h('div', { class: 'short', style: 'margin-top:var(--space-3)' }, h('a', { class: 'btn', href: hrefFor.funnels() }, 'Funnels'), h('a', { class: 'btn', href: hrefFor.launcher() }, 'All apps'))))));
}
