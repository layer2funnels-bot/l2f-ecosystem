// Shared window furniture of the media editors (image, PDF): a compact top bar (back, file icon, name edited in place, save state, History, Download, Save) and a menu bar
// (File, Edit, View, ... every command lives in a menu; the toolbar keeps the frequent ones). Menus work with the keyboard: Alt or F10 moves to the menu bar, Left/Right
// switch menus, Down/Up move inside one, Enter runs, Esc closes. On a phone the menu bar becomes one "Menu" button with all menus listed in sections.
import { h, icon, toast } from '../ui.js';

/** menus: [{ label, items: [{ label, on, key?, disabled?, checked? } | 'sep'] }] -> { el, focus, destroy } */
export function menuBar(menus, { isLive = () => true } = {}) {
  let openIdx = -1, pop = null; const buttons = [];
  const bar = h('div', { class: 'edx-menubar', role: 'menubar', 'aria-label': 'Menus' });
  const closeAll = (refocus) => { pop?.remove(); pop = null; document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', esc, true); if (openIdx >= 0 && refocus) buttons[openIdx]?.focus(); buttons.forEach((b) => b.setAttribute('aria-expanded', 'false')); openIdx = -1; };
  const esc = (e) => { if (e.key === 'Escape' && pop) { e.preventDefault(); e.stopPropagation(); closeAll(true); } };   // Escape closes the menu wherever the focus is (the phone menu does not take focus)
  const outside = (e) => { if (pop && !pop.contains(e.target) && !bar.contains(e.target) && !phoneBtn.contains(e.target)) closeAll(false); };
  const itemEl = (it) => {
    if (it === 'sep') return h('hr', { role: 'separator' });
    if (it.heading) return h('div', { class: 'edx-mh', role: 'presentation' }, it.heading);
    const dis = typeof it.disabled === 'function' ? it.disabled() : it.disabled;
    return h('button', { type: 'button', role: it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem', class: 'edx-mi', disabled: dis || false, ...(it.checked !== undefined ? { 'aria-checked': String(Boolean(typeof it.checked === 'function' ? it.checked() : it.checked)) } : {}), onclick: () => { closeAll(true); it.on?.(); } },
      h('span', {}, it.label), it.key ? h('kbd', {}, it.key) : null);
  };
  const place = (anchor, list) => {
    pop?.remove(); pop = h('div', { class: 'edx-menu', role: 'menu' }, ...list.map(itemEl)); document.body.append(pop);
    const r = anchor.getBoundingClientRect(), pr = pop.getBoundingClientRect(); pop.style.left = `${Math.max(4, Math.min(r.left, innerWidth - pr.width - 4))}px`; pop.style.top = `${Math.min(r.bottom + 2, innerHeight - Math.min(pr.height, innerHeight - 8) - 4)}px`;
    pop.addEventListener('keydown', (e) => {
      const items = [...pop.querySelectorAll('button:not(:disabled)')]; const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeAll(true); } else if (e.key === 'ArrowLeft' && openIdx >= 0) { e.preventDefault(); openMenu((openIdx - 1 + menus.length) % menus.length, true); } else if (e.key === 'ArrowRight' && openIdx >= 0) { e.preventDefault(); openMenu((openIdx + 1) % menus.length, true); }
      else if (e.key === 'Tab') closeAll(false);
    });
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', esc, true); return pop;
  };
  function openMenu(i, focusFirst) { closeAll(false); openIdx = i; buttons.forEach((b, n) => b.setAttribute('aria-expanded', String(n === i))); const p = place(buttons[i], menus[i].items); if (focusFirst) p.querySelector('button:not(:disabled)')?.focus(); }
  menus.forEach((m, i) => {
    const b = h('button', { type: 'button', class: 'edx-mb', role: 'menuitem', 'aria-haspopup': 'menu', 'aria-expanded': 'false', tabindex: i === 0 ? '0' : '-1', onclick: () => (openIdx === i ? closeAll(true) : openMenu(i, false)) }, m.label);
    b.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMenu(i, true); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); const n = (i + 1) % menus.length; buttons[n].focus(); if (openIdx >= 0) openMenu(n, false); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); const n = (i - 1 + menus.length) % menus.length; buttons[n].focus(); if (openIdx >= 0) openMenu(n, false); }
      else if (e.key === 'Escape') closeAll(true);
    });
    b.addEventListener('mouseenter', () => { if (openIdx >= 0 && openIdx !== i) openMenu(i, false); });
    buttons.push(b); bar.append(b);
  });
  // phone: one Menu button with every menu as a section
  const phoneBtn = h('button', { type: 'button', class: 'edx-phone', 'aria-haspopup': 'menu', 'aria-label': 'Menu', onclick: () => { if (pop) { closeAll(false); return; } place(phoneBtn, menus.flatMap((m) => [{ heading: m.label }, ...m.items])); pop.classList.add('edx-menu-phone'); } }, icon('list'), h('span', {}, 'Menu'));
  const wrap = h('div', { class: 'edx-menuwrap' }, phoneBtn, bar);
  const key = (e) => {
    if (!isLive()) { document.removeEventListener('keydown', key); closeAll(false); return; }
    if ((e.key === 'F10' || (e.key === 'Alt' && !e.ctrlKey && !e.shiftKey && !e.metaKey)) && !document.querySelector('.ovl, .drawer')) { if (e.key === 'F10') e.preventDefault(); const vis = getComputedStyle(bar).display !== 'none'; (vis ? buttons[0] : phoneBtn).focus(); }
  };
  document.addEventListener('keydown', key);
  return { el: wrap, close: () => closeAll(false), destroy: () => { document.removeEventListener('keydown', key); closeAll(false); } };
}

/** The compact top bar. Returns { el, setTitle }. */
export function topBar({ backHref, backLabel = 'Back to Drive', glyph, name, readOnly, onRename, right }) {
  const title = h('input', { class: 'edx-title', value: name, 'aria-label': 'File name', maxlength: '200', spellcheck: 'false', ...(readOnly ? { readonly: true } : {}) });
  let current = name;
  const commit = async () => {
    const v = title.value.trim(); if (readOnly || v === current) { title.value = current; return; }
    if (!v || /[\/\\]/.test(v)) { toast('A name can’t be empty or contain a slash.', false); title.value = current; return; }
    const ok = await onRename(v); if (ok) current = v; else title.value = current;
  };
  title.addEventListener('change', commit); title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } else if (e.key === 'Escape') { title.value = current; title.blur(); } });
  const el = h('header', { class: 'edx-top' }, h('a', { class: 'edx-back', href: backHref, 'aria-label': backLabel, title: backLabel }, icon('arrow', 'edx-flip')), h('span', { class: 'edx-glyph', 'aria-hidden': 'true' }, icon(glyph)), title, h('span', { class: 'edx-sp' }), ...right);
  return { el, title, setTitle: (v) => { current = v; title.value = v; } };
}

/** Where "back" goes for a stored file: the folder it lives in, or the owning app. */
export function backFor(file) {
  if (file.project_id) return '#/projects';
  if (file.client_id) return `#/clients/c/${file.client_id}`;
  return `#/drive${file.space === 'personal' ? '/personal' : ''}${file.folder_id ? `/f/${file.folder_id}` : ''}`;
}
