// Social Planner screen rules (pure): what each state offers, caption counters, the calendar grid, progress.
import { recorder } from './lib.mjs';
import { postActions, counter, mediaWarning, monthGrid, byDay, progress, campaignMoves, toLocalInput, fromLocalInput, ymd } from '../apps/web/js/modules/socialmodel.js';
const { results, check } = recorder(); const ALL = { edit: true, schedule: true };
check('SM1', 'A draft offers review and cancel; review and approval of a post in review come only from its approval', postActions({ status: 'draft' }, ALL).join() === 'review,cancel' && postActions({ status: 'in_review' }, ALL).length === 0);
check('SM2', 'An approved post offers schedule and mark as posted only to people who may schedule', postActions({ status: 'approved' }, ALL).includes('schedule') && !postActions({ status: 'approved' }, { edit: true }).includes('schedule') && postActions({ status: 'approved' }, { edit: true }).join() === 'to_draft,cancel');
check('SM3', 'A failed post offers retry and mark as posted; a cancelled post only reopens; a published or archived post offers nothing', postActions({ status: 'failed' }, ALL).includes('retry') && postActions({ status: 'cancelled' }, ALL).join() === 'reopen' && postActions({ status: 'published' }, ALL).length === 0 && postActions({ status: 'draft', archived_at: 'x' }, ALL).length === 0);
check('SM4', 'A viewer is offered nothing', postActions({ status: 'draft' }, {}).length === 0);
const c = counter('a'.repeat(300), { max_text: 280 });
check('SM5', 'The counter flags a caption over the limit and counts emoji as one', c.over && c.left === -20 && counter('😀😀', { max_text: 280 }).len === 2 && counter('x', { max_text: null }).over === false && counter('x', null).max === null);
check('SM6', 'Too many files for the channel is explained in words', mediaWarning(3, { label: 'TikTok', max_media: 1 }).includes('at most 1 file;') && mediaWarning(1, { label: 'TikTok', max_media: 1 }) === '');
const g = monthGrid(2026, 10);   // November 2026 starts on a Sunday
check('SM7', 'The month grid is whole Monday-first weeks that contain the whole month', g.every((w) => w.length === 7) && g[0][0].getDay() === 1 && ymd(g[0][6]) === '2026-11-01' && g.flat().some((d) => ymd(d) === '2026-11-30') && g.length === 6);
const m = byDay([{ scheduled_for: new Date(2026, 10, 5, 15).toISOString(), t: 'b' }, { scheduled_for: new Date(2026, 10, 5, 9).toISOString(), t: 'a' }, { scheduled_for: null }]);
check('SM8', 'Posts group by local day in time order, undated posts are left out', m.get('2026-11-05').map((p) => p.t).join() === 'a,b' && m.size === 1);
check('SM9', 'Progress is posted over planned, leaving cancelled posts out', progress({ posts: 5, cancelled: 1, published: 2 }) === 50 && progress({ posts: 0, cancelled: 0, published: 0 }) === 0 && progress({ posts: 2, cancelled: 2, published: 0 }) === 0);
check('SM10', 'Each campaign state offers its own moves and completed can be reopened', campaignMoves('active').map((x) => x[0]).join() === 'paused,completed' && campaignMoves('completed')[0][0] === 'active' && campaignMoves('nope').length === 0);
check('SM11', 'A planned time round-trips through the date-time input', fromLocalInput(toLocalInput('2026-11-05T10:30:00.000Z')) === '2026-11-05T10:30:00.000Z' && fromLocalInput('') === null);
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`); process.exit(pc === results.length ? 0 : 1);
