"use client";
// Browser-side exports: file download, the map as SVG/PNG (with the canvas fonts embedded) and the PDF client report.
import { money, moneyShort, nf, pct, ratio, people } from "@/lib/format";
import { artOf, artSrc } from "@/lib/block-art";
import { stepRows, type FunnelResult } from "@/lib/funnel-math";
import type { FunnelEdge, FunnelNode } from "@/lib/graph";
import { mapSvg, type MapSvgOptions, type Measure } from "@/lib/export";
import { reportData, type MonthlyActualRow, type ReportSettings } from "@/lib/report-data";
import { typeOf } from "@/lib/catalog";
import { supabaseBrowser } from "@/lib/supabase/client";

export function download(name: string, data: Blob | string, type = "application/octet-stream") {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Image failed to load"));
    img.src = src;
  });
}

/** Rasterise an SVG string to a PNG data URL (scale × for crisp output, capped to keep canvases sane). */
export async function svgToPng(svg: string, scale = 2): Promise<{ url: string; width: number; height: number }> {
  const m = svg.match(/width="([\d.]+)" height="([\d.]+)"/);
  const w = m ? Number(m[1]) : 1200,
    h = m ? Number(m[2]) : 800;
  const k = Math.min(scale, 8000 / Math.max(w, h));
  const img = await loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  try {
    await img.decode();
  } catch {}
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { url: c.toDataURL("image/png"), width: c.width, height: c.height };
}

async function dataUrlToBlob(url: string) {
  return (await fetch(url)).blob();
}

export async function downloadPng(name: string, svg: string) {
  const { url } = await svgToPng(svg, 2);
  download(name, await dataUrlToBlob(url));
}

/** Any image URL (incl. SVG logos) → PNG data URL + aspect ratio, or null if it can't be loaded (CORS etc.). */
async function logoPng(url: string | null | undefined) {
  if (!url) return null;
  try {
    const img = await loadImage(url);
    const c = document.createElement("canvas");
    const k = Math.min(1, 400 / Math.max(img.naturalWidth || 400, img.naturalHeight || 400));
    c.width = Math.max(1, Math.round((img.naturalWidth || 400) * k));
    c.height = Math.max(1, Math.round((img.naturalHeight || 400) * k));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return { url: c.toDataURL("image/png"), ratio: c.width / c.height };
  } catch {
    return null;
  }
}

/* ---------------- map image: the app's fonts, real text widths, inlined images ---------------- */

