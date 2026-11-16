// Starting points on Drive's category pages (V8 "Start a new …"): real content in each editor's own stored format, never a picture of one.
// Docs: Meeting notes, Proposal, SOP, Weekly report. Sheets: Budget, Content calendar, Tracker (working formulas). Slides: Pitch, Kick-off, Report.
import { serialize, emptyDoc } from './docmodel.js';
import { serializeBook, emptyBook } from './sheetmodel.js';

const p = (x, o = {}) => ({ t: 'p', c: x ? [{ x, ...o }] : [] });
const hd = (t, x) => ({ t, c: [{ x }] });
const ul = (...xs) => ({ t: 'list', items: xs.map((x) => ({ k: 'ul', lv: 0, c: [{ x }] })) });
const cl = (...xs) => ({ t: 'list', items: xs.map((x) => ({ k: 'cl', lv: 0, c: [{ x }] })) });
const table = (rows) => ({ t: 'table', hdr: 1, rows: rows.map((r) => r.map((x) => ({ c: x ? [{ x }] : [] }))) });
const doc = (title, blocks) => serialize({ ...emptyDoc(), tabs: [{ id: 't1', title, blocks, children: [] }] });

const DOCS = {
  'Meeting notes': () => doc('Meeting notes', [hd('title', 'Meeting notes'), p('Date · Attendees', { i: 1 }), hd('h2', 'Agenda'), ul('Topic one', 'Topic two'), hd('h2', 'Notes'), p(''), hd('h2', 'Decisions'), ul('Decision'), hd('h2', 'Next steps'), table([['Action', 'Owner', 'Due'], ['', '', '']])]),
  Proposal: () => doc('Proposal', [hd('title', 'Proposal'), p('For: client name · Prepared by: your name', { i: 1 }), hd('h2', 'The goal'), p('What the client wants to achieve, in their words.'), hd('h2', 'What we will do'), ul('Step one', 'Step two', 'Step three'),
    hd('h2', 'Timeline'), table([['Phase', 'What', 'When'], ['1', '', ''], ['2', '', '']]), hd('h2', 'Investment'), table([['Item', 'Price'], ['', ''], ['Total', '']]), hd('h2', 'Next step'), p('How to say yes.')]),
  SOP: () => doc('SOP', [hd('title', 'Standard operating procedure'), p('Owner · Version 1 · Last reviewed', { i: 1 }), hd('h2', 'Purpose'), p('Why this procedure exists and when to use it.'), hd('h2', 'Before you start'), cl('What you need', 'Who to tell'),
    hd('h2', 'Steps'), { t: 'list', items: ['First step', 'Second step', 'Third step'].map((x) => ({ k: 'ol', lv: 0, c: [{ x }] })) }, hd('h2', 'Done when'), p('How you know it worked.')]),
  'Weekly report': () => doc('Weekly report', [hd('title', 'Weekly report'), p('Week of …', { i: 1 }), hd('h2', 'Highlights'), ul('Win'), hd('h2', 'Numbers'), table([['Measure', 'This week', 'Last week'], ['', '', ''], ['', '', '']]), hd('h2', 'Problems and help needed'), ul('…'), hd('h2', 'Next week'), cl('Priority')]),
};
// the stored v2 shape (sheetmodel.parseBook checks every field when the editor opens it)
const book = (name, cells, extra = {}) => JSON.stringify({ v: 2, styles: [{ b: 1, bg: '#eef2fb' }], sheets: [{ name, cells, freeze: { r: 1, c: 0 }, ...extra }] });
const H = (x) => [x, 0];   // header cell: the bold style (index 0)
const SHEETS = {
  Budget: () => book('Budget', { A1: H('Item'), B1: H('Planned'), C1: H('Actual'), D1: H('Difference'), A2: 'Rent', B2: '0', C2: '0', D2: '=B2-C2', A3: 'Software', B3: '0', C3: '0', D3: '=B3-C3', A4: 'Marketing', B4: '0', C4: '0', D4: '=B4-C4', A6: H('Total'), B6: '=SUM(B2:B5)', C6: '=SUM(C2:C5)', D6: '=B6-C6' }, { cw: { 0: 180, 1: 120, 2: 120, 3: 120 } }),
  'Content calendar': () => book('Calendar', { A1: H('Date'), B1: H('Channel'), C1: H('Topic'), D1: H('Status'), E1: H('Reach') }, { cw: { 0: 120, 1: 140, 2: 260, 3: 120, 4: 100 }, dv: [{ range: 'D2:D200', list: ['Idea', 'Writing', 'Scheduled', 'Posted'] }, { range: 'B2:B200', list: ['Instagram', 'YouTube', 'LinkedIn', 'Email', 'TikTok'] }] }),
  Tracker: () => book('Tracker', { A1: H('Task'), B1: H('Owner'), C1: H('Due'), D1: H('Status'), F1: H('Done'), G1: '=COUNTIF(D2:D200,"Done")', F2: H('Open'), G2: '=COUNTA(A2:A200)-G1' }, { cw: { 0: 260, 1: 140, 2: 110, 3: 120 }, dv: [{ range: 'D2:D200', list: ['To do', 'Doing', 'Done'] }] }),
};
// slides: { v: 1, theme, slides: [{ layout, title, body, notes }] } (slidemodel.js)
const deck = (slides) => JSON.stringify({ v: 1, theme: 'ledger', slides: slides.map(([title, body, layout = 'title-body']) => ({ layout, title, body, notes: '', boxes: [] })) });
const SLIDES = {
  Pitch: () => deck([['The problem', 'Who has it and why it matters', 'title'], ['Our answer', 'What we do'], ['How it works', 'Three simple steps'], ['Proof', 'Results so far'], ['The ask', 'What we need next']]),
  'Kick-off': () => deck([['Kick-off', 'Client · project', 'title'], ['What we heard', 'Goals in the client’s words'], ['The plan', 'Steps and owners'], ['Timeline', 'Dates that matter'], ['Next steps', 'Who does what this week']]),
  Report: () => deck([['Monthly report', 'Month · client', 'title'], ['Highlights', 'Wins this month'], ['Numbers', 'What changed'], ['Next month', 'Plan and priorities']]),
};
const BLANK = { doc: () => doc('Tab 1', [p('')]), sheet: () => serializeBook(emptyBook()), slides: () => deck([['Title', 'Subtitle', 'title']]) };
const SETS = { doc: DOCS, sheet: SHEETS, slides: SLIDES };

/** The template list for a category page: [{ name, body() }], Blank first. */
export function templatesFor(t) {
  if (!SETS[t]) return [];
  return [{ name: 'Blank', body: BLANK[t] }, ...Object.entries(SETS[t]).map(([name, body]) => ({ name, body }))];
}
