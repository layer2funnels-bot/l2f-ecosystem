import { h } from '../dom.js';
import { messageFor } from '../messages.js';

// Screens with no approved design are built to the design tokens and marked, so nobody mistakes them for finished design.
export const needsDesign = (cfg = window.L2F_CONFIG) => cfg?.showNeedsDesign === false ? null
  : h('p', { class: 'needs-design', role: 'note' }, h('strong', {}, 'Needs design'), ' This screen works but has no approved design yet. Structure and wording are provisional.');

export const pageTitle = (text, sub) => h('div', { class: 'page-head' }, h('h1', { 'data-page-title': true }, text), sub ? h('p', { class: 'muted' }, sub) : null);

export const skeleton = (rows = 4) => h('div', { class: 'skeleton', role: 'status', 'aria-label': 'Loading' }, ...Array.from({ length: rows }, () => h('div', { class: 'skeleton-row' })));
export const emptyState = (title, body, action) => h('div', { class: 'state empty' }, h('h2', {}, title), body ? h('p', { class: 'muted' }, body) : null, action ?? null);
export const errorState = (code, retry) => h('div', { class: 'state error', role: 'alert' },
  h('h2', {}, code === 'offline' ? "You're offline" : 'That did not work'), h('p', {}, messageFor(code)), retry ? button('Try again', retry, 'secondary') : null);
// Denied is deliberately identical to not found: it never names the record or says it exists.
export const notFoundState = (back) => h('div', { class: 'state denied' }, h('h2', {}, 'Not found'), h('p', {}, messageFor('not_found')), back ?? null);
export const comingSoon = (name) => h('div', { class: 'state' }, h('h2', {}, `${name} is coming soon`), h('p', { class: 'muted' }, 'Nothing to set up yet.'));

export function button(label, onClick, kind = 'primary', attrs = {}) {
  return h('button', { type: 'button', class: `btn ${kind}`, onclick: onClick, ...attrs }, label);
}
export function field({ id, label, type = 'text', value = '', hint, error, required, autocomplete, rows, maxlength, options, readonly }) {
  const common = { id, name: id, 'aria-describedby': [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || false, 'aria-invalid': error ? 'true' : false, required: required || false, autocomplete: autocomplete || false, maxlength: maxlength || false, readonly: readonly || false };
  let control;
  if (options) control = h('select', common, ...options.map(([v, t]) => h('option', { value: v, selected: v === value }, t)));
  else if (rows) { control = h('textarea', { ...common, rows }); control.value = value ?? ''; }
  else { control = h('input', { ...common, type }); control.value = value ?? ''; }
  return h('div', { class: `field${error ? ' has-error' : ''}` }, h('label', { for: id }, label, required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null),
    hint ? h('p', { class: 'hint', id: `${id}-hint` }, hint) : null, control, error ? h('p', { class: 'field-error', id: `${id}-err` }, error) : null);
}
export const chip = (text, kind = 'neutral') => h('span', { class: `chip ${kind}` }, text);
