// More download formats, written from the document model: OpenDocument text (.odt), Rich Text (.rtf), EPUB (.epub) and a zipped web page with its pictures.
// ODT, EPUB and the zip use fflate (MIT). Content is { page, blocks } as produced by contentOf(); images is { fileId: { data, type, w, h } }.
import { zipSync, strToU8 } from 'fflate';
import { FONTS, PAGES, marginsOf, pageSize, toHtml } from '../../web/js/modules/docmodel.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const extOf = (t) => (t === 'jpg' ? 'jpg' : t);
const mimeOf = (t) => ({ png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[t] ?? 'image/png');
const fontOf = (k) => FONTS[k]?.docx;
const walkRuns = (blocks, f) => { for (const b of blocks) { if (b.c) f(b.c); if (b.items) b.items.forEach((i) => f(i.c)); if (b.rows) b.rows.forEach((r) => r.forEach((c) => f(c.c))); } };

// ---------------------------------------------------------------- ODT
export function buildOdt(content, images = {}, title = 'Document') {
  const { page, blocks } = content; const styles = new Map(); let sn = 0; const extra = [];
  const style = (xml) => { if (!styles.has(xml)) styles.set(xml, `T${(sn += 1)}`); return styles.get(xml); };
  const props = (r) => {
    const a = [];
    if (r.b) a.push('fo:font-weight="bold"'); if (r.i) a.push('fo:font-style="italic"'); if (r.u) a.push('style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"');
    if (r.s) a.push('style:text-line-through-style="solid"'); if (r.sup) a.push('style:text-position="super 58%"'); else if (r.sub) a.push('style:text-position="sub 58%"');
    const fam = r.cd ? 'Courier New' : fontOf(r.f); if (fam) a.push(`fo:font-family="${esc(fam)}"`); if (r.z) a.push(`fo:font-size="${r.z}pt"`); if (r.c) a.push(`fo:color="${r.c}"`); if (r.hl) a.push(`fo:background-color="${r.hl}"`);
    return a.join(' ');
  };
  let note = 0;
  const run = (r) => {
    if (r.fn) { note += 1; return `<text:note text:id="ftn${note}" text:note-class="footnote"><text:note-citation>${note}</text:note-citation><text:note-body><text:p>${esc(r.fn)}</text:p></text:note-body></text:note>`; }
    const body = r.x.split('\n').map((t) => esc(t).replace(/\t/g, '<text:tab/>').replace(/ {2,}/g, (m) => ` <text:s text:c="${m.length - 1}"/>`)).join('<text:line-break/>');
    const p = props(r); let x = p ? `<text:span text:style-name="${style(`<style:style style:name="@" style:family="text"><style:text-properties ${p}/></style:style>`)}">${body}</text:span>` : body;
    if (r.a) x = `<text:a xlink:type="simple" xlink:href="${esc(r.a)}">${x}</text:a>`;
    return x;
  };
  const runs = (rs) => rs.map(run).join('');
  let pn = 0; const pstyles = new Map();
  const pstyle = (b, parent, more = '') => {
    const pp = []; if (b.al) pp.push(`fo:text-align="${{ c: 'center', r: 'end', j: 'justify' }[b.al]}"`); if (b.ls) pp.push(`fo:line-height="${Math.round(b.ls * 100)}%"`); if (b.sb) pp.push(`fo:margin-top="${b.sb}pt"`); if (b.sa) pp.push(`fo:margin-bottom="${b.sa}pt"`); if (b.ind) pp.push(`fo:margin-left="${b.ind * 0.5}in"`); if (b.dir === 'rtl') pp.push('style:writing-mode="rl-tb"');
    const all = `${pp.join(' ')} ${more}`.trim(); if (!all) return parent;
    const xml = `<style:style style:name="@" style:family="paragraph" style:parent-style-name="${parent}"><style:paragraph-properties ${all}/></style:style>`;
    if (!pstyles.has(xml)) pstyles.set(xml, `P${(pn += 1)}`); return pstyles.get(xml);
  };
  const pics = []; let imgN = 0;
  const lists = (items) => {
    let out = ''; const stack = []; let open = false;
    const close = (to) => { while (stack.length > to) { out += '</text:list-item></text:list>'; stack.pop(); } };
    for (const it of items) {
      if (stack.length > it.lv + 1) close(it.lv + 1);
      if (stack.length === it.lv + 1) out += '</text:list-item><text:list-item>';
      while (stack.length < it.lv + 1) { out += `<text:list text:style-name="${it.k === 'ol' ? 'LN' : 'LB'}"><text:list-item>`; if (stack.length < it.lv) out += ''; stack.push(1); }
      out += `<text:p text:style-name="Standard">${it.k === 'cl' ? (it.ck ? '☑ ' : '☐ ') : ''}${runs(it.c)}</text:p>`; open = true;
    }
    void open; close(0); return out;
  };
  const body = blocks.map((b) => {
    switch (b.t) {
      case 'title': return `<text:p text:style-name="${pstyle(b, 'Title')}">${runs(b.c)}</text:p>`;
      case 'subtitle': return `<text:p text:style-name="${pstyle(b, 'Subtitle')}">${runs(b.c)}</text:p>`;
      case 'h1': case 'h2': case 'h3': return `<text:h text:style-name="${pstyle(b, `Heading_20_${b.t[1]}`)}" text:outline-level="${b.t[1]}">${runs(b.c)}</text:h>`;
      case 'quote': return `<text:p text:style-name="${pstyle(b, 'Quotations')}">${runs(b.c)}</text:p>`;
      case 'code': return `<text:p text:style-name="${pstyle(b, 'Preformatted_20_Text')}">${runs(b.c)}</text:p>`;
      case 'hr': return `<text:p text:style-name="${pstyle({}, 'Horizontal_20_Line')}"/>`;
      case 'pb': return `<text:p text:style-name="${pstyle({}, 'Standard', 'fo:break-before="page"')}"/>`;
      case 'list': return lists(b.items);
      case 'table': { const n = b.rows[0].length; return `<table:table table:name="Table${(imgN += 1)}" table:style-name="Tbl"><table:table-column table:number-columns-repeated="${n}"/>${b.rows.map((r, ri) => `<table:table-row>${r.map((c) => `<table:table-cell table:style-name="Cell" office:value-type="string"><text:p text:style-name="${b.hdr && ri === 0 ? 'Table_20_Heading' : 'Table_20_Contents'}">${runs(c.c)}</text:p></table:table-cell>`).join('')}</table:table-row>`).join('')}</table:table>`; }
      case 'img': {
        const im = images[b.f]; if (!im) return `<text:p text:style-name="Standard">[Picture${b.alt ? `: ${esc(b.alt)}` : ''}]</text:p>`;
        const w = Math.min(b.w ?? Math.min(im.w, 480), 620); const hh = Math.round((w * im.h) / im.w); const name = `Pictures/${b.f}.${extOf(im.type)}`; pics.push([name, im]);
        return `<text:p text:style-name="${pstyle({ al: b.al }, 'Standard')}"><draw:frame draw:name="Picture ${pics.length}" text:anchor-type="as-char" svg:width="${(w * 0.0264583).toFixed(2)}cm" svg:height="${(hh * 0.0264583).toFixed(2)}cm"><draw:image xlink:href="${name}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/><svg:title>${esc(b.alt ?? '')}</svg:title></draw:frame></text:p>`;
      }
      default: return `<text:p text:style-name="${pstyle(b, 'Standard')}">${runs(b.c)}</text:p>`;
    }
  }).join('');
  const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"';
  const levels = (bullet) => Array.from({ length: 9 }, (_, i) => (bullet ? `<text:list-level-style-bullet text:level="${i + 1}" text:bullet-char="${['•', '◦', '▪'][i % 3]}"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:margin-left="${(i + 1) * 0.5}in" fo:text-indent="-0.25in"/></style:list-level-properties></text:list-level-style-bullet>`
    : `<text:list-level-style-number text:level="${i + 1}" style:num-suffix="." style:num-format="${['1', 'a', 'i'][i % 3]}"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:margin-left="${(i + 1) * 0.5}in" fo:text-indent="-0.25in"/></style:list-level-properties></text:list-level-style-number>`)).join('');
  const auto = [...styles].map(([xml, n]) => xml.replace('"@"', `"${n}"`)).join('') + [...pstyles].map(([xml, n]) => xml.replace('"@"', `"${n}"`)).join('')
    + `<text:list-style style:name="LB">${levels(true)}</text:list-style><text:list-style style:name="LN">${levels(false)}</text:list-style>`
    + '<style:style style:name="Tbl" style:family="table"><style:table-properties style:width="17cm" table:align="margins"/></style:style><style:style style:name="Cell" style:family="table-cell"><style:table-cell-properties fo:padding="0.1cm" fo:border="0.5pt solid #999999"/></style:style>';
  const content_xml = `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${NS} office:version="1.2"><office:automatic-styles>${auto}</office:automatic-styles><office:body><office:text>${body || '<text:p/>'}</office:text></office:body></office:document-content>`;
  const sz = pageSize(page); const [mt, mr, mb, ml] = marginsOf(page);
  const hf = (tag, inner) => (inner ? `<style:${tag}><text:p text:style-name="Standard">${inner}</text:p></style:${tag}>` : '');
  const pnx = page.pn ? `<text:page-number text:select-page="current"/>` : '';
  const footer = hf('footer', `${page.ftr ? esc(page.ftr) : ''}${page.ftr && pnx ? ' · Page ' : pnx ? 'Page ' : ''}${pnx}`);
  const st = (name, parent, p, t) => `<style:style style:name="${name}" style:family="paragraph" ${parent ? `style:parent-style-name="${parent}"` : ''} style:class="text">${p ? `<style:paragraph-properties ${p}/>` : ''}${t ? `<style:text-properties ${t}/>` : ''}</style:style>`;
  const styles_xml = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${NS} office:version="1.2"><office:styles>
<style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.15cm"/><style:text-properties fo:font-size="11pt" fo:font-family="Arial"/></style:default-style>
${st('Standard', '', '', '')}${st('Title', 'Standard', 'fo:margin-bottom="0.3cm"', 'fo:font-size="26pt" fo:font-weight="bold"')}${st('Subtitle', 'Standard', '', 'fo:font-size="14pt" fo:color="#555555"')}
${[1, 2, 3].map((n) => st(`Heading_20_${n}`, 'Standard', 'fo:margin-top="0.4cm" fo:margin-bottom="0.2cm" fo:keep-with-next="always"', `fo:font-size="${[20, 15, 12.5][n - 1]}pt" fo:font-weight="bold"`)).join('')}
${st('Quotations', 'Standard', 'fo:margin-left="0.8cm" fo:border-left="1.5pt solid #999999" fo:padding-left="0.3cm"', 'fo:color="#444444"')}${st('Preformatted_20_Text', 'Standard', 'fo:background-color="#f3f3f1"', 'fo:font-family="Courier New" fo:font-size="10pt"')}
${st('Horizontal_20_Line', 'Standard', 'fo:border-bottom="0.5pt solid #aaaaaa"', '')}${st('Table_20_Contents', 'Standard', 'fo:margin-bottom="0cm"', '')}${st('Table_20_Heading', 'Table_20_Contents', '', 'fo:font-weight="bold"')}
</office:styles><office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="${sz.w}mm" fo:page-height="${sz.h}mm" style:print-orientation="${page.orient === 'l' ? 'landscape' : 'portrait'}" fo:margin-top="${mt}mm" fo:margin-right="${mr}mm" fo:margin-bottom="${mb}mm" fo:margin-left="${ml}mm"/></style:page-layout></office:automatic-styles>
<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1">${hf('header', page.hdr ? esc(page.hdr) : '')}${footer}${page.first ? '<style:header-first><text:p text:style-name="Standard"/></style:header-first><style:footer-first><text:p text:style-name="Standard"/></style:footer-first>' : ''}</style:master-page></office:master-styles></office:document-styles>`;
  const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>${[...new Set(pics.map((p) => p[0]))].map((n) => `<manifest:file-entry manifest:full-path="${n}" manifest:media-type="${mimeOf(n.split('.').pop())}"/>`).join('')}</manifest:manifest>`;
  const files = { mimetype: [strToU8('application/vnd.oasis.opendocument.text'), { level: 0 }], 'META-INF/manifest.xml': strToU8(manifest), 'content.xml': strToU8(content_xml), 'styles.xml': strToU8(styles_xml),
    'meta.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><office:document-meta ${NS} office:version="1.2"><office:meta><dc:title>${esc(title)}</dc:title><meta:generator>Layer2Funnels Docs</meta:generator></office:meta></office:document-meta>`) };
  for (const [n, im] of pics) files[n] = [im.data, { level: 0 }];
  return new Blob([zipSync(files)], { type: 'application/vnd.oasis.opendocument.text' });
}

