// Slides editor (V8 05_DRIVE "Slides", prototype drive6.js): thumbnails (numbers, drag or arrows to reorder), a 16:9 canvas with the slide's title and
// body edited in place, text boxes, pictures (document attachments, stored once) and shapes that move and resize, speaker notes, themes and layouts,
// Present (full screen, arrows, Esc). Autosave and history through the shared session (session.js), on the V8 editor frame (edframe.js).
import { h, icon, toast, dialog, skeleton, noAccessState, errorState } from '../ui.js';
import { createSession } from './session.js';
import { edFrame } from './edframe.js';
import { parseDeck, serializeDeck, emptySlide, duplicateSlide, moveSlide, THEMES, LAYOUTS, MAX_SLIDES, MAX_BOXES, newId } from './slidemodel.js';
import { attach, url as assetUrl } from './docassets.js';
import { shareFile } from './sharedialog.js';

export function slidesView({ api, id, ctx }) {
  const root = h('section', { class: 'v8p-ed' }, h('div', { style: 'padding:40px' }, skeleton(3)));
  const appsEl = h('span', { class: 'r-wrap' }); root.__editor = true; root.__appsSlot = appsEl;
  (async () => {
    const [f, v] = await Promise.all([api.call('drive.files.get', { id }), api.call('drive.files.version', { file: id })]);
    if (!root.isConnected) return;
    if (!f.ok || !v.ok || !f.data[0]) { root.replaceChildren(f.status === 404 ? noAccessState({ title: 'This file isn’t available', action: h('a', { class: 'btn', href: '#/drive/home' }, 'Back to Drive') }) : errorState(() => location.reload())); return; }
    mount(f.data[0], v.data[0]);
  })();
  return root;

  function mount(file, ver) {
    let deck = parseDeck(ver.body ?? ''); let at = 0; let sel = null; const readOnly = Boolean(file.archived_at);
    const hist = { stack: [serializeDeck(deck)], i: 0 }; let frame = null;
    const getBody = () => serializeDeck(deck);
    const sess = createSession({ api, id, ctx, version: ver.version, savedBody: null, savedAt: ver.created_at, readOnly, getBody, label: () => file.name,
      setBody: (b) => { deck = parseDeck(b); at = Math.min(at, deck.slides.length - 1); paint(); }, onStatus: ({ status, savedAt }) => frame?.setSave(status === 'saved' ? `Saved ${new Date(savedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : { dirty: 'Unsaved changes', saving: 'Saving…', retrying: 'Saving soon…', failed: 'Couldn’t save', readonly: 'Read only' }[status] ?? '', status) });
    sess.rebase();
    const changed = (snapshot = true) => { if (snapshot) { const b = serializeDeck(deck); if (b !== hist.stack[hist.i]) { hist.stack.length = hist.i + 1; hist.stack.push(b); if (hist.stack.length > 200) hist.stack.shift(); hist.i = hist.stack.length - 1; } } sess.markChanged(); };
    const undo = () => { if (hist.i <= 0) return; hist.i -= 1; deck = parseDeck(hist.stack[hist.i]); at = Math.min(at, deck.slides.length - 1); sel = null; paint(); sess.markChanged(); };
    const redo = () => { if (hist.i >= hist.stack.length - 1) return; hist.i += 1; deck = parseDeck(hist.stack[hist.i]); at = Math.min(at, deck.slides.length - 1); sel = null; paint(); sess.markChanged(); };
    const cur = () => deck.slides[at];

    // ---------------------------------------------------------------- slide rendering (prototype .sl: title, body, chip; boxes positioned in %)
    const slideEl = (s, editable) => {
      const el = h('div', { class: `sl${deck.theme === 'light' ? ' light' : ''}`, 'data-theme': deck.theme, 'data-layout': s.layout });
      if (deck.theme === 'dark') el.style.background = '#0b1220';
      if (s.layout !== 'blank') {
        el.append(h('span', { class: 'pill brand chip' }, ctx.orgName));
        const t = h('h2', { ...(editable && !readOnly ? { contenteditable: 'plaintext-only', 'aria-label': 'Slide title', 'data-ph': 'Title' } : {}) }, s.title);
        const b = s.layout === 'title' || s.layout === 'title-body' ? h('p', { ...(editable && !readOnly ? { contenteditable: 'plaintext-only', 'aria-label': 'Slide text', 'data-ph': 'Text' } : {}), style: 'white-space:pre-wrap' }, s.body) : null;
        if (editable) { t.addEventListener('input', () => { s.title = t.textContent.slice(0, 300); thumbs(); changed(false); }); t.addEventListener('blur', () => changed()); b?.addEventListener('input', () => { s.body = b.textContent.slice(0, 4000); thumbs(); changed(false); }); b?.addEventListener('blur', () => changed()); }
        el.append(t); if (b) el.append(b);
      }
      for (const box of s.boxes) el.append(boxEl(box, editable));
      return el;
    };
    function boxEl(box, editable) {
      const el = h('div', { class: `sbox k-${box.k}${sel === box.id && editable ? ' on' : ''}`, style: `position:absolute;left:${box.x}%;top:${box.y}%;width:${box.w}%;height:${box.h}%;${box.k === 'shape' ? `background:${box.fill};border-radius:1.2cqw;` : ''}`, 'data-box': box.id });
      if (box.k === 'text') { const t = h('div', { class: 'sbox-t', style: 'width:100%;height:100%;font-size:2.4cqw;white-space:pre-wrap;overflow:hidden', ...(editable && !readOnly ? { contenteditable: 'plaintext-only', 'aria-label': 'Text box' } : {}) }, box.text ?? '');
        if (editable) { t.addEventListener('input', () => { box.text = t.textContent.slice(0, 4000); changed(false); }); t.addEventListener('blur', () => changed()); } el.append(t); }
      if (box.k === 'img') { const img = h('img', { alt: '', style: 'width:100%;height:100%;object-fit:contain', draggable: 'false' }); assetUrl(api, id, box.a).then((u) => { if (u) img.src = u; }); el.append(img); }
      if (editable && !readOnly) {
        el.addEventListener('pointerdown', (e) => { if (e.target.isContentEditable && sel === box.id) return; sel = box.id; root.querySelectorAll('.sbox.on').forEach((x) => x.classList.remove('on')); el.classList.add('on'); dragBox(e, box, el, e.target.classList.contains('sbox-rs') ? 'resize' : 'move'); });
        el.append(h('span', { class: 'sbox-rs', 'aria-hidden': 'true' }));
      }
      return el;
    }
    function dragBox(e, box, el, mode) {
      const stage = el.parentElement.getBoundingClientRect(); const sx = e.clientX, sy = e.clientY; const o = { ...box }; let moved = false;
      const mv = (ev) => { const dx = ((ev.clientX - sx) / stage.width) * 100, dy = ((ev.clientY - sy) / stage.height) * 100; if (Math.abs(dx) + Math.abs(dy) > 0.3) moved = true; if (!moved) return;
        if (mode === 'move') { box.x = Math.max(0, Math.min(100 - box.w, o.x + dx)); box.y = Math.max(0, Math.min(100 - box.h, o.y + dy)); } else { box.w = Math.max(3, Math.min(100 - box.x, o.w + dx)); box.h = Math.max(3, Math.min(100 - box.y, o.h + dy)); }
        Object.assign(el.style, { left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }); };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (moved) { for (const k of ['x', 'y', 'w', 'h']) box[k] = Math.round(box[k] * 10) / 10; thumbs(); changed(); } };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    }

    // ---------------------------------------------------------------- actions (each runs once per click: the frame's buttons are disabled while busy)
    const addSlide = (layout = 'title-body') => { if (readOnly || deck.slides.length >= MAX_SLIDES) return; deck.slides.splice(at + 1, 0, emptySlide(layout)); at += 1; sel = null; paint(); changed(); };
    const dupSlide = () => { if (readOnly) return; const i = duplicateSlide(deck, at); if (i >= 0) { at = i; paint(); changed(); } };
    const delSlide = () => { if (readOnly) return; if (deck.slides.length === 1) { toast('A deck keeps at least one slide.', false); return; } deck.slides.splice(at, 1); at = Math.min(at, deck.slides.length - 1); paint(); changed(); };
    const move = (d) => { if (!readOnly && moveSlide(deck, at, at + d)) { at += d; paint(); changed(); } };
    const addBox = (k, extra = {}) => { if (readOnly) return; const s = cur(); if (s.boxes.length >= MAX_BOXES) { toast('A slide holds up to 40 items.', false); return; } const b = { id: newId(), k, x: 30, y: 35, w: 40, h: 22, ...(k === 'text' ? { text: 'Text' } : k === 'shape' ? { fill: '#ffc633' } : {}), ...extra }; s.boxes.push(b); sel = b.id; paint(); changed(); };
    const delBox = () => { if (readOnly || !sel) return; const s = cur(); s.boxes = s.boxes.filter((b) => b.id !== sel); sel = null; paint(); changed(); };
    const order = (d) => { const s = cur(); const i = s.boxes.findIndex((b) => b.id === sel); const j = i + d; if (i < 0 || j < 0 || j >= s.boxes.length) return; [s.boxes[i], s.boxes[j]] = [s.boxes[j], s.boxes[i]]; paint(); changed(); };
    let adding = false;
    const picture = () => { if (readOnly || adding) return; const inp = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', hidden: true }); document.body.append(inp);
      inp.addEventListener('change', async () => { const fl = inp.files?.[0]; inp.remove(); if (!fl) return; adding = true; toast('Adding the picture…');
        try { const r = await attach(api, id, fl); if (r) { const ar = r.width && r.height ? r.height / r.width : 0.6; const w = 40, hh = Math.min(80, w * ar * (16 / 9)); addBox('img', { a: r.asset, w, h: hh, y: Math.max(0, 50 - hh / 2) }); } } catch (e) { toast(e.message, false); } finally { adding = false; } }); inp.click(); };
    function present() {
      let i = at; const box = h('div', { class: 'v8p-ed slides-present', role: 'dialog', 'aria-label': 'Presenting', tabindex: '-1', style: 'position:fixed;inset:0;z-index:9999;background:#000;display:grid;place-items:center' });
      const stageP = h('div', { class: 'stage16', style: 'width:min(100vw,177.78vh);max-width:none;border-radius:0;border:0' }); box.append(stageP);
      const show = () => { stageP.replaceChildren(slideEl(deck.slides[i], false)); };
      const key = (e) => { if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'].includes(e.key)) { e.preventDefault(); if (i < deck.slides.length - 1) { i += 1; show(); } } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); if (i > 0) { i -= 1; show(); } } else if (e.key === 'Escape') { e.preventDefault(); end(); } };
      const end = () => { document.removeEventListener('keydown', key, true); document.exitFullscreen?.().catch(() => {}); box.remove(); };
      box.addEventListener('click', () => { if (i < deck.slides.length - 1) { i += 1; show(); } else end(); });
      document.addEventListener('keydown', key, true); document.body.append(box); show(); box.focus(); box.requestFullscreen?.().catch(() => {});
      document.addEventListener('fullscreenchange', function off() { if (!document.fullscreenElement) { document.removeEventListener('fullscreenchange', off); if (box.isConnected) end(); } });
    }

    // ---------------------------------------------------------------- frame: menus, toolbar, panels
    const tb = (ic, label, on, extra = {}) => h('button', { type: 'button', class: 'tbtn', title: label, 'aria-label': label, onclick: on, ...(readOnly && !extra.always ? { disabled: true } : {}) }, icon(ic));
    const themeSel = h('select', { class: 'sel xs', 'aria-label': 'Theme', ...(readOnly ? { disabled: true } : {}), onchange: (e) => { deck.theme = e.target.value; paint(); changed(); } }, ...THEMES.map(([k, l]) => h('option', { value: k }, l)));
    const layoutSel = h('select', { class: 'sel xs', 'aria-label': 'Layout', ...(readOnly ? { disabled: true } : {}), onchange: (e) => { cur().layout = e.target.value; paint(); changed(); } }, ...LAYOUTS.map(([k, l]) => h('option', { value: k }, l)));
    const menus = [
      { label: 'File', items: [{ label: 'Version history', on: () => sess.openHistory(!readOnly) }, { label: 'Present', on: present }] },
      { label: 'Edit', items: [{ label: 'Undo', key: 'Ctrl Z', on: undo }, { label: 'Redo', key: 'Ctrl Y', on: redo }, 'sep', { label: 'Delete selected item', key: 'Delete', on: delBox }] },
      { label: 'View', items: [{ label: 'Present', key: 'F5', on: present }] },
      { label: 'Insert', items: [{ label: 'Text box', on: () => addBox('text') }, { label: 'Picture…', on: picture }, { label: 'Shape', on: () => addBox('shape') }, 'sep', { label: 'New slide', key: 'Ctrl M', on: () => addSlide() }] },
      { label: 'Slide', items: [{ label: 'New slide', on: () => addSlide() }, { label: 'Duplicate slide', on: dupSlide }, { label: 'Delete slide', on: delSlide }, 'sep', { label: 'Move up', on: () => move(-1) }, { label: 'Move down', on: () => move(1) }] },
      { label: 'Arrange', items: [{ label: 'Bring forward', on: () => order(1) }, { label: 'Send backward', on: () => order(-1) }] },
    ];
    const nav = h('nav', { class: 'snav6', 'aria-label': 'Slides' });
    const stage = h('div', { class: 'stage16' }); const notes = h('div', { class: 'notes', ...(readOnly ? {} : { contenteditable: 'plaintext-only' }), 'aria-label': 'Speaker notes', 'data-ph': 'Speaker notes' });
    notes.addEventListener('input', () => { cur().notes = notes.textContent.slice(0, 4000); changed(false); }); notes.addEventListener('blur', () => changed());
    const count = h('span');
    frame = edFrame({ api, ctx, file, type: 'slides', readOnly, menus,
      tools: [tb('undo', 'Undo', undo), tb('redo', 'Redo', redo), h('span', { class: 'vs' }), tb('text', 'Text box', () => addBox('text')), tb('imgI', 'Picture', picture), tb('shape', 'Shape', () => addBox('shape')),
        h('span', { class: 'vs' }), themeSel, layoutSel, h('span', { class: 'grow' }), h('button', { type: 'button', class: 'btn ink sm', onclick: present }, icon('play'), 'Present')],
      body: [nav, h('div', { class: 'scanvas' }, stage, notes)], status: [count, h('span', { class: 'grow' })],
      onRename: async (n) => { const r = await api.call('drive.files.update', { id, name: n }); if (!r.ok) { toast(r.error?.message ?? 'Couldn’t rename.', false); return false; } file.name = n; document.title = `${n} · Slides`; return true; },
      onHistory: () => sess.openHistory(!readOnly), onShare: () => shareFile(api, file), appsEl });
    root.replaceChildren(...frame.root.childNodes); frame.setSave(readOnly ? 'Read only' : `Saved ${new Date(ver.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`, readOnly ? 'readonly' : 'saved');
    document.title = `${file.name} · Slides`;
    function thumbs() {
      nav.replaceChildren(...deck.slides.map((s, i) => h('button', { type: 'button', 'aria-current': String(i === at), 'aria-label': `Slide ${i + 1}${s.title ? `: ${s.title}` : ''}`, draggable: readOnly ? 'false' : 'true', 'data-i': String(i), onclick: () => { at = i; sel = null; paint(); } },
        h('span', {}, String(i + 1)), h('span', { class: 'th', style: 'container-type:inline-size' }, slideEl(s, false)))),
        readOnly ? '' : h('button', { type: 'button', class: 'chip sm', onclick: () => addSlide() }, icon('plus'), 'Slide'));
    }
    nav.addEventListener('dragstart', (e) => { const b = e.target.closest('[data-i]'); if (b) e.dataTransfer.setData('text/x-slide', b.dataset.i); });
    nav.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-slide')) e.preventDefault(); });
    nav.addEventListener('drop', (e) => { const b = e.target.closest('[data-i]'); const from = Number(e.dataTransfer.getData('text/x-slide')); if (!b || Number.isNaN(from)) return; e.preventDefault(); const to = Number(b.dataset.i); if (moveSlide(deck, from, to)) { at = to; paint(); changed(); } });
    function paint() {
      thumbs(); stage.replaceChildren(slideEl(cur(), true)); notes.textContent = cur().notes; themeSel.value = deck.theme; layoutSel.value = cur().layout;
      count.textContent = `Slide ${at + 1} of ${deck.slides.length}`;
    }
    root.addEventListener('keydown', (e) => {
      const typing = e.target.isContentEditable || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') { e.preventDefault(); addSlide(); }
      else if (e.key === 'F5') { e.preventDefault(); present(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && sel) { e.preventDefault(); delBox(); }
      else if (!typing && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target.closest?.('.snav6')) { e.preventDefault(); if (e.altKey) move(e.key === 'ArrowDown' ? 1 : -1); else { at = Math.max(0, Math.min(deck.slides.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1))); paint(); nav.querySelector('[aria-current="true"]')?.focus(); } }
    });
    root.addEventListener('pointerdown', (e) => { if (!e.target.closest('.sbox') && sel) { sel = null; root.querySelectorAll('.sbox.on').forEach((x) => x.classList.remove('on')); } });
    window.addEventListener('hashchange', function off() { if (root.isConnected) return; window.removeEventListener('hashchange', off); sess.save({ manual: false }); sess.destroy(); frame.destroy(); });
    paint();
  }
}
