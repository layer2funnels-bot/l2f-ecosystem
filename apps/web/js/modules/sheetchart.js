// Sheets charts: column, bar, line and pie charts drawn as SVG from { cats, series } (sheetmodel.chartData). No library. Colours come from the theme tokens
// (set through the CSSOM, never as markup), so charts follow light/dark and both organisations.
const NS = 'http://www.w3.org/2000/svg';
export const PALETTE = ['var(--action)', 'var(--warn)', 'var(--ok)', 'var(--danger)', 'var(--brand)', 'var(--text2)', 'var(--muted)', 'var(--action-ink)'];
const el = (tag, attrs = {}, style = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); for (const [k, v] of Object.entries(style)) e.style[k] = v; return e; };
const txt = (x, y, s, o = {}) => { const t = el('text', { x, y, 'text-anchor': o.anchor ?? 'middle', 'font-size': o.size ?? 11 }, { fill: o.fill ?? 'var(--text2)', fontWeight: o.bold ? '700' : '400' }); t.textContent = s; return t; };
const short = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
const fmt = (v) => { const a = Math.abs(v); if (a >= 1e9) return `${+(v / 1e9).toFixed(1)}B`; if (a >= 1e6) return `${+(v / 1e6).toFixed(1)}M`; if (a >= 1e4) return `${+(v / 1e3).toFixed(1)}k`; return String(+v.toFixed(2)); };
function niceMax(max) { if (max <= 0) return 1; const p = 10 ** Math.floor(Math.log10(max)); const f = max / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }

