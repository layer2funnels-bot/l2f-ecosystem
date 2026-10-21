// The ecosystem shell: header (organization, switcher, profile) and the app menu. Needs design as a whole.
import { h } from '../dom.js';
import { hrefFor, FUNNEL_TYPES } from '../routes.js';

export function shellView({ app, orgs, activeOrg, email, route, content, notice }) {
  const switcher = h('select', { id: 'org-switcher', 'aria-label': 'Organization', onchange: (e) => app.switchOrg(e.target.value) },
    ...orgs.map((o) => h('option', { value: o.org_id, selected: o.org_id === activeOrg?.org_id }, o.name)));
  const nav = [
    h('a', { href: hrefFor.launcher(), class: route.name === 'launcher' ? 'current' : '' }, 'All apps'),
    h('a', { href: hrefFor.office(), class: route.name === 'office' ? 'current' : '' }, 'Office home'),
    h('a', { href: hrefFor.funnels(), class: route.name === 'funnels' ? 'current' : '' }, 'Funnels'),
    ...FUNNEL_TYPES.map((t) => h('a', { href: hrefFor.list(t.key), class: `sub${route.params?.type === t.key ? ' current' : ''}` }, t.label)),
  ];
  return h('div', { class: 'shell', dataset: { org: activeOrg?.slug ?? '' } },
    h('a', { class: 'skip', href: '#main' }, 'Skip to content'),
    h('header', { class: 'topbar' },
      h('span', { class: 'org-name' }, activeOrg?.name ?? ''),
      h('label', { class: 'switch-label', for: 'org-switcher' }, 'Organization'), switcher,
      h('span', { class: 'spacer' }),
      h('span', { class: 'who' }, email ?? ''), h('button', { type: 'button', class: 'btn ghost', onclick: () => app.signOut() }, 'Sign out')),
    h('div', { class: 'body' },
      h('nav', { class: 'appnav', 'aria-label': 'Office' }, ...nav),
      h('main', { id: 'main' }, notice ?? null, content)));
}
