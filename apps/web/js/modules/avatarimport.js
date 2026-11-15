// Customer Avatar import (V8 "New customer avatar" › Read the file › Check the sections). Reads a Word (.docx) or PDF file IN THE BROWSER — nothing is
// sent anywhere — and keeps its structure: top headings become sections, deeper headings become parts inside them (avatarmodel.toOutline). The person
// checks and can change every match before anything is saved. .docx: a zip read with the browser's own DecompressionStream; PDF: the self-hosted pdf.js already used by the PDF editor.

import { toOutline } from './avatarmodel.js';

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
      const list = el.getElementsByTagNameNS(W, 'numPr').length > 0 || /^ListParagraph/i.test(style); const bold = [...el.getElementsByTagNameNS(W, 'b')].length > 0 && x.length < 90;
      // heading level from the style (Heading1, Heading 2, Title = 0, "berschrift2"…); a short bold numbered or capitalised line counts as a top heading
      const lv = /^title$/i.test(style) ? 0 : (/heading\s*(\d)|berschrift\s*(\d)|^(\d)$/i.exec(style) ?? []).slice(1).find(Boolean);
      if (lv != null) out.push({ t: 'h', lvl: Number(lv), x });
      else if (!list && bold && (/^\d+[.)]\s/.test(x) || (x === x.toUpperCase() && /[A-Z]/.test(x)))) out.push({ t: 'h', lvl: 1, x });
      else out.push({ t: list ? 'li' : 'p', x: x.replace(/^[•\-–·*]\s+/, '') });
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
      // bigger type = a heading; the biggest sizes (or a numbered capitalised line) are top level, the rest sub-headings
      const head = l.size > body * 1.15 || (x.length < 80 && x === x.toUpperCase() && /[A-Z]/.test(x)) || (/^\d+[.)]\s+[A-Z]/.test(x) && x.length < 80);
      out.push(head ? { t: 'h', lvl: l.size > body * 1.45 || /^\d+[.)]\s+/.test(x) ? 1 : 2, x } : { t: /^[•\-–·*]\s/.test(x) ? 'li' : 'p', x: x.replace(/^[•\-–·*]\s+/, '') }); }
  }
  return out;
}
/** Read a file → { name, words, outline: [{ heading, parts: [{ heading, blocks }] }] }. Throws an Error with a plain message. */
export async function readAvatarFile(file) {
  if (file.size > 20 * 1048576) throw new Error('That file is over 20 MB.');
  const buf = await file.arrayBuffer(); const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
  if (!isPdf && !/\.docx$/i.test(file.name)) throw new Error('Choose a .docx or .pdf file.');
  const blocks = isPdf ? await pdfBlocks(buf) : docxBlocks(await unzipEntry(buf, 'word/document.xml'));
  return { name: file.name, words: blocks.reduce((n, b) => n + (b.x ?? b.rows.flat().join(' ')).split(/\s+/).filter(Boolean).length, 0), outline: toOutline(blocks) };
}
