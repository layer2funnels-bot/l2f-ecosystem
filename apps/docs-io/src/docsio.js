// Word (.docx) export and import for the Docs editor. Bundled at build time (scripts/build-docs-io.mjs) into apps/web/docs-io/docsio.js and
// loaded only when someone opens or downloads a Word file. docx (MIT) writes the file from the document model; mammoth (BSD-2-Clause) reads one
// into HTML that the editor then passes through its own allow-list (the HTML is never inserted as markup).
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, ImageRun, ExternalHyperlink, PageBreak, BorderStyle, ShadingType, LevelFormat, Header, Footer, PageNumber, FootnoteReferenceRun, PageOrientation } from 'docx';
import mammoth from 'mammoth';
import { FONTS, PAGES, marginsOf } from '../../web/js/modules/docmodel.js';

const mm = (v) => Math.round((v / 25.4) * 1440);
const ALIGN = { c: AlignmentType.CENTER, r: AlignmentType.RIGHT, j: AlignmentType.JUSTIFIED, l: AlignmentType.LEFT };
const BULLETS = ['•', '◦', '▪'];

/** content: { page, blocks } from the model (tab titles/contents already expanded); images: { fileId: { data, type, w, h } } */
export async function buildDocx(content, images = {}) {
  const notes = {}; let noteN = 0; const olRefs = [];
  const runOpts = (r) => ({
    bold: r.b, italics: r.i, underline: r.u ? {} : undefined, strike: r.s, superScript: r.sup, subScript: r.sub,
    font: r.cd ? 'Courier New' : r.f ? FONTS[r.f]?.docx : undefined, size: r.z ? Math.round(r.z * 2) : undefined, color: r.a ? '1D4ED8' : r.c ? r.c.slice(1) : undefined,
    shading: r.hl ? { type: ShadingType.CLEAR, fill: r.hl.slice(1), color: 'auto' } : r.cd ? { type: ShadingType.CLEAR, fill: 'F1F1EE', color: 'auto' } : undefined,
  });
  const textRuns = (r) => {
    if (r.fn) { noteN += 1; notes[noteN] = { children: [new Paragraph({ children: [new TextRun({ text: r.fn, size: 20 })] })] }; return [new FootnoteReferenceRun(noteN)]; }
    const o = runOpts(r); const parts = r.x.split('\n');
    const out = parts.map((t, i) => new TextRun({ ...o, text: t, break: i ? 1 : undefined, underline: r.a ? {} : o.underline }));
    return r.a ? [new ExternalHyperlink({ link: r.a, children: out })] : out;
  };
  const runs = (rs) => rs.flatMap(textRuns);
  const spacing = (b) => ({ line: b.ls ? Math.round(b.ls * 240) : undefined, before: b.sb ? Math.round(b.sb * 20) : undefined, after: b.sa ? Math.round(b.sa * 20) : 120 });
  const base = (b) => ({ alignment: b.al ? ALIGN[b.al] : undefined, spacing: spacing(b), indent: b.ind ? { left: b.ind * 720 } : undefined });
  const para = (b) => {
    const c = runs(b.c);
    switch (b.t) {
      case 'title': return new Paragraph({ ...base(b), heading: HeadingLevel.TITLE, children: c });
      case 'subtitle': return new Paragraph({ ...base(b), children: c.length ? runs(b.c.map((r) => ({ ...r, c: r.c ?? '555555', z: r.z ?? 14 }))) : [] });
      case 'h1': return new Paragraph({ ...base(b), heading: HeadingLevel.HEADING_1, children: c });
      case 'h2': return new Paragraph({ ...base(b), heading: HeadingLevel.HEADING_2, children: c });
      case 'h3': return new Paragraph({ ...base(b), heading: HeadingLevel.HEADING_3, children: c });
      case 'quote': return new Paragraph({ ...base(b), indent: { left: 720 + (b.ind ?? 0) * 720 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: '999999', space: 8 } }, children: c });
      case 'code': return new Paragraph({ ...base(b), shading: { type: ShadingType.CLEAR, fill: 'F3F3F1', color: 'auto' }, children: runs(b.c.map((r) => ({ ...r, f: 'courier' }))) });
      default: return new Paragraph({ ...base(b), children: c });
    }
  };
  const out = [];
  content.blocks.forEach((b, bi) => {
    if (b.t === 'hr') out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'AAAAAA', space: 1 } }, children: [] }));
    else if (b.t === 'pb') out.push(new Paragraph({ children: [new PageBreak()] }));
    else if (b.t === 'list') {
      const ref = `ol${bi}`; let usedOl = false;
      for (const it of b.items) {
        if (it.k === 'cl') out.push(new Paragraph({ spacing: { after: 60 }, indent: { left: 360 * (it.lv + 1) + 360, hanging: 360 }, children: [new TextRun({ text: it.ck ? '☑ ' : '☐ ' }), ...runs(it.c)] }));
        else if (it.k === 'ol') { usedOl = true; out.push(new Paragraph({ spacing: { after: 60 }, numbering: { reference: ref, level: Math.min(it.lv, 8) }, children: runs(it.c) })); }
        else out.push(new Paragraph({ spacing: { after: 60 }, numbering: { reference: 'ul', level: Math.min(it.lv, 8) }, children: runs(it.c) }));
      }
      if (usedOl) olRefs.push(ref);
    } else if (b.t === 'table') {
      out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: b.rows.map((r, ri) => new TableRow({ tableHeader: Boolean(b.hdr && ri === 0), children: r.map((c) => new TableCell({
        shading: b.hdr && ri === 0 ? { type: ShadingType.CLEAR, fill: 'EFEFEC', color: 'auto' } : undefined,
        children: [new Paragraph({ alignment: c.al ? ALIGN[c.al] : undefined, children: runs(b.hdr && ri === 0 ? c.c.map((x) => ({ ...x, b: 1 })) : c.c) })] })) })) }));
      out.push(new Paragraph({ children: [] }));
    } else if (b.t === 'img') {
      const im = images[b.f]; if (!im) { out.push(new Paragraph({ children: [new TextRun({ text: `[Picture${b.alt ? `: ${b.alt}` : ''}]`, italics: true })] })); return; }
      const w = Math.min(b.w ?? Math.min(im.w, 480), 620); const hh = Math.round((w * im.h) / im.w);
      out.push(new Paragraph({ alignment: b.al ? ALIGN[b.al] : undefined, children: [new ImageRun({ type: im.type, data: im.data, transformation: { width: w, height: hh }, altText: { title: b.alt || 'Picture', description: b.alt || 'Picture', name: 'Picture' } })] }));
    } else out.push(para(b));
  });
  const pg = content.page; const sz = PAGES[pg.size]; const [mt, mr, mb, ml] = marginsOf(pg);
  const pnAlign = { l: AlignmentType.LEFT, c: AlignmentType.CENTER, r: AlignmentType.RIGHT }[pg.pn];
  const footerChildren = () => {
    const items = [];
    if (pg.ftr) items.push(new Paragraph({ alignment: pg.pn === 'l' ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: pg.ftr, size: 18, color: '555555' })] }));
    if (pg.pn) items.push(new Paragraph({ alignment: pnAlign, children: [new TextRun({ children: ['Page ', PageNumber.CURRENT], size: 18, color: '555555' })] }));
    return items;
  };
  const props = { page: { size: { width: mm(sz.w), height: mm(sz.h), orientation: pg.orient === 'l' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT }, margin: { top: mm(mt), right: mm(mr), bottom: mm(mb), left: mm(ml) } }, ...(pg.first ? { titlePage: true } : {}) };
  const headers = pg.hdr ? { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: pg.hdr, size: 18, color: '555555' })] })] }), ...(pg.first ? { first: new Header({ children: [new Paragraph({ children: [] })] }) } : {}) } : undefined;
  const footers = pg.ftr || pg.pn ? { default: new Footer({ children: footerChildren() }), ...(pg.first ? { first: new Footer({ children: [new Paragraph({ children: [] })] }) } : {}) } : undefined;
  const lvl = (level, fmt, text) => ({ level, format: fmt, text, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 + level * 360, hanging: 360 } } } });
  const doc = new Document({
    creator: 'Layer2Funnels Docs', footnotes: notes,
    styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
    numbering: { config: [
      { reference: 'ul', levels: Array.from({ length: 9 }, (_, i) => lvl(i, LevelFormat.BULLET, BULLETS[i % 3])) },
      ...[...new Set(olRefs)].map((reference) => ({ reference, levels: Array.from({ length: 9 }, (_, i) => lvl(i, [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][i % 3], `%${i + 1}.`)) })),
    ] },
    sections: [{ properties: props, headers, footers, children: out.length ? out : [new Paragraph({ children: [] })] }],
  });
  return Packer.toBlob(doc);
}

/** A Word file as HTML text (pictures inlined as data addresses); the editor converts it to blocks. */
export async function importDocx(arrayBuffer) {
  const r = await mammoth.convertToHtml({ arrayBuffer }, {
    styleMap: ['u => u', 'strike => s', "p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh"],
    convertImage: mammoth.images.imgElement(async (img) => ({ src: `data:${img.contentType};base64,${await img.read('base64')}`, alt: img.altText ?? '' })),
  });
  return r.value;
}
export { buildOdt, buildRtf, buildEpub, buildHtmlZip } from './formats.js';