// ---------------------------------------------------------------- RTF
export function buildRtf(content, images = {}) {
  const { page, blocks } = content; const fonts = ['Arial']; const colours = []; const fi = (n) => { let i = fonts.indexOf(n); if (i < 0) { fonts.push(n); i = fonts.length - 1; } return i; };
  const ci = (hex) => { let i = colours.indexOf(hex); if (i < 0) { colours.push(hex); i = colours.length - 1; } return i + 1; };
  const txt = (s) => { let o = ''; for (const ch of s) { const c = ch.codePointAt(0); if (ch === '\\' || ch === '{' || ch === '}') o += `\\${ch}`; else if (ch === '\n') o += '\\line '; else if (ch === '\t') o += '\\tab '; else if (c > 126) { const u = c > 0xffff ? [0xd800 + ((c - 0x10000) >> 10), 0xdc00 + ((c - 0x10000) & 0x3ff)] : [c]; for (const x of u) o += `\\u${x > 32767 ? x - 65536 : x}?`; } else o += ch; } return o; };
  const run = (r) => {
    if (r.fn) return `{\\super\\chftn}{\\footnote\\pard\\plain{\\super\\chftn} ${txt(r.fn)}}`;
    const m = []; if (r.b) m.push('\\b'); if (r.i) m.push('\\i'); if (r.u) m.push('\\ul'); if (r.s) m.push('\\strike'); if (r.sup) m.push('\\super'); else if (r.sub) m.push('\\sub');
    const fam = r.cd ? 'Courier New' : fontOf(r.f); if (fam) m.push(`\\f${fi(fam)}`); if (r.z) m.push(`\\fs${Math.round(r.z * 2)}`); if (r.c) m.push(`\\cf${ci(r.c)}`); if (r.hl) m.push(`\\highlight${ci(r.hl)}`);
    const body = txt(r.x); const g = m.length ? `{${m.join('')} ${body}}` : body; return r.a ? `{\\field{\\*\\fldinst HYPERLINK "${r.a}"}{\\fldrslt{\\ul\\cf${ci('#1d4ed8')} ${body}}}}` : g;
  };
  const runs = (rs) => rs.map(run).join('');
  const para = (b, pre = '') => `\\pard${b.dir === 'rtl' ? '\\rtlpar' : ''}${b.al ? `\\q${b.al === 'j' ? 'j' : b.al}` : ''}${b.sb ? `\\sb${b.sb * 20}` : ''}\\sa${b.sa ? b.sa * 20 : 120}${b.ls ? `\\sl${Math.round(b.ls * 240)}\\slmult1` : ''}${b.ind ? `\\li${b.ind * 720}` : ''} ${pre}`;
  const hex = (d) => Array.from(d, (x) => x.toString(16).padStart(2, '0')).join('');
  const out = blocks.map((b) => {
    switch (b.t) {
      case 'title': return `${para(b)}{\\b\\fs52 ${runs(b.c)}}\\par`;
      case 'subtitle': return `${para(b)}{\\fs28\\cf${ci('#555555')} ${runs(b.c)}}\\par`;
      case 'h1': case 'h2': case 'h3': return `${para(b)}{\\b\\fs${[40, 30, 25][b.t[1] - 1]} ${runs(b.c)}}\\par`;
      case 'quote': return `${para(b)}\\li720{\\i ${runs(b.c)}}\\par`;
      case 'code': return `${para(b)}{\\f${fi('Courier New')}\\fs20 ${runs(b.c)}}\\par`;
      case 'hr': return '\\pard\\brdrb\\brdrs\\brdrw10\\brsp1 \\par';
      case 'pb': return '\\page ';
      case 'list': { const cnt = []; return b.items.map((it) => { cnt.length = it.lv + 1; cnt[it.lv] = (cnt[it.lv] ?? 0) + 1; const lab = it.k === 'ol' ? `${cnt[it.lv]}.` : it.k === 'cl' ? (it.ck ? '\\u9745?' : '\\u9744?') : '\\u8226?'; return `\\pard\\li${360 * (it.lv + 1) + 360}\\fi-360\\sa60 ${lab}\\tab ${runs(it.c)}\\par`; }).join('\n'); }
      case 'table': { const n = b.rows[0].length; const w = Math.round(((pageSize(page).w - marginsOf(page)[1] - marginsOf(page)[3]) / n) * 56.69);
        return `${b.rows.map((r, ri) => `\\trowd\\trgaph108${r.map((_, i) => `\\clbrdrt\\brdrs\\brdrw10\\clbrdrl\\brdrs\\brdrw10\\clbrdrb\\brdrs\\brdrw10\\clbrdrr\\brdrs\\brdrw10${b.hdr && ri === 0 ? '\\clcbpat' + ci('#efefec') : ''}\\cellx${w * (i + 1)}`).join('')}\n${r.map((c) => `\\pard\\intbl ${b.hdr && ri === 0 ? '{\\b ' : ''}${runs(c.c)}${b.hdr && ri === 0 ? '}' : ''}\\cell`).join('')}\\row`).join('\n')}\n\\pard \\par`; }
      case 'img': { const im = images[b.f]; if (!im || !['png', 'jpg'].includes(im.type)) return `\\pard [Picture${b.alt ? `: ${txt(b.alt)}` : ''}]\\par`; const w = Math.min(b.w ?? Math.min(im.w, 480), 620); const hh = Math.round((w * im.h) / im.w);
        return `\\pard${b.al === 'c' ? '\\qc' : b.al === 'r' ? '\\qr' : ''} {\\pict\\${im.type === 'png' ? 'pngblip' : 'jpegblip'}\\picw${im.w}\\pich${im.h}\\picwgoal${w * 15}\\pichgoal${hh * 15} ${hex(im.data)}}\\par`; }
      default: return `${para(b)}${runs(b.c)}\\par`;
    }
  }).join('\n');
  const sz = pageSize(page); const [mt, mr, mb, ml] = marginsOf(page); const tw = (v) => Math.round(v * 56.69);
  const hdr = page.hdr ? `{\\header\\pard\\qc\\fs18 ${txt(page.hdr)}\\par}` : ''; const ftr = page.ftr || page.pn ? `{\\footer\\pard${page.pn === 'c' ? '\\qc' : page.pn === 'r' ? '\\qr' : ''}\\fs18 ${page.ftr ? txt(page.ftr) + (page.pn ? '  ·  ' : '') : ''}${page.pn ? 'Page {\\field{\\*\\fldinst PAGE}{\\fldrslt 1}}' : ''}\\par}` : '';
  const head = `{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl${fonts.map((f, i) => `{\\f${i}\\fnil ${f};}`).join('')}}{\\colortbl;${colours.map((c) => `\\red${parseInt(c.slice(1, 3), 16)}\\green${parseInt(c.slice(3, 5), 16)}\\blue${parseInt(c.slice(5, 7), 16)};`).join('')}}`;
  return `${head}\\paperw${tw(sz.w)}\\paperh${tw(sz.h)}${page.orient === 'l' ? '\\landscape' : ''}\\margt${tw(mt)}\\margr${tw(mr)}\\margb${tw(mb)}\\margl${tw(ml)}${page.first ? '\\titlepg' : ''}\\fs22\n${hdr}${ftr}\n${out}\n}`;
}

