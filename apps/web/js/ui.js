// Shared interface parts from the approved designs: dialog, toast, segmented control, notices, fields, and the shared states (design 07).
// Text is only ever set through text nodes (dom.js), never innerHTML.
import { h, clear, put } from './dom.js';
import { icon } from './icons.js';

// ---- toast (one at a time, announced politely)
let toastEl; let toastTimer;
export function toast(text, ok = true) {
  toastEl ??= document.body.appendChild(h('div', { class: 'toast', role: 'status', 'data-show': 'false' }));
  clear(toastEl).append(icon(ok ? 'check' : 'info'), h('span', {}, text));
  toastEl.dataset.show = 'true';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.dataset.show = 'false'; }, 3600);
}

// ---- dialog: focus is trapped, Esc closes (unless `modal: 'strict'`), focus returns to what opened it
const focusables = (root) => [...root.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')].filter((e) => !e.disabled && e.offsetParent !== null);
export function dialog({ title, body, actions = [], wide = false, role = 'dialog', onClose, describedBy }) {
  const prev = document.activeElement;
  const titleId = `dlt-${Math.random().toString(36).slice(2, 8)}`;
  const bar = h('div', { class: 'acts' });
  const panel = h('div', { class: `dlg${wide ? ' wide' : ''}`, role, 'aria-modal': 'true', 'aria-labelledby': titleId, ...(describedBy ? { 'aria-describedby': describedBy } : {}) },
    h('h2', { id: titleId }, title), h('div', { class: 'bd' }, body ?? null), bar);
  const overlay = h('div', { class: 'ovl' }, panel);
  let closed = false;
  const close = () => {
    if (closed) return; closed = true; overlay.remove(); onClose?.();
    if (prev && prev.isConnected && prev.focus) prev.focus();
  };
  const buttons = actions.map((a) => {
    const b = h('button', { type: 'button', class: `btn ${a.cls ?? ''}`.trim() }, a.label);
    b.addEventListener('click', async () => {
      if (a.on) {
        const label = b.textContent; b.disabled = true;
        const keep = await a.on(close, b);
        b.disabled = false; b.textContent = label;
        if (keep === false) return;
      }
      if (!a.keep) close();
    });
    bar.append(b); return b;
  });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = focusables(overlay); if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  });
  document.body.append(overlay);
  const first = overlay.querySelector('[autofocus]') ?? (actions.findIndex((a) => a.focus) >= 0 ? buttons[actions.findIndex((a) => a.focus)] : null) ?? focusables(overlay)[0];
  first?.focus();
  return close;
}

// ---- small parts
export const pill = (text, kind = '', ic) => h('span', { class: `pill ${kind}`.trim() }, ic ? icon(ic) : null, text);
export const btn = (label, onClick, cls = '', attrs = {}) => h('button', { type: 'button', class: `btn ${cls}`.trim(), onclick: onClick, ...attrs }, label);
export const link = (label, onClick) => h('button', { type: 'button', class: 'btn link', onclick: onClick }, label);
export function notice(kind, ic, content, actions = []) {   // kind: info | warn | err
  return h('div', { class: `notice ${kind}`, role: kind === 'err' || kind === 'warn' ? 'alert' : 'status' }, icon(ic), h('p', {}, content), actions.length ? h('div', { class: 'act' }, ...actions) : null);
}
export function seg(options, current, onChange, label) {
  const wrap = h('div', { class: 'seg', role: 'group', 'aria-label': label ?? false });
  for (const [k, text] of options) {
    wrap.append(h('button', { type: 'button', 'data-k': k, 'aria-pressed': String(k === current), onclick: () => {
      wrap.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === k))); onChange(k);
    } }, text));
  }
  return wrap;
}
export const tabs = (options, current, onChange, label) => {     // real role=tab strip
  const wrap = h('div', { class: 'tabs', role: 'tablist', 'aria-label': label });
  for (const [k, text] of options) {
    wrap.append(h('button', { type: 'button', role: 'tab', id: `tab-${k}`, 'data-k': k, 'aria-selected': String(k === current), tabindex: k === current ? 0 : -1, onclick: () => onChange(k) }, text));
  }
  wrap.addEventListener('keydown', (e) => {
    const t = [...wrap.querySelectorAll('[role=tab]')]; const i = t.indexOf(document.activeElement);
    if (i < 0 || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? t.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + t.length) % t.length;
    t[n].focus(); t[n].click();
  });
  return wrap;
};

