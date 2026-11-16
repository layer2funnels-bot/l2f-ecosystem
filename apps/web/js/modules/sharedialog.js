// Share from inside an editor (owner requirement, V8 top bar "Share"): who has the file, add a teammate as Can view / Can edit, change or remove.
// Only Library files are shared this way (Personal stays private; client files are shared with their client in Clients). The database decides who may.
import { h, dialog, toast } from '../ui.js';

export async function shareFile(api, file) {
  if (file.space === 'personal') return dialog({ title: 'Share', key: 'share-file', body: h('p', {}, 'This file is in your Personal space, which only you can open. Move or copy it to the Library to share it with your team.'), actions: [{ label: 'Close' }] });
  if (file.space === 'client') return dialog({ title: 'Share', key: 'share-file', body: h('p', {}, 'Client files are shared with the client from the client’s page in Clients.'), actions: [{ label: 'Close' }] });
  const list = h('ul', { class: 'drv-share-list', style: 'list-style:none;padding:0;margin:8px 0' }); const who = h('select', { class: 'sel', 'aria-label': 'Person' }); const role = h('select', { class: 'sel', 'aria-label': 'Access' }, h('option', { value: 'viewer' }, 'Can view'), h('option', { value: 'editor' }, 'Can edit'));
  let busy = false;
  const paint = async () => {
    const [sh, pp] = await Promise.all([api.call('drive.shares.list', { file: file.id }), api.call('drive.people', {})]);
    const direct = sh.ok ? sh.data.filter((x) => !x.via_link) : [];
    list.replaceChildren(...(direct.length ? direct.map((x) => h('li', { style: 'display:flex;gap:8px;align-items:center;padding:6px 0' }, h('span', { style: 'flex:1' }, x.display_name),
      h('select', { class: 'sel', 'aria-label': `Access for ${x.display_name}`, onchange: (e) => set(x.user_id, e.target.value) }, ...[['viewer', 'Can view'], ['editor', 'Can edit']].map(([k, l]) => h('option', { value: k, ...(x.role === k ? { selected: true } : {}) }, l))),
      h('button', { type: 'button', class: 'btn quiet sm', onclick: () => remove(x.id) }, 'Remove'))) : [h('li', { class: 'fine muted' }, `Everyone in the organization with Drive can already open Library files. Add people here to give them more (Can edit) or to share inside a protected folder.`)]));
    const have = new Set(direct.map((x) => x.user_id));
    who.replaceChildren(h('option', { value: '' }, 'Choose a teammate…'), ...(pp.ok ? pp.data : []).filter((p) => !p.is_you && !have.has(p.user_id)).map((p) => h('option', { value: p.user_id }, p.display_name)));
  };
  const set = async (user, r) => { if (busy) return; busy = true; try { const x = await api.call('drive.shares.set', { file: file.id, user, role: r }); if (!x.ok) toast(x.status === 404 ? 'You can’t share this file.' : 'Couldn’t share. Try again.', false); else toast('Sharing saved.'); await paint(); } finally { busy = false; } };
  const remove = async (sid) => { if (busy) return; busy = true; try { const x = await api.call('drive.shares.remove', { id: sid }); if (!x.ok) toast('Couldn’t remove that.', false); await paint(); } finally { busy = false; } };
  dialog({ title: `Share “${file.name}”`, key: 'share-file', body: [h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, who, role), list],
    actions: [{ label: 'Add', cls: 'primary', on: async () => { if (!who.value) { toast('Choose a teammate first.', false); return false; } await set(who.value, role.value); return false; } }, { label: 'Done' }] });
  paint();
}