// ---------------------------------------------------------------- web page zip, EPUB
const pathOf = (f, im) => `images/${f}.${extOf(im.type)}`;
const xhtml = (s) => s.replace(/<br>/g, '<br/>').replace(/<hr>/g, '<hr/>').replace(/<img([^>]*?)>/g, '<img$1/>');
export function buildHtmlZip(doc, tab, images, title) {
  const map = {}; const files = {}; for (const [f, im] of Object.entries(images)) { map[f] = pathOf(f, im); files[map[f]] = [im.data, { level: 0 }]; }
  files['index.html'] = strToU8(toHtml(doc, { tab, title, images: map })); return new Blob([zipSync(files)], { type: 'application/zip' });
}
/** doc is the model; chapters: [{ id, title, depth }] in reading order; each tab becomes one chapter. */
export function buildEpub(doc, chapters, images, title, lang = 'en') {
  const files = { mimetype: [strToU8('application/epub+zip'), { level: 0 }], 'META-INF/container.xml': strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>') };
  const map = {}; const manifest = []; for (const [f, im] of Object.entries(images)) { map[f] = pathOf(f, im); files[`OEBPS/${map[f]}`] = [im.data, { level: 0 }]; manifest.push(`<item id="img-${f}" href="${map[f]}" media-type="${mimeOf(im.type)}"/>`); }
  const css = 'body{font-family:serif;line-height:1.5}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px}pre{white-space:pre-wrap}blockquote{border-left:3px solid #999;margin-left:0;padding-left:1em}';
  files['OEBPS/style.css'] = strToU8(css);
  chapters.forEach((c, i) => {
    const full = toHtml(doc, { tab: c.id, title: c.title, images: map }); const inner = /<body>([\s\S]*)<\/body>/.exec(full)?.[1] ?? '';
    files[`OEBPS/ch${i + 1}.xhtml`] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}"><head><meta charset="utf-8"/><title>${esc(c.title)}</title><link rel="stylesheet" href="style.css"/></head><body><h1>${esc(c.title)}</h1>${xhtml(inner)}</body></html>`);
  });
  files['OEBPS/nav.xhtml'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><h1>Contents</h1><ol>${chapters.map((c, i) => `<li><a href="ch${i + 1}.xhtml">${esc(c.title)}</a></li>`).join('')}</ol></nav></body></html>`);
  const opf = `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:${crypto.randomUUID()}</dc:identifier><dc:title>${esc(title)}</dc:title><dc:language>${lang}</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>${chapters.map((_, i) => `<item id="ch${i + 1}" href="ch${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('')}${manifest.join('')}</manifest><spine>${chapters.map((_, i) => `<itemref idref="ch${i + 1}"/>`).join('')}</spine></package>`;
  files['OEBPS/content.opf'] = strToU8(opf);
  return new Blob([zipSync(files)], { type: 'application/epub+zip' });
}
export { walkRuns, PAGES };
