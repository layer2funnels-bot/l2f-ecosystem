// Tiny DOM builder. Text is ALWAYS set with textContent / text nodes, never innerHTML, so data from the server cannot inject markup.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = String(v);        // CSSOM, not the style attribute: the Content-Security-Policy forbids inline style attributes
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
// replaceChildren(null) would print "null": this drops empty slots.
export const put = (el, ...nodes) => { el.replaceChildren(...nodes.flat().filter((x) => x != null && x !== false)); return el; };
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
let live;
// Screen-reader announcements (organization switches, saves, errors).
export function announce(text) {
  live ??= document.body.appendChild(h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' }));
  live.textContent = ''; setTimeout(() => { live.textContent = text; }, 30);
}
export function focusTitle(root) { const t = root.querySelector('[data-page-title]'); if (t) { t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); } }

/** True when a click began inside one of `targets` (elements or CSS selectors). Uses the path recorded when the click happened, so a
 *  panel that re-renders the button that was clicked (a filter, a tab) still counts the click as inside: e.target is detached by then,
 *  and `panel.contains(e.target)` would wrongly say "outside" and close it. */
export const clickedInside = (e, ...targets) => (e.composedPath?.() ?? [e.target]).some((n) => targets.some((t) => (typeof t === 'string' ? n?.matches?.(t) : n === t)));
