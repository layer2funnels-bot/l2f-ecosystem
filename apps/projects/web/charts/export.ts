// Chart export: CSV text and a PNG made from the live SVG (styles are resolved first so CSS variables and dark mode survive).
export type Cell = string | number | null | undefined;

/** RFC 4180 CSV. Text that a spreadsheet could read as a formula gets a leading apostrophe. */
export function toCsv(rows: Cell[][]): string {
  const cell = (c: Cell): string => {
    if (c === null || c === undefined) return '';
    let s = String(c);
    if (typeof c === 'string' && /^[=+@\t\r]|^-(?!\d)/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const STYLE_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity',
  'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor', 'dominant-baseline', 'stop-color', 'stop-opacity', 'visibility'];

/** Copies the resolved (computed) presentation styles of every node of `src` onto the matching node of the detached `dst`. */
function inlineStyles(src: SVGSVGElement, dst: SVGSVGElement): void {
  const a = [src, ...Array.from(src.querySelectorAll('*'))];
  const b = [dst, ...Array.from(dst.querySelectorAll('*'))];
  const drop: Element[] = [];
  a.forEach((el, i) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') { drop.push(b[i]); return; }
    if (el.classList.contains('pm-chart__hit')) { drop.push(b[i]); return; }   // invisible hover areas
    let s = '';
    for (const p of STYLE_PROPS) { const v = cs.getPropertyValue(p); if (v) s += `${p}:${v};`; }
    b[i].setAttribute('style', s);
    b[i].removeAttribute('class');
  });
  for (const el of drop) el.remove();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) { out.push(line); line = word; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

/** Renders title, subtitle, legend and the first chart SVG found in `root` to a PNG (2x). */
export async function chartToPng(root: HTMLElement, o: { title: string; subtitle?: string }): Promise<Blob> {
  const svg = root.querySelector<SVGSVGElement>('svg.pm-chart__svg');
  if (!svg) throw new Error('There is no chart to export');
  const box = svg.getBoundingClientRect();
  const w = Math.max(1, Math.round(box.width)), h = Math.max(1, Math.round(box.height));
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  clone.removeAttribute('style');

  const card = root.closest('.pm-chartcard') ?? root;
  const cardCs = getComputedStyle(card);
  const fontFamily = cardCs.fontFamily || 'sans-serif';
  const textColor = getComputedStyle(root.querySelector('.pm-chart__cat') ?? card).color;
  const titleColor = cardCs.color;
  const mutedColor = (card.querySelector('.pm-chartcard__sub') ? getComputedStyle(card.querySelector('.pm-chartcard__sub') as Element).color : textColor);
  const bg = cardCs.backgroundColor && cardCs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cardCs.backgroundColor : '#ffffff';

  const legend = Array.from(root.querySelectorAll('.pm-legend__item:not(.is-off)')).map((el) => {
    const sw = el.querySelector('.pm-legend__sw');
    const swCs = sw ? getComputedStyle(sw) : null;
    const color = swCs ? (swCs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? swCs.backgroundColor : swCs.borderTopColor) : titleColor;
    return { label: (el.querySelector('.pm-legend__label')?.textContent ?? '').trim(), value: (el.querySelector('.pm-legend__val')?.textContent ?? '').trim(), color };
  });

  const pad = 18, scale = 2;
  const width = Math.max(w + pad * 2, 380);
  const measure = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
  measure.font = `13px ${fontFamily}`;
  const subLines = o.subtitle ? wrapLines(measure, o.subtitle, width - pad * 2) : [];
  // legend layout
  measure.font = `12px ${fontFamily}`;
  const legendRows: { x: number; row: number; item: (typeof legend)[number] }[] = [];
  let lx = pad, row = 0;
  for (const item of legend) {
    const text = item.value ? `${item.label}  ${item.value}` : item.label;
    const iw = 16 + measure.measureText(text).width + 16;
    if (lx + iw > width - pad && lx > pad) { lx = pad; row++; }
    legendRows.push({ x: lx, row, item });
    lx += iw;
  }
  const headH = pad + 20 + subLines.length * 17 + 8;
  const legendH = legend.length ? (row + 1) * 20 + 8 : 0;
  const height = headH + legendH + h + pad;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.scale(scale, scale);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = titleColor;
  ctx.font = `600 16px ${fontFamily}`;
  ctx.fillText(o.title, pad, pad + 14);
  ctx.fillStyle = mutedColor;
  ctx.font = `13px ${fontFamily}`;
  subLines.forEach((l, i) => ctx.fillText(l, pad, pad + 14 + 20 + i * 17 - 2));
  ctx.font = `12px ${fontFamily}`;
  for (const { x, row: r, item } of legendRows) {
    const y = headH + r * 20 + 10;
    ctx.fillStyle = item.color;
    ctx.beginPath(); ctx.roundRect(x, y - 5, 10, 10, 3); ctx.fill();
    ctx.fillStyle = titleColor;
    ctx.fillText(item.value ? `${item.label}  ${item.value}` : item.label, x + 16, y + 4);
  }

  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('The chart image could not be drawn')); img.src = url; });
    ctx.drawImage(img, (width - w) / 2, headH + legendH, w, h);
  } finally {
    URL.revokeObjectURL(url);
  }
  return new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('The image could not be created'))), 'image/png'));
}
