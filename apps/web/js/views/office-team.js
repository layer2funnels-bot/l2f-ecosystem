// Office › Team, member page, Apps and Notification settings, V8 (prototype office5.js `team`, `memberPage`, `apps`, office6.js `notifSettings`).
// Everything a person sees about a colleague's work is what their own project access allows (office.team.now / office.member.get run under row rules).
import { h, put, icon, toast, skeleton, errorState, emptyState, avatar, roleLabel } from '../ui.js';
import { hrefFor } from '../routes.js';
import { plateOf, loadRegistry } from '../registry.js';
import { dueLabel, feedLine } from './home.js';

const TONES = ['#2B63F6', '#13A592', '#E8B820', '#FF8A6B', '#A898FF', '#5FDCCB', '#FF9CC8'];
const tone = (id) => TONES[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];
const ago = (iso) => { const s = (Date.now() - new Date(iso)) / 1000; return s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : s < 86400 ? `${Math.round(s / 3600)} h` : s < 172800 ? 'Yesterday' : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };
const hours = (m) => `${Math.round((m ?? 0) / 6) / 10}h`;
const photoInto = (api, m, el) => { if (m.has_photo) api.call('profile.photo', { user: m.user_id }).then((x) => { const url = x.ok ? x.data?.[0]?.photo : null; if (url) el.replaceChildren(h('img', { src: url, alt: '', style: 'width:100%;height:100%;border-radius:50%;object-fit:cover' })); }); };
const face = (api, m, size) => { const a = avatar(m.display_name, size); a.style.cssText += `;width:${size}px;height:${size}px;font-size:${Math.round(size / 3)}px;--av:${tone(m.user_id)}`; photoInto(api, m, a); return a; };
const reg = async () => { const r = await loadRegistry().catch(() => null); return (k) => r?.get(k) ?? { id: k }; };

export function teamView({ api, ctx }) {
  const root = h('div', { class: 'v8p-office' }); const grid = h('div', { class: 'cardgrid team' }, skeleton(4));
  (async () => {
    const [t, n] = await Promise.all([api.call('team.list', {}), api.call('office.team.now', {})]); if (!ctx.live()) return;
    if (!t.ok) return put(grid, errorState(() => ctx.rerender()));
    const now = new Map((n.ok ? n.data : []).map((x) => [x.user_id, x]));
    put(grid, ...(t.data.length ? t.data.map((m) => { const w = now.get(m.user_id);
      return h('a', { class: 'card tm', href: `#/office/member/${m.user_id}` }, h('span', { class: 'tm-cover', style: `--c:${tone(m.user_id)}` }), face(api, m, 76),
        h('h3', {}, m.display_name, m.is_you ? h('span', { class: 'muted', style: 'font-weight:400' }, ' (you)') : null), h('p', {}, roleLabel(m.role)),
        h('span', { class: 'foot' }, h('span', { class: 'dotc', style: `--c:${w ? '#2BB673' : '#9AA0AA'}` }), w ? `Working on: ${w.title}` : 'Nothing in progress you can see')); })
      : [emptyState({ title: 'No one here yet', body: 'Invite people from Admin.', ic: 'team' })]));
  })();
  put(root, h('div', { class: 'pagehead' }, h('div', {}, h('h1', { class: 'h1', 'data-page-title': true }, 'Team'), h('p', { class: 'lede' }, `Everyone in ${ctx.orgName}: who they are and what they’re working on.`)),
    ctx.isAdmin ? h('div', { class: 'acts' }, h('a', { class: 'btn ghost', href: hrefFor.admin('members') }, icon('shield'), 'Manage access')) : null), grid);
  return root;
}

