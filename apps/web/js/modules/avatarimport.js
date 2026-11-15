// Customer Avatar import (V8 "New customer avatar" › Read the file › Check the sections). Reads a Word (.docx) or PDF file IN THE BROWSER — nothing is
// sent anywhere — splits it into sections by its headings, and suggests the chapter each section belongs to, with a confidence. The person checks every
// match before anything is saved. .docx: a zip read with the browser's own DecompressionStream; PDF: the self-hosted pdf.js already used by the PDF editor.

export const CHAPTERS = [
  ['market', 'Market map'], ['qual', 'Qualification'], ['basic', 'Basic profile'], ['drives', 'What drives them'], ['beliefs', 'Beliefs'], ['desires', 'External vs internal desires'],
  ['filter', 'Best vs worst customer'], ['problems', 'Problems, now and next'], ['niche', 'Niche statement'], ['next', 'What to do next'], ['notes', 'Context notes'],
];
const RULES = [   // [chapter, strong words, weaker words]
  ['market', /market\s*map|core market|sub-?market|niche map/i, /market/i], ['qual', /qualif|3 questions|three questions/i, /question/i],
  ['basic', /basic profile|demograph|who (is|are) (he|she|they)|profile/i, /age|income|location/i], ['beliefs', /belief/i, /root|mindset/i],
  ['drives', /drive|motivat|values|identity|wants/i, /goal|learn/i], ['desires', /desire/i, /external|internal/i],
  ['filter', /best\s*(vs\.?|and|or)\s*worst|ideal (vs|and) bad|best customer|worst customer/i, /best|worst/i], ['problems', /problem|pain|challenge/i, /struggl|future/i],
  ['niche', /niche statement|one-?line|positioning/i, /statement|niche/i], ['next', /what to do next|next steps|action/i, /next|todo|to do/i], ['notes', /context|notes|important/i, /misc|other/i],
];
/** The chapter a heading most likely belongs to: { key, confidence: 'High' | 'Medium' | 'Low' } (Low = keep as a custom section). */
export function matchChapter(heading) {
  const t = String(heading ?? '');
  for (const [k, strong] of RULES) if (strong.test(t)) return { key: k, confidence: 'High' };
  for (const [k, , weak] of RULES) if (weak.test(t)) return { key: k, confidence: 'Medium' };
  return { key: 'custom', confidence: 'Low' };
}

