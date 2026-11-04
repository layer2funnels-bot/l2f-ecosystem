// Markdown and plain text to document blocks (import of .md and .txt files). Pure: text in, blocks out; docmodel.normalize() still checks everything.
import { safeHref } from './docmodel.js';

const INLINE = /(\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|`([^`]+)`|\*(.+?)\*|_(.+?)_|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|<u>(.+?)<\/u>)/;
/** Inline Markdown to runs (bold, italic, strike, code, links, underline); anything else is plain text. */
export function inlineRuns(text, marks = {}) {
  const out = []; let rest = String(text ?? '');
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) { out.push({ x: rest, ...marks }); break; }
    if (m.index) out.push({ x: rest.slice(0, m.index), ...marks });
    if (m[2] !== undefined) out.push(...inlineRuns(m[2], { ...marks, b: 1 }));
    else if (m[3] !== undefined) out.push(...inlineRuns(m[3], { ...marks, b: 1 }));
    else if (m[4] !== undefined) out.push(...inlineRuns(m[4], { ...marks, s: 1 }));
    else if (m[5] !== undefined) out.push({ x: m[5], ...marks, cd: 1 });
    else if (m[6] !== undefined) out.push(...inlineRuns(m[6], { ...marks, i: 1 }));
    else if (m[7] !== undefined) out.push(...inlineRuns(m[7], { ...marks, i: 1 }));
    else if (m[8] !== undefined) { const a = safeHref(m[9]); out.push(...inlineRuns(m[8], a ? { ...marks, a } : marks)); }
    else if (m[10] !== undefined) out.push(...inlineRuns(m[10], { ...marks, u: 1 }));
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}
const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
const isSep = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.includes('-');
export function blocksFromMarkdown(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n'); const blocks = []; let para = [];
  const flush = () => { if (para.length) { blocks.push({ t: 'p', c: inlineRuns(para.join(' ')) }); para = []; } };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { flush(); const code = []; i += 1; while (i < lines.length && !/^\s*```/.test(lines[i])) { code.push(lines[i]); i += 1; } blocks.push({ t: 'code', c: [{ x: code.join('\n') }] }); continue; }
    if (!line.trim()) { flush(); continue; }
    let m;
    if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) { flush(); blocks.push({ t: `h${Math.min(3, m[1].length)}`, c: inlineRuns(m[2]) }); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); blocks.push({ t: 'hr' }); continue; }
    if (/^\s*<!--\s*page break\s*-->\s*$/i.test(line)) { flush(); blocks.push({ t: 'pb' }); continue; }
    if (line.includes('|') && i + 1 < lines.length && isSep(lines[i + 1])) {
      flush(); const rows = [cells(line).map((c) => ({ c: inlineRuns(c) }))]; i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(cells(lines[i]).map((c) => ({ c: inlineRuns(c) }))); i += 1; }
      i -= 1; blocks.push({ t: 'table', hdr: 1, rows }); continue;
    }
    if (/^\s*>\s?/.test(line)) { flush(); const q = []; while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i += 1; } i -= 1; blocks.push({ t: 'quote', c: inlineRuns(q.join(' ')) }); continue; }
    if ((m = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/.exec(line))) {
      flush(); const items = [];
      while (i < lines.length && (m = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/.exec(lines[i]))) {
        const lv = Math.min(8, Math.floor(m[1].replace(/\t/g, '  ').length / 2)); const k = m[3] !== undefined ? 'cl' : /\d/.test(m[2]) ? 'ol' : 'ul';
        items.push({ k, lv, ...(k === 'cl' && /x/i.test(m[3]) ? { ck: 1 } : {}), c: inlineRuns(m[4]) }); i += 1;
      }
      i -= 1; blocks.push({ t: 'list', items }); continue;
    }
    para.push(line.trim());
  }
  flush();
  return blocks;
}
/** Plain text: one paragraph per line, blank lines kept. */
export const blocksFromText = (src) => String(src ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => ({ t: 'p', c: l ? [{ x: l }] : [] }));
