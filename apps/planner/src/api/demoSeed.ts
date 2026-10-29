// Synthetic demo data for the local engine. Everything is created through the real planner_* functions under the real
// policies (as the matching person), except organization/membership setup which the foundation seeds by hand.
import type { PGlite } from '@electric-sql/pglite';

export const DEMO_IDS = {
  L2F: '11111111-1111-4111-8111-111111111111',
  AURJ: '22222222-2222-4222-8222-222222222222',
  OLIVE: 'aaaaaaaa-0000-4000-8000-000000000001',   // owner of both organizations
  ADAM: 'aaaaaaaa-0000-4000-8000-000000000002',    // Layer2Funnels admin
  EDITH: 'aaaaaaaa-0000-4000-8000-000000000003',   // Layer2Funnels editor
  ELI: 'aaaaaaaa-0000-4000-8000-000000000004',     // Layer2Funnels editor
  VERA: 'aaaaaaaa-0000-4000-8000-000000000005',    // Layer2Funnels viewer
  NOAH: 'aaaaaaaa-0000-4000-8000-000000000006',    // Layer2Funnels editor without a Planner grant
  ARIA: 'bbbbbbbb-0000-4000-8000-000000000001',    // Aurj admin
  EDDIE: 'bbbbbbbb-0000-4000-8000-000000000002',   // Aurj editor
} as const;

export const DEMO_USERS = [
  { id: DEMO_IDS.OLIVE, name: 'Olive Owner', note: 'Owner of both organizations' },
  { id: DEMO_IDS.ADAM, name: 'Adam Admin', note: 'Admin · Layer2Funnels' },
  { id: DEMO_IDS.EDITH, name: 'Edith Editor', note: 'Editor · Layer2Funnels' },
  { id: DEMO_IDS.ELI, name: 'Eli Editor', note: 'Editor · Layer2Funnels' },
  { id: DEMO_IDS.VERA, name: 'Vera Viewer', note: 'Viewer · Layer2Funnels' },
  { id: DEMO_IDS.NOAH, name: 'Noah NoAccess', note: 'Editor · no Planner access' },
  { id: DEMO_IDS.ARIA, name: 'Aria Admin', note: 'Admin · Aurj' },
  { id: DEMO_IDS.EDDIE, name: 'Eddie Editor', note: 'Editor · Aurj' },
] as const;

type Row = Record<string, any>;
const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };

export async function seedDemo(db: PGlite): Promise<void> {
  const I = DEMO_IDS;
  await db.exec(`
    insert into public.workspaces (id, slug, name) values ('${I.L2F}', 'layer2funnels', 'Layer2Funnels'), ('${I.AURJ}', 'aurj', 'Aurj');
  `);
  const member = (u: string, ws: string, role: string, name: string) =>
    db.query(`insert into public.memberships (workspace_id, user_id, kind, role) values ($1, $2, 'staff', $3)`, [ws, u, role])
      .then(() => db.query(`insert into public.profiles (id, display_name) values ($1, $2) on conflict (id) do nothing`, [u, name]));
  await member(I.OLIVE, I.L2F, 'owner', 'Olive Owner'); await member(I.OLIVE, I.AURJ, 'owner', 'Olive Owner');
  await member(I.ADAM, I.L2F, 'admin', 'Adam Admin'); await member(I.EDITH, I.L2F, 'editor', 'Edith Editor');
  await member(I.ELI, I.L2F, 'editor', 'Eli Editor'); await member(I.VERA, I.L2F, 'viewer', 'Vera Viewer');
  await member(I.NOAH, I.L2F, 'editor', 'Noah NoAccess');
  await member(I.ARIA, I.AURJ, 'admin', 'Aria Admin'); await member(I.EDDIE, I.AURJ, 'editor', 'Eddie Editor');
  for (const [u, ws] of [[I.EDITH, I.L2F], [I.ELI, I.L2F], [I.VERA, I.L2F], [I.EDDIE, I.AURJ]] as const)
    await db.query(`insert into public.app_grants (workspace_id, user_id, app_key) values ($1, $2, 'planner')`, [ws, u]);
  await db.exec(`
    insert into public.clients (id, workspace_id, name) values ('cccccccc-0000-4000-8000-000000000001', '${I.L2F}', 'Acme Co'), ('cccccccc-0000-4000-8000-000000000002', '${I.AURJ}', 'Studio Launch');
    insert into public.projects (id, workspace_id, client_id, name) values
      ('dddddddd-0000-4000-8000-000000000001', '${I.L2F}', 'cccccccc-0000-4000-8000-000000000001', 'Funnel rebuild · Acme'),
      ('dddddddd-0000-4000-8000-000000000002', '${I.AURJ}', 'cccccccc-0000-4000-8000-000000000002', 'Studio launch campaign');
    update public.profiles set active_workspace_id = '${I.L2F}' where id in ('${I.OLIVE}', '${I.ADAM}', '${I.EDITH}', '${I.ELI}', '${I.VERA}', '${I.NOAH}');
    update public.profiles set active_workspace_id = '${I.AURJ}' where id in ('${I.ARIA}', '${I.EDDIE}');
  `);

  const call = async <T = any>(user: string, fn: string, args: Row): Promise<T> => {
    const keys = Object.keys(args);
    const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
    const params = keys.map((k) => { const v = args[k]; return v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v; });
    return db.transaction(async (tx) => {
      await tx.exec('set local role app_user');
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user, role: 'authenticated' })]);
      return (await tx.query<{ r: T }>(sql, params as unknown[])).rows[0]!.r;
    });
  };

  await seedLayer2Funnels(call);
  await seedAurj(call);
}

