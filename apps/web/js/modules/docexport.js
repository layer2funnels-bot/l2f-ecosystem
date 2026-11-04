// Docs downloads and printing. Everything is generated from the model (never from the page's HTML). Word (.docx) export/import use the lazy-loaded,
// self-hosted bundle built by scripts/build-docs-io.mjs (docx, MIT; mammoth, BSD-2-Clause); when it is not part of the build the menu says so.
import { renderBlocks, fillToc, fillNotes } from './docdom.js';
import { pageSize, marginsOf } from './docmodel.js';

export const safeName = (s) => String(s ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim().slice(0, 100) || 'Document';
export function download(name, mime, data) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
let io;
/** The Word bundle, or null when this build does not include it. */
export async function loadIo() {
  io ??= import(new URL('../../docs-io/docsio.js', import.meta.url).href).then((m) => m, () => null);
  return io;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cssStr = (t) => `"${String(t ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
/** The @page rule for a document: size, orientation, margins, and the header, footer and page number in the margin boxes (browsers without margin boxes print without them). */
export function pageRule(page) {
  const sz = pageSize(page); const [mt, mr, mb, ml] = marginsOf(page);
  const box = (pos, content) => `@${pos}{content:${content};font:9pt Arial,Helvetica,sans-serif;color:#555}`;
  const parts = [`size:${sz.w}mm ${sz.h}mm`, `margin:${mt}mm ${mr}mm ${mb}mm ${ml}mm`];
  const boxes = [];
  if (page.hdr) boxes.push(box('top-center', cssStr(page.hdr)));
  if (page.ftr) boxes.push(box(page.pn === 'l' ? 'bottom-right' : 'bottom-left', cssStr(page.ftr)));
  if (page.pn) boxes.push(box(`bottom-${{ l: 'left', c: 'center', r: 'right' }[page.pn]}`, '"Page " counter(page)'));
  let css = `@page{${parts.join(';')};${boxes.join('')}}`;
  if (page.first) css += '@page :first{@top-center{content:""}@bottom-left{content:""}@bottom-center{content:""}@bottom-right{content:""}}';
  return css;
}
/** Prints (or saves as PDF) just the document: the blocks are drawn in a hidden frame with the page's own stylesheets and the page rule. With `preview` (an element) the frame is shown there instead and returned. */
export async function printBlocks({ blocks, page, imageSrc, title, preview }) {
  const frame = document.createElement('iframe'); frame.setAttribute('aria-hidden', preview ? 'false' : 'true'); frame.title = 'Print preview'; frame.tabIndex = preview ? 0 : -1; frame.className = preview ? 'dx-previewframe' : 'dx-printframe';
  (preview ?? document.body).append(frame);
  const w = frame.contentWindow; const d = frame.contentDocument; d.title = title;
  for (const l of document.querySelectorAll('link[rel=stylesheet]')) { const c = d.createElement('link'); c.rel = 'stylesheet'; c.href = l.href; d.head.append(c); }
  d.documentElement.className = preview ? 'dx-print dx-preview' : 'dx-print'; d.documentElement.dataset.theme = 'light';
  try { const sheet = new w.CSSStyleSheet(); sheet.replaceSync(pageRule(page)); d.adoptedStyleSheets = [sheet]; } catch { /* the browser's default margins apply */ }
  const paper = d.createElement('div'); paper.className = 'dx-paper'; const root = d.createElement('div'); root.className = 'dx-doc docpage'; const notes = d.createElement('div'); notes.className = 'dx-notes'; paper.append(root, notes); d.body.append(paper);
  if (preview) { const sz = pageSize(page); const [mt, mr, mb, ml] = marginsOf(page); paper.style.setProperty('--dx-w', `${sz.w}mm`); for (const [k, v] of [['mt', mt], ['mr', mr], ['mb', mb], ['ml', ml]]) paper.style.setProperty(`--dx-${k}`, `${v}mm`); }
  renderBlocks(root, blocks); fillToc(root); fillNotes(root, notes);
  const imgs = [...root.querySelectorAll('figure.dx-img img')];
  await Promise.all(imgs.map(async (im) => { const src = await imageSrc(im.closest('figure').dataset.f).catch(() => null); if (!src) return; await new Promise((res) => { im.onload = res; im.onerror = res; im.src = src; setTimeout(res, 4000); }); }));
  await Promise.race([Promise.all([...d.querySelectorAll('link[rel=stylesheet]')].map((l) => new Promise((res) => { if (l.sheet) res(); else { l.onload = res; l.onerror = res; } }))), sleep(3000)]);
  try { await d.fonts?.ready; } catch { /* fonts fall back */ }
  await sleep(50);
  if (preview) return frame;
  const done = () => frame.remove();
  w.addEventListener('afterprint', () => setTimeout(done, 500)); setTimeout(done, 10 * 60 * 1000);
  w.focus(); w.print(); return frame;
}
