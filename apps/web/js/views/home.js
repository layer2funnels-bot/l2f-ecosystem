// Office Home (design 04, Design v4 "Your work in <organization>."). "My work", "Deadlines" and the review notice come from Projects and Planner (my.work,
// projects.deadlines, planner.overview); what the person may not see simply isn't there, and a block with nothing to show keeps its designed empty state.
// The counts in the strip are computed from the same data; nothing is invented.
import { h, put, icon, pill, skeleton } from '../ui.js';
import { hrefFor } from '../routes.js';
import { plateOf, loadRegistry } from '../registry.js';

const DAY = 86400000;
const startOfToday = () => new Date(new Date().toDateString());
const asDate = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00`);
const daysFrom = (iso) => Math.round((asDate(iso) - startOfToday()) / DAY);
const shortDate = (iso) => { const d = asDate(iso); const n = daysFrom(iso); return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n > 1 && n < 7 ? d.toLocaleDateString(undefined, { weekday: 'short' }) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
const STATUS = { todo: 'Not started', doing: 'In progress', blocked: 'Blocked', done: 'Done' };
const today = () => startOfToday().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

const panel = (labelId, title, { count, right } = {}, ...body) => h('section', { class: 'panel', 'aria-labelledby': labelId },
  h('div', { class: 'sec-h' }, h('h2', { id: labelId }, title), count != null ? h('span', { class: 'n' }, String(count)) : null, right ?? null), ...body);
const quiet = (ic, title, body) => h('div', { class: 'eb' }, icon(ic), h('span', {}, title ? h('b', { style: 'color:var(--text)' }, title) : null, title ? h('br') : null, body));

export function officeHomeView({ org, role, isAdmin, api, live, portalState }) {
  const stat = (n, label) => h('div', {}, h('b', {}, String(n)), h('span', {}, label));
  const strip = h('div', { class: 'focus', style: 'grid-template-columns:repeat(3,minmax(0,1fr))' }, stat('·', 'Need you'), stat('·', 'Due this week'), stat('·', 'In progress'));
  const noticeBox = h('div', {});
  const workBox = panel('h2x', 'My work', {}, skeleton(2));
  const dlBox = panel('h3x', 'Deadlines', { right: h('span', { class: 'hint', style: 'margin-left:auto' }, 'Next 7 days') }, skeleton(2));
  const att = panel('h1x', 'Needs your attention', { count: 0 }, quiet('check', 'Nothing needs you right now.', 'Approvals and reviews assigned to you show up here.'));
  const feed = panel('h4x', 'Recent updates', {}, quiet('info', null, 'No updates yet today.'), h('p', { class: 'hint', style: 'padding:0 20px 16px' }, 'Only from things you can open.'));
  const shortcuts = panel('h6x', 'Shortcuts', {}, h('div', { class: 'shortcuts' }));
  const owner = isAdmin ? h('section', { class: 'panel owner', 'aria-labelledby': 'h5' }, h('div', { style: 'display:flex;gap:12px;align-items:center' }, h('span', { class: 'plate-slot' }),
    h('div', {}, h('p', { class: 'over' }, 'For owners and admins'), h('b', { id: 'h5', style: 'font-size:15px' }, 'Organization health'))), skeleton(1)) : null;

  loadRegistry().then((reg) => {
    if (!live()) return;
    const sc = shortcuts.querySelector('.shortcuts');
    for (const [id, label, href] of [['planner', 'Planner', hrefFor.page('planner')], ['projects', 'Projects', hrefFor.app('projects')], ['funnel_mapper_pro', 'Funnels', hrefFor.funnels()], ['drive', 'Docs', hrefFor.page('documents')]]) {
      const m = reg.get(id === 'funnel_mapper_pro' ? 'funnel_mapper_pro' : id) ?? { id };
      sc.append(h('a', { href, style: 'display:grid;justify-items:center;gap:8px;padding:12px 4px;border-radius:14px;font-size:12.5px;font-weight:550;color:var(--text2);text-decoration:none' }, plateOf(m, 40), label));
    }
    const plateSlot = owner?.querySelector('.plate-slot'); if (plateSlot) plateSlot.replaceWith(plateOf(reg.get('portal') ?? { id: 'portal' }, 40));
  });

  (async () => {
    const [w, d, p] = await Promise.all([api.call('my.work', { limit: 50 }), api.call('projects.deadlines', { days: 14 }), api.call('planner.overview', { days: 14 })]);
    if (!live()) return;
    const work = w.ok ? w.data : [];
    const dl = d.ok ? d.data : [];
    const weekDl = dl.filter((x) => { const n = daysFrom(x.due_on); return n >= 0 && n <= 6; });
    strip.replaceChildren(stat(0, 'Need you'), stat(weekDl.length, 'Due this week'), stat(work.filter((t) => t.status === 'doing').length, 'In progress'));
    put(workBox, h('div', { class: 'sec-h' }, h('h2', { id: 'h2x' }, 'My work'), h('span', { class: 'n' }, String(work.length)), h('a', { class: 'linkbtn', href: hrefFor.app('projects') + '/mine', style: 'color:var(--action);font-weight:600;text-decoration:none' }, 'All in Projects')),
      work.length ? h('div', { class: 'rows' }, ...work.slice(0, 5).map((t) => h('div', { class: 'row' },
        h('span', { class: 'tic' }, icon('mywork')), h('div', { class: 'main' }, h('b', {}, t.title), h('small', {}, `${t.project_name}${t.due_on ? ` · Due ${shortDate(t.due_on)}` : ''}`)),
        h('span', { class: `pill ${t.overdue ? 'warn' : t.status === 'doing' ? 'blue' : ''}` }, t.overdue ? 'Overdue' : STATUS[t.status] ?? t.status))))
        : quiet('home', 'Nothing assigned to you.', `When someone gives you a task in ${org.name}, it appears here with its due date.`));
    const day0 = startOfToday();
    const days = Array.from({ length: 7 }, (_, i) => new Date(day0.getTime() + i * DAY));
    put(dlBox, h('div', { class: 'sec-h' }, h('h2', { id: 'h3x' }, 'Deadlines'), h('span', { class: 'hint', style: 'margin-left:auto' }, 'Next 7 days')),
      h('div', { class: 'week' }, ...days.map((dt, i) => { const n = weekDl.filter((x) => daysFrom(x.due_on) === i).length;
        return h('div', { class: `day${i === 0 ? ' today' : ''}` }, h('span', {}, dt.toLocaleDateString(undefined, { weekday: 'short' })), h('b', {}, String(dt.getDate())), h('i', {}, ...Array.from({ length: Math.min(n, 3) }, () => h('em'))));
      })),
      dl.length ? h('div', { class: 'rows', style: 'padding-top:0' }, ...dl.slice(0, 6).map((x) => { const soon = daysFrom(x.due_on) <= 1;
        return h('div', { class: 'row', style: 'min-height:48px' }, h('span', { class: 'dotc', style: `--c:${soon ? 'var(--warn)' : 'var(--action)'}` }), h('div', { class: 'main' }, h('b', { style: 'font-size:14px' }, x.label)), h('span', { class: `due${soon ? ' soon' : ''}` }, shortDate(x.due_on))); }))
        : quiet('clock', null, 'No deadlines in the next two weeks.'));
    const o = p.ok ? p.data[0] : null;
    if (o && (o.reviews_overdue > 0 || o.reviews_due > 0)) {
      put(noticeBox, h('div', { class: 'notice', role: 'status', style: 'margin-top:22px' }, icon('clock'), h('span', {}, h('b', {}, 'Coming up. '), o.reviews_overdue > 0 ? `${o.reviews_overdue} Planner review${o.reviews_overdue === 1 ? ' is' : 's are'} overdue. ` : '', o.reviews_due > 0 ? `${o.reviews_due} due in the next two weeks${o.next_review_on ? `, the next ${shortDate(o.next_review_on)}` : ''}.` : '')));
    }
  })();
  if (owner) {
    (async () => {
      const r = await api.call('members.list', {});
      if (!live()) return;
      const waiting = r.ok ? r.data.filter((m) => m.row_kind === 'invitation').length : null;
      owner.querySelector('.skel-wrap, .skel')?.remove();
      owner.append(
        h('a', { class: 'kv linkrow', style: 'min-height:44px;padding:0;text-decoration:none', href: hrefFor.admin('members') }, icon('mail'), waiting === null ? 'Invitations can’t be loaded right now' : 'Invitations waiting', waiting === null ? null : h('span', { class: 'pill brand', style: 'margin-left:auto' }, String(waiting))),
        portalState ? h('div', { class: 'kv' }, icon('lock'), 'Client Portal', portalState === 'locked' ? pill('Locked', '', 'lock') : pill('On', 'ok', 'check')) : null);
    })();
  }
  return h('section', {},
    h('div', { class: 'hello' }, h('div', {}, h('p', { class: 'over' }, today()), h('h1', { 'data-page-title': true }, `Your work in ${org.name}.`), h('p', { class: 'sub' }, 'Everything assigned to you, in one place.')),
      h('a', { class: 'btn primary', href: hrefFor.app('projects') }, icon('plus'), 'New task')),
    noticeBox, strip,
    h('div', { class: 'cols' },
      h('div', { class: 'stackcol' }, att, workBox),
      h('div', { class: 'stackcol' }, dlBox, feed, shortcuts, owner)));
}