export function memberView({ api, ctx, id }) {
  const root = h('div', { class: 'v8p-office' }, skeleton(4));
  (async () => {
    const [r, f, R] = await Promise.all([api.call('office.member.get', { user: id }), api.call('pm.activity.org.feed', { args: { actor: id, limit: 6 } }), reg()]); if (!ctx.live()) return;
    if (!r.ok) return put(root, errorState(() => ctx.rerender()));
    const m = r.data?.[0]; if (!m) return put(root, emptyState({ title: 'This person isn’t on your team', body: 'They may have left, or belong to another organization.', ic: 'team', action: h('a', { class: 'btn', href: '#/office/team' }, 'Back to Team') }));
    const feed = f.ok ? f.data?.[0]?.r?.items ?? [] : []; const planned = m.week?.planned_minutes ?? 0; const logged = m.week?.logged_minutes ?? 0; const top = Math.max(planned, logged, 60);
    const bar = (nm, v, deep) => h('div', { class: 'ws-bar' }, h('span', { class: 'nm' }, nm), h('span', { class: 'prog', style: `--v:${Math.round((v / top) * 100)}%` }, h('i', deep ? { style: 'background:var(--brand-deep)' } : {})), h('span', { class: 'mono', style: 'font-size:13px' }, hours(v)));
    put(root, h('div', { class: 'profile-hero', style: `--c:${tone(m.user_id)}` }, h('div', { class: 'ph-cover' }), h('div', { class: 'ph-row' }, face(api, m, 112),
      h('div', { class: 'ph-name' }, h('h1', { class: 'h1', 'data-page-title': true }, m.display_name), h('p', { class: 'tx2' }, [roleLabel(m.role), ctx.orgName, m.email].filter(Boolean).join(' · '))),
      h('div', { class: 'acts' }, m.is_you ? h('a', { class: 'btn ghost', href: '#/profile' }, icon('imgI'), 'Change photo') : null, ctx.isAdmin ? h('a', { class: 'btn ghost', href: hrefFor.admin('members') }, icon('shield'), 'Access') : null))),
    h('div', { class: 'split', style: 'margin-top:22px' },
      h('div', { class: 'stackcol' },
        h('section', { class: 'panel now' }, h('p', { class: 'over' }, 'Working on now'), m.now ? h('div', { style: 'display:flex;gap:14px;align-items:center;margin-top:8px' }, plateOf(R('projects'), 40),
          h('div', { class: 'grow' }, h('b', { style: 'font-size:17px' }, m.now.title), h('p', { class: 'hint' }, `${m.now.project_name} · timer running since ${new Date(m.now.started_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`)),
          h('a', { class: 'btn ghost sm', href: `#/projects/p/${m.now.project_id}/list?task=${m.now.task_id}` }, 'Open')) : h('p', { class: 'hint', style: 'margin-top:8px' }, 'No timer running in a project you can see.')),
        h('section', { class: 'panel' }, h('div', { class: 'sec-h' }, h('h2', {}, 'Pending work'), h('span', { class: 'n' }, String(m.tasks.length))),
          m.tasks.length ? h('div', { class: 'rows' }, ...m.tasks.map((t) => h('a', { class: 'row', href: `#/projects/p/${t.project_id}/list?task=${t.id}` }, plateOf(R('projects'), 26), h('div', { class: 'main' }, h('b', {}, t.title), h('small', {}, t.project_name)), t.due_on ? h('span', { class: 'due' }, dueLabel(t.due_on)) : null)))
            : h('p', { class: 'hint', style: 'padding:0 20px 14px' }, 'No open work you can see.'),
          h('p', { class: 'hint', style: 'padding:0 20px 14px' }, 'Only work you’re allowed to see.')),
        h('section', { class: 'panel' }, h('div', { class: 'sec-h' }, h('h2', {}, 'Recent activity')), feed.length ? h('ul', { class: 'feed' }, ...feed.map((a) => h('li', {}, avatar(m.display_name, 28), h('div', {}, feedLine(a), h('small', {}, `${a.projectName} · ${ago(a.createdAt)}`)))))
          : h('p', { class: 'hint', style: 'padding:0 20px 14px' }, 'Nothing recent in projects you can see.'))),
      h('div', { class: 'stackcol' },
        h('section', { class: 'panel', style: 'padding:18px 20px' }, h('p', { class: 'sec-t', style: 'margin-top:0' }, 'This week'), bar('Planned', planned), bar('Logged', logged, true)),
        h('section', { class: 'panel', style: 'padding:18px 20px' }, h('p', { class: 'sec-t', style: 'margin-top:0' }, 'About'), h('dl', { class: 'kv2' }, h('dt', {}, 'Role'), h('dd', {}, roleLabel(m.role)), h('dt', {}, 'Email'), h('dd', {}, m.email || '—'), h('dt', {}, 'Organization'), h('dd', {}, ctx.orgName))),
        h('section', { class: 'panel', style: 'padding:18px 20px' }, h('p', { class: 'sec-t', style: 'margin-top:0' }, 'Projects'), ...(m.projects.length ? m.projects.map((p) => h('a', { class: 'linkrow', style: 'min-height:44px', href: `#/projects/p/${p.id}/overview` }, h('span', { class: 'pdot', style: `--c:${p.color}` }), h('span', { class: 'main' }, h('b', {}, p.name)))) : [h('p', { class: 'hint' }, 'None you can see.')])))));
  })();
  return root;
}

