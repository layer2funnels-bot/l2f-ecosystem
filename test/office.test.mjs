// Office V8 (P01, migration 0056): strategy template versions, Documents sections, New offer / New story fields, several brand kits.
// Row rules decide; Layer2Funnels and Aurj never mix.
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, recorder } from './lib.mjs';
import { createApi } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';

const db = await openDb(); await migrate(db);
const { results, check } = recorder();
let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }) });
const J = async (op, input, u, org) => { const r = await api.handle({ operation: op, input, auth: { userId: u, email: 'x@example.com' }, headers: { 'x-org-id': org } }); return { status: r.status, rows: r.body?.data ?? [], row: r.body?.data?.[0] }; };

await db.exec('reset role');
const ORG = { L: id(), A: id() }; const U = { LO: id(), LAD: id(), LED: id(), LVW: id(), AO: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [ORG.L, ORG.A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.LO, ORG.L, 'owner'); await staff(U.LAD, ORG.L, 'admin'); await staff(U.LED, ORG.L, 'editor'); await staff(U.LVW, ORG.L, 'viewer'); await staff(U.AO, ORG.A, 'owner');
for (const ws of [ORG.L, ORG.A]) for (const app of ['office', 'drive']) await db.query("insert into workspace_apps (workspace_id,app_key,enabled) values ($1,$2,true) on conflict (workspace_id,app_key) do update set enabled = true", [ws, app]);
for (const u of [U.LED, U.LVW]) for (const app of ['office', 'drive']) await db.query('insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,$3)', [ORG.L, u, app]);

// ---- default strategy template
const t0 = await J('office.template.get', {}, U.LED, ORG.L);
check('OF1', 'Before anything is saved, the template is V8’s six starting sections (version 0)', t0.status === 200 && t0.row.version === 0 && t0.row.sections.length === 6 && t0.row.sections[0].heading === 'Funnel overview');
const s1 = await J('office.template.save', { sections: [{ heading: 'Goal', help: 'What it must achieve' }, { heading: 'Audience' }] }, U.LO, ORG.L);
const s2 = await J('office.template.save', { sections: [{ heading: 'Goal' }, { heading: 'Audience' }, { heading: 'Offer' }] }, U.LO, ORG.L);
check('OF2', 'Saving makes a new version each time; the latest is what new strategies use', s1.row?.version === 1 && s2.row?.version === 2 && (await J('office.template.get', {}, U.LED, ORG.L)).row.sections.length === 3);
check('OF3', 'Versions are listed with who saved them, newest first', (await J('office.template.versions', {}, U.LO, ORG.L)).rows.map((v) => v.version).join() === '2,1');
check('OF4', 'A viewer cannot save the template; an empty template is refused', (await J('office.template.save', { sections: [{ heading: 'X' }] }, U.LVW, ORG.L)).status >= 400 && (await J('office.template.save', { sections: [] }, U.LO, ORG.L)).status >= 400);
check('OF5', 'Aurj never sees Layer2Funnels’ template', (await J('office.template.get', {}, U.AO, ORG.A)).row.version === 0);

// ---- Documents sections
check('OF6', 'An editor opening Documents first sees no sections (only owners/admins create the starting ones)', (await J('office.sections.list', {}, U.LED, ORG.L)).rows.length === 0);
const first = await J('office.sections.list', {}, U.LAD, ORG.L);
check('OF7', 'An admin’s first visit creates V8’s starting sections: Approved SOPs (owner protected), Policies, Templates', first.rows.map((r) => r.name).join() === 'Approved SOPs,Policies,Templates' && first.rows[0].owner_protected === true);
const ns = await J('office.sections.create', { name: 'Brand guidelines', visibility: 'admins' }, U.LAD, ORG.L);
check('OF8', 'New section: a Drive folder is made for it in the shared space', ns.status === 200 && !!ns.row?.folder_id && (await db.query('select space, name from drive_folders where id = $1', [ns.row.folder_id])).rows[0]?.name === 'Brand guidelines');
check('OF9', 'A section for admins only is hidden from an editor; everyone’s sections are visible', !(await J('office.sections.list', {}, U.LED, ORG.L)).rows.some((r) => r.name === 'Brand guidelines') && (await J('office.sections.list', {}, U.LED, ORG.L)).rows.length === 3);
check('OF10', 'An editor cannot create, rename or delete sections', (await J('office.sections.create', { name: 'Mine' }, U.LED, ORG.L)).status >= 400
  && (await J('office.sections.update', { id: first.rows[1].id, name: 'Hacked' }, U.LED, ORG.L)).row == null && (await J('office.sections.delete', { id: first.rows[1].id }, U.LED, ORG.L)).row == null);
const rn = await J('office.sections.update', { id: ns.row.id, name: 'Brand rules', visibility: 'everyone' }, U.LO, ORG.L);
check('OF11', 'Renaming a section renames its Drive folder; who-can-see changes', rn.row?.name === 'Brand rules' && rn.row.visibility === 'everyone' && (await db.query('select name from drive_folders where id = $1', [ns.row.folder_id])).rows[0]?.name === 'Brand rules');
check('OF12', 'Deleting a section keeps its folder in Drive', (await J('office.sections.delete', { id: ns.row.id }, U.LO, ORG.L)).row?.id === ns.row.id && (await db.query('select count(*)::int n from drive_folders where id = $1', [ns.row.folder_id])).rows[0].n === 1);
check('OF13', 'Aurj sees none of Layer2Funnels’ sections', !(await J('office.sections.list', {}, U.AO, ORG.A)).rows.some((r) => r.name === 'Policies' && first.rows.some((f) => f.id === r.id)));

// ---- New offer / New story / several brand kits (0056 fields through the existing operations)
const of = await J('funnels.offers.create', { name: 'Funnel Done-For-You', kind: 'offer', offer_type: 'service', status: 'draft', billing: 'one_off', price_amount: 3000, currency: 'USD', guarantee: '30 days of fixes', included: ['Strategy', 'All copy'], internal_notes: 'Margin 60%' }, U.LO, ORG.L);
check('OF14', 'New offer saves type, status, billing, guarantee, what’s included and internal notes', of.status === 200 && of.row.offer_type === 'service' && of.row.status === 'draft' && JSON.stringify(of.row.included) === '["Strategy","All copy"]' && of.row.internal_notes === 'Margin 60%');
check('OF15', 'An unknown offer type is refused', (await J('funnels.offers.create', { name: 'X', offer_type: 'magic' }, U.LO, ORG.L)).status === 422);
const st = await J('funnels.stories.create', { title: 'From 0 to 41 calls', kind: 'case_study', before_text: '2 calls a week', after_text: '41 calls', permission: 'given', use_in: ['Sales page', 'Ads'] }, U.LO, ORG.L);
check('OF16', 'New story saves before → after, permission and where to use it', st.status === 200 && st.row.permission === 'given' && st.row.use_in.join() === 'Sales page,Ads');
const k1 = await J('funnels.brand_kits.create', { name: 'Layer2Funnels', is_main: true, colors: ['#2B63F6', '#FFC633'], color_names: ['Primary', 'Accent'] }, U.LO, ORG.L);
const k2 = await J('funnels.brand_kits.create', { name: 'Challenge', colors: ['#F07C1A'] }, U.LO, ORG.L);
check('OF17', 'Several brand kits, one of them the main kit; colour roles kept in order', k1.status === 200 && k2.status === 200 && k1.row.is_main && k1.row.color_names.join() === 'Primary,Accent');
check('OF18', 'Only one main kit per organization', (await J('funnels.brand_kits.create', { name: 'Second main', is_main: true }, U.LO, ORG.L)).status >= 400);

// ---- Team
const mg = await J('office.member.get', { user: U.LED }, U.LVW, ORG.L);
check('OF19', 'Member page: a teammate’s role, open work, week and projects (only what the viewer may see)', mg.status === 200 && mg.row?.role === 'editor' && Array.isArray(mg.row.tasks) && mg.row.week && 'planned_minutes' in mg.row.week && Array.isArray(mg.row.projects));
check('OF20', 'Aurj cannot open a Layer2Funnels member', (await J('office.member.get', { user: U.LED }, U.AO, ORG.A)).row == null);
check('OF21', 'Working on now answers for the whole team in one call', (await J('office.team.now', {}, U.LVW, ORG.L)).status === 200);

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(5)} ${r.name}${r.ok ? '' : `  ${r.detail ?? ''}`}`);
const pc = results.filter((r) => r.ok).length; console.log(`\n${pc}/${results.length} checks passed`); await db.close(); process.exit(pc === results.length ? 0 : 1);
