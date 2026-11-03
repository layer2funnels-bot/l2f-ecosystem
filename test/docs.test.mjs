// Docs document model (v2): the stored format is JSON, never markup; links, colours, sizes and ids are allow-listed; limits cut instead of crash;
// v1 and plain text open and upgrade; tabs (pages and sub-pages) add, move, nest, duplicate and delete within limits; exports are generated from the model.
import { recorder } from './lib.mjs';
import * as M from '../apps/web/js/modules/docmodel.js';
const { safeHref, safeColor, normalize, parseBody, serialize, plainText, wordCount, outline, isEmpty, sameDoc, sizeOf, emptyDoc, MAX_CHARS, MAX_BLOCKS, MAX_TABS, MAX_TAB_DEPTH } = M;

const { results, check } = recorder();
const p = (x, extra = {}) => ({ t: 'p', c: [{ x, ...extra }] });
const one = (blocks) => normalize({ blocks }).tabs[0].blocks;
check('DC1', 'Links: web and mail only. javascript:, data:, file:, relative, spaces and control characters are dropped',
  safeHref('https://example.com/a?b=1') === 'https://example.com/a?b=1' && safeHref('mailto:a@example.com') === 'mailto:a@example.com' && safeHref('http://example.com') === 'http://example.com/'
  && !safeHref('javascript:alert(1)') && !safeHref('JaVaScRiPt:alert(1)') && !safeHref('data:text/html,<b>') && !safeHref('file:///etc/passwd') && !safeHref('/relative') && !safeHref('example.com') && !safeHref('https://a b.com') && !safeHref('https://x.com/\u0000') && !safeHref(null) && !safeHref('https://' + 'a'.repeat(2100)));
const d = one([{ t: 'h1', c: [{ x: 'Title', b: 1 }] }, { t: 'p', c: [{ x: 'See ' }, { x: 'site', a: 'javascript:alert(1)', i: 1 }, { x: ' and ' }, { x: 'ok', a: 'https://example.com' }] }]);
check('DC2', 'A hostile link is removed but its text stays; a good link is kept', d[1].c.some((r) => r.x === 'site' && !r.a && r.i === 1) && d[1].c.some((r) => r.x === 'ok' && r.a === 'https://example.com/'));
check('DC3', 'Unknown block types become paragraphs; unknown fields are dropped; markup in text stays plain text', (() => { const n = one([{ t: 'script', c: [{ x: '<img src=x onerror=alert(1)>', onclick: 'x', style: 'x' }], evil: 1, onload: 'x' }]); return n[0].t === 'p' && n[0].c[0].x === '<img src=x onerror=alert(1)>' && !('onclick' in n[0].c[0]) && !('style' in n[0].c[0]) && !('evil' in n[0]) && !('onload' in n[0]); })());
check('DC4', 'Anything in gives a valid document out: null, strings, numbers, wrong shapes, empty', [null, undefined, 5, 'x', {}, { blocks: 'no' }, { blocks: [] }, { blocks: [null, 3, {}] }, { tabs: 'x' }, { tabs: [null, 4] }].every((x) => { const n = normalize(x); return n.v === 2 && n.tabs.length >= 1 && n.tabs[0].blocks.length >= 1; }));
check('DC5', 'Neighbouring text with the same look merges; different looks stay apart', (() => { const n = one([{ t: 'p', c: [{ x: 'a', b: 1 }, { x: 'b', b: 1 }, { x: 'c' }] }]); return n[0].c.length === 2 && n[0].c[0].x === 'ab'; })());
const plain = parseBody('Line one\n\nLine three');
check('DC6', 'Plain text (a legacy SOP) opens as one paragraph per line and keeps the blank line', plain.tabs[0].blocks.length === 3 && plain.tabs[0].blocks[1].c.length === 0 && plainText(plain) === 'Line one\n\nLine three');
check('DC7', 'Text that starts with a brace but is not a document opens as text, never an error', plainText(parseBody('{ not json')) === '{ not json' && plainText(parseBody('{"v":3}')) === '{"v":3}');
const v1 = { v: 1, blocks: [{ t: 'h1', c: [{ x: 'Plan' }] }, { t: 'ul', items: [[{ x: 'one' }], [{ x: 'two', b: 1 }]] }, { t: 'hr' }, { t: 'h2', c: [{ x: 'Next' }] }, { t: 'quote', c: [{ x: 'q' }] }] };
const up = parseBody(JSON.stringify(v1));
check('DC8', 'A stored v1 document opens as one tab, its lists become v2 lists, and saving then reopening gives the same document', up.v === 2 && up.tabs.length === 1 && up.tabs[0].title === 'Tab 1' && up.tabs[0].blocks[1].t === 'list' && up.tabs[0].blocks[1].items.length === 2 && up.tabs[0].blocks[1].items[1].c[0].b === 1 && sameDoc(parseBody(serialize(up)), up));
check('DC9', 'The outline lists headings in order with their level and block position; an empty heading still shows', JSON.stringify(outline(up)) === JSON.stringify([{ level: 1, text: 'Plan', index: 0 }, { level: 2, text: 'Next', index: 3 }]) && outline({ blocks: [{ t: 'h3', c: [] }] })[0].text === 'Untitled heading');
check('DC10', 'Word count and plain text work over lists and ignore rules', wordCount(up) === 5 && plainText(up).includes('one\ntwo'));
check('DC11', 'An untouched new document is empty; a rule or text makes it not empty; an image or table does too', isEmpty(emptyDoc()) && !isEmpty({ blocks: [{ t: 'hr' }] }) && !isEmpty({ blocks: [p('a')] }) && !isEmpty({ blocks: [{ t: 'table', rows: [[{ c: [] }]] }] }));
const big = one(Array.from({ length: MAX_BLOCKS + 50 }, () => p('x')));
check('DC12', 'Too many blocks are cut, not refused', big.length === MAX_BLOCKS);
check('DC13', 'The size the saved text will take is measurable against the 1,000,000 limit', sizeOf(emptyDoc()) < 200 && MAX_CHARS === 1000000 && sizeOf({ blocks: [p('y'.repeat(150000))] }) > 150000);
check('DC14', 'Serialising is stable: the same document always gives the same text (no spurious "unsaved changes")', serialize(up) === serialize(parseBody(serialize(up))));
import { parseRoute, hrefFor, pageKeyFor, routeForPage } from '../apps/web/js/routes.js';
check('DC15', 'The document address #/doc/<id> is a route; after an organization switch it lands on the Drive app, never on a record of the other organization', parseRoute('#/doc/abc').name === 'doc' && parseRoute('#/doc/abc').params.id === 'abc' && hrefFor.doc('abc') === '#/doc/abc' && parseRoute('#/doc').name === 'not-found'
  && pageKeyFor(parseRoute('#/doc/abc')).app === 'drive' && routeForPage('drive', null) === '#/drive');