const firstFamily = (stack: string) => stack.split(",")[0]?.trim().replace(/^["']|["']$/g, "") ?? "";
const toDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

let fontCache: Promise<{ sans: string; display: string; css: string }> | null = null;
/**
 * The canvas fonts (DM Sans, Bricolage) as @font-face rules with the font files inlined, so the SVG renders with the
 * same fonts when it is rasterised (an SVG drawn as an image can't fetch fonts) or opened elsewhere. Latin subset only.
 */
function appFonts() {
  fontCache ??= (async () => {
    const cs = getComputedStyle(document.documentElement);
    const sans = cs.getPropertyValue("--font-sans").trim() || "Arial, sans-serif";
    const display = cs.getPropertyValue("--font-display").trim() || sans;
    const want = new Set([firstFamily(sans), firstFamily(display)]);
    const rules: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let list: CSSRuleList;
      try {
        list = sheet.cssRules;
      } catch {
        continue; // cross-origin sheet
      }
      for (const rule of Array.from(list)) {
        if (!(rule instanceof CSSFontFaceRule)) continue;
        const st = rule.style;
        if (!want.has(firstFamily(st.getPropertyValue("font-family")))) continue;
        const range = st.getPropertyValue("unicode-range");
        if (range && !/U\+0+-0*FF\b/i.test(range)) continue;
        const url = st.getPropertyValue("src").match(/url\(["']?([^"')]+)["']?\)/)?.[1];
        if (!url) continue;
        try {
          const data = await toDataUrl(await (await fetch(new URL(url, sheet.href ?? document.baseURI))).blob());
          rules.push(`@font-face{font-family:"${firstFamily(st.getPropertyValue("font-family"))}";src:url(${data});font-weight:${st.getPropertyValue("font-weight") || "normal"};font-style:${st.getPropertyValue("font-style") || "normal"}${range ? `;unicode-range:${range}` : ""}}`);
        } catch {}
      }
    }
    return { sans, display, css: rules.join("") };
  })();
  return fontCache;
}

/** Text widths from the browser's own font engine (after the web fonts have loaded). */
function canvasMeasure(): Measure {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return (t, size) => t.length * size * 0.55;
  return (t, size, weight, family) => {
    ctx.font = `${weight} ${size}px ${family}`;
    return ctx.measureText(t).width;
  };
}

/** Remote image URLs → data URLs (an SVG drawn as an image can't load external files). Unreachable ones stay as URLs. */
async function inlineImages(nodes: FunnelNode[]) {
  return Promise.all(
    nodes.map(async (n) => {
      const src = n.type === "image" ? String(n.p.src ?? "") : "";
      if (!src || src.startsWith("data:")) return n;
      try {
        const r = await fetch(src, { mode: "cors" });
        if (!r.ok) return n;
        return { ...n, p: { ...n.p, src: await toDataUrl(await r.blob()) } };
      } catch {
        return n;
      }
    }),
  );
}

/** Page screenshots (private bucket paths, or URLs) → data URLs by node id, so the strip shows the capture in every export. */
async function loadShots(nodes: FunnelNode[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    nodes
      .filter((n) => n.shot && typeOf(n.type) && ["page", "offer"].includes(typeOf(n.type).cat))
      .map(async (n) => {
        try {
          let url = n.shot!;
          if (!/^(https?:|data:)/.test(url)) {
            const { data } = await supabaseBrowser().storage.from("screenshots").createSignedUrl(url, 120);
            if (!data?.signedUrl) return;
            url = data.signedUrl;
          }
          if (url.startsWith("data:")) return void (out[n.id] = url);
          const r = await fetch(url, { mode: "cors" });
          if (r.ok) out[n.id] = await toDataUrl(await r.blob());
        } catch {}
      }),
  );
  return out;
}

/** The owner's block artwork for the block types on the map, as data URLs (static files, same origin). */
async function loadArt(nodes: FunnelNode[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const types = [...new Set(nodes.map((n) => n.type))].filter((t) => artOf(t));
  await Promise.all(
    types.map(async (t) => {
      try {
        const r = await fetch(artSrc(artOf(t)!));
        if (r.ok) out[t] = await toDataUrl(await r.blob());
      } catch {}
    }),
  );
  return out;
}

/** The map as a self-contained SVG: canvas fonts embedded, text measured with them, images inlined. */
export async function renderMapSvg(g: { nodes: FunnelNode[]; edges: FunnelEdge[] }, R: FunnelResult, opts: Omit<MapSvgOptions, "fonts" | "measure"> & { embedFonts?: boolean }) {
  await document.fonts?.ready;
  const fonts = await appFonts();
  const nodes = await inlineImages(g.nodes);
  const shots = opts.shots ?? (await loadShots(g.nodes));
  const art = opts.art ?? (await loadArt(g.nodes));
  return mapSvg({ nodes, edges: g.edges }, R, { ...opts, shots, art, fonts: opts.embedFonts === false ? { sans: fonts.sans, display: fonts.display } : fonts, measure: canvasMeasure() });
}

/* ---------------- PDF client report ---------------- */

export interface PdfInfo {
  funnelName: string;
  description?: string;
  clientName: string;
  clientLogo?: string | null;
  agencyName: string;
  agencyLogo?: string | null;
  currency: string;
  basis: "first" | "ltv";
  hideNumbers?: boolean;
  /** Funnel settings: scenarios, forecast, expenses and target feed the report pages. */
  settings: ReportSettings;
  /** Map drawing options (measured sizes, line thickness). */
  map?: Pick<MapSvgOptions, "heightOf" | "widthOf" | "thick" | "keyLeak" | "goals" | "widgetData">;
  /** Entered actuals next to the plan by month (lib/report-data.ts monthlyPlanVsActual); the page is left out when empty. */
  actualVsPlan?: MonthlyActualRow[];
  /** Report sections the person switched off in the export step (keys of PDF_SECTIONS). The cover, map and key numbers always print. */
  omit?: string[];
}

/** The optional PDF sections, in report order. The export step lists these as checkboxes; the cover page (branding, map, key numbers, steps) always prints. */
export const PDF_SECTIONS: { key: string; label: string; match: RegExp }[] = [
  { key: "summary", label: "Executive summary", match: /^Executive summary/ },
  { key: "scenarios", label: "Scenario comparison", match: /^Scenario comparison/ },
  { key: "forecast", label: "Revenue and profit forecast, month by month, MRR and reinvestment", match: /^(Revenue & profit forecast|Month by month|MRR forecast|Traffic reinvestment)/ },
  { key: "sources", label: "Traffic source performance", match: /^Traffic source performance/ },
  { key: "offers", label: "Offer and product revenue", match: /^Offer & product revenue/ },
  { key: "expenses", label: "Expenses", match: /^Expenses/ },
  { key: "goals", label: "Goals and required numbers", match: /^Goals & required numbers/ },
  { key: "actuals", label: "Actual vs plan by month", match: /^Actual vs plan/ },
  { key: "status", label: "Build status", match: /^Build status/ },
];

type RGB = [number, number, number];
const C = {
  chrome: [17, 24, 39] as RGB,
  chromeInk: [226, 232, 240] as RGB,
  chromeMuted: [148, 163, 184] as RGB,
  brand: [4, 120, 87] as RGB,
  emerald: [16, 185, 129] as RGB,
  ink: [15, 23, 42] as RGB,
  muted: [71, 85, 105] as RGB,
  line: [219, 226, 234] as RGB,
  soft: [241, 245, 249] as RGB,
  bg: [248, 250, 252] as RGB,
  good: [21, 128, 61] as RGB,
  bad: [185, 28, 28] as RGB,
  orange: [194, 65, 12] as RGB,
};

/** jsPDF's built-in fonts only cover Windows-1252: swap the few non-Latin characters the app itself produces. */
const pdfText = (s: string) =>
  s
    .replace(/₹/g, "Rs ")
    .replace(/[−–]/g, "-")
    .replace(/→/g, "->")
    .replace(/✓/g, "v")
    .replace(/[^\x00-\xFF€…‘’“”•—™]/g, "?");

type Cell = string | { t: string; c?: RGB; b?: boolean };
interface Col {
  h: string;
  w: number;
  a?: "left" | "right";
}
const ROW = 4.8,
  HEAD = 6,
  TITLE = 8;

/** Multi-page A4 landscape client report: cover page (branding, map, key numbers, steps) then the report sections. */
export async function pdfReport(g: { nodes: FunnelNode[]; edges: FunnelEdge[] }, R: FunnelResult, info: PdfInfo) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = 297,
    H = 210,
    M = 12;
  const nums = !info.hideNumbers;
  const m = (v: number) => pdfText(money(v, info.currency));
  const ms = (v: number) => pdfText(moneyShort(v, info.currency));
  const fill = (c: RGB) => doc.setFillColor(...c);
  const ink = (c: RGB) => doc.setTextColor(...c);
  const font = (size: number, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
  };
  const fit = (t: string, w: number) => {
    t = pdfText(t);
    if (doc.getTextWidth(t) <= w) return t;
    let k = t.length;
    while (k > 0 && doc.getTextWidth(t.slice(0, k) + "…") > w) k--;
    return t.slice(0, k).trimEnd() + "…";
  };
  const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  /** Table at (x, y), width w. Returns its height. `total` = last row is a bold total line. */
  const table = (x: number, y: number, w: number, cols: Col[], rows: Cell[][], opts: { total?: boolean } = {}) => {
    const sum = cols.reduce((a, c) => a + c.w, 0);
    const cw = cols.map((c) => (c.w / sum) * w);
    font(7.5, true);
    ink(C.muted);
    let cx = x;
    cols.forEach((c, j) => {
      const a = c.a ?? (j ? "right" : "left");
      doc.text(fit(c.h, cw[j] - 2), a === "right" ? cx + cw[j] - 1 : cx + 1, y + 4, { align: a });
      cx += cw[j];
    });
    doc.setDrawColor(...C.line);
    doc.setLineWidth(0.3);
    doc.line(x, y + HEAD - 0.5, x + w, y + HEAD - 0.5);
    rows.forEach((r, i) => {
      const ry = y + HEAD + i * ROW;
      const isTotal = opts.total && i === rows.length - 1;
      if (isTotal) doc.line(x, ry, x + w, ry);
      else if (i % 2) {
        fill(C.bg);
        doc.rect(x, ry, w, ROW, "F");
      }
      let cx2 = x;
      r.forEach((cell, j) => {
        const c = typeof cell === "string" ? { t: cell } : cell;
        const a = cols[j].a ?? (j ? "right" : "left");
        font(8, isTotal || !!c.b);
        ink(c.c ?? C.ink);
        doc.text(fit(c.t, cw[j] - 2), a === "right" ? cx2 + cw[j] - 1 : cx2 + 1, ry + ROW - 1.4, { align: a });
        cx2 += cw[j];
      });
    });
    return HEAD + rows.length * ROW;
  };
  const tableH = (rows: number) => HEAD + rows * ROW;
  const signed = (v: number): RGB => (v >= 0 ? C.good : C.bad);

  /* ================= page 1: cover, map, key numbers, steps ================= */
  fill(C.chrome);
  doc.rect(0, 0, W, 24, "F");
  fill(C.emerald);
  doc.rect(0, 24, W, 0.8, "F");
  let hx = M;
  const agencyLogo = await logoPng(info.agencyLogo);
  if (agencyLogo) {
    const lh = 12,
      lw = Math.min(40, lh * agencyLogo.ratio);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(hx - 1, 5, lw + 2, lh + 2, 2, 2, "F");
    doc.addImage(agencyLogo.url, "PNG", hx, 6, lw, lh);
    hx += lw + 5;
  }
  ink(C.chromeInk);
  font(14, true);
  doc.text(pdfText(info.agencyName || "Funnel plan"), hx, 12.5);
  font(9);
  ink(C.chromeMuted);
  doc.text(pdfText(`Prepared for ${info.clientName} · ${dateStr}`), hx, 18);
  const clientLogo = await logoPng(info.clientLogo);
  if (clientLogo) {
    const lh = 14,
      lw = Math.min(46, lh * clientLogo.ratio);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(W - M - lw - 1, 4, lw + 2, lh + 2, 2, 2, "F");
    doc.addImage(clientLogo.url, "PNG", W - M - lw, 5, lw, lh);
  }

  ink(C.ink);
  font(18, true);
  doc.text(fit(info.funnelName, W - 2 * M), M, 35);
  if (info.description) {
    font(9);
    ink(C.muted);
    doc.text(doc.splitTextToSize(pdfText(info.description), 180).slice(0, 2), M, 41);
  }

  // map
  const mapX = M,
    mapY = 47,
    mapW = nums ? 190 : W - 2 * M,
    mapH = nums ? 100 : H - mapY - 14;
  doc.setDrawColor(...C.line);
  fill(C.bg);
  doc.roundedRect(mapX, mapY, mapW, mapH, 3, 3, "FD");
  if (g.nodes.length) {
    const svg = await renderMapSvg(g, R, { currency: info.currency, basis: info.basis, nums, ...info.map });
    const sz = svg.match(/width="([\d.]+)" height="([\d.]+)"/);
    const sw = Number(sz?.[1] ?? 1200),
      sh = Number(sz?.[2] ?? 800);
    // raster density: ~300 dpi on the printed size, capped by the PNG limit
    const k0 = Math.min((mapW - 4) / sw, (mapH - 4) / sh);
    const png = await svgToPng(svg, Math.max(1, Math.min(4, (k0 * 300) / 25.4)));
    const k = Math.min((mapW - 4) / png.width, (mapH - 4) / png.height);
    const iw = png.width * k,
      ih = png.height * k;
    doc.addImage(png.url, "PNG", mapX + (mapW - iw) / 2, mapY + (mapH - ih) / 2, iw, ih, undefined, "FAST");
  }

  const steps = stepRows(g, R);
  const stepCols: Col[] = [
    { h: "Step", w: 70, a: "left" },
    { h: "Type", w: 50, a: "left" },
    { h: "In", w: 30 },
    { h: "Out", w: 30 },
    { h: "Conversion", w: 30 },
    { h: "Revenue", w: 32 },
    { h: "Cost", w: 31 },
  ];
  const stepCells = (r: (typeof steps)[number]): Cell[] => [r.name, r.label, nf(r.inn), people(r.out), r.cat === "traffic" ? "–" : pct(r.convPct), r.cat === "offer" ? m(r.rev) : "", r.cost ? m(r.cost) : ""];
  let overflow = 0;
  if (nums) {
    const kx = mapX + mapW + 6,
      kw = W - M - kx;
    const kpis: [string, string, RGB?][] = [
      [info.basis === "ltv" ? "Revenue (lifetime)" : "Revenue", m(R.rev)],
      ["Profit", m(R.profit), signed(R.profit)],
      ["Ad spend", m(R.spend)],
      ["ROAS", ratio(R.roas)],
      ["Traffic", nf(R.traffic)],
      ["Leads", people(R.leads)],
      ["Customers", people(R.cust)],
      ["CPA", m(R.cpa)],
      ["AOV", m(R.aov)],
      ["ROI", pct(R.roi)],
      ["Conversion", pct(R.conv)],
      ["MRR", m(R.mrr)],
    ];
    const cw = (kw - 3) / 2,
      ch = 15.6;
    kpis.forEach(([l, v, c], i) => {
      const x = kx + (i % 2) * (cw + 3),
        y = mapY + Math.floor(i / 2) * (ch + 1.3);
      fill(C.soft);
      doc.roundedRect(x, y, cw, ch, 2, 2, "F");
      font(7.5);
      ink(C.muted);
      doc.text(l, x + 3, y + 5.5);
      font(12, true);
      ink(c ?? C.ink);
      doc.text(fit(v, cw - 5), x + 3, y + 12.2);
    });

    const ty = mapY + mapH + 5;
    const maxRows = Math.floor((H - 12 - ty - HEAD) / ROW);
    const shown = steps.length > maxRows ? maxRows - 1 : steps.length;
    table(M, ty, W - 2 * M, stepCols, steps.slice(0, shown).map(stepCells));
    overflow = steps.length - shown;
    if (overflow > 0) {
      font(8);
      ink(C.muted);
      doc.text(`+ ${overflow} more steps: see "Funnel data" in this report`, M + 1, ty + HEAD + shown * ROW + ROW - 1.4);
    }
  }

  /* ================= report pages ================= */
  if (nums) {
    const D = reportData(g, info.settings, R);
    interface Section {
      title: string;
      h: number;
      full?: boolean;
      draw: (x: number, y: number, w: number) => void;
    }
    const sections: Section[] = [];
    const TOP = 24,
      BOTTOM = H - 12,
      GAP = 8,
      COLW = (W - 2 * M - GAP) / 2;
    const maxTableRows = Math.floor((BOTTOM - TOP - TITLE - HEAD) / ROW);
    /** A table section, split over pages when it is too long. */
    const tableSection = (title: string, cols: Col[], rows: Cell[][], opts: { full?: boolean; total?: boolean; note?: string } = {}) => {
      for (let i = 0, part = 0; i < rows.length || (i === 0 && !rows.length); i += maxTableRows, part++) {
        const chunk = rows.slice(i, i + maxTableRows);
        const last = i + maxTableRows >= rows.length;
        sections.push({
          title: part ? `${title} (continued)` : title,
          full: opts.full,
          h: TITLE + tableH(chunk.length) + (last && opts.note ? 5 : 0),
          draw: (x, y, w) => {
            const th = table(x, y, w, cols, chunk, { total: last && opts.total });
            if (last && opts.note) {
              font(7.5);
              ink(C.muted);
              doc.text(fit(opts.note, w), x + 1, y + th + 4);
            }
          },
        });
        if (!rows.length) break;
      }
    };

    // --- forecast (charts, as in the editor's Forecast tab); placed below the scenario and month tables
    const F = D.forecast;
    const forecastSection = (): Section => ({
        title: `Revenue & profit forecast: ${F.months} months${F.growth ? `, traffic ${F.growth > 0 ? "+" : ""}${nf(F.growth, 1)}% a month` : ""}`,
        full: true,
        h: TITLE + 14 + 4 + 52,
        draw: (x, y, w) => {
          const stats: [string, string, RGB?][] = [
            [`Revenue (${F.months} mo)`, m(F.revenue)],
            [`Profit (${F.months} mo)`, m(F.profit), signed(F.profit)],
            [`MRR at month ${F.months}`, m(F.mrr)],
            [`Active subscriptions at month ${F.months}`, people(F.activeSubs)],
            ["Cash break-even", F.breakEven ? `Month ${F.breakEven}` : "Not within range"],
          ];
          const sw = (w - 4 * 3) / 5;
          stats.forEach(([l, v, c], i) => {
            const sx = x + i * (sw + 3);
            fill(C.soft);
            doc.roundedRect(sx, y, sw, 14, 2, 2, "F");
            font(7);
            ink(C.muted);
            doc.text(fit(l, sw - 5), sx + 3, y + 5);
            font(11, true);
            ink(c ?? C.ink);
            doc.text(fit(v, sw - 5), sx + 3, y + 11);
          });
          const cy = y + 18,
            chW = (w - 8) / 2;
          lineChart(x, cy, chW, 52, "Revenue and costs per month", [
            { name: "Revenue", c: C.emerald, v: F.rows.map((r) => r.revenue) },
            { name: "Costs", c: C.orange, v: F.rows.map((r) => r.costs), dash: true },
          ]);
          lineChart(x + chW + 8, cy, chW, 52, "Cumulative profit", [{ name: "Cumulative profit", c: C.emerald, v: F.rows.map((r) => r.cumulative), area: true }]);
        },
      });

    // --- executive summary: the year at today's rates and the biggest leak
    const O = D.overview;
    sections.push({
      title: "Executive summary",
      full: true,
      h: TITLE + 14 + (O.keyLeak ? 10 : 0),
      draw: (x, y, w) => {
        const stats: [string, string, RGB?][] = [
          ["Traffic per year", nf(O.year.people)],
          ["Leads per year", nf(O.year.leads)],
          ["Customers per year", nf(O.year.customers)],
          ["Revenue per year", ms(O.year.revenue)],
          ["Profit per year", ms(O.year.profit), signed(O.year.profit)],
          ["ROI", pct(R.roi)],
        ];
        const sw = (w - 5 * 3) / 6;
        stats.forEach(([l, v, c], i) => {
          const sx = x + i * (sw + 3);
          fill(C.soft);
          doc.roundedRect(sx, y, sw, 14, 2, 2, "F");
          font(7);
          ink(C.muted);
          doc.text(fit(l, sw - 5), sx + 3, y + 5);
          font(11, true);
          ink(c ?? C.ink);
          doc.text(fit(v, sw - 5), sx + 3, y + 11);
        });
        if (O.keyLeak) {
          const L = O.keyLeak;
          fill(C.orange);
          doc.rect(x, y + 17, 0.8, 7, "F");
          font(8.5, true);
          ink(C.ink);
          doc.text(fit(`Key leak: ${L.name}`, w - 4), x + 3, y + 20);
          font(7.5);
          ink(C.muted);
          doc.text(fit(`${people(L.lost)} of ${people(L.inn)} people (${pct(L.dropPct)}) don't move on each month. Converting 10% better here adds about ${m(L.revenueGain)} revenue and ${m(L.profitGain)} profit a month.`, w - 4), x + 3, y + 24);
        }
      },
    });

    // --- scenario comparison
    if (D.scenarios.length > 1) {
      const cols = D.scenarios.slice(0, 9);
      const metrics: [string, (r: FunnelResult) => Cell][] = [
        ["Traffic", (r) => nf(r.traffic)],
        ["Leads", (r) => people(r.leads)],
        ["Customers", (r) => people(r.cust)],
        ["Revenue", (r) => m(r.rev)],
        ["Ad spend", (r) => m(r.spend)],
        ["Total costs", (r) => m(r.costs)],
        ["Profit", (r) => ({ t: m(r.profit), c: signed(r.profit), b: true })],
        ["ROAS", (r) => ratio(r.roas)],
        ["CPA", (r) => m(r.cpa)],
        ["CPL", (r) => m(r.cpl)],
        ["AOV", (r) => m(r.aov)],
        ["MRR", (r) => m(r.mrr)],
      ];
      const base = cols[0].R;
      const delta = (r: FunnelResult) => (base.profit ? (r.profit - base.profit) / Math.abs(base.profit) : NaN);
      const rows: Cell[][] = metrics.map(([l, f]) => [{ t: l, b: true }, ...cols.map((c) => f(c.R))]);
      rows.push([{ t: "Profit vs as mapped", b: true }, "–", ...cols.slice(1).map((c) => ({ t: Number.isFinite(delta(c.R)) ? `${delta(c.R) >= 0 ? "+" : ""}${pct(delta(c.R))}` : "–", c: signed(c.R.profit - base.profit) }))]);
      tableSection("Scenario comparison", [{ h: "", w: 1.3, a: "left" }, ...cols.map((c) => ({ h: c.name, w: 1 }))], rows, {
        full: cols.length > 4,
        note: `Scenarios scale traffic, conversion, prices and ad cost on top of the mapped funnel.${D.scenarios.length > 9 ? ` First ${cols.length - 1} scenarios shown.` : ""}`,
      });
    }

    // --- forecast table
    if (F.rows.length)
      tableSection(
        "Month by month",
        [{ h: "Month", w: 0.7, a: "left" }, { h: "Traffic", w: 1 }, { h: "Revenue", w: 1.2 }, { h: "Costs", w: 1.2 }, { h: "Profit", w: 1.2 }, { h: "Cumulative", w: 1.2 }, { h: "MRR", w: 1 }],
        F.rows.map((r) => [String(r.month), nf(r.traffic), m(r.revenue), m(r.costs), { t: m(r.profit), c: signed(r.profit) }, { t: m(r.cumulative), c: signed(r.cumulative) }, m(r.mrr)]),
      );

    if (F.rows.length) sections.push(forecastSection());

    // --- actual vs plan by month (the editor's Month-to-month chart; same monthlyPlanVsActual rows)
    const AV = nums ? (info.actualVsPlan ?? []).slice(-12) : [];
    if (AV.length) {
      const mon = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
      const vs = (plan: number, act: number, spend = false): Cell => (plan ? { t: `${act >= plan ? "+" : ""}${nf((act / plan - 1) * 100, 1)}%`, c: (spend ? act <= plan : act >= plan) ? C.good : C.bad } : "–");
      sections.push({
        title: "Actual vs plan by month",
        full: true,
        h: TITLE + 54 + 4 + tableH(AV.length) + 6,
        draw: (x, y, w) => {
          const cw = (w - 8) / 2;
          const xl = { labels: AV.map((r) => mon(r.month)), axis: "Month" };
          lineChart(x, y, cw, 50, "Revenue", [{ name: "Actual", c: C.emerald, v: AV.map((r) => r.actRev) }, { name: "Plan", c: C.muted, v: AV.map((r) => r.planRev), dash: true }], xl);
          lineChart(x + cw + 8, y, cw, 50, "Ad spend", [{ name: "Actual", c: C.emerald, v: AV.map((r) => r.actSpend) }, { name: "Plan", c: C.muted, v: AV.map((r) => r.planSpend), dash: true }], xl);
          const th = table(
            x,
            y + 54,
            w,
            [{ h: "Month", w: 1, a: "left" }, { h: "Days", w: 0.6 }, { h: "Plan revenue", w: 1.2 }, { h: "Actual revenue", w: 1.2 }, { h: "vs plan", w: 0.9 }, { h: "Plan ad spend", w: 1.2 }, { h: "Actual ad spend", w: 1.2 }, { h: "vs plan", w: 0.9 }],
            AV.map((r): Cell[] => [mon(r.month), nf(r.days), m(r.planRev), m(r.actRev), vs(r.planRev, r.actRev), m(r.planSpend), m(r.actSpend), vs(r.planSpend, r.actSpend, true)]),
          );
          font(7.5);
          ink(C.muted);
          doc.text(fit("Plan is the funnel's monthly numbers scaled to the days entered. Ad spend above plan shows red.", w), x + 1, y + 54 + th + 4);
        },
      });
    }

    // --- traffic sources
    if (D.sources.length)
      tableSection(
        "Traffic source performance",
        [{ h: "Source", w: 2, a: "left" }, { h: "Visitors", w: 1 }, { h: "Customers", w: 1 }, { h: "Revenue", w: 1.1 }, { h: "Ad spend", w: 1.1 }, { h: "CPA", w: 1 }, { h: "ROAS", w: 0.8 }],
        [
          ...D.sources.map((s): Cell[] => [s.name, nf(s.traffic), people(s.cust), m(s.rev), s.spend ? m(s.spend) : "free", m(s.cpa), ratio(s.roas)]),
          ...(D.sources.length > 1 ? [["All sources", nf(R.traffic), people(R.cust), m(R.rev), m(R.spend), m(R.cpa), ratio(R.roas)] as Cell[]] : []),
        ],
        { total: D.sources.length > 1 },
      );

    // --- offers / products
    if (D.offers.length)
      sections.push({
        title: "Offer & product revenue",
        h: TITLE + tableH(D.offers.length + 1),
        draw: (x, y, w) => {
          table(
            x,
            y,
            w,
            [{ h: "Offer", w: 2, a: "left" }, { h: "Type", w: 1.3, a: "left" }, { h: "Buyers", w: 0.8 }, { h: "Revenue", w: 1.1 }, { h: "Share", w: 1.3 }],
            [...D.offers.map((o): Cell[] => [o.name, o.label, people(o.buyers), m(o.revenue), pct(o.share)]), ["Total", "", people(R.orders), m(R.rev), R.rev ? "100%" : "–"]],
            { total: true },
          );
          // share bars in the Share column
          const sum = 2 + 1.3 + 0.8 + 1.1 + 1.3,
            bx = x + (w * (sum - 1.3)) / sum + 1,
            bw = (w * 1.3) / sum - 14;
          D.offers.forEach((o, i) => {
            fill(C.soft);
            doc.rect(bx, y + HEAD + i * ROW + 1.4, bw, 2, "F");
            fill(C.emerald);
            doc.rect(bx, y + HEAD + i * ROW + 1.4, bw * Math.max(0, Math.min(1, o.share)), 2, "F");
          });
        },
      });

    // --- expenses
    const E = D.expenses;
    sections.push({
      title: "Expenses (per month)",
      h: TITLE + (E.lines.length + 1) * 5.4 + 2 + (E.oneTime ? 5 : 0) + (E.items.length ? 4 + tableH(E.items.length) : 0),
      draw: (x, y, w) => {
        const lw = w * 0.36,
          vw = w * 0.22,
          bw = w - lw - vw - 4;
        let yy = y;
        E.lines.forEach(([l, v]) => {
          font(8);
          ink(C.ink);
          doc.text(l, x + 1, yy + 4);
          fill(C.soft);
          doc.rect(x + lw, yy + 1.6, bw, 2.4, "F");
          fill(C.orange);
          doc.rect(x + lw, yy + 1.6, bw * (E.total > 0 ? Math.max(0, Math.min(1, v / E.total)) : 0), 2.4, "F");
          doc.text(m(v), x + w - 1, yy + 4, { align: "right" });
          yy += 5.4;
        });
        doc.setDrawColor(...C.line);
        doc.line(x, yy + 0.5, x + w, yy + 0.5);
        font(8.5, true);
        doc.text("Total costs", x + 1, yy + 4.6);
        doc.text(m(E.total), x + w - 1, yy + 4.6, { align: "right" });
        yy += 7.4;
        if (E.oneTime) {
          font(7.5);
          ink(C.muted);
          doc.text(pdfText(`Plus one-time (launch) costs of ${m(E.oneTime)}, counted in month 1 of the forecast.`), x + 1, yy + 3);
          yy += 5;
        }
        if (E.items.length) {
          yy += 4;
          table(x, yy, w, [{ h: "Expense", w: 2, a: "left" }, { h: "Category", w: 1.3, a: "left" }, { h: "How often", w: 1.1, a: "left" }, { h: "Amount", w: 1 }, { h: "Per month", w: 1 }], E.items.map((e) => [e.name, e.category, e.kind, m(e.amount), e.perPeriod ? m(e.perPeriod) : "–"]));
        }
      },
    });

    // --- goals / required numbers
    const G = D.goals;
    if (G.plan || G.blocks.length) {
      const goalH = G.blocks.length ? 4 + tableH(G.blocks.length) : 0;
      sections.push({
        title: "Goals & required numbers",
        h: TITLE + (G.plan ? 11 + tableH(G.required.length) : 0) + goalH,
        draw: (x, y, w) => {
          let yy = y;
          if (G.plan) {
            font(8.5, true);
            ink(C.ink);
            doc.text(pdfText(`Revenue target: ${m(G.target)} per month`), x + 1, yy + 3.5);
            font(7.5);
            ink(C.muted);
            doc.text(pdfText(`Currently planned: ${m(R.rev)} per month (${pct(R.rev / G.target)} of target). Needed at today's conversion rates and costs:`), x + 1, yy + 8);
            yy += 11;
            yy += table(x, yy, w, [{ h: "Period", w: 1.1, a: "left" }, { h: "Revenue", w: 1.2 }, { h: "Visitors", w: 1.1 }, { h: "Ad spend", w: 1.2 }, { h: "Customers", w: 1.1 }], G.required.map(([p, rev, vis, spend, cust]) => [{ t: p, b: true }, m(rev), nf(vis), m(spend), people(cust)]));
          }
          if (G.blocks.length) {
            yy += 4;
            table(x, yy, w, [{ h: "Goal", w: 3, a: "left" }, { h: "People reaching it (per month)", w: 2 }], G.blocks.map((b) => [b.name, people(b.people)]));
          }
        },
      });
    }

    // --- named goals: required numbers per period (traffic-scaled) or a step's conversion target
    for (const gr of G.items) {
      const g = gr.goal;
      const isMoney = g.kind === "revenue" || g.kind === "profit";
      const fv = (v: number) => (isMoney ? m(v) : g.kind === "conversion" ? `${nf(v, 1)}%` : people(v));
      const title = `Goal: ${g.name || gr.label}`;
      const status = `${gr.label}: ${fv(gr.current)} now, target ${fv(g.value)} (${pct(gr.progress)}).`;
      if (g.kind === "conversion") {
        sections.push({
          title,
          h: TITLE + 11,
          draw: (x, y, w) => {
            font(8);
            ink(C.ink);
            doc.text(fit(status, w), x + 1, y + 3.5);
            font(7.5);
            ink(C.muted);
            doc.text(fit(gr.impact ? `At the target rate: revenue ${m(gr.impact.rev)} and profit ${m(gr.impact.profit)} per month.` : "Pick a step and a target rate.", w), x + 1, y + 8);
          },
        });
      } else if (gr.required.length) {
        tableSection(
          title,
          [{ h: "Period", w: 1, a: "left" }, { h: "Revenue", w: 1.1 }, { h: "Profit", w: 1.1 }, { h: "Traffic", w: 1 }, { h: "Traffic cost", w: 1.1 }, { h: "Leads", w: 0.9 }, { h: "Customers", w: 1 }],
          gr.required.map(([p, rev, profit, vis, spend, leads, cust]) => [{ t: p, b: true }, m(rev), { t: m(profit), c: signed(profit) }, nf(vis), m(spend), people(leads), people(cust)]),
          { note: `${status} Needs ${nf(gr.plan?.multiplier ?? NaN, 2)}x today's traffic at today's rates.` },
        );
      }
    }

    // --- MRR forecast (subscriptions)
    if (F.rows.some((r) => r.mrr > 0))
      tableSection(
        "MRR forecast",
        [{ h: "Month", w: 0.6, a: "left" }, { h: "New cust.", w: 0.9 }, { h: "Active subs", w: 0.9 }, { h: "MRR", w: 1 }, { h: "Revenue", w: 1 }, { h: "Cum. revenue", w: 1.1 }, { h: "Traffic cost", w: 1 }, { h: "Expenses", w: 1 }, { h: "Profit", w: 1 }],
        F.rows.map((r) => [String(r.month), people(r.newCustomers), people(r.activeSubs), m(r.mrr), m(r.revenue), m(r.cumulativeRevenue), m(r.adSpend), m(r.expenses + r.followUp + r.delivery), { t: m(r.profit), c: signed(r.profit) }]),
        { full: true, note: "Subscriptions renew monthly with churn of 1 / average stay. Expenses include follow-up, delivery and fixed costs." },
      );

    // --- traffic reinvestment
    const RV = D.reinvest;
    if (RV.hasPaid && RV.pct > 0)
      tableSection(
        `Traffic reinvestment: ${nf(RV.pct)}% of profit back into ads`,
        [{ h: "Month", w: 0.6, a: "left" }, { h: "Ad budget", w: 1 }, { h: "Reinvested", w: 1 }, { h: "Traffic", w: 1 }, { h: "Revenue", w: 1.1 }, { h: "Profit", w: 1.1 }, { h: "Cumulative", w: 1.1 }],
        [
          ...RV.rows.map((r): Cell[] => [String(r.month), m(r.adSpend), r.reinvested ? m(r.reinvested) : "–", nf(r.traffic), m(r.revenue), { t: m(r.profit), c: signed(r.profit) }, { t: m(r.cumulative), c: signed(r.cumulative) }]),
          [`${RV.months} months`, m(RV.rows.reduce((a, r) => a + r.adSpend, 0)), m(RV.total.reinvested), nf(RV.total.traffic), m(RV.total.revenue), { t: m(RV.total.profit), c: signed(RV.total.profit) }, ""],
        ],
        { full: true, total: true, note: `Without reinvestment: revenue ${m(RV.plainTotal.revenue)}, profit ${m(RV.plainTotal.profit)} over the same ${RV.months} months.` },
      );

    // --- published / completion status
    const ST = D.status;
    if (ST.total && ST.steps.some((x) => x.status !== "planned"))
      tableSection(
        `Build status: ${pct(ST.pct)} live (${ST.done} of ${ST.total} steps)`,
        [{ h: "Step", w: 2, a: "left" }, { h: "Type", w: 1.4, a: "left" }, { h: "Status", w: 1, a: "left" }],
        [...ST.steps].sort((a, b) => (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0)).map((x) => [x.name, x.label, { t: x.status === "done" ? "Live / done" : x.status === "building" ? "In progress" : "Planned", b: x.status !== "done" }]),
      );

    // --- full funnel data when the cover page could not fit every step
    if (overflow > 0) tableSection("Funnel data", stepCols, steps.map(stepCells), { full: true });

    /* line chart: series over months, nice y ticks, legend */
    function lineChart(x: number, y: number, w: number, h: number, title: string, series: { name: string; c: RGB; v: number[]; dash?: boolean; area?: boolean }[], xl?: { labels: string[]; axis: string }) {
      font(8, true);
      ink(C.ink);
      doc.text(title, x, y + 3);
      // legend
      let lx = x + w;
      font(7);
      [...series].reverse().forEach((s) => {
        const tw = doc.getTextWidth(s.name);
        lx -= tw;
        ink(C.muted);
        doc.text(s.name, lx, y + 3);
        lx -= 5;
        doc.setDrawColor(...s.c);
        doc.setLineWidth(0.6);
        if (s.dash) doc.setLineDashPattern([1, 0.8], 0);
        doc.line(lx, y + 2, lx + 3.5, y + 2);
        doc.setLineDashPattern([], 0);
        lx -= 4;
      });
      const all = series.flatMap((s) => s.v).filter(Number.isFinite);
      let lo = Math.min(0, ...all),
        hi = Math.max(0, ...all);
      if (hi === lo) hi = lo + 1;
      const raw = (hi - lo) / 4,
        mag = Math.pow(10, Math.floor(Math.log10(raw))),
        step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw) ?? raw;
      lo = Math.floor(lo / step) * step;
      hi = Math.ceil(hi / step) * step;
      const px = x + 16,
        py = y + 7,
        pw = w - 18,
        ph = h - 14;
      const Y = (v: number) => py + ph - ((v - lo) / (hi - lo)) * ph;
      const n = series[0]?.v.length ?? 0;
      const X = (i: number) => (n <= 1 ? px + pw / 2 : px + (i / (n - 1)) * pw);
      font(6.5);
      ink(C.muted);
      doc.setLineWidth(0.2);
      for (let v = lo; v <= hi + step / 2; v += step) {
        doc.setDrawColor(...(Math.abs(v) < step / 1e6 ? C.muted : C.line));
        doc.line(px, Y(v), px + pw, Y(v));
        doc.text(Math.abs(v) < step / 1e6 ? ms(0).replace(/\.00$/, "") : ms(v), px - 1.5, Y(v) + 1, { align: "right" });
      }
      const every = Math.max(1, Math.ceil(n / 12));
      for (let i = 0; i < n; i++) if (i % every === 0 || i === n - 1) doc.text(xl?.labels[i] ?? String(i + 1), X(i), py + ph + 4, { align: "center" });
      doc.text(xl?.axis ?? "Month", px + pw, py + ph + 7.5, { align: "right" });
      series.forEach((s) => {
        const pts = s.v.map((v, i) => [X(i), Y(Number.isFinite(v) ? v : 0)] as [number, number]);
        if (!pts.length) return;
        if (s.area && pts.length > 1) {
          const z = Y(Math.max(lo, Math.min(hi, 0)));
          doc.setGState(doc.GState({ opacity: 0.14 }));
          fill(s.c);
          const segs: [number, number][] = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
          doc.lines([[0, pts[0][1] - z], ...segs, [0, z - pts[pts.length - 1][1]]], pts[0][0], z, [1, 1], "F", true);
          doc.setGState(doc.GState({ opacity: 1 }));
        }
        doc.setDrawColor(...s.c);
        doc.setLineWidth(0.6);
        if (s.dash) doc.setLineDashPattern([1.6, 1.2], 0);
        for (let i = 1; i < pts.length; i++) doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
        doc.setLineDashPattern([], 0);
        if (pts.length === 1) {
          fill(s.c);
          doc.circle(pts[0][0], pts[0][1], 0.8, "F");
        }
      });
    }

    /* place the sections: two columns, full-width sections span both, new pages as needed */
    const pageHead = () => {
      doc.addPage();
      fill(C.chrome);
      doc.rect(0, 0, W, 14, "F");
      fill(C.emerald);
      doc.rect(0, 14, W, 0.6, "F");
      font(11, true);
      ink(C.chromeInk);
      doc.text(fit(info.funnelName, W / 2), M, 9);
      font(8);
      ink(C.chromeMuted);
      doc.text(fit(`${info.agencyName ? `${info.agencyName} · ` : ""}Prepared for ${info.clientName} · ${dateStr}`, W / 2 - M - 6), W - M, 9, { align: "right" });
    };
    const head = (t: string, x: number, y: number, w: number) => {
      font(10, true);
      ink(C.ink);
      doc.text(fit(t, w), x, y + 4.5);
      fill(C.emerald);
      doc.rect(x, y + 6, 10, 0.6, "F");
    };
    let ys = [TOP, TOP];
    const omitted = new Set(info.omit ?? []);
    const chosen = sections.filter((s) => !PDF_SECTIONS.some((o) => omitted.has(o.key) && o.match.test(s.title)));
    if (chosen.length) pageHead();
    for (const s of chosen) {
      if (s.full) {
        let y = Math.max(...ys);
        if (y + s.h > BOTTOM && y > TOP) {
          pageHead();
          y = TOP;
        }
        head(s.title, M, y, W - 2 * M);
        s.draw(M, y + TITLE, W - 2 * M);
        ys = [y + s.h + 7, y + s.h + 7];
      } else {
        let c = ys[0] <= ys[1] ? 0 : 1;
        if (ys[c] + s.h > BOTTOM) {
          if (ys[1 - c] + s.h <= BOTTOM) c = 1 - c;
          else {
            pageHead();
            ys = [TOP, TOP];
            c = 0;
          }
        }
        const x = M + c * (COLW + GAP);
        head(s.title, x, ys[c], COLW);
        s.draw(x, ys[c] + TITLE, COLW);
        ys[c] += s.h + 7;
      }
    }
  }

  // footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    font(7.5);
    ink(C.muted);
    doc.text("Planned figures are estimates based on the assumptions in this funnel map.", M, H - 5);
    ink(C.brand);
    doc.text(pdfText(`${info.agencyName ? `${info.agencyName} · ` : ""}Page ${p} of ${pages}`), W - M, H - 5, { align: "right" });
  }
  return doc.output("blob");
}