type Call = <T = any>(user: string, fn: string, args: Row) => Promise<T>;

async function seedLayer2Funnels(call: Call) {
  const I = DEMO_IDS;
  const plan = await call(I.ADAM, 'planner_save_plan', { p_workspace: I.L2F, p_id: null, p_expected: null, p_data: {
    name: 'Layer2Funnels Strategy 2026', description: 'The company plan: growth, delivery, and the ecosystem we are building for the team.',
    vision: 'Make funnel-building calm, clear and measurable for service businesses.', period_start: day(-120), period_end: day(245), review_cadence: 'monthly' } });
  const P = plan.id;
  for (const [n, d] of [['Clarity', 'Plain words, simple decisions, no jargon.'], ['Craft', 'Do fewer things and finish them properly.'], ['Care', 'Clients and teammates should feel looked after.']])
    await call(I.ADAM, 'planner_save_value', { p_plan: P, p_id: null, p_data: { name: n, description: d } });
  const fa = async (name: string, color: string, description = '') => (await call(I.ADAM, 'planner_save_focus_area', { p_plan: P, p_id: null, p_data: { name, color, description } })).id;
  const FA = { grow: await fa('Grow revenue', 'coral', 'Predictable monthly revenue from retainers.'), delight: await fa('Delight clients', 'teal', 'Deliver on time and make clients feel seen.'),
    eco: await fa('Build the ecosystem', 'violet', 'The shared tools our team runs on.'), run: await fa('Run well', 'slate', 'Keep the business simple and efficient.') };
  const types = (await call(I.ADAM, 'planner_get_plan', { p_plan: P })).goal_types as Row[];
  const T = Object.fromEntries(types.map((t) => [t.name, t.id]));
  // reusable building blocks: two focus areas, a KPI type and a strategy that ties them to the Objective kind
  const ftCreate = await call(I.ADAM, 'planner_save_focus_template', { p_workspace: I.L2F, p_id: null, p_data: { name: 'Content creation', color: 'teal', description: 'Make and publish the work.' } });
  const ftChallenge = await call(I.ADAM, 'planner_save_focus_template', { p_workspace: I.L2F, p_id: null, p_data: { name: 'Posting challenge', color: 'amber', description: 'A focused 10-day push.' } });
  await call(I.ADAM, 'planner_save_measure_type', { p_workspace: I.L2F, p_id: null, p_data: { name: 'Followers', unit: 'people', direction: 'increase', kind_ids: [T.Objective] } });
  const socialStrategy = await call(I.ADAM, 'planner_save_strategy', { p_workspace: I.L2F, p_id: null, p_data: { name: 'Social growth', description: 'Grow an audience with steady content.', focus_ids: [ftCreate.id, ftChallenge.id] } });
  const si = async (data: Row) => (await call(I.ADAM, 'planner_save_strategy_item', { p_workspace: I.L2F, p_id: null, p_data: { strategy_id: socialStrategy.id, ...data } })).id as string;
  const o1 = await si({ template_id: ftCreate.id, item_kind: 'objective', title: 'Publish 30 short videos' });
  await si({ parent_id: o1, item_kind: 'kpi', title: 'Videos published', target: 30, unit: 'videos' });
  await si({ parent_id: o1, item_kind: 'task', title: 'Write a month of scripts' });
  const o2 = await si({ template_id: ftChallenge.id, item_kind: 'objective', title: 'Reach 1,000 followers' });
  await si({ parent_id: o2, item_kind: 'kpi', title: 'Followers', target: 1000, unit: 'people' });
  await si({ parent_id: o2, item_kind: 'objective', title: 'Post every day for 10 days' });

  const goal = async (_user: string, data: Row) => (await call(I.ADAM, 'planner_save_goal', { p_plan: P, p_id: null, p_expected: null, p_data: data })).id as string;
  const kpi = async (g: string, m: Row, readings: [number, number][]) => {
    const meas = await call(I.ADAM, 'planner_save_measure', { p_goal: g, p_id: null, p_data: m });
    for (const [ago, v] of readings) await call(I.ELI, 'planner_record_reading', { p_measure: meas.id, p_value: v, p_recorded_on: day(-ago), p_note: null });
    return meas.id as string;
  };
  const update = (user: string, g: string, status: string, summary: string, extra: Row = {}) => call(user, 'planner_post_update', { p_goal: g, p_data: { status, summary, ...extra } });

  // Grow revenue
  const mrr = await goal(I.ADAM, { title: 'Reach $60k monthly recurring revenue', goal_type_id: T.Objective, focus_area_id: FA.grow, owner_id: I.EDITH, progress_mode: 'measure', priority: 'critical', weight: 4, start_date: day(-120), due_date: day(150), status: 'on_track', value_id: null });
  await kpi(mrr, { name: 'Monthly recurring revenue', unit: '$', start_value: 38000, target_value: 60000, cadence: 'monthly' }, [[120, 38000], [90, 41000], [60, 43500], [30, 45000], [3, 47500]]);
  await update(I.EDITH, mrr, 'on_track', 'Two retainers renewed at a higher tier; pipeline steady.', { confidence: 'high', next_step: 'Close the two open proposals before month end.' });
  const retainers = await goal(I.ADAM, { title: 'Win 12 new retainer clients', goal_type_id: T.Objective, focus_area_id: FA.grow, owner_id: I.ELI, progress_mode: 'children', status: 'on_track', priority: 'high', weight: 3, start_date: day(-90), due_date: day(120) });
  const outbound = await goal(I.ADAM, { title: 'Run the outbound sprint', parent_goal_id: retainers, goal_type_id: T.Initiative, owner_id: I.ELI, progress: 55, priority: 'high', weight: 2, start_date: day(-30), due_date: day(20) });
  await update(I.ELI, outbound, 'at_risk', 'Reply rate is below plan; we need a second offer angle.', { progress: 55, confidence: 'low', risk: 'Lead list quality', next_step: 'Test the audit-offer angle with 50 contacts.' });
  await call(I.ELI, 'planner_save_risk', { p_goal: outbound, p_id: null, p_data: { title: 'Lead list quality is poor', likelihood: 4, impact: 3, mitigation: 'Re-verify the list and cut weak segments.', owner_id: I.ELI } });
  for (const [t, a, s, due] of [['Write three outreach sequences', I.ELI, 'done', -12], ['Verify and clean the lead list', I.ELI, 'doing', 3], ['Book 10 discovery calls', I.EDITH, 'todo', 14]] as const)
    await call(I.ELI, 'planner_save_action', { p_goal: outbound, p_id: null, p_data: { title: t, assignee_id: a, status: s, due_date: day(due) } });
  const referral = await goal(I.ADAM, { title: 'Launch the referral programme', parent_goal_id: retainers, goal_type_id: T.Initiative, owner_id: I.EDITH, progress_mode: 'actions', priority: 'medium', weight: 2, start_date: day(-45), due_date: day(40), project_id: 'dddddddd-0000-4000-8000-000000000001' });
  for (const [t, s] of [['Define the reward', 'done'], ['Write the referral email', 'done'], ['Add a referral page to the site', 'done'], ['Brief the account managers', 'doing'], ['Announce to current clients', 'todo']] as const)
    await call(I.EDITH, 'planner_save_action', { p_goal: referral, p_id: null, p_data: { title: t, assignee_id: I.EDITH, status: s, due_date: day(s === 'todo' ? 25 : -5) } });
  await update(I.EDITH, referral, 'on_track', 'Page is live; briefing account managers this week.', { confidence: 'high' });
  const cases = await goal(I.ADAM, { title: 'Publish six client case studies', parent_goal_id: retainers, goal_type_id: T.Initiative, owner_id: I.ADAM, progress: 33, priority: 'medium', weight: 1, start_date: day(-60), due_date: day(90), status: 'on_track' });
  await call(I.ADAM, 'planner_add_comment', { p_goal: cases, p_body: 'Two are drafted; waiting on client approval for the third.' });
  const win = await goal(I.ADAM, { title: 'Lift proposal win rate to 45%', goal_type_id: T.Objective, focus_area_id: FA.grow, owner_id: I.ELI, progress_mode: 'measure', priority: 'high', weight: 2, start_date: day(-120), due_date: day(150), status: 'at_risk' });
  await kpi(win, { name: 'Proposal win rate', unit: '%', start_value: 28, target_value: 45, cadence: 'monthly' }, [[100, 28], [70, 31], [40, 34], [8, 36]]);

  // Delight clients
  const ontime = await goal(I.ADAM, { title: 'Deliver every funnel on time', goal_type_id: T.Objective, focus_area_id: FA.delight, owner_id: I.ADAM, progress_mode: 'children', status: 'on_track', priority: 'high', weight: 3, start_date: day(-100), due_date: day(200) });
  const onb = await goal(I.ADAM, { title: 'Standardise the onboarding checklist', parent_goal_id: ontime, goal_type_id: T.Initiative, owner_id: I.EDITH, progress: 100, status: 'completed', weight: 1, start_date: day(-90), due_date: day(-14) });
  await update(I.EDITH, onb, 'completed', 'Checklist is in use for every new client.', { progress: 100, confidence: 'high' });
  const rhythm = await goal(I.ADAM, { title: 'Weekly delivery review rhythm', parent_goal_id: ontime, goal_type_id: T.Initiative, owner_id: I.ADAM, progress: 70, status: 'on_track', weight: 2, start_date: day(-60), due_date: day(60) });
  await update(I.ADAM, rhythm, 'on_track', 'Seven weeks running; blockers surface earlier now.', { progress: 70, confidence: 'high' });
  const nps = await goal(I.ADAM, { title: 'Raise client NPS to 60', goal_type_id: T.Objective, focus_area_id: FA.delight, owner_id: I.ADAM, progress_mode: 'measure', priority: 'medium', weight: 2, start_date: day(-120), due_date: day(180), status: 'on_track' });
  await kpi(nps, { name: 'Net promoter score', unit: '', start_value: 41, target_value: 60, cadence: 'quarterly' }, [[110, 41], [20, 52]]);

  // Build the ecosystem
  const eco = await goal(I.ADAM, { title: 'Ship the Office apps to the team', goal_type_id: T.Objective, focus_area_id: FA.eco, owner_id: I.OLIVE, progress_mode: 'children', status: 'at_risk', priority: 'critical', weight: 4, start_date: day(-30), due_date: day(160) });
  const plannerApp = await goal(I.ADAM, { title: 'Planner live for both organizations', parent_goal_id: eco, goal_type_id: T.Initiative, owner_id: I.OLIVE, progress: 60, weight: 3, start_date: day(-14), due_date: day(30), status: 'on_track' });
  await update(I.OLIVE, plannerApp, 'on_track', 'Database layer and interface built; reviewing with the team next.', { progress: 60, confidence: 'medium' });
  const portal = await goal(I.ADAM, { title: 'Pass the Client Portal approval gate', parent_goal_id: eco, goal_type_id: T.Initiative, owner_id: I.ADAM, progress: 20, weight: 2, start_date: day(0), due_date: day(90), status: 'at_risk' });
  await call(I.ADAM, 'planner_save_risk', { p_goal: portal, p_id: null, p_data: { title: 'Gate review slips past quarter end', likelihood: 3, impact: 5, mitigation: 'Book the review date now.', owner_id: I.ADAM } });
  await goal(I.ADAM, { title: 'Drive and Projects foundations', parent_goal_id: eco, goal_type_id: T.Initiative, owner_id: I.ELI, progress: 35, weight: 2, start_date: day(10), due_date: day(150), status: 'on_hold' });

  // Run well
  const spend = await goal(I.ADAM, { title: 'Cut tool spend by 15%', goal_type_id: T.Objective, focus_area_id: FA.run, owner_id: I.OLIVE, progress_mode: 'measure', priority: 'medium', weight: 1, start_date: day(-60), due_date: day(100), status: 'on_track' });
  await kpi(spend, { name: 'Monthly tool spend', unit: '$', direction: 'decrease', start_value: 4200, target_value: 3570, cadence: 'monthly' }, [[60, 4200], [30, 4050], [4, 3900]]);
  const sops = await goal(I.ADAM, { title: 'Document the ten core SOPs', goal_type_id: T.Initiative, focus_area_id: FA.run, owner_id: I.ELI, progress: 40, priority: 'medium', weight: 1, start_date: day(-80), due_date: day(-10), status: 'off_track' });
  await update(I.ELI, sops, 'off_track', 'Behind: delivery work took priority. Four of ten are written.', { progress: 40, confidence: 'low', next_step: 'Block two hours each Friday.' });
  await call(I.ELI, 'planner_save_risk', { p_goal: sops, p_id: null, p_data: { title: 'No time reserved for documentation', likelihood: 5, impact: 2, owner_id: I.ELI, status: 'mitigating', mitigation: 'Friday writing block.' } });

  // reviews
  const past = await call(I.ADAM, 'planner_save_review', { p_plan: P, p_id: null, p_data: { title: 'Monthly review · last month', due_on: day(-28) } });
  await call(I.ADAM, 'planner_hold_review', { p_review: past.id, p_summary: 'Growth is steady; delivery is healthy. Documentation is the weak spot.', p_decisions: 'Reserve Friday writing time. Test a second outbound offer.' });
  await call(I.ADAM, 'planner_save_review', { p_plan: P, p_id: null, p_data: { title: 'Monthly review · this month', due_on: day(-2) } });
  await call(I.ADAM, 'planner_save_review', { p_plan: P, p_id: null, p_data: { title: 'Monthly review · next month', due_on: day(27) } });

  // a smaller second plan and a favourite
  const sprint = await call(I.ADAM, 'planner_save_plan', { p_workspace: I.L2F, p_id: null, p_expected: null, p_data: { name: 'Q4 delivery sprint', parent_plan_id: P, description: 'A 90-day push on delivery speed.', vision: 'Every client gets their funnel faster, without rushing.', period_start: day(-10), period_end: day(80), review_cadence: 'fortnightly' } });
  const sfa = (await call(I.ADAM, 'planner_save_focus_area', { p_plan: sprint.id, p_id: null, p_data: { name: 'Speed', color: 'amber' } })).id;
  const sg = await call(I.ADAM, 'planner_save_goal', { p_plan: sprint.id, p_id: null, p_expected: null, p_data: { title: 'Cut average build time from 18 to 12 days', focus_area_id: sfa, owner_id: I.ADAM, priority: 'high', progress: 25, status: 'on_track', due_date: day(70) } });
  await call(I.ADAM, 'planner_save_action', { p_goal: sg.id, p_id: null, p_data: { title: 'Time five recent builds', assignee_id: I.EDITH, status: 'doing', due_date: day(5) } });
  await call(I.EDITH, 'planner_toggle_favorite', { p_plan: P, p_on: true });
  await call(I.OLIVE, 'planner_toggle_favorite', { p_plan: P, p_on: true });
}