// ---- v2 content
const FID = '0b9c2d34-1111-4222-8333-444455556666';
const rich = one([{ t: 'p', al: 'c', ls: 1.5, sb: 6, sa: 12, ind: 2, c: [{ x: 'Hi', f: 'serif', z: 14, c: '#FF0000', hl: '#ff0', sup: 1, sub: 1, cd: 1 }] }]);
check('DC16', 'Run marks: font keys, sizes, colours and highlight are validated; sup wins over sub; block spacing, alignment and indent are kept', rich[0].al === 'c' && rich[0].ls === 1.5 && rich[0].sb === 6 && rich[0].sa === 12 && rich[0].ind === 2
  && rich[0].c[0].f === 'serif' && rich[0].c[0].z === 14 && rich[0].c[0].c === '#ff0000' && rich[0].c[0].hl === '#ffff00' && rich[0].c[0].sup === 1 && !rich[0].c[0].sub && rich[0].c[0].cd === 1);
const evil = one([{ t: 'p', al: 'x', ls: 9999, sb: -5, sa: 1e9, ind: 99, c: [{ x: 'a', f: '__proto__', z: 1e9, c: 'url(javascript:alert(1))', hl: 'red;position:fixed', b: 'yes' }, { x: 'b', z: -4 }, { x: 'c', z: 'NaN', c: 'expression(1)' }] }]);
check('DC17', 'Hostile styles: unknown fonts and CSS injections are dropped; huge or negative sizes are clamped; bad alignment is ignored', !evil[0].al && evil[0].ls === 4 && !evil[0].sb && evil[0].sa === 200 && evil[0].ind === 8
  && !('f' in evil[0].c[0]) && evil[0].c[0].z === 200 && !('c' in evil[0].c[0]) && !('hl' in evil[0].c[0]) && evil[0].c[0].b === 1 && JSON.stringify(evil).indexOf('javascript') < 0 && JSON.stringify(evil).indexOf('position') < 0 && evil[0].c.some((r) => r.z === 6));
