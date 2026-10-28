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

// ---- starter templates (Design v4 Whiteboard > Templates): a few labelled boxes, arrows and notes to start from. Plain drawing elements only, so they pass parseBoard.
const base = { angle: 0, strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid', roughness: 0, opacity: 100, groupIds: [], frameId: null, roundness: null, seed: 1, version: 1, versionNonce: 1, isDeleted: false, boundElements: null, updated: 1, link: null, locked: false };
let seq = 0;
const eid = () => `t${(seq += 1)}`;
const box = (x, y, w, h, label, fill = '#fff3bf') => [
  { ...base, id: eid(), type: 'rectangle', x, y, width: w, height: h, backgroundColor: fill, roundness: { type: 3 } },
  { ...base, id: eid(), type: 'text', x: x + 12, y: y + h / 2 - 12, width: w - 24, height: 24, text: label, originalText: label, fontSize: 18, fontFamily: 2, textAlign: 'center', verticalAlign: 'middle', containerId: null, lineHeight: 1.25, autoResize: true }];
const arrow = (x, y, dx, dy = 0) => ({ ...base, id: eid(), type: 'arrow', x, y, width: Math.abs(dx), height: Math.abs(dy), points: [[0, 0], [dx, dy]], startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: 'arrow' });
const heading = (x, y, text) => ({ ...base, id: eid(), type: 'text', x, y, width: 420, height: 32, text, originalText: text, fontSize: 28, fontFamily: 2, textAlign: 'left', verticalAlign: 'top', containerId: null, lineHeight: 1.25, autoResize: true });
export const BOARD_TEMPLATES = [
  { key: 'blank', name: 'Blank', desc: 'An empty canvas.', scene: () => emptyBoard() },
  { key: 'funnel', name: 'Funnel flow', desc: 'Traffic, page, offer, thank you: a left-to-right flow to rearrange.', scene: () => { seq = 0; return serializeBoard([heading(0, -60, 'Funnel flow'), ...box(0, 0, 180, 90, 'Traffic', '#a5d8ff'), arrow(190, 45, 70), ...box(270, 0, 180, 90, 'Landing page', '#d0bfff'), arrow(460, 45, 70), ...box(540, 0, 180, 90, 'Offer', '#ffd8a8'), arrow(730, 45, 70), ...box(810, 0, 180, 90, 'Thank you', '#b2f2bb')]); } },
  { key: 'brainstorm', name: 'Brainstorm', desc: 'One question in the middle and four areas around it.', scene: () => { seq = 0; return serializeBoard([heading(0, -60, 'Brainstorm'), ...box(260, 120, 220, 100, 'The question', '#ffec99'), ...box(0, 0, 200, 90, 'Idea', '#fff3bf'), ...box(540, 0, 200, 90, 'Idea', '#fff3bf'), ...box(0, 260, 200, 90, 'Idea', '#fff3bf'), ...box(540, 260, 200, 90, 'Idea', '#fff3bf')]); } },
  { key: 'retro', name: 'Retro', desc: 'Went well, to improve, actions.', scene: () => { seq = 0; return serializeBoard([heading(0, -60, 'Retro'), ...box(0, 0, 260, 320, 'Went well', '#b2f2bb'), ...box(290, 0, 260, 320, 'To improve', '#ffc9c9'), ...box(580, 0, 260, 320, 'Actions', '#a5d8ff')]); } },
  { key: 'mindmap', name: 'Mind map', desc: 'A centre topic with branches to fill in.', scene: () => { seq = 0; return serializeBoard([...box(280, 160, 200, 90, 'Topic', '#d0bfff'), ...box(0, 0, 180, 70, 'Branch', '#e9ecef'), ...box(580, 0, 180, 70, 'Branch', '#e9ecef'), ...box(0, 340, 180, 70, 'Branch', '#e9ecef'), ...box(580, 340, 180, 70, 'Branch', '#e9ecef')]); } },
];
