// Social Planner (v4): Calendar, Posts, Campaigns and Channels, and the campaign page. It PLANS. Nothing is published from here: "posted" is a person's own record
// ("Mark as posted manually"), connecting accounts is switched off and says why. Review goes through Approvals; the post follows the decision.
import { setCrumbs, h, put, icon, btn, chip, dialog, drawer, toast, field, notice, skeleton, emptyState, errorState, noAccessState, tabs, readOnlyNotice } from '../ui.js';
import { STATES, stateLabel, CAMPAIGN_STATES, postActions, counter, mediaWarning, monthGrid, byDay, progress, campaignMoves, toLocalInput, fromLocalInput, ymd } from './socialmodel.js';

export const socialHref = (view, id) => (view === 'c' ? `#/social/c/${id}` : view && view !== 'calendar' ? `#/social?tab=${view}` : '#/social');
const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const day = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const TABS = [['calendar', 'Calendar'], ['posts', 'Posts'], ['campaigns', 'Campaigns'], ['channels', 'Channels']];
const NO_CONNECT = 'Connecting accounts isn’t available yet. Posts are planned here and published by a person.';

export function socialView({ api, ctx, route }) {
  const root = h('section', { class: 'sp' }); const live = () => ctx.live() && root.isConnected;
  const canCreate = ctx.canAnywhere('social.post.create'); const canEdit = ctx.canAnywhere('social.post.edit'); const canSched = ctx.canAnywhere('social.post.schedule');
  let channels = []; let campaigns = [];
  const chan = (k) => channels.find((c) => c.key === k); const chLabel = (k) => chan(k)?.label ?? k;
  const clientName = (c) => (c ? (ctx.clients?.get(c) ?? 'A client') : ctx.orgName);
  const fail = (r, what = 'do that') => toast(r?.status === 404 ? `You can’t ${what} here.` : (r?.message ?? 'Something went wrong. Try again.'), false);
  const refresh = () => { if (live()) ctx.rerender(); };
  const statePill = (s) => chip(stateLabel(s), STATES[s]?.kind ?? '');

  async function boot() {
    const [c, k] = await Promise.all([api.call('social.channels', {}), api.call('social.campaigns.list', {})]);
    if (!live()) return false;
    if (!c.ok) { put(root, c.status === 404 ? noAccessState({ title: 'Social Planner isn’t switched on for you', body: 'Ask an admin to turn it on for your access level.', action: h('a', { class: 'btn', href: '#/launcher' }, 'Back to the Launcher') }) : errorState(refresh)); return false; }
    channels = c.data; campaigns = k.ok ? k.data : []; return true;
  }

  // ---------------------------------------------------------------- a post: the drawer (write, preview, media, versions, moves)
  async function openPost(id, defaults = {}) {
    let post = null;
    if (id) { const r = await api.call('social.posts.get', { id }); if (!r.ok || !r.data[0]) return fail(r, 'open this post'); post = r.data[0]; }
    const editable = id ? canEdit && !['in_review', 'approved', 'scheduled', 'published', 'failed'].includes(post.status) && !post.archived_at : canCreate;
    const title = field({ id: 'sp-title', label: 'Title', value: post?.title ?? '', maxlength: 200, readonly: !editable });
    const chSel = field({ id: 'sp-channel', label: 'Channel', value: post?.channel ?? defaults.channel ?? 'instagram', options: channels.map((c) => [c.key, c.label]), readonly: !editable });
    const cap = field({ id: 'sp-caption', label: 'Caption', value: post?.caption ?? '', rows: 6, readonly: !editable });
    const planned = field({ id: 'sp-when', label: 'Planned for', type: 'datetime-local', value: toLocalInput(post?.scheduled_for ?? defaults.scheduled_for), readonly: !(id ? canEdit && !['published', 'cancelled'].includes(post.status) : canCreate), hint: 'Optional until you schedule it.' });
    const clientOpts = [['', ctx.orgName], ...ctx.clientsWhere('social.post.create').map(([cid, n]) => [cid, n])];
    const clientSel = field({ id: 'sp-client', label: 'For', value: post?.client_id ?? defaults.client ?? '', options: id ? [[post.client_id ?? '', clientName(post.client_id)]] : clientOpts, readonly: !!id });
    const campOpts = () => [['', 'No campaign'], ...campaigns.filter((c) => !c.archived_at && (!c.client_id || c.client_id === (clientSel.input.value || null))).map((c) => [c.id, c.name])];
    const campSel = field({ id: 'sp-campaign', label: 'Campaign', value: post?.campaign_id ?? defaults.campaign ?? '', options: campOpts(), readonly: id ? !canEdit || post.status === 'published' : !canCreate });
    clientSel.input.addEventListener('change', () => { const v = campSel.input.value; campSel.input.replaceChildren(...campOpts().map(([val, t]) => h('option', { value: val }, t))); campSel.input.value = campOpts().some(([val]) => val === v) ? v : ''; });
    const count = h('p', { class: 'sp-count fine', 'aria-live': 'polite' }); const warn = h('p', { class: 'sp-warn fine', role: 'status' });
    const preview = h('div', { class: 'sp-prev', 'aria-label': 'Preview' });
    const paint = () => {
      const ch = chan(chSel.input.value); const c = counter(cap.input.value, ch);
      put(count, c.max === null ? `${c.len} characters. ${ch?.label ?? ''} has no fixed limit.` : c.over ? `${c.len} / ${c.max}. ${-c.left} over the ${ch.label} limit; it can’t be scheduled like this.` : `${c.len} / ${c.max}`);
      count.classList.toggle('over', c.over); put(warn, mediaWarning(post?.files?.length ?? 0, ch));
      put(preview, h('strong', {}, ch?.label ?? ''), h('p', {}, title.input.value || 'Untitled'), h('p', { class: 'sp-prev-cap' }, c.max !== null && c.over ? cap.input.value.slice(0, c.max) : cap.input.value, c.over ? h('mark', {}, cap.input.value.slice(c.max)) : null), (post?.files?.length ?? 0) ? h('p', { class: 'fine muted' }, `${post.files.length} file${post.files.length === 1 ? '' : 's'} attached`) : null);
    };
    for (const f of [title, chSel, cap]) f.input.addEventListener('input', paint); chSel.input.addEventListener('change', paint); paint();

    const save = async () => {
      const t = title.input.value.trim(); if (!t) return title.error('Give the post a title.'); title.ok();
      const when_ = fromLocalInput(planned.input.value);
      const body = { title: t, channel: chSel.input.value, caption: cap.input.value, ...(when_ ? { scheduled_for: when_ } : {}) };
      const r = id ? await api.call('social.posts.update', { id, ...body, ...(campSel.input.value ? { campaign: campSel.input.value } : { clear_campaign: true }) })
        : await api.call('social.posts.create', { ...body, status: 'draft', ...(clientSel.input.value ? { client: clientSel.input.value } : {}), ...(campSel.input.value ? { campaign: campSel.input.value } : {}) });
      if (!r.ok) return fail(r, 'save posts'); toast('Saved.'); close(); refresh();
    };
    const move = async (status, extra = {}, msg) => { const r = await api.call('social.posts.set_status', { id, status, ...extra }); if (!r.ok) return fail(r); toast(msg ?? 'Updated.'); close(); refresh(); };
    const ask = (titleText, bodyEls, label, on, cls = 'pri') => dialog({ title: titleText, body: bodyEls, actions: [{ label, cls, on: async () => { const k = await on(); return k === false ? false : undefined; } }, { label: 'Cancel' }] });
    const acts = {
      to_draft: ['Back to draft', () => move('draft', {}, 'Back to draft.')],
      review: ['Send for review', () => { const n = field({ id: 'sp-note', label: 'Note for the reviewer (optional)', rows: 3 }); ask('Send for review', n.el, 'Send', async () => { const r = await api.call('social.posts.submit_for_review', { id, ...(n.input.value.trim() ? { note: n.input.value.trim() } : {}) }); if (!r.ok) { fail(r, 'send posts for review'); return false; } toast('Sent for review.'); close(); refresh(); }); }, 'pri'],
      schedule: ['Schedule', () => { const w = field({ id: 'sp-sch', label: 'Post at', type: 'datetime-local', value: toLocalInput(post.scheduled_for) }); ask('Schedule post', [w.el, h('p', { class: 'fine muted' }, 'Planner doesn’t publish. This puts the post on the calendar for the person who will post it.')], 'Schedule', async () => { const v = fromLocalInput(w.input.value); if (!v) return w.error('Choose a date and time.'); const r = await api.call('social.posts.set_status', { id, status: 'scheduled', scheduled_for: v }); if (!r.ok) { fail(r); return false; } toast('Scheduled.'); close(); refresh(); }); }, 'pri'],
      posted: ['Mark as posted manually', () => { const u = field({ id: 'sp-url', label: 'Link to the live post (optional)', hint: 'Starts with https://' }); ask('Mark as posted', [u.el, h('p', { class: 'fine muted' }, 'This records that you posted it yourself. Planner can’t check.')], 'Mark as posted', async () => { const v = u.input.value.trim(); if (v && !/^https?:\/\/\S+$/.test(v)) return u.error('Use a web address that starts with https://'); const r = await api.call('social.posts.set_status', { id, status: 'published', ...(v ? { post_url: v } : {}) }); if (!r.ok) { fail(r); return false; } toast('Recorded as posted.'); close(); refresh(); }); }, 'pri'],
      failed: ['Mark as failed', () => { const w = field({ id: 'sp-why', label: 'What went wrong?', rows: 3, maxlength: 500 }); ask('Mark as failed', w.el, 'Mark as failed', async () => { const v = w.input.value.trim(); if (!v) return w.error('Say what went wrong so the next person knows.'); const r = await api.call('social.posts.set_status', { id, status: 'failed', failure_reason: v }); if (!r.ok) { fail(r); return false; } toast('Marked as failed.'); close(); refresh(); }, 'danger'); }],
      retry: ['Schedule again', () => { const w = field({ id: 'sp-sch', label: 'Post at', type: 'datetime-local', value: toLocalInput(post.scheduled_for) }); ask('Schedule again', w.el, 'Schedule', async () => { const v = fromLocalInput(w.input.value); if (!v) return w.error('Choose a date and time.'); const r = await api.call('social.posts.set_status', { id, status: 'scheduled', scheduled_for: v }); if (!r.ok) { fail(r); return false; } toast('Scheduled again.'); close(); refresh(); }); }, 'pri'],
      cancel: ['Cancel post', () => ask('Cancel this post?', h('p', {}, 'It stays in the list as cancelled and can be reopened as a draft.'), 'Cancel post', async () => { const r = await api.call('social.posts.set_status', { id, status: 'cancelled' }); if (!r.ok) { fail(r); return false; } toast('Cancelled.'); close(); refresh(); }, 'danger')],
      reopen: ['Reopen as draft', () => move('draft', {}, 'Reopened as a draft.')],
    };
    const moves = id ? postActions(post, { edit: canEdit, schedule: canSched }) : [];
    const statusBlock = !id ? null : h('div', { class: 'sp-state' }, statePill(post.status), post.status === 'in_review' ? h('p', { class: 'fine muted' }, 'Waiting for the approval. The decision moves the post on its own.') : null,
      post.status === 'failed' ? notice('err', 'warn', [h('b', {}, 'Failed.'), ` ${post.failure_reason}`]) : null,
      post.status === 'published' ? h('p', { class: 'fine' }, `Posted manually ${when(post.published_at)}. `, post.post_url ? h('a', { href: post.post_url, target: '_blank', rel: 'noopener noreferrer' }, 'Open the live post') : null) : null,
      post.campaign_id ? h('p', { class: 'fine' }, 'Campaign: ', h('a', { href: socialHref('c', post.campaign_id) }, campaigns.find((c) => c.id === post.campaign_id)?.name ?? 'Open')) : null);
    const mediaBox = !id ? h('p', { class: 'fine muted' }, 'Attach media after the first save.') : h('div', { class: 'sp-media' }, h('strong', {}, 'Media'), h('p', { class: 'fine muted' }, post.files.length ? `${post.files.length} file${post.files.length === 1 ? '' : 's'} from Drive` : 'No files yet.'),
      canEdit && editable ? btn('Choose from Drive', () => pickMedia(post, () => { close(); refresh(); }), '') : null);
    const body = h('div', { class: 'sp-form' }, statusBlock, title.el, h('div', { class: 'sp-row' }, chSel.el, clientSel.el), cap.el, count, warn, h('div', { class: 'sp-row' }, planned.el, campSel.el), mediaBox, h('h3', {}, 'Preview'), preview,
      id && canCreate && !post.archived_at ? btn('Write it for other channels', () => variants(post, () => { close(); refresh(); }), '') : null);
    const bar = h('div', { class: 'sp-actions' },
      ...(editable || (id && canEdit && !['published', 'cancelled'].includes(post.status)) ? [btn(id ? 'Save' : 'Create post', save, 'pri')] : []),
      ...moves.map((m) => btn(acts[m][0], acts[m][1], acts[m][2] ?? '')),
      id && canEdit && !post.archived_at && ['idea', 'draft', 'cancelled', 'published'].includes(post.status) ? btn('Archive', async () => { const r = await api.call('social.posts.archive', { id }); if (!r.ok) return fail(r); toast('Archived.'); close(); refresh(); }, '') : null,
      id && canEdit && post.archived_at ? btn('Restore', async () => { const r = await api.call('social.posts.restore', { id }); if (!r.ok) return fail(r); toast('Restored.'); close(); refresh(); }, '') : null);
    const close = drawer({ title: id ? post.title : 'New post', label: id ? 'Post' : 'New post', body: h('div', {}, !id && !canCreate ? readOnlyNotice('Your access level can’t add posts') : null, body, bar) });
  }

  async function pickMedia(post, done) {
    const r = await api.call('drive.files.list', { space: 'shared' }); if (!r.ok) return fail(r, 'open Drive');
    const files = r.data.filter((f) => f.kind === 'file' && /^(image|video)\//.test(f.mime_type ?? '')); const chosen = new Set(post.files);
    const ch = chan(post.channel);
    dialog({ title: 'Choose media from Drive', wide: true, body: files.length ? h('div', { class: 'sp-pick' }, ...files.map((f) => { const id = `pm-${f.id}`; const cb = h('input', { type: 'checkbox', id, checked: chosen.has(f.id) }); cb.addEventListener('change', () => (cb.checked ? chosen.add(f.id) : chosen.delete(f.id))); return h('label', { for: id }, cb, ' ', f.name); }))
      : emptyState({ title: 'No pictures or videos in Drive yet', body: 'Upload them in Drive first, then come back.', ic: 'drv' }),
      actions: [{ label: 'Attach', cls: 'pri', on: async () => { if (chosen.size > 10 || (ch && chosen.size > ch.max_media)) { toast(`${ch?.label ?? 'A post'} takes at most ${Math.min(10, ch?.max_media ?? 10)} files.`, false); return false; } const w = await api.call('social.posts.files.set', { id: post.id, files: [...chosen] }); if (!w.ok) { fail(w, 'attach media'); return false; } toast('Media attached.'); done(); } }, { label: 'Cancel' }] });
  }

  function variants(post, done) {
    const boxes = channels.filter((c) => c.key !== post.channel).map((c) => { const id = `vr-${c.key}`; const cb = h('input', { type: 'checkbox', id, value: c.key }); return [cb, h('label', { for: id }, cb, ' ', c.label, c.max_text !== null && counter(post.caption, c).over ? h('span', { class: 'fine over' }, ` (caption is ${counter(post.caption, c).len - c.max_text} over)`) : null)]; });
    dialog({ title: 'Write it for other channels', body: [h('p', { class: 'fine muted' }, 'Each one becomes a draft with the same words and media, so you can adjust it for that channel.'), h('div', { class: 'sp-pick' }, ...boxes.map((b) => b[1]))],
      actions: [{ label: 'Make drafts', cls: 'pri', on: async () => { const picked = boxes.map((b) => b[0]).filter((c) => c.checked).map((c) => c.value); if (!picked.length) { toast('Choose at least one channel.', false); return false; } const r = await api.call('social.posts.variants', { id: post.id, channels: picked }); if (!r.ok) { fail(r, 'add posts'); return false; } toast(`${r.data.length} draft${r.data.length === 1 ? '' : 's'} made.`); done(); } }, { label: 'Cancel' }] });
  }

  // ---------------------------------------------------------------- campaigns: create / edit
  function campaignForm(c, done) {
    const name = field({ id: 'sc-name', label: 'Campaign name', value: c?.name ?? '', maxlength: 200 });
    const goal = field({ id: 'sc-goal', label: 'Goal (optional)', value: c?.goal ?? '', rows: 3, maxlength: 1000 });
    const from = field({ id: 'sc-from', label: 'Starts', type: 'date', value: c?.starts_on?.slice(0, 10) ?? '' }); const to = field({ id: 'sc-to', label: 'Ends', type: 'date', value: c?.ends_on?.slice(0, 10) ?? '' });
    const cl = field({ id: 'sc-client', label: 'For', value: c?.client_id ?? '', options: c ? [[c.client_id ?? '', clientName(c.client_id)]] : [['', ctx.orgName], ...ctx.clientsWhere('social.post.create')], readonly: !!c });
    dialog({ title: c ? 'Edit campaign' : 'New campaign', body: [name.el, goal.el, h('div', { class: 'sp-row' }, from.el, to.el), cl.el], actions: [{ label: c ? 'Save' : 'Create', cls: 'pri', on: async () => {
      const n = name.input.value.trim(); if (!n) return name.error('Give the campaign a name.');
      if (from.input.value && to.input.value && to.input.value < from.input.value) return to.error('The end can’t be before the start.');
      const dates = { ...(from.input.value ? { starts_on: from.input.value } : {}), ...(to.input.value ? { ends_on: to.input.value } : {}) };
      const r = c ? await api.call('social.campaigns.update', { id: c.id, name: n, goal: goal.input.value.trim(), ...dates }) : await api.call('social.campaigns.create', { name: n, ...(goal.input.value.trim() ? { goal: goal.input.value.trim() } : {}), ...dates, ...(cl.input.value ? { client: cl.input.value } : {}) });
      if (!r.ok) { fail(r, 'save campaigns'); return false; } done(r.data[0]); } }, { label: 'Cancel' }] });
  }

  // ---------------------------------------------------------------- the home: tabs
  async function home() {
    put(root, skeleton(3)); if (!(await boot())) return;
    let tab = TABS.some(([k]) => k === route?.query?.tab) ? route.query.tab : 'calendar';
    const body = h('div', {});     // the four views are the app's side-rail pages (appnav.js)
    const newPost = canCreate ? btn('New post', () => openPost(null), 'pri') : null;
    put(root, h('div', { class: 'pj-head' }, h('div', {}, h('div', { class: 'crumbs fine' }, 'Social Planner'), h('h1', { 'data-page-title': true }, 'Social Planner'), h('p', { class: 'sub' }, 'Plan posts and campaigns. A person posts them; Planner keeps the record.')), newPost), !canCreate ? readOnlyNotice('Your access level can’t add posts') : null, body);
    ({ calendar, posts, campaigns: campaignsTab, channels: channelsTab })[tab](body);
  }

  async function calendar(body) {
    const now = new Date(); let y = now.getFullYear(); let m = now.getMonth(); let ch = ''; const grid = h('div', {}); const head = h('h2', { class: 'sp-month', 'aria-live': 'polite' });
    const chSel = h('select', { 'aria-label': 'Channel' }, h('option', { value: '' }, 'All channels'), ...channels.map((c) => h('option', { value: c.key }, c.label))); chSel.addEventListener('change', () => { ch = chSel.value; load(); });
    const nav = h('div', { class: 'sp-nav' }, btn('Previous month', () => { m -= 1; if (m < 0) { m = 11; y -= 1; } load(); }, '', { 'aria-label': 'Previous month' }), btn('Today', () => { y = now.getFullYear(); m = now.getMonth(); load(); }), btn('Next month', () => { m += 1; if (m > 11) { m = 0; y += 1; } load(); }, '', { 'aria-label': 'Next month' }), chSel);
    put(body, h('div', { class: 'toolbar' }, head, nav), grid);
    async function load() {
      const weeks = monthGrid(y, m); const from = ymd(weeks[0][0]); const to = ymd(weeks.at(-1)[6]);
      put(head, new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
      const [r, u] = await Promise.all([api.call('social.calendar', { from, to, ...(ch ? { channel: ch } : {}) }), api.call('social.posts.list', {})]); if (!live()) return;
      if (!r.ok) return put(grid, errorState(load));
      const days = byDay(r.data.filter((p) => p.status !== 'cancelled')); const today = ymd(now);
      const undated = u.ok ? u.data.filter((p) => !p.scheduled_for && (!ch || p.channel === ch)) : [];
      put(grid, h('div', { class: 'sp-cal', role: 'grid', 'aria-label': 'Month' }, ...['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => h('div', { class: 'sp-dow', role: 'columnheader' }, d)),
        ...weeks.flat().map((d) => { const k = ymd(d); const list = days.get(k) ?? [];
          return h('div', { class: `sp-day${d.getMonth() !== m ? ' out' : ''}${k === today ? ' today' : ''}`, role: 'gridcell', 'aria-label': `${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}, ${list.length} post${list.length === 1 ? '' : 's'}` },
            h('span', { class: 'sp-dn' }, d.getDate()),
            ...list.slice(0, 3).map((p) => h('button', { type: 'button', class: `sp-chip s-${p.status}`, onclick: () => openPost(p.id) }, h('span', { class: 'sp-ch' }, chLabel(p.channel)), ' ', p.title)),
            list.length > 3 ? h('span', { class: 'fine muted' }, `+${list.length - 3} more`) : null,
            canCreate ? h('button', { type: 'button', class: 'sp-add', 'aria-label': `New post on ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`, onclick: () => openPost(null, { scheduled_for: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9).toISOString() }) }, icon('plus')) : null); })),
        undated.length ? h('div', { class: 'card sp-undated' }, h('h3', {}, 'Not dated yet'), h('ul', {}, ...undated.slice(0, 12).map((p) => h('li', {}, h('button', { type: 'button', class: 'btn link', onclick: () => openPost(p.id) }, p.title), ' ', statePill(p.status), ' ', chip(chLabel(p.channel)))))) : null);
    }
    load();
  }

  async function posts(body) {
    let q = ''; let status = ''; let archived = false; let t = null; const list = h('div', {}, skeleton(3));
    const load = async () => {
      const r = await api.call('social.posts.list', { archived, ...(q ? { q } : {}), ...(status ? { status } : {}) }); if (!live()) return;
      if (!r.ok) return put(list, errorState(load));
      put(list, r.data.length ? h('div', { class: 'card tbl-wrap' }, h('table', { class: 'tbl' }, h('caption', { class: 'sr' }, 'Posts'), h('thead', {}, h('tr', {}, ...['Post', 'Channel', 'State', 'Planned', 'Campaign', 'For'].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, ...r.data.map((p) => h('tr', {}, h('td', {}, h('button', { type: 'button', class: 'btn link', onclick: () => openPost(p.id) }, p.title)), h('td', {}, chLabel(p.channel)), h('td', {}, statePill(p.status)), h('td', {}, when(p.scheduled_for) || '—'),
          h('td', {}, p.campaign_id ? h('a', { href: socialHref('c', p.campaign_id) }, campaigns.find((c) => c.id === p.campaign_id)?.name ?? 'Campaign') : '—'), h('td', {}, clientName(p.client_id)))))))
        : emptyState({ title: q || status ? 'No post matches' : archived ? 'Nothing archived' : 'No posts yet', body: q || status ? 'Try another word or state.' : 'Ideas, drafts and scheduled posts show up here.', ic: 'soc', first: !q && !status && !archived, action: canCreate && !q && !status && !archived ? btn('New post', () => openPost(null), 'pri') : null }));
    };
    const search = h('input', { type: 'search', placeholder: 'Search posts', 'aria-label': 'Search posts', autocomplete: 'off' }); search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { q = search.value.trim(); load(); }, 200); });
    const st = h('select', { 'aria-label': 'State' }, h('option', { value: '' }, 'Any state'), ...Object.entries(STATES).map(([k, v]) => h('option', { value: k }, v.label))); st.addEventListener('change', () => { status = st.value; load(); });
    const sh = h('select', { 'aria-label': 'Show' }, h('option', { value: 'active' }, 'Active'), h('option', { value: 'archived' }, 'Archived')); sh.addEventListener('change', () => { archived = sh.value === 'archived'; load(); });
    put(body, h('div', { class: 'toolbar' }, search, st, sh), list); load();
  }

  async function campaignsTab(body) {
    let archived = false; const list = h('div', {}, skeleton(3));
    const load = async () => {
      const r = await api.call('social.campaigns.list', { archived }); if (!live()) return; if (!r.ok) return put(list, errorState(load)); campaigns = archived ? campaigns : r.data;
      put(list, r.data.length ? h('div', { class: 'pj-cards' }, ...r.data.map((c) => h('a', { class: 'pj-card', href: socialHref('c', c.id) }, h('div', { class: 'pj-card-top' }, h('strong', {}, c.name), chip(CAMPAIGN_STATES[c.status])), h('p', { class: 'fine muted' }, `${clientName(c.client_id)}${c.starts_on ? ` · ${day(c.starts_on)}${c.ends_on ? ` to ${day(c.ends_on)}` : ''}` : ''}`),
        bar(c), h('p', { class: 'fine' }, `${c.published} of ${c.posts - c.cancelled} posted`))))
        : emptyState({ title: archived ? 'Nothing archived' : 'No campaigns yet', body: archived ? '' : 'A campaign groups the posts for one launch or push, with dates and a goal, so you can see how far along it is.', ic: 'soc', first: !archived, action: canCreate && !archived ? btn('New campaign', () => campaignForm(null, (c) => ctx.go(socialHref('c', c.id))), 'pri') : null }));
    };
    const sh = h('select', { 'aria-label': 'Show' }, h('option', { value: 'active' }, 'Active'), h('option', { value: 'archived' }, 'Archived')); sh.addEventListener('change', () => { archived = sh.value === 'archived'; load(); });
    put(body, h('div', { class: 'toolbar' }, sh, canCreate ? btn('New campaign', () => campaignForm(null, (c) => ctx.go(socialHref('c', c.id))), 'pri') : null), list); load();
  }
  const bar = (c) => { const p = progress(c); return h('div', { class: 'sp-bar', role: 'img', 'aria-label': `${p}% posted` }, h('i', { style: `width:${p}%` })); };

  function channelsTab(body) {
    put(body, notice('info', 'info', [h('b', {}, 'Planner plans; people post.'), ` ${NO_CONNECT}`]), h('div', { class: 'card tbl-wrap' }, h('table', { class: 'tbl' }, h('caption', { class: 'sr' }, 'What each channel takes'),
      h('thead', {}, h('tr', {}, ...['Channel', 'Text', 'Files', 'File types', 'Planned time', 'Connect'].map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', {}, ...channels.map((c) => h('tr', {}, h('td', {}, c.label), h('td', {}, c.max_text === null ? 'No fixed limit' : `${c.max_text.toLocaleString()} characters`), h('td', {}, `Up to ${c.max_media}`), h('td', {}, c.media_types.join(', ')), h('td', {}, c.can_schedule ? 'Yes' : 'No'),
        h('td', {}, h('button', { type: 'button', class: 'btn', disabled: true, 'aria-disabled': 'true', title: NO_CONNECT }, 'Connect'), h('span', { class: 'sr' }, NO_CONNECT))))))));
  }

  // ---------------------------------------------------------------- one campaign
  async function campaignPage(id) {
    put(root, skeleton(3)); if (!(await boot())) return;
    const r = await api.call('social.campaigns.get', { id }); if (!live()) return;
    if (!r.ok) return put(root, errorState(refresh)); const c = r.data[0];
    if (!c) return put(root, noAccessState({ title: 'Not here', body: 'This campaign doesn’t exist or isn’t available to you.', action: h('a', { class: 'btn', href: socialHref('campaigns') }, 'All campaigns') }));
    const pr = await api.call('social.posts.list', { campaign: id }); if (!live()) return;
    const move = async (to) => { const w = await api.call('social.campaigns.update', { id, status: to }); if (!w.ok) return fail(w); toast('Updated.'); refresh(); };
    const posts_ = pr.ok ? pr.data : [];
    setCrumbs(root, [['Campaigns', socialHref('campaigns')], [c.name]]);
    put(root, h('div', { class: 'pj-head' }, h('div', {}, h('div', { class: 'crumbs fine' }, h('a', { href: socialHref('campaigns') }, 'Campaigns')), h('h1', { 'data-page-title': true }, c.name), h('p', { class: 'pj-meta' }, chip(CAMPAIGN_STATES[c.status]), ` ${clientName(c.client_id)}`, c.starts_on ? ` · ${day(c.starts_on)}${c.ends_on ? ` to ${day(c.ends_on)}` : ''}` : '', c.archived_at ? ' · Archived' : '')),
      h('div', { class: 'sp-actions' }, ...(canEdit && !c.archived_at ? [...campaignMoves(c.status).map(([to, label]) => btn(label, () => move(to), to === 'active' || to === 'planned' ? 'pri' : '')), btn('Edit', () => campaignForm(c, () => refresh()))] : []),
        canEdit ? btn(c.archived_at ? 'Restore' : 'Archive', async () => { const w = await api.call(c.archived_at ? 'social.campaigns.restore' : 'social.campaigns.archive', { id }); if (!w.ok) return fail(w); toast(c.archived_at ? 'Restored.' : 'Archived.'); refresh(); }) : null)),
      c.goal ? h('p', {}, h('b', {}, 'Goal. '), c.goal) : null,
      h('div', { class: 'card sp-prog' }, bar(c), h('p', {}, h('b', {}, `${progress(c)}%`), ` posted · ${c.published} of ${c.posts - c.cancelled}`, c.scheduled ? ` · ${c.scheduled} scheduled` : '', c.failed ? ` · ${c.failed} failed` : '', c.cancelled ? ` · ${c.cancelled} cancelled` : '')),
      h('div', { class: 'pj-head' }, h('h2', {}, 'Posts'), canCreate && !c.archived_at ? btn('New post in this campaign', () => openPost(null, { campaign: id, client: c.client_id ?? '' }), 'pri') : null),
      posts_.length ? h('div', { class: 'card tbl-wrap' }, h('table', { class: 'tbl' }, h('caption', { class: 'sr' }, 'Posts in this campaign'), h('thead', {}, h('tr', {}, ...['Post', 'Channel', 'State', 'Planned'].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, ...posts_.map((p) => h('tr', {}, h('td', {}, h('button', { type: 'button', class: 'btn link', onclick: () => openPost(p.id) }, p.title)), h('td', {}, chLabel(p.channel)), h('td', {}, statePill(p.status)), h('td', {}, when(p.scheduled_for) || '—'))))))
        : emptyState({ title: 'No posts in this campaign yet', body: 'Add the first one, or move an existing post into it from its drawer.', ic: 'soc' }));
  }

  if (route?.view === 'c' && route.id) campaignPage(route.id); else home();
  return root;
}