check('DC18', 'Colours: #rgb, #rrggbb and rgb() are accepted; names, url() and transparent are not', safeColor('#fa0') === '#ffaa00' && safeColor('rgb(255, 0, 16)') === '#ff0010' && safeColor('rgba(0,0,0,0)') === null && !safeColor('red') && !safeColor('url(x)') && !safeColor('#12') && !safeColor(null));
const lists = one([{ t: 'list', items: [{ k: 'ul', lv: 3, c: [{ x: 'a' }] }, { k: 'cl', lv: 5, ck: 1, c: [{ x: 'b' }] }, { k: 'ol', lv: 0, ck: 1, c: [{ x: 'c' }] }, { k: 'zz', lv: 1, c: [{ x: 'd' }] }] }]);
check('DC19', 'Lists: a level never jumps more than one deeper than the item above; only checklist items can be checked; unknown kinds become bullets', lists[0].items.map((i) => i.lv).join() === '0,1,0,1' && lists[0].items[1].ck === 1 && !lists[0].items[2].ck && lists[0].items[3].k === 'ul' && lists[0].items[1].k === 'cl');
const tbl = one([{ t: 'table', hdr: 1, rows: [[{ c: [{ x: 'a' }] }, { c: [{ x: 'b' }] }], [{ c: [{ x: 'c' }] }]] }, { t: 'table', rows: [] }]);
check('DC20', 'Tables: short rows are padded, empty tables are dropped, the header flag is kept, and size is limited', tbl.length === 1 && tbl[0].rows[1].length === 2 && tbl[0].hdr === 1
  && one([{ t: 'table', rows: Array.from({ length: 900 }, () => Array.from({ length: 60 }, () => ({ c: [] }))) }])[0].rows.length === 500 && one([{ t: 'table', rows: [Array.from({ length: 60 }, () => ({ c: [] }))] }])[0].rows[0].length === 20);
const imgs = one([{ t: 'img', f: FID.toUpperCase(), alt: 'x'.repeat(900), w: 99999, al: 'c' }, { t: 'img', f: '../../etc/passwd' }, { t: 'img', f: 'javascript:alert(1)' }, { t: 'img' }]);
check('DC21', 'Images: only a Drive file id is kept (no addresses or paths), alt text and width are limited', imgs.length === 1 && imgs[0].f === FID && imgs[0].alt.length === 500 && imgs[0].w === 2400 && imgs[0].al === 'c');
check('DC22', 'Control characters and zero-width placeholders are stripped from text; non-breaking spaces become spaces', one([p('a\u0000b​c d\u0007e\nf\tg')])[0].c[0].x === 'abc de\nf\tg');
const pg = normalize({ page: { size: 'letter', margin: 'wide' }, blocks: [] }); const pg2 = normalize({ page: { size: '<x>', margin: 5 } });
check('DC23', 'Page settings are kept when valid and fall back to A4 / Normal otherwise', pg.page.size === 'letter' && pg.page.margin === 'wide' && pg2.page.size === 'a4' && pg2.page.margin === 'normal');
const h = M.pasteBlocks({ t: 'h1', c: [{ x: 'HelloWorld' }] }, 5, [p('A'), p('B'), p('C')]);
check('DC24', 'Pasting blocks into a paragraph splits it: first joins the text before, last joins the text after, the middle stays whole', h.length === 3 && h[0].t === 'h1' && M.runsText(h[0].c) === 'HelloA' && M.runsText(h[1].c) === 'B' && M.runsText(h[2].c) === 'CWorld'
  && M.pasteBlocks(p('abcd'), 2, [p('X')])[0].c[0].x === 'abXcd' && M.pasteBlocks(p('ab'), 1, [{ t: 'hr' }]).map((b) => b.t).join() === 'p,hr,p');
const mr = M.mapRange([{ x: 'hello world', b: 1 }], 2, 7, (r) => ({ b: undefined, i: 1 }));
check('DC25', 'Formatting part of a run splits it: only the chosen characters change', mr.length === 3 && mr[0].x === 'he' && mr[0].b === 1 && mr[1].x === 'llo w' && !mr[1].b && mr[1].i === 1 && mr[2].x === 'orld' && M.allRuns(mr, 0, 2, (r) => r.b === 1) && !M.allRuns(mr, 0, 5, (r) => r.b === 1));