// ---- .docx: find word/document.xml in the zip (central directory), inflate it, read paragraphs, headings, list items and tables
async function unzipEntry(buf, want) {
  const dv = new DataView(buf); let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This isn’t a Word file we can read.');
  let p = dv.getUint32(eocd + 16, true); const n = dv.getUint16(eocd + 10, true); const dec = new TextDecoder();
  for (let k = 0; k < n; k++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nl)); p += 46 + nl + el + cl;
    if (name !== want) continue;
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true); const data = new Uint8Array(buf, start, csize);
    if (method === 0) return dec.decode(data);
    if (method !== 8 || typeof DecompressionStream === 'undefined') throw new Error('This browser can’t open that Word file. Try a PDF.');
    return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  }
  throw new Error('This isn’t a Word file we can read.');
}
export function docxBlocks(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml'); const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const body = doc.getElementsByTagNameNS(W, 'body')[0]; if (!body) return [];
  const textOf = (el) => [...el.getElementsByTagNameNS(W, 't')].map((t) => t.textContent).join('').replace(/\s+/g, ' ').trim();
  const out = [];
  for (const el of body.children) {
    if (el.localName === 'p') {
      const x = textOf(el); if (!x) continue;
      const style = el.getElementsByTagNameNS(W, 'pStyle')[0]?.getAttributeNS(W, 'val') ?? '';
      const list = el.getElementsByTagNameNS(W, 'numPr').length > 0; const bold = [...el.getElementsByTagNameNS(W, 'b')].length > 0 && x.length < 90;
      out.push({ t: /^(heading|title)\s*\d?/i.test(style) || /^Heading/.test(style) ? 'h' : list ? 'li' : bold && (/^\d+[.)]\s/.test(x) || x === x.toUpperCase()) ? 'h' : 'p', x });
    } else if (el.localName === 'tbl') {
      const rows = [...el.getElementsByTagNameNS(W, 'tr')].map((tr) => [...tr.getElementsByTagNameNS(W, 'tc')].map(textOf)).filter((r) => r.some(Boolean));
      if (rows.length) out.push({ t: 'table', rows });
    }
  }
  return out;
}
async function pdfBlocks(buf) {
  const pdfjs = await import('/media/pdfjs.js').then((m) => { m.GlobalWorkerOptions.workerSrc = '/media/pdf.worker.js'; return m; }).catch(() => { throw new Error('PDF reading isn’t part of this build yet. Try a Word file.'); });
  const pdf = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise; const out = [];
  for (let n = 1; n <= Math.min(pdf.numPages, 60); n++) {
    const tc = await (await pdf.getPage(n)).getTextContent(); const lines = new Map();
    for (const it of tc.items) { const y = Math.round(it.transform[5]); const l = lines.get(y) ?? { x: '', size: 0 }; l.x += it.str; l.size = Math.max(l.size, Math.abs(it.transform[0])); lines.set(y, l); }
    const sizes = [...lines.values()].map((l) => l.size).sort((a, b) => a - b); const body = sizes[Math.floor(sizes.length / 2)] ?? 10;
    for (const [, l] of [...lines].sort((a, b) => b[0] - a[0])) { const x = l.x.replace(/\s+/g, ' ').trim(); if (!x) continue;
      out.push({ t: l.size > body * 1.15 || (x.length < 80 && x === x.toUpperCase() && /[A-Z]/.test(x)) || /^\d+[.)]\s+[A-Z]/.test(x) && x.length < 80 ? 'h' : /^[•\-–·*]\s/.test(x) ? 'li' : 'p', x: x.replace(/^[•\-–·*]\s+/, '') }); }
  }
  return out;
}
/** Read a file → { name, words, sections: [{ heading, lines: [text], rows: [[cells]] }] }. Throws an Error with a plain message. */
export async function readAvatarFile(file) {
  if (file.size > 20 * 1048576) throw new Error('That file is over 20 MB.');
  const buf = await file.arrayBuffer(); const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
  if (!isPdf && !/\.docx$/i.test(file.name)) throw new Error('Choose a .docx or .pdf file.');
  const blocks = isPdf ? await pdfBlocks(buf) : docxBlocks(await unzipEntry(buf, 'word/document.xml'));
  return { name: file.name, words: blocks.reduce((n, b) => n + (b.x ?? b.rows.flat().join(' ')).split(/\s+/).filter(Boolean).length, 0), sections: toSections(blocks) };
}
export function toSections(blocks) {
  const out = []; let cur = null;
  for (const b of blocks) {
    if (b.t === 'h') { cur = { heading: b.x, lines: [], rows: [] }; out.push(cur); continue; }
    if (!cur) { cur = { heading: 'Introduction', lines: [], rows: [] }; out.push(cur); }
    if (b.t === 'table') cur.rows.push(...b.rows); else cur.lines.push(b.x);
  }
  return out.filter((s) => s.lines.length || s.rows.length);
}
const split2 = (s) => { const m = /^(.{1,60}?)\s*[:–—|]\s+(.+)$/.exec(s); return m ? [m[1].trim(), m[2].trim()] : null; };
/** Merge the checked sections into a profile. mapping[i] = chapter key, 'custom' or 'skip'. */
export function sectionsToProfile(sections, mapping, base = {}) {
  const p = structuredClone(base); const push = (k, v) => { p[k] = [...(p[k] ?? []), ...v]; };
  sections.forEach((s, i) => {
    const k = mapping[i]; if (!k || k === 'skip') return;
    const items = [...s.lines, ...s.rows.map((r) => r.filter(Boolean).join(' — '))];
    const pairs = [...s.rows.filter((r) => r.length >= 2).map((r) => [r[0], r.slice(1).join(' ')]), ...s.lines.map(split2).filter(Boolean)];
    switch (k) {
      case 'market': p.market = { ...(p.market ?? {}), niches: [...(p.market?.niches ?? []), ...items.map((x) => [x, '', false])] }; break;
      case 'qual': push('qual', pairs.length ? pairs : items.map((x) => [x, ''])); break;
      case 'basic': push('facts', pairs.length ? pairs : items.map((x) => ['Note', x])); break;
      case 'drives': push('wants', items); break;
      case 'beliefs': push('beliefs', items.map((x) => ['', x.replace(/^[“"]|[”"]$/g, ''), 'F'])); break;
      case 'desires': push('ext', items); break;
      case 'filter': push('best', items.map((x) => [x, ''])); break;
      case 'problems': push('problems', items.map((x) => ['Business', x, ''])); break;
      case 'niche': push('niche', items.map((x, j) => [j ? 'Version' : 'Full', x])); break;
      case 'next': push('next', items.map((x) => [x, 'week', false])); break;
      case 'notes': p.notes = [p.notes, ...items].filter(Boolean).join('\n'); break;
      default: push('custom', [{ title: s.heading.slice(0, 120), text: items.join('\n') }]);
    }
  });
  return p;
}
