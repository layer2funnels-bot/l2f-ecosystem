// Working together, on screen (the shared service of migration 0034): a comment thread with @mentions, the record's history, and a
// Follow button. Any app shows them for its own records by passing the record type and id; the database decides who sees and who is told.
import { h, put, btn, toast, icon, avatar } from '../ui.js';

const when = (iso) => { const d = new Date(iso); const mins = Math.round((Date.now() - d.getTime()) / 60000);
  return mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : d.toLocaleDateString(); };

/** Comment thread. people: [{ user_id, display_name, is_you }]; canComment: may this person write here. */
export function commentsPanel({ api, type, id, people = [], canComment, onChange = () => {} }) {
  const box = h('div', { class: 'cm' });
  const list = h('ol', { class: 'cm-list', 'aria-label': 'Comments' });
  const mentioned = new Map();              // display name -> user id, for the people picked while writing
  const nameOf = (uid) => people.find((p) => p.user_id === uid)?.display_name ?? 'Someone';
  const me = people.find((p) => p.is_you)?.user_id;
  const text = h('textarea', { id: `cm-${id}`, rows: 3, maxlength: '10000', placeholder: 'Write a comment. Type @ to mention someone.', 'aria-describedby': `cm-hint-${id}` });
  const sugg = h('ul', { class: 'cm-sugg', role: 'listbox', 'aria-label': 'People to mention', hidden: true });
  let options = []; let sel = 0;
  // the words typed after @ (a full name may have spaces: "@Dan De" narrows to Dan Dev); no match closes the list
  const atWord = () => { const v = text.value.slice(0, text.selectionStart); const m = /(^|\s)@([^@\n]{0,40})$/.exec(v); return m ? m[2] : null; };
  const pick = (p) => {
    const pos = text.selectionStart; const before = text.value.slice(0, pos).replace(/@([^@\n]{0,40})$/, `@${p.display_name} `);
    text.value = before + text.value.slice(pos); text.selectionStart = text.selectionEnd = before.length; mentioned.set(p.display_name, p.user_id); sugg.hidden = true; text.focus();
  };
  const paintSugg = () => {
    const q = atWord();
    const ql = (q ?? '').toLowerCase();
    options = q == null ? [] : people.filter((p) => !p.is_you && p.display_name.toLowerCase().includes(ql)).sort((a, b) => Number(!a.display_name.toLowerCase().startsWith(ql)) - Number(!b.display_name.toLowerCase().startsWith(ql))).slice(0, 8);
    sel = Math.min(sel, Math.max(options.length - 1, 0));
    sugg.hidden = !options.length;
    sugg.replaceChildren(...options.map((p, n) => h('li', { role: 'option', id: `cm-o-${id}-${n}`, 'aria-selected': String(n === sel), class: n === sel ? 'sel' : '', onmousedown: (e) => { e.preventDefault(); pick(p); } }, avatar(p.display_name, 24), p.display_name)));
    text.setAttribute('aria-activedescendant', options.length ? `cm-o-${id}-${sel}` : '');
  };
  text.addEventListener('input', () => { sel = 0; paintSugg(); });
  text.addEventListener('keydown', (e) => {
    if (!sugg.hidden && options.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length; paintSugg(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(options[sel]); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); sugg.hidden = true; return; }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
  });
  const send = async () => {
    const body = text.value.trim(); if (!body) return text.focus();
    const ids = [...mentioned].filter(([name]) => body.includes(`@${name}`)).map(([, uid]) => uid);
    post.disabled = true;
    const r = await api.call('comments.add', { type, id, body, mentions: ids }); post.disabled = false;
    if (!r.ok) return toast(r.status === 404 ? 'You can’t comment here.' : 'That comment wasn’t saved. Try again.', false);
    const told = new Set(r.data[0].mentioned ?? []); const left = ids.filter((x) => !told.has(x));
    text.value = ''; mentioned.clear();
    if (left.length) toast(`${left.map(nameOf).join(', ')} can’t open this, so they weren’t told.`, false);
    load(); onChange();
  };
  const post = btn('Comment', send, 'pri');
  const row = (c) => {
    const mine = c.author_id === me; const bodyEl = h('p', { class: 'cm-body' }, c.body);
    const li = h('li', { class: 'cm-item' }, avatar(c.author_name, 32), h('div', { class: 'cm-main' },
      h('div', { class: 'cm-meta' }, h('b', {}, c.author_name), h('span', { class: 'fine muted' }, ` · ${when(c.created_at)}${c.edited_at ? ' · edited' : ''}`)), bodyEl,
      mine ? h('div', { class: 'cm-acts' }, btn('Edit', () => edit(c, li, bodyEl), 'link'), btn('Delete', async () => { const r = await api.call('comments.delete', { id: c.id }); if (r.ok) { toast('Comment deleted.'); load(); } else toast('That comment wasn’t deleted.', false); }, 'link')) : null));
    return li;
  };
  const edit = (c, li, bodyEl) => {
    const ta = h('textarea', { rows: 3, maxlength: '10000', 'aria-label': 'Edit comment' }); ta.value = c.body;
    const done = h('div', { class: 'cm-acts' }, btn('Save', async () => { const v = ta.value.trim(); if (!v) return; const r = await api.call('comments.edit', { id: c.id, body: v }); if (r.ok) load(); else toast('That change wasn’t saved.', false); }, 'pri'), btn('Cancel', () => load(), ''));
    bodyEl.replaceWith(ta); li.querySelector('.cm-acts')?.replaceWith(done); ta.focus();
  };
  async function load() {
    const r = await api.call('comments.list', { type, id });
    if (!r.ok) return put(list, h('li', { class: 'fine muted' }, 'Comments couldn’t be loaded.'));
    put(list, ...(r.data.length ? r.data.map(row) : [h('li', { class: 'fine muted cm-empty' }, 'No comments yet.')]));
  }
  put(box, list, canComment ? h('div', { class: 'cm-new' }, h('label', { class: 'sr', for: `cm-${id}` }, 'New comment'), h('div', { class: 'cm-wrap' }, text, sugg),
    h('div', { class: 'cm-send' }, h('span', { class: 'fine muted', id: `cm-hint-${id}` }, 'Ctrl+Enter to send. Comments are internal: clients never see them.'), post))
    : h('p', { class: 'fine muted' }, 'You can read comments here but not add them.'));
  load();
  return box;
}

