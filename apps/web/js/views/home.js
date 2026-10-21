// Office Home (design 04). Blocks that need Projects or Planner data show their designed empty states until those apps exist.
import { h, put, icon, pill, emptyState, skeleton } from '../ui.js';
import { hrefFor } from '../routes.js';

const eb = (ic, title, body) => h('div', { class: 'eb' }, icon(ic), h('span', {}, title ? h('b', { style: 'color:var(--ink)' }, title) : null, title ? h('br') : null, body));

export function officeHomeView({ org, role, isAdmin, api, live, portalState }) {
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
  return h('section', {}, h('div', { class: 'crumb' }, `Office · ${org.name}`), h('h1', { 'data-page-title': true }, 'Home'), h('p', { class: 'sub' }, `Your work in ${org.name}.`),
    h('div', { class: 'split' },
      h('div', { class: 'grid' },
        h('section', { class: 'card', 'aria-labelledby': 'h1x' }, h('h3', { id: 'h1x', style: 'padding:var(--space-4) var(--space-5) 0' }, 'Needs your attention'), eb('check', 'Nothing needs you right now.', 'Approvals and reviews assigned to you show up here.')),
        h('section', { class: 'card', 'aria-labelledby': 'h2x' }, h('h3', { id: 'h2x', style: 'padding:var(--space-4) var(--space-5) 0' }, 'My work'), eb('home', 'Nothing assigned to you.', `When someone gives you a task in ${org.name}, it appears here with its due date.`))),
      h('div', { class: 'grid' },
        h('section', { class: 'card', 'aria-labelledby': 'h3x' }, h('h3', { id: 'h3x', style: 'padding:var(--space-4) var(--space-5) 0' }, 'Deadlines'), eb('clock', null, 'No deadlines in the next two weeks.')),
        h('section', { class: 'card', 'aria-labelledby': 'h4x' }, h('h3', { id: 'h4x', style: 'padding:var(--space-4) var(--space-5) 0' }, 'Recent updates'), h('p', { class: 'sec' }, 'Only from things you can open.'), eb('info', null, 'No updates yet today.')),
        isAdmin ? adminBox : null,
        h('section', { class: 'card', 'aria-labelledby': 'h6x' }, h('h3', { id: 'h6x', style: 'padding:var(--space-4) var(--space-5) 0' }, 'Shortcuts'),
          h('div', { class: 'short', style: 'margin-top:var(--space-3)' }, h('a', { class: 'btn', href: hrefFor.funnels() }, 'Funnels'), h('a', { class: 'btn', href: hrefFor.launcher() }, 'All apps'))))));
}
