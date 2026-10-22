// Whiteboard scene model: what is stored in a board's Drive document (JSON, the 200,000 character document limit applies) and what is
// allowed back in when one is opened. Plain logic, tested without a browser. Rules: only drawing elements survive (no images, embeds or
// iframes: those load outside content, and images need Drive references that come later), links must be web or mail links, deleted elements
// are not stored, the number of elements is capped, and anything unreadable opens as an empty board instead of an error.
import { safeHref } from './docmodel.js';

export const BOARD_MIME = 'application/vnd.excalidraw+json';
export const MAX_ELEMENTS = 5000, MAX_CHARS = 200000;
const TYPES = new Set(['rectangle', 'diamond', 'ellipse', 'arrow', 'line', 'freedraw', 'text', 'frame', 'magicframe']);
const COLOR = /^(#[0-9a-fA-F]{3,8}|transparent)$/;

/** Scene text -> { elements, background }. Never throws. */
export function parseBoard(text) {
  let j = null; try { j = JSON.parse(String(text ?? '')); } catch { /* empty or not JSON */ }
  const elements = [];
  for (const e of Array.isArray(j?.elements) ? j.elements : []) {
    if (elements.length >= MAX_ELEMENTS) break;
    if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !TYPES.has(e.type) || e.isDeleted) continue;
    const c = { ...e };
    if (c.link != null) { const l = safeHref(c.link); if (l) c.link = l; else c.link = null; }
    delete c.fileId; delete c.status;
    elements.push(c);
  }
  const bg = j?.appState?.viewBackgroundColor;
  return { elements, background: typeof bg === 'string' && COLOR.test(bg) ? bg : '#ffffff' };
}
/** Live scene -> stored text (deleted elements and view-only state are left out). */
export function serializeBoard(elements, background = '#ffffff') {
  const keep = (Array.isArray(elements) ? elements : []).filter((e) => e && !e.isDeleted && TYPES.has(e.type)).slice(0, MAX_ELEMENTS);
  return JSON.stringify({ type: 'excalidraw', version: 2, source: 'l2f', elements: keep, appState: { viewBackgroundColor: COLOR.test(String(background)) ? background : '#ffffff' } });
}
/** Cheap change signature: ids with their version numbers (Excalidraw bumps `version` on every edit). */
export const signature = (elements) => (Array.isArray(elements) ? elements.map((e) => `${e.id}:${e.version}${e.isDeleted ? 'x' : ''}`).join('|') : '');
export const countLive = (elements) => (Array.isArray(elements) ? elements.filter((e) => e && !e.isDeleted).length : 0);
export const emptyBoard = () => serializeBoard([], '#ffffff');