// ---- form fields: label, optional hint, control, and an error slot that is announced when filled
export function field({ id, label, type = 'text', value = '', hint, autocomplete, options, rows, readonly, required, maxlength, inputmode }) {
  const describedBy = [hint ? `${id}-h` : '', `${id}-e`].filter(Boolean).join(' ');
  const common = { id, name: id, 'aria-describedby': describedBy, autocomplete: autocomplete ?? false, readonly: readonly || false, required: required || false, maxlength: maxlength ?? false, inputmode: inputmode ?? false };
  let control;
  if (options) { control = h('select', { ...common, readonly: false, disabled: readonly || false }, ...options.map(([v, t]) => h('option', { value: v }, t))); control.value = value ?? ''; }
  else if (rows) { control = h('textarea', { ...common, rows }); control.value = value ?? ''; }
  else { control = h('input', { ...common, type }); control.value = value ?? ''; }
  const err = h('span', { class: 'err', id: `${id}-e`, role: 'alert', hidden: true });
  const el = h('div', { class: 'fld' }, h('label', { for: id }, label), control, hint ? h('span', { class: 'hint', id: `${id}-h` }, hint) : null, err);
  return {
    el, input: control,
    error(text) { control.setAttribute('aria-invalid', 'true'); err.hidden = false; clear(err).append(icon('cross'), text); control.focus(); return false; },
    ok() { control.removeAttribute('aria-invalid'); err.hidden = true; clear(err); return true; },
  };
}
export function passwordField({ id, label, autocomplete, hint }) {
  const f = field({ id, label, type: 'password', autocomplete, hint });
  const eye = h('button', { type: 'button', 'aria-label': 'Show password', 'aria-pressed': 'false' }, icon('eye'));
  eye.addEventListener('click', () => {
    const show = f.input.type === 'password'; f.input.type = show ? 'text' : 'password';
    eye.setAttribute('aria-pressed', String(show)); eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    clear(eye).append(icon(show ? 'eyeoff' : 'eye'));
  });
  const wrap = h('div', { class: 'pw' }); f.input.replaceWith(wrap); wrap.append(f.input, eye);
  return f;
}

// ---- shared states (design 07)
export const skeleton = (rows = 4) => h('div', { class: 'skel', 'aria-busy': 'true', role: 'status', 'aria-label': 'Loading' },
  h('div', { class: 'bar', style: 'width:35%;height:24px' }), ...Array.from({ length: rows }, (_, i) => h('div', { class: 'bar', style: `width:${90 - i * 12}%` })));
export const plate = () => {
  const NS = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 90'); svg.setAttribute('width', '120'); svg.setAttribute('height', '90'); svg.setAttribute('aria-hidden', 'true');
  const g = document.createElementNS(NS, 'g'); g.setAttribute('stroke', '#1b1f27'); g.setAttribute('stroke-opacity', '.12');
  [['M60 52 100 70 60 88 20 70z', '#c9cfd8'], ['M60 38 100 56 60 74 20 56z', 'var(--tint,#e3eafa)'], ['M60 24 100 42 60 60 20 42z', 'var(--accent,#ff7a59)'], ['M60 10 100 28 60 46 20 28z', 'var(--primary,#173a8f)']].forEach(([d, f]) => {
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('fill', f); g.append(p);
  });
  svg.append(g); return svg;
};
export const emptyState = ({ title, body, action, ic, first = false }) => h('div', { class: 'empty', role: 'status' },
  first ? plate() : h('div', { class: 'big' }, icon(ic ?? 'search')), h('h3', {}, title), body ? h('p', {}, body) : null, action ?? null);
export function errorState(retry, { title = 'We couldn’t load this', body = 'Your work is safe. Check your connection and try again.' } = {}) {
  return h('div', { class: 'empty', role: 'alert' }, h('div', { class: 'big', style: 'background:var(--danger-tint);color:var(--danger)' }, icon('cross')), h('h3', {}, title), h('p', {}, body), retry ? btn('Try again', retry, 'pri') : null);
}
export const offlineNotice = () => notice('warn', 'warn', [h('b', {}, 'You’re offline.'), ' You can keep reading. Changes can’t be saved until you’re back.']);
// "Not found" and "no access" are the same screen on purpose (design 07).
export const notFoundState = (homeHref, homeLabel = 'Go to Office Home') => h('div', { class: 'empty', role: 'status' },
  h('div', { class: 'big' }, icon('search')), h('h3', {}, 'We couldn’t find that'), h('p', {}, 'It may have moved, or you may not have access.'),
  h('a', { class: 'btn pri', href: homeHref }, homeLabel));
export const readOnlyNotice = (why, what = 'You can look but not change.') => notice('info', 'eye', [h('b', {}, 'Read only.'), ` ${why}. ${what}`]);

// Development builds only: shows the design status of a screen that has none yet (docs/DESIGN_STATUS.md). Production never renders it.
export const designBadge = (status = 'Needs design') => (window.L2F_CONFIG?.showDesignStatus ? h('span', { class: 'devbadge', role: 'note' }, status) : null);

export const initials = (text) => String(text ?? '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase() || '?';
export const orgMark = (o) => ({ l2f: 'L2', layer2funnels: 'L2', aurj: 'Au' }[o?.slug] ?? initials(o?.name).slice(0, 2));
export const orgColor = (o) => ({ aurj: '#b23a08' }[o?.slug] ?? '#173a8f');
export const roleLabel = (r) => ({ owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer' }[r] ?? 'Member');
export { h, clear, put, icon };