async function seedAurj(call: Call) {
  const I = DEMO_IDS;
  const plan = await call(I.ARIA, 'planner_save_plan', { p_workspace: I.AURJ, p_id: null, p_expected: null, p_data: {
    name: 'Aurj Growth Plan 2026', description: 'Build an audience, shape three signature offers, and deliver them beautifully.',
    vision: 'Help founders turn quiet expertise into offers people ask for.', period_start: day(-90), period_end: day(270), review_cadence: 'monthly' } });
  const P = plan.id;
  for (const [n, d] of [['Warmth', 'Write and design like a friend who knows the craft.'], ['Substance', 'Every offer earns its price.']])
    await call(I.ARIA, 'planner_save_value', { p_plan: P, p_id: null, p_data: { name: n, description: d } });
  const fa = async (name: string, color: string) => (await call(I.ARIA, 'planner_save_focus_area', { p_plan: P, p_id: null, p_data: { name, color } })).id;
  const FA = { aud: await fa('Audience', 'amber'), off: await fa('Signature offers', 'coral'), ful: await fa('Fulfilment', 'green') };
  const types = (await call(I.ARIA, 'planner_get_plan', { p_plan: P })).goal_types as Row[];
  const T = Object.fromEntries(types.map((t) => [t.name, t.id]));
  const goal = async (data: Row) => (await call(I.ARIA, 'planner_save_goal', { p_plan: P, p_id: null, p_expected: null, p_data: data })).id as string;
  const news = await goal({ title: 'Grow the newsletter to 5,000 readers', goal_type_id: T.Objective, focus_area_id: FA.aud, owner_id: I.EDDIE, progress_mode: 'measure', priority: 'high', start_date: day(-90), due_date: day(180), status: 'on_track' });
  const m = await call(I.ARIA, 'planner_save_measure', { p_goal: news, p_id: null, p_data: { name: 'Subscribers', start_value: 1800, target_value: 5000, cadence: 'weekly' } });
  for (const [ago, v] of [[84, 1800], [56, 2300], [28, 2900], [7, 3350]] as const) await call(I.EDDIE, 'planner_record_reading', { p_measure: m.id, p_value: v, p_recorded_on: day(-ago), p_note: null });
  const offers = await goal({ title: 'Launch three signature offers', goal_type_id: T.Objective, focus_area_id: FA.off, owner_id: I.OLIVE, progress_mode: 'children', status: 'on_track', priority: 'critical', start_date: day(-60), due_date: day(150) });
  await goal({ title: 'Offer one: the Clarity Session', parent_goal_id: offers, goal_type_id: T.Initiative, owner_id: I.ARIA, progress: 90, status: 'on_track', start_date: day(-60), due_date: day(-5) });
  await goal({ title: 'Offer two: the Founder Voice Kit', parent_goal_id: offers, goal_type_id: T.Initiative, owner_id: I.EDDIE, progress: 45, status: 'on_track', start_date: day(-20), due_date: day(60) });
  const o3 = await goal({ title: 'Offer three: the Launch Studio', parent_goal_id: offers, goal_type_id: T.Initiative, owner_id: I.OLIVE, progress: 10, status: 'not_started', start_date: day(30), due_date: day(150), project_id: 'dddddddd-0000-4000-8000-000000000002' });
  await call(I.ARIA, 'planner_save_risk', { p_goal: o3, p_id: null, p_data: { title: 'Scope grows before it launches', likelihood: 3, impact: 4, owner_id: I.OLIVE } });
  const nps = await goal({ title: 'Keep client satisfaction above 4.7 out of 5', goal_type_id: T.Objective, focus_area_id: FA.ful, owner_id: I.ARIA, progress_mode: 'measure', start_date: day(-90), due_date: day(270), status: 'on_track' });
  const m2 = await call(I.ARIA, 'planner_save_measure', { p_goal: nps, p_id: null, p_data: { name: 'Average rating', start_value: 4.2, target_value: 4.7, current_value: 4.55, cadence: 'monthly' } });
  await call(I.ARIA, 'planner_record_reading', { p_measure: m2.id, p_value: 4.55, p_recorded_on: day(-6), p_note: 'Post-session survey' });
  await goal({ title: 'Write the delivery playbook', goal_type_id: T.Initiative, focus_area_id: FA.ful, owner_id: I.EDDIE, progress: 15, status: 'at_risk', start_date: day(-30), due_date: day(40) });
  await call(I.ARIA, 'planner_save_review', { p_plan: P, p_id: null, p_data: { title: 'Monthly review', due_on: day(14) } });
  const studio = await call(I.ARIA, 'planner_save_plan', { p_workspace: I.AURJ, p_id: null, p_expected: null, p_data: { name: 'Content Studio', parent_plan_id: P, description: 'Weekly content that feeds the newsletter.', vision: 'Make something worth sharing every week.', period_start: day(-30), period_end: day(150) } });
  const sfa2 = (await call(I.ARIA, 'planner_save_focus_area', { p_plan: studio.id, p_id: null, p_data: { name: 'Publishing', color: 'teal' } })).id;
  await call(I.EDDIE, 'planner_save_goal', { p_plan: studio.id, p_id: null, p_expected: null, p_data: { title: 'Publish one article every week', focus_area_id: sfa2, owner_id: I.EDDIE, progress: 35, status: 'on_track', due_date: day(120) } });
  await call(I.ARIA, 'planner_save_plan', { p_workspace: I.AURJ, p_id: null, p_expected: null, p_data: { name: 'Fulfilment Playbook', parent_plan_id: P, description: 'How every client engagement is delivered.' } });
}
