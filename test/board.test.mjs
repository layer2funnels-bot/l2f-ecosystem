// Whiteboard scene model (boardmodel.js): what a board stores and what may be opened. Plain logic, no browser.
import { recorder } from './lib.mjs';
import { parseBoard, serializeBoard, signature, countLive, emptyBoard, MAX_ELEMENTS, MAX_CHARS, BOARD_MIME } from '../apps/web/js/modules/boardmodel.js';
import { parseRoute, hrefFor, pageKeyFor, routeForPage } from '../apps/web/js/routes.js';

const { results, check } = recorder();
const el = (id, type = 'rectangle', extra = {}) => ({ id, type, x: 0, y: 0, width: 10, height: 10, version: 1, versionNonce: 1, ...extra });
check('BD1', 'The board type is the one the Drive and the All boards list filter on', BOARD_MIME === 'application/vnd.excalidraw+json');
const s = serializeBoard([el('a'), el('b', 'text', { text: 'hello' }), el('gone', 'rectangle', { isDeleted: true })], '#ffeeaa');
const back = parseBoard(s);
check('BD2', 'A scene round-trips: live elements and the background come back; deleted elements are not stored', back.elements.map((e) => e.id).join() === 'a,b' && back.background === '#ffeeaa' && !s.includes('"gone"'));
check('BD3', 'The stored text is JSON of a known shape and within the document limit for ordinary boards', JSON.parse(s).type === 'excalidraw' && s.length < MAX_CHARS && MAX_CHARS === 200000);
const hostile = JSON.stringify({ elements: [el('i', 'image', { fileId: 'f' }), el('e', 'embeddable'), el('f', 'iframe'), el('x', 'script'), el('ok', 'ellipse', { link: 'javascript:alert(1)' }), el('ok2', 'rectangle', { link: 'https://example.com/x' }), el('t', 'text', { text: '<img src=x onerror=alert(1)>' }), null, 5, { type: 'rectangle' }], files: { f: { dataURL: 'data:image/png;base64,AAAA' } }, appState: { viewBackgroundColor: 'url(javascript:x)' } });
const h = parseBoard(hostile);
check('BD4', 'Images, embeds, iframes and unknown types never enter; elements without an id are dropped; the files table is ignored', h.elements.map((e) => e.id).join() === 'ok,ok2,t');
check('BD5', 'A javascript: link is removed from an element, a web link is kept; text with markup stays plain text', h.elements[0].link === null && h.elements[1].link === 'https://example.com/x' && h.elements[2].text === '<img src=x onerror=alert(1)>');
check('BD6', 'A hostile background value is replaced by white', h.background === '#ffffff' && parseBoard(JSON.stringify({ appState: { viewBackgroundColor: 'transparent' } })).background === 'transparent');
check('BD7', 'Unreadable text opens as an empty board, never an error: empty, not JSON, wrong shapes', ['', 'nope', '{', 'null', '[]', '{"elements":"x"}', undefined, null, 5].every((x) => { const p = parseBoard(x); return Array.isArray(p.elements) && p.elements.length === 0 && p.background === '#ffffff'; }));
const many = serializeBoard(Array.from({ length: MAX_ELEMENTS + 20 }, (_, i) => el(`e${i}`)), '#fff');
check('BD8', 'Too many elements are cut at the limit, on save and on open', JSON.parse(many).elements.length === MAX_ELEMENTS && parseBoard(JSON.stringify({ elements: Array.from({ length: MAX_ELEMENTS + 20 }, (_, i) => el(`e${i}`)) })).elements.length === MAX_ELEMENTS);
check('BD9', 'An empty board is stored as a valid scene and counts zero', parseBoard(emptyBoard()).elements.length === 0 && countLive([]) === 0 && countLive([el('a'), el('b', 'rectangle', { isDeleted: true })]) === 1);
check('BD10', 'The change signature moves when an element is edited, added or deleted, and not otherwise', signature([el('a')]) === signature([el('a')]) && signature([el('a')]) !== signature([el('a', 'rectangle', { version: 2 })]) && signature([el('a')]) !== signature([el('a'), el('b')]) && signature([el('a')]) !== signature([el('a', 'rectangle', { isDeleted: true })]));
check('BD11', 'Serialising is stable: the same scene always gives the same text (no phantom "unsaved changes")', serializeBoard(back.elements, back.background) === serializeBoard(parseBoard(serializeBoard(back.elements, back.background)).elements, back.background));
check('BD12', 'The board address #/board/<id> is a route; after an organization switch it lands on the Whiteboard app, never on a record of the other organization', parseRoute('#/board/abc').name === 'board' && parseRoute('#/board/abc').params.id === 'abc' && hrefFor.board('abc') === '#/board/abc' && parseRoute('#/board').name === 'not-found' && pageKeyFor(parseRoute('#/board/abc')).app === 'whiteboard' && routeForPage('whiteboard', null) === '#/app/whiteboard');
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`);
process.exit(pc === results.length ? 0 : 1);