export function appsView({ catalog, registry, org }) {
  const reason = { locked: 'Locked until security tests pass', coming_soon: 'Coming soon', not_set_up: `Not set up for ${org.name}` };
  const cards = catalog.map((a) => { const man = registry?.get(a.app_key); const open = a.state === 'available';
    const href = a.app_key === 'office' ? hrefFor.office() : a.app_key === 'funnel_mapper_pro' && a.launch_url ? a.launch_url : hrefFor.app(a.app_key);
    return h('div', { class: 'card', style: 'grid-template-columns:auto 1fr;align-items:center' }, plateOf(man ?? { id: a.app_key }, 52, a.state), h('span', {}, h('h3', {}, a.name), h('p', {}, man?.description ?? '')),
      h('div', { class: 'foot', style: 'grid-column:1/-1' }, open ? h('span', { class: 'pill blue' }, 'On') : h('span', { class: 'pill' }, a.state === 'locked' ? icon('lock') : null, reason[a.state] ?? 'Unavailable'),
        open ? h('a', { class: 'btn quiet sm', style: 'margin-left:auto', href }, 'Open', h('span', { class: 'sr' }, ` ${a.name}`)) : null)); });
  return h('div', { class: 'v8p-office' }, h('div', { class: 'pagehead' }, h('div', {}, h('h1', { class: 'h1', 'data-page-title': true }, 'Apps'), h('p', { class: 'lede' }, `Apps on for ${org.name}. Owners turn apps on or off for the whole organization; people still need access in Admin.`))),
    cards.length ? h('div', { class: 'cardgrid' }, ...cards) : emptyState({ title: 'No apps yet', body: 'No app is switched on for you here. Ask an admin.', ic: 'grid' }));
}

/** Notification settings (V8 office6 `notifSettings`): per app, the in-app inbox on or off. Email digest needs an approved provider (not set up: shown as Later). */
export function notificationSettingsView({ api, ctx }) {
  const APPS = [['projects', 'Projects'], ['clients', 'Clients'], ['planner', 'Planner'], ['drive', 'Drive'], ['social_planner', 'Social Planner'], ['forms', 'Forms'], ['office', 'Office']];
  const root = h('div', { class: 'v8p-office' }); const tbl = h('div', { class: 'tbl6' }, skeleton(4));
  (async () => {
    const [p, R] = await Promise.all([api.call('notifications.prefs', {}), reg()]); if (!ctx.live()) return;
    if (!p.ok) return put(tbl, errorState(() => ctx.rerender()));
    const on = new Map(p.data.map((x) => [x.app, x.in_app]));
    put(tbl, h('div', { class: 'thd' }, ...['App', 'In-app inbox', 'Email digest', 'Mentions', 'Approvals', ''].map((x) => h('span', {}, x))),
      ...APPS.map(([k, n]) => { const sw = h('button', { class: 'toggle', type: 'button', role: 'switch', 'aria-checked': String(on.get(k) ?? true), 'aria-label': `${n} in the app` });
        sw.onclick = async () => { const v = sw.getAttribute('aria-checked') !== 'true'; sw.setAttribute('aria-checked', String(v)); const r = await api.call('notifications.prefs.set', { app: k, in_app: v });
          if (!r.ok) { sw.setAttribute('aria-checked', String(!v)); toast('Couldn’t save that.', false); } else toast(`${n}: ${v ? 'on' : 'off'} in the app.`); };
        return h('div', { class: 'tr' }, h('span', { class: 't1c' }, plateOf(R(k), 24), h('b', {}, n)), h('span', {}, sw), h('span', {}, h('span', { class: 'pill' }, 'Later')), h('span', { class: 'tx2' }, 'Always'), h('span', { class: 'tx2' }, 'Always'), h('span')); }));
  })();
  put(root, h('div', { class: 'ph6' }, h('h1', { class: 't1', 'data-page-title': true }, 'Notification settings')), tbl,
    h('p', { class: 'hint', style: 'margin-top:8px' }, 'Email needs an approved provider. Mentions and approvals can’t be turned off.'));
  return root;
}
