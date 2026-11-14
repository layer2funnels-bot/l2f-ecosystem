// Global search in the browser (V8 02 §5): the query language, the result links and the "apps, pages and menus" part. Pure logic, no browser.
import { recorder } from './lib.mjs';
import { parseQuery, resultHref, pageEntries, SCOPES } from '../apps/web/js/views/search.js';
const { results, check } = recorder();

check('GS1', 'The design\'s eight scopes, Everything first', SCOPES.map(([, l]) => l).join() === 'Everything,Projects & tasks,Tasks,Clients,Docs & files,Office,Planner,Funnels');
const p = parseQuery('quiz in:clients is:archived', 'all');
check('GS2', '"in:clients" switches the scope and the token leaves the text; "is:archived" includes archived items', p.scope === 'clients' && p.archived && p.q === 'quiz');
check('GS3', 'in:drive, in:files and in:docs all mean Docs & files; in:projects, in:planner, in:funnels work too', ['drive', 'files', 'docs'].every((w) => parseQuery(`in:${w} x`, 'all').scope === 'files') && parseQuery('in:projects x', 'all').scope === 'projects' && parseQuery('in:planner', 'all').scope === 'planner' && parseQuery('in:funnels', 'all').scope === 'funnels');
const m = parseQuery('@me overdue', 'all');
check('GS4', '"@me" and "overdue" are filters, not words', m.me && m.overdue && m.q === '');
check('GS5', 'An unknown "in:" stays as text and keeps the scope', parseQuery('in:nowhere', 'tasks').scope === 'tasks' && parseQuery('in:nowhere', 'tasks').q === 'in:nowhere');
check('GS6', 'Result links use each app\'s own addresses', resultHref({ app: 'projects', type: 'project', id: 'p1' }) === '#/projects/p/p1' && resultHref({ app: 'projects', type: 'task', id: 't1', extra: 'p1' }) === '#/projects/p/p1/list?task=t1'
  && resultHref({ app: 'clients', type: 'client', id: 'c1' }) === '#/clients/c/c1' && resultHref({ app: 'office', type: 'offers', id: 'o1' }) === '#/office/funnels/offers/o1' && resultHref({ app: 'office', type: 'strategy', id: 's1' }) === '#/office/funnels/strategy/s1'
  && resultHref({ app: 'planner', type: 'goal', id: 'g1', extra: 'pl1' }) === '#/planner/map?plan=pl1&goal=g1');
check('GS7', 'Drive results open the right editor (document, sheet, board, image, PDF)', resultHref({ app: 'drive', type: 'document', id: 'd', extra: 'application/vnd.l2f.doc+json' }) === '#/doc/d' && resultHref({ app: 'drive', type: 'document', id: 's', extra: 'application/vnd.l2f.sheet+json' }) === '#/sheet/s'
  && resultHref({ app: 'drive', type: 'document', id: 'b', extra: 'application/vnd.excalidraw+json' }) === '#/board/b' && resultHref({ app: 'drive', type: 'file', id: 'i', extra: 'image/png' }) === '#/image/i' && resultHref({ app: 'drive', type: 'file', id: 'f', extra: 'application/pdf' }) === '#/pdf/f');
const cat = [{ app_key: 'office', name: 'Office', state: 'available' }, { app_key: 'clients', name: 'Clients', state: 'available' }, { app_key: 'portal', name: 'Client Portal', state: 'locked' }];
const pe = pageEntries(cat, false); const titles = pe.map((x) => x.title);
check('GS8', 'Apps, pages and menu entries are searchable, only for apps this person can open (a locked app is not offered)', titles.includes('Office') && titles.includes('Clients') && titles.includes('Requests & Approvals') && titles.includes('Customer Avatars') && !titles.includes('Client Portal'));
check('GS9', 'Admin pages appear only for owners and admins', !titles.includes('Admin') && pageEntries(cat, true).some((x) => x.title === 'Admin'));
check('GS10', 'Every page entry is a real link', pe.every((x) => /^#\//.test(x.href)));

const fails = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(5)} ${r.name}${r.ok ? '' : `  ${r.detail}`}`);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
process.exit(fails.length ? 1 : 0);