/** History of the record, oldest first. describe(a) turns one step into words. */
export function activityPanel({ api, type, id, describe }) {
  const list = h('ol', { class: 'act-list', 'aria-label': 'History' }, h('li', { class: 'fine muted' }, 'Loading history…'));
  const load = () => api.call('activity.list', { type, id }).then((r) => {
    if (!r.ok) return put(list, h('li', { class: 'fine muted' }, 'History couldn’t be loaded.'));
    put(list, ...(r.data.length ? r.data.map((a) => h('li', { class: 'act-item' }, h('b', {}, a.actor_name), ` ${describe(a)}`, h('span', { class: 'fine muted' }, ` · ${when(a.created_at)}`))) : [h('li', { class: 'fine muted' }, 'Nothing has happened yet.')]));
  });
  list.load = load;   // a <details> around it calls this when opened, so history is current and costs nothing until someone looks
  return list;
}

/** Follow / Following toggle: followers are told about comments and completion. */
export function followButton({ api, type, id }) {
  const b = btn('Follow', null, '', { 'aria-pressed': 'false', disabled: true });
  let on = false;
  const paint = () => { b.replaceChildren(icon(on ? 'check' : 'bell'), on ? 'Following' : 'Follow'); b.setAttribute('aria-pressed', String(on)); b.title = on ? 'You are told about comments and when it is done. Click to stop.' : 'Be told about comments and when it is done.'; };
  api.call('follow.get', { type, id }).then((r) => { if (r.ok) { on = r.data[0].following; b.disabled = false; paint(); } });
  b.addEventListener('click', async () => { b.disabled = true; const r = await api.call('follow.set', { type, id, on: !on }); b.disabled = false; if (r.ok) { on = r.data[0].following; paint(); toast(on ? 'You’ll be told about this task.' : 'You won’t be told about this task any more.'); } else toast('That didn’t work. Try again.', false); });
  paint();
  return b;
}