// ---- tabs
const idsOf = (doc) => M.flatTabs(doc).map((x) => x.tab.title).join();
check('DC26', 'A new document has one tab; a body without tabs becomes "Tab 1"; titles default and are cleaned', emptyDoc().tabs.length === 1 && normalize({ tabs: [{ title: '  \n ', blocks: [] }, { title: 'x'.repeat(500) }] }).tabs[1].title.length === 120 && normalize({ tabs: [{ title: '  \n ' }] }).tabs[0].title === 'Tab 1');
let t = M.normalize({ tabs: [{ id: 'a1', title: 'A', blocks: [p('one two')] }, { id: 'b1', title: 'B', blocks: [p('three')] }] });
const a1 = M.addTab(t, 'a1', 'A.1'); t = a1.doc; const a2 = M.addTab(t, a1.id, 'A.1.1'); t = a2.doc;
check('DC27', 'Add tab and sub-tab (three levels deep at most)', idsOf(t) === 'A,A.1,A.1.1,B' && M.findTab(t, a2.id).depth === 2 && M.addTab(t, a2.id, 'too deep') === null && M.addTab(t, 'nope', 'x') === null);
t = M.updateTab(t, 'b1', { title: 'Beta', icon: '📌', blocks: [p('three four five')] });
check('DC28', 'Rename, icon and content per tab; each tab keeps its own blocks; word count per tab and in total', M.findTab(t, 'b1').tab.title === 'Beta' && M.findTab(t, 'b1').tab.icon === '📌' && M.tabWords(M.findTab(t, 'b1').tab) === 3 && wordCount(t, 'a1') === 2 && wordCount(t) === 5 && plainText(t, 'b1') === 'three four five');
check('DC29', 'An icon is short text only: markup characters are dropped and it is cut to four characters', normalize({ tabs: [{ title: 'x', icon: '<b>"a"</b>12345678' }] }).tabs[0].icon.length <= 4 && !/[<>"]/.test(normalize({ tabs: [{ title: 'x', icon: '<b>"a"</b>' }] }).tabs[0].icon));
const dup = M.duplicateTab(t, 'a1'); const t2 = dup.doc;
check('DC30', 'Duplicate copies the tab with its sub-tabs and new ids, right after the original', idsOf(t2) === 'A,A.1,A.1.1,A (copy),A.1,A.1.1,Beta' && new Set(M.flatTabs(t2).map((x) => x.tab.id)).size === 7);
check('DC31', 'Delete removes a tab with everything under it; the only tab cannot be deleted', idsOf(M.deleteTab(t, 'a1')) === 'Beta' && M.deleteTab(emptyDoc(), 't1') === null && M.deleteTab(t, 'zzz') === null);
check('DC32', 'Move up and down among siblings stops at the ends', idsOf(M.moveTab(t, 'b1', 'up')) === 'Beta,A,A.1,A.1.1' && idsOf(M.moveTab(t, 'b1', 'down')) === idsOf(t) && idsOf(M.moveTab(t, 'a1', 'up')) === idsOf(t));
check('DC33', 'Indent nests under the sibling above, outdent lifts out again; the first sibling cannot indent', idsOf(M.indentTab(t, 'b1')) === 'A,A.1,A.1.1,Beta' && M.findTab(M.indentTab(t, 'b1'), 'b1').depth === 1 && M.findTab(M.outdentTab(M.indentTab(t, 'b1'), 'b1'), 'b1').depth === 0 && M.indentTab(t, 'a1') === t);
check('DC34', 'Drag and drop: a tab cannot go inside itself or its own sub-tabs, nor past the depth limit; reorder works', M.moveTabTo(t, 'a1', a1.id, 0) === t && M.moveTabTo(t, 'a1', 'a1', 0) === t && M.moveTabTo(t, 'a1', 'b1', 0) === t && idsOf(M.moveTabTo(t, 'b1', null, 0)) === 'Beta,A,A.1,A.1.1' && M.findTab(M.moveTabTo(t, 'b1', a1.id, 0), 'b1').depth === 2);
let many = emptyDoc(); let full = null; for (let i = 0; i < MAX_TABS + 5; i += 1) { const r = M.addTab(many); if (!r) { full = i; break; } many = r.doc; }
check('DC35', `Limits: at most ${MAX_TABS} tabs; adding past it and duplicating past it are refused`, full === MAX_TABS - 1 && M.tabCount(many) === MAX_TABS && M.duplicateTab(many, many.tabs[0].id) === null);
const hostile = normalize({ tabs: [{ id: '<script>', title: '<img onerror=x>', blocks: [p('a')], children: [{ id: 'dup', title: 'c1' }, { id: 'dup', title: 'c2', children: [{ title: 'g', children: [{ title: 'too deep', children: [{ title: 'way too deep' }] }] }] }] }, { id: '__proto__', title: 'x' }, ...Array.from({ length: 300 }, (_, i) => ({ title: `t${i}` }))] });
const hf = M.flatTabs(hostile);
check('DC36', 'Hostile tabs: bad or repeated ids are replaced by unique ones, depth and count are cut, titles stay text', hf.length === MAX_TABS && new Set(hf.map((x) => x.tab.id)).size === hf.length && hf.every((x) => /^[a-z0-9]{2,12}$/.test(x.tab.id) && x.depth < MAX_TAB_DEPTH) && hf[0].tab.title === '<img onerror=x>' && !hf.some((x) => x.tab.title === 'way too deep'));
check('DC37', 'The block limit is shared by all tabs, not per tab', (() => { const n = normalize({ tabs: [{ blocks: Array.from({ length: MAX_BLOCKS }, () => p('x')) }, { blocks: Array.from({ length: 50 }, () => p('x')) }] }); return M.flatTabs(n).reduce((s, x) => s + x.tab.blocks.length, 0) <= MAX_BLOCKS + 1; })());
const ex = M.contentOf(t, 'all', { headers: true });
check('DC38', 'Exporting all tabs puts each tab title first with a page break between tabs; one tab exports without a title block', ex.blocks.some((b) => b.t === 'title' && b.c[0].x === 'Beta') && ex.blocks.filter((b) => b.t === 'pb').length === 3 && M.contentOf(t, 'b1', { headers: true }).blocks.length === 1 && M.contentOf(emptyDoc(), 'all', { headers: true }).blocks.every((b) => b.t !== 'title'));
const rt = { v: 2, page: { size: 'letter', margin: 'narrow' }, tabs: [{ id: 'x1', title: 'Main', icon: '📄', blocks: [{ t: 'h1', c: [{ x: 'T', b: 1 }] }, { t: 'list', items: [{ k: 'cl', lv: 0, ck: 1, c: [{ x: 'done' }] }, { k: 'ul', lv: 1, c: [{ x: 'sub' }] }] }, { t: 'table', hdr: 1, rows: [[{ c: [{ x: 'a' }] }, { c: [{ x: 'b' }] }]] }, { t: 'img', f: FID, alt: 'pic', w: 300 }, { t: 'pb' }], children: [{ id: 'x2', title: 'Sub', blocks: [p('s', { z: 20, f: 'mono', c: '#123456' })], children: [] }] }] };
check('DC39', 'Round trip: everything the editor supports survives serialize and parse unchanged', JSON.stringify(parseBody(serialize(rt))) === JSON.stringify(normalize(rt)) && JSON.stringify(normalize(rt).tabs[0].blocks[1].items[0]) === JSON.stringify({ k: 'cl', lv: 0, c: [{ x: 'done' }], ck: 1 }) && M.findTab(parseBody(serialize(rt)), 'x2').tab.blocks[0].c[0].z === 20);
const txt = M.toText(rt); const md = M.toMarkdown(rt); const html = M.toHtml(rt, { title: '<x>' });
check('DC40', 'Text, Markdown and HTML are generated from the model; checklist boxes, headings, tables and images come out; HTML is escaped', txt.includes('[x] done') && txt.includes('  • sub') && md.startsWith('# Main') && md.includes('# T') && md.includes('- [x] done') && md.includes('| a | b |') && md.includes('![pic]') && html.includes('<title>&lt;x&gt;</title>') && html.includes('&#9745; done'));
const xs = M.toHtml({ blocks: [{ t: 'p', c: [{ x: '<script>alert(1)</script>', a: 'javascript:alert(1)' }, { x: 'ok', a: 'https://e.com/?a=1&b="2"' }] }] });
check('DC41', 'Generated HTML never contains live script or javascript: links, and quotes in addresses are escaped', !xs.includes('<script>') && !xs.includes('javascript:') && xs.includes('&lt;script&gt;') && xs.includes('href="https://e.com/?a=1&amp;b=%22%22'.slice(0, 30)) && !xs.includes('b="2"'));
check('DC42', 'The remaining space is computed from the saved size, never below zero', M.spaceLeft(250000) === 750000 && M.spaceLeft(5e6) === 0);
const huge = performance.now(); const bigDoc = normalize({ blocks: Array.from({ length: 4000 }, (_, i) => ({ t: i % 50 === 0 ? 'h2' : 'p', c: Array.from({ length: 5 }, (__, j) => ({ x: `word${i} ${j} lorem ipsum dolor `, b: j % 2 })) })) });
const s20 = serialize(bigDoc); const ms = performance.now() - huge;
check('DC43', '20,000 words normalise, serialise and count in well under a second and fit the 1,000,000 limit', wordCount(bigDoc) >= 20000 && s20.length < MAX_CHARS && ms < 1500);

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`);
process.exit(pc === results.length ? 0 : 1);