/** Draws the chart into `svg` (cleared first) at w x h pixels. */
export function drawChart(svg, chart, data, w, h) {
  svg.replaceChildren(); svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('role', 'img');
  const series = chart.type === 'pie' ? data.series.slice(0, 1) : data.series;
  svg.setAttribute('aria-label', `${chart.title || 'Chart'}: ${chart.type} chart of ${data.cats.length} categor${data.cats.length === 1 ? 'y' : 'ies'} and ${series.length} series`);
  const top = chart.title ? 30 : 12, legendOn = chart.legend && (chart.type === 'pie' ? data.cats.length > 0 : series.length > 1);
  if (chart.title) svg.append(txt(w / 2, 20, short(chart.title, Math.floor(w / 8)), { size: 14, bold: true, fill: 'var(--text)' }));
  if (!series.length || !data.cats.length) { svg.append(txt(w / 2, h / 2, 'Nothing to chart in this range', { size: 13 })); return; }
  const names = chart.type === 'pie' ? data.cats : series.map((s) => s.name);
  let bottom = 10;
  if (legendOn) {                                                                 // legend along the bottom, wrapping onto rows
    let x = 12, y = h - 12; const rows = [[]]; const items = names.slice(0, 24).map((n, i) => ({ n: short(n, 18), i }));
    for (const it of items) { const wd = 22 + it.n.length * 6.2; if (x + wd > w - 8 && rows.at(-1).length) { rows.push([]); x = 12; } rows.at(-1).push({ ...it, x }); x += wd + 10; }
    bottom = 10 + rows.length * 18; y = h - bottom + 14;
    rows.forEach((row, ri) => row.forEach((it) => { svg.append(el('rect', { x: it.x, y: y + ri * 18 - 9, width: 10, height: 10, rx: 2 }, { fill: PALETTE[it.i % PALETTE.length] })); svg.append(txt(it.x + 14, y + ri * 18, it.n, { anchor: 'start', size: 11 })); }));
  }
  if (chart.type === 'pie') {
    const vals = series[0].values.map((v) => Math.max(0, v)); const total = vals.reduce((a, b) => a + b, 0);
    const cx = w / 2, cy = top + (h - top - bottom) / 2, r = Math.max(20, Math.min((w - 24) / 2, (h - top - bottom - 8) / 2));
    if (!total) { svg.append(txt(w / 2, h / 2, 'All values are zero', { size: 13 })); return; }
    let a0 = -Math.PI / 2;
    vals.forEach((v, i) => {
      if (!v) return; const a1 = a0 + (v / total) * Math.PI * 2; const big = a1 - a0 > Math.PI ? 1 : 0;
      const pt = (a) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
      const d = vals.filter(Boolean).length === 1 ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z` : `M ${cx} ${cy} L ${pt(a0)} A ${r} ${r} 0 ${big} 1 ${pt(a1)} Z`;
      const sl = el('path', { d, 'stroke-width': 1.5 }, { fill: PALETTE[i % PALETTE.length], stroke: 'var(--surface)' }); const tt = el('title'); tt.textContent = `${data.cats[i]}: ${fmt(v)} (${Math.round(v / total * 100)}%)`; sl.append(tt); svg.append(sl);
      if (v / total > 0.06) { const am = (a0 + a1) / 2; svg.append(txt(cx + r * 0.62 * Math.cos(am), cy + r * 0.62 * Math.sin(am) + 4, `${Math.round(v / total * 100)}%`, { size: 11, bold: true, fill: 'var(--surface)' })); }
      a0 = a1;
    });
    return;
  }
  const horiz = chart.type === 'bar'; const all = series.flatMap((s) => s.values); const min = Math.min(0, ...all), max = niceMax(Math.max(0, ...all)); const range = (max - min) || 1;
  const L = horiz ? 78 : 44, R = 14, T = top, B = bottom + (horiz ? 16 : 22), pw = w - L - R, ph = h - T - B;
  if (pw < 30 || ph < 30) return;
  const ticks = 5; const sx = (v) => L + ((v - min) / range) * pw, sy = (v) => T + ph - ((v - min) / range) * ph;
  for (let i = 0; i <= ticks; i++) {
    const v = min + (range * i) / ticks;
    if (horiz) { svg.append(el('line', { x1: sx(v), x2: sx(v), y1: T, y2: T + ph }, { stroke: 'var(--line2)' })); svg.append(txt(sx(v), T + ph + 14, fmt(v), { size: 10 })); }
    else { svg.append(el('line', { x1: L, x2: L + pw, y1: sy(v), y2: sy(v) }, { stroke: 'var(--line2)' })); svg.append(txt(L - 6, sy(v) + 3, fmt(v), { anchor: 'end', size: 10 })); }
  }
  const n = data.cats.length; const band = (horiz ? ph : pw) / n; const step = Math.max(1, Math.ceil(n / Math.floor((horiz ? ph : pw) / (horiz ? 16 : 56))));
  data.cats.forEach((c, i) => { if (i % step) return; if (horiz) svg.append(txt(L - 6, T + band * (i + 0.5) + 4, short(c, 11), { anchor: 'end', size: 10 })); else svg.append(txt(L + band * (i + 0.5), T + ph + 14, short(c, Math.max(4, Math.floor(band / 6))), { size: 10 })); });
  const zero = horiz ? sx(0) : sy(0); svg.append(el(horiz ? 'line' : 'line', horiz ? { x1: zero, x2: zero, y1: T, y2: T + ph } : { x1: L, x2: L + pw, y1: zero, y2: zero }, { stroke: 'var(--text2)' }));
  if (chart.type === 'line') {
    series.forEach((s, si) => {
      const pts = s.values.map((v, i) => [L + band * (i + 0.5), sy(v)]); const col = PALETTE[si % PALETTE.length];
      svg.append(el('polyline', { points: pts.map((p) => p.join(',')).join(' '), 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, { fill: 'none', stroke: col }));
      pts.forEach((p, i) => { const dot = el('circle', { cx: p[0], cy: p[1], r: n > 60 ? 0 : 3.5, 'stroke-width': 1.5 }, { fill: col, stroke: 'var(--surface)' }); const tt = el('title'); tt.textContent = `${s.name} · ${data.cats[i]}: ${fmt(s.values[i])}`; dot.append(tt); svg.append(dot); });
    });
    return;
  }
  const m = series.length; const inner = band * 0.78; const bw = inner / m;
  series.forEach((s, si) => s.values.forEach((v, i) => {
    const off = band * i + (band - inner) / 2 + bw * si; const a = Math.min(v, 0) === v && v < 0 ? v : 0;
    const rect = horiz ? el('rect', { x: Math.min(sx(0), sx(v)), y: T + off, width: Math.max(1, Math.abs(sx(v) - sx(0))), height: Math.max(1, bw - 1), rx: 2 }, { fill: PALETTE[si % PALETTE.length] })
      : el('rect', { x: L + off, y: Math.min(sy(v), sy(0)), width: Math.max(1, bw - 1), height: Math.max(1, Math.abs(sy(v) - sy(0))), rx: 2 }, { fill: PALETTE[si % PALETTE.length] });
    void a; const tt = el('title'); tt.textContent = `${s.name} · ${data.cats[i]}: ${fmt(v)}`; rect.append(tt); svg.append(rect);
  }));
}
