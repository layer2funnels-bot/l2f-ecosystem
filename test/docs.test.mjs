// Docs document model: the stored format is JSON, never markup; links are filtered; limits cut instead of crash; plain text opens as paragraphs.
import { recorder } from './lib.mjs';
import { safeHref, normalize, parseBody, serialize, plainText, wordCount, outline, isEmpty, sameDoc, sizeOf, emptyDoc, MAX_CHARS, MAX_BLOCKS } from '../apps/web/js/modules/docmodel.js';

const { results, check } = recorder();
check('DC1', 'Links: web and mail only. javascript:, data:, file:, relative, spaces and control characters are dropped',
  safeHref('https://example.com/a?b=1') === 'https://example.com/a?b=1' && safeHref('mailto:a@example.com') === 'mailto:a@example.com' && safeHref('http://example.com') === 'http://example.com/'
  && !safeHref('javascript:alert(1)') && !safeHref('JaVaScRiPt:alert(1)') && !safeHref('data:text/html,<b>') && !safeHref('file:///etc/passwd') && !safeHref('/relative') && !safeHref('example.com') && !safeHref('https://a b.com') && !safeHref('https://x.com/\u0000') && !safeHref(null) && !safeHref('https://' + 'a'.repeat(2100)));
const d = normalize({ blocks: [{ t: 'h1', c: [{ x: 'Title', b: 1 }] }, { t: 'p', c: [{ x: 'See ' }, { x: 'site', a: 'javascript:alert(1)', i: 1 }, { x: ' and ' }, { x: 'ok', a: 'https://example.com' }] }] });
check('DC2', 'A hostile link is removed but its text stays; a good link is kept', d.blocks[1].c.some((r) => r.x === 'site' && !r.a && r.i === 1) && d.blocks[1].c.some((r) => r.x === 'ok' && r.a === 'https://example.com/'));
check('DC3', 'Unknown block types become paragraphs; unknown fields are dropped; markup in text stays plain text', (() => { const n = normalize({ blocks: [{ t: 'script', c: [{ x: '<img src=x onerror=alert(1)>', onclick: 'x' }], evil: 1 }] }); return n.blocks[0].t === 'p' && n.blocks[0].c[0].x === '<img src=x onerror=alert(1)>' && !('onclick' in n.blocks[0].c[0]) && !('evil' in n.blocks[0]); })());
check('DC4', 'Anything in gives a valid document out: null, strings, numbers, wrong shapes, empty', [null, undefined, 5, 'x', {}, { blocks: 'no' }, { blocks: [] }, { blocks: [null, 3, {}] }].every((x) => { const n = normalize(x); return n.v === 1 && n.blocks.length >= 1 && n.blocks.every((b) => ['p', 'h1', 'h2', 'h3', 'quote', 'ul', 'ol', 'hr'].includes(b.t)); }));
check('DC5', 'Neighbouring text with the same look merges; different looks stay apart', (() => { const n = normalize({ blocks: [{ t: 'p', c: [{ x: 'a', b: 1 }, { x: 'b', b: 1 }, { x: 'c' }] }] }); return n.blocks[0].c.length === 2 && n.blocks[0].c[0].x === 'ab'; })());
const plain = parseBody('Line one\n\nLine three');
check('DC6', 'Plain text (a legacy SOP) opens as one paragraph per line and keeps the blank line', plain.blocks.length === 3 && plain.blocks[1].c.length === 0 && plainText(plain) === 'Line one\n\nLine three');
check('DC7', 'Text that starts with a brace but is not a document opens as text, never an error', plainText(parseBody('{ not json')) === '{ not json' && plainText(parseBody('{"v":2}')) === '{"v":2}');
const doc = { v: 1, blocks: [{ t: 'h1', c: [{ x: 'Plan' }] }, { t: 'ul', items: [[{ x: 'one' }], [{ x: 'two', b: 1 }]] }, { t: 'hr' }, { t: 'h2', c: [{ x: 'Next' }] }, { t: 'quote', c: [{ x: 'q' }] }] };
check('DC8', 'Save and open give the same document back (round trip)', sameDoc(parseBody(serialize(doc)), doc) && parseBody(serialize(doc)).blocks.length === 5);
check('DC9', 'The outline lists headings in order with their level and block position; an empty heading still shows', JSON.stringify(outline(doc)) === JSON.stringify([{ level: 1, text: 'Plan', index: 0 }, { level: 2, text: 'Next', index: 3 }]) && outline({ blocks: [{ t: 'h3', c: [] }] })[0].text === 'Untitled heading');
check('DC10', 'Word count and plain text work over lists and ignore rules', wordCount(doc) === 5 && plainText(doc).includes('one\ntwo'));
check('DC11', 'An untouched new document is empty; a rule or text makes it not empty', isEmpty(emptyDoc()) && !isEmpty({ blocks: [{ t: 'hr' }] }) && !isEmpty({ blocks: [{ t: 'p', c: [{ x: 'a' }] }] }));
const big = normalize({ blocks: Array.from({ length: MAX_BLOCKS + 50 }, () => ({ t: 'p', c: [{ x: 'x' }] })) });
check('DC12', 'Too many blocks are cut, not refused', big.blocks.length === MAX_BLOCKS);
check('DC13', 'The size the saved text will take is measurable against the 200,000 limit', sizeOf(emptyDoc()) < 100 && MAX_CHARS === 200000 && sizeOf({ blocks: [{ t: 'p', c: [{ x: 'y'.repeat(150000) }] }] }) > 150000);
check('DC14', 'Serialising is stable: the same document always gives the same text (no spurious "unsaved changes")', serialize(doc) === serialize(parseBody(serialize(doc))));
import { parseRoute, hrefFor, pageKeyFor, routeForPage } from '../apps/web/js/routes.js';
check('DC15', 'The document address #/doc/<id> is a route; after an organization switch it lands on the Drive app, never on a record of the other organization', parseRoute('#/doc/abc').name === 'doc' && parseRoute('#/doc/abc').params.id === 'abc' && hrefFor.doc('abc') === '#/doc/abc' && parseRoute('#/doc').name === 'not-found'
  && pageKeyFor(parseRoute('#/doc/abc')).app === 'drive' && routeForPage('drive', null) === '#/app/drive');
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`);
process.exit(pc === results.length ? 0 : 1);
