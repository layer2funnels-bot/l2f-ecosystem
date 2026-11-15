// V8 fidelity check (owner, 14 Nov 2026: "V8 is the specification, not inspiration"). LOCAL ONLY.
// Opens each implemented page in the live app (local stack) and the matching route in the V8 prototype at desktop 1440, tablet 834 and
// phone 390; writes one side-by-side image per page and size (V8 left, ours right) and a table of measured properties for the shell parts
// both have (rail, sidebar, app bar, sidebar rows, page title, menus, drawers). Output: $SHOTS/v8cmp/ (git-ignored).
// Usage: PLAYWRIGHT_MODULE=... node scripts/v8-compare.mjs [filter]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import pg from 'pg';
import { startDevServer, LOCAL_ENV } from './dev-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');
const OUT = `${process.env.SHOTS || 'e2e-shots'}/v8cmp`; mkdirSync(OUT, { recursive: true });
const PROTO = new URL('../docs/design/v8/Layer2Funnels_V8_Developer_Handoff/08_PROTOTYPE_AND_SOURCE/ecosystem-v8.html', import.meta.url).href;
const filter = process.argv[2] ?? '';

const admin = new pg.Client({ connectionString: 'postgresql://supabase_admin:postgres@127.0.0.1:54332/postgres' }); await admin.connect();
const q = async (sql, a = []) => (await admin.query(sql, a)).rows;
const s = await startDevServer({ port: 0, sink: () => {}, env: { ...LOCAL_ENV, ...process.env } });
const base = `http://127.0.0.1:${s.port}`;
const browser = await chromium.launch();
const touch = await chromium.launch({ args: ['--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1'] });

// ---- one signed-in person, owner in Layer2Funnels (the same organizations the browser tests use)
const stamp = Date.now(); const EMAIL = `v8cmp.${stamp}@example.com`, PW = 'correct-horse-battery-staple';
const signup = await (await browser.newContext()).newPage();
await signup.goto(`${base}/#/signup`); await signup.fill('#nm', 'Tabish Riaz'); await signup.fill('#em', EMAIL); await signup.fill('#pw', PW); await signup.click('button[type=submit]');
await signup.waitForTimeout(1500);
const uid = (await q('select id from auth.users where email = $1', [EMAIL]))[0].id;
const L = (await q("select id from workspaces where slug = 'layer2funnels'"))[0].id;
const A = (await q("select id from workspaces where slug = 'aurj'"))[0]?.id;
await q("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','owner') on conflict do nothing", [L, uid]);
if (A) await q("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','editor') on conflict do nothing", [A, uid]);   // owner in Layer2Funnels ranks first, as in the prototype
await q('update profiles set active_workspace_id = $1 where id = $2', [L, uid]);   // Layer2Funnels, as in the prototype
const storage = await signup.context().storageState();
await signup.context().close();

// ---- the pages: [key, our address, V8 address, optional action after load (both sides), selectors measured on both sides [ours, V8]]
const SHELL = [['rail', '.shell.v8 .rail', '.rail'], ['sidebar', '.shell.v8 > .side', '.side'], ['app bar', '.shell.v8 .hdr.bar', '.bar'], ['sidebar row', '.shell.v8 .side .nav a', '.side .nav a'],
  ['sidebar row (current)', '.shell.v8 .side .nav a[aria-current=page]', '.side .nav a[aria-current=page]'], ['app name', '.shell.v8 .side-top b', '.side-top b'], ['page title', 'main h1', '.content h1, .content .t1']];
const click = (ours, proto) => async (p, side) => { const sel = side === 'ours' ? ours : proto; if (sel) await p.locator(sel).first().click().catch(() => {}); await p.waitForTimeout(500); };
const PAGES = [
  ['launcher', '#/launcher', '#/launcher', null, [['top row', '.l-top', '.l-top'], ['weather chip', '.wxchip', '.wxchip'], ['hero', '.l-hero h1', '.l-hero h1'], ['line under hero', '.l-hero .sub', '.l-hero .sub'], ['find an app', '.l-find', '.l-find'], ['shelf', '.shelf', '.shelf'], ['tile', '.tile', '.tile'], ['tile name', '.tile .t-name', '.tile .t-name'], ['tile text', '.tile .t-desc', '.tile .t-desc']]],
  ['office-home', '#/office', '#/office/home', null, [...SHELL.slice(0, 6), ...[['date line', '.o-hero .over'], ['greeting', '.o-hero h1'], ['summary', '.o-hero .sub'], ['view switch', '.o-hero .vsw'], ['view button', '.o-hero .vsw button'],
    ['ask bar', '.askbar'], ['ask pill', '.askbar .pill'], ['grid', '.o-grid'], ['left column', '.o-grid > .stackcol'], ['panel', '.o-grid .panel'], ['panel header', '.o-grid .sec-h'], ['panel title', '.o-grid .sec-h h2'],
    ['count', '.o-grid .sec-h .n'], ['day switch', '.o-grid .sec-h .vsw'], ['right panel', '.o-grid > .stackcol:last-child .panel'], ['link button', '.o-grid .linkbtn']].map(([l, sel]) => [l, `.v8p-oh ${sel}`, `.content ${sel}`])]],
  ['apps-menu', '#/office', '#/office/home', click('#app-switcher', '.rail button[title="All apps"]'), [['menu', '.menu.appmenu', '.appmenu'], ['launcher row', '.appmenu .home', '.appmenu .home'], ['app tile', '.appmenu .grid a', '.appmenu .grid a'], ['hint', '.appmenu .hint', '.appmenu .hint']]],
  ['org-menu', '#/office', '#/office/home', click('#org-switcher', '.rail .r-org'), [['menu', '#org-menu', '.menu.railmenu:not([hidden])']]],
  ['profile-menu', '#/office', '#/office/home', click('.profile-wrap .who', '.rail .r-me, .rail .me, .rail button:last-child'), [['menu', '#profile-menu', '.menu:not([hidden])']]],
  ['notifications', '#/office', '#/office/home', click('#bell', '.rail button[title*="otification" i], .rail [aria-label*="otification" i]'), [['drawer', '.nfx', '.drawer.open'], ['item', '.nfx-item', '.drawer.open .nitem']]],
  ['search', '#/office', '#/office/home', async (p, side) => { await p.keyboard.press('Control+k'); await p.waitForTimeout(500); }, [['dialog', '.gsx', '.cmdk']]],
  ['profile', '#/profile/about', '#/profile', null, [['top bar', '.shell.v8 .hdr.bar', '.fbar5'], ['bar title', '.shell.v8 .focusbar .hdr-ttl b', '.fbar5 .grow b'], ['bar photo', '.focusbar-photo', '.fbar5 .photo'], ['back', '.focusbar .hdr-back', '.fbar5 .iconbtn'], ['header', '.pf8-head', '.prof-head'], ['name', '.pf8-name', '.prof-head h1'], ['tab', '.pf8-tabs a', '.prof-tabs a'], ['label', '.pf8 .fld label', '.prof label'], ['input', '.pf8 .fld input', '.prof input'], ['save', '.pf8 .btn.primary', '.prof .btn.primary'], ['card', '.pf8-card', '.prof .panel']]],
  ['profile-account', '#/profile/account', '#/profile/account', null, []],
  ['profile-notifications', '#/profile/notifications', '#/profile/notifications', null, []],
  ['profile-appearance', '#/profile/appearance', '#/profile/appearance', null, []],
  ['of-funnels', '#/office/funnels', '#/office/funnels', null, SHELL], ['of-avatars', '#/office/funnels/avatars', '#/office/avatars', null, SHELL],
  ['of-avatar-new', '#/office/funnels/avatars/new', '#/office/avatar-new', null, []], ['of-offers', '#/office/funnels/offers', '#/office/offers', null, SHELL],
  ['of-offer-new', '#/office/funnels/offers/new', '#/office/offer-new', null, []], ['of-stories', '#/office/funnels/stories', '#/office/stories', null, SHELL],
  ['of-story-new', '#/office/funnels/stories/new', '#/office/story-new', null, []], ['of-brandkits', '#/office/funnels/brand_kits', '#/office/brandkits', null, SHELL],
  ['of-brandkit-new', '#/office/funnels/brand_kits/new', '#/office/brandkit-new', null, []], ['of-strategies', '#/office/funnels/strategies', '#/office/strategies', null, SHELL],
  ['of-template', '#/office/funnels/strategies/template', '#/office/strategy-template', null, SHELL], ['of-documents', '#/office/documents', '#/office/documents', null, SHELL],
  ['of-team', '#/office/team', '#/office/team', null, SHELL], ['of-apps', '#/office/apps', '#/office/apps', null, SHELL], ['of-settings', '#/office/settings', '#/office/settings', null, SHELL],
  ['of-admin-people', '#/office/admin/people', '#/office/admin/people', null, SHELL], ['of-admin-clients', '#/office/admin/clients', '#/office/admin/clients', null, SHELL],
  ['of-admin-roles', '#/office/admin/roles', '#/office/admin/roles', null, SHELL], ['of-admin-review', '#/office/admin/review', '#/office/admin/review', null, SHELL],
  ['of-admin-storage', '#/office/admin/storage', '#/office/admin/storage', null, SHELL], ['of-admin-branding', '#/office/admin/branding', '#/office/admin/branding', null, SHELL],
  ['tk-today', '#/tasks/today', '#/tasks/today', null, SHELL], ['tk-upcoming', '#/tasks/upcoming', '#/tasks/upcoming', null, SHELL], ['tk-inbox', '#/tasks/inbox', '#/tasks/inbox', null, SHELL],
  ['tk-teammates', '#/tasks/teammates', '#/tasks/teammates', null, SHELL], ['tk-mine', '#/tasks/list/MINE', '#/tasks/list/mine', null, SHELL], ['tk-team', '#/tasks/list/TEAM', '#/tasks/list/team', null, SHELL],
  ['clients-list', '#/clients', '#/clients/list', null, SHELL],
  ['drive-home', '#/drive', '#/drive/home', null, SHELL],
  ['projects-home', '#/projects', '#/projects/home', null, SHELL],
  ['planner', '#/planner', '#/planner/home', null, SHELL],
].filter(([k]) => k.includes(filter));
const SIZES = [[1440, 900, 'desktop'], [834, 1112, 'tablet'], [390, 844, 'phone']];

const measure = (p, sels) => p.evaluate((sels) => sels.map((sel) => { const e = sel && document.querySelector(sel); if (!e) return null; const c = getComputedStyle(e); const r = e.getBoundingClientRect();
  return { margin: c.margin, top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), font: `${c.fontSize}/${c.fontWeight}/${c.lineHeight}`, pad: c.padding, rad: c.borderRadius, bg: c.backgroundColor, color: c.color, shadow: c.boxShadow === 'none' ? 'none' : c.boxShadow.slice(0, 40) }; }), sels);

const report = [];
for (const [key, ours, v8, act, sels] of PAGES) for (const [w, hgt, size] of SIZES) {
  const b = size === 'desktop' ? browser : touch;
  const mine = await (await b.newContext({ viewport: { width: w, height: hgt }, storageState: storage, hasTouch: size !== 'desktop' })).newPage();
  const ref = await (await b.newContext({ viewport: { width: w, height: hgt }, hasTouch: size !== 'desktop' })).newPage();
  // the prototype loads Geist (variable) from Google Fonts; serve the same variable files locally so both sides render the same font
  await ref.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ contentType: 'text/css', body: '@font-face{font-family:"Geist";font-weight:100 900;src:url(https://fonts.gstatic.com/geist.woff2) format("woff2")}@font-face{font-family:"Geist Mono";font-weight:100 900;src:url(https://fonts.gstatic.com/geist-mono.woff2) format("woff2")}@font-face{font-family:"Bricolage Grotesque";font-weight:700;src:url(https://fonts.gstatic.com/bricolage.woff2) format("woff2")}' }));
  await ref.route(/fonts\.gstatic\.com/, (r) => { const f = { 'geist.woff2': 'geist-variable.woff2', 'geist-mono.woff2': 'geist-mono-variable.woff2', 'bricolage.woff2': 'bricolage-grotesque-latin-700.woff2' }[r.request().url().split('/').pop()]; return f ? r.fulfill({ contentType: 'font/woff2', body: readFileSync(new URL(`../apps/web/fonts/${f}`, import.meta.url)) }) : r.abort(); });
  let addr = ours;
  if (addr.includes('MINE') || addr.includes('TEAM')) {   // Tasks: the person's own lists exist only after a first visit (My tasks is made on first use)
    if (!globalThis.__tk) { await mine.goto(`${base}/#/tasks/today`); await mine.waitForTimeout(2500);
      const lists = await q('select id, is_default from task_lists where owner_id = $1', [uid]); let team = lists.find((x) => !x.is_default)?.id;
      if (!team) { team = (await q("insert into task_lists (workspace_id, owner_id, space, name, colour, icon) values ($1,$2,'team','Build team','#2B63F6','team') returning id", [L, uid]))[0].id; await q("insert into task_blocks (workspace_id, list_id, name) values ($1,$2,'Open')", [L, team]); }
      const mineId = lists.find((x) => x.is_default)?.id; const blocks = await q('select id from task_blocks where list_id = $1 order by position', [mineId]);
      const seed = [['Write the quiz questions', 0, null], ['Reply to DMs', 0, 'now()'], ['Record intro video', 0, null], ['Update tracker', 0, 'now()'], ['Plan next week', 1, null]];
      for (const [t, b, d] of seed) await q(`insert into task_items (workspace_id, list_id, block_id, title, due_date, created_by, done_at) values ($1,$2,$3,$4,current_date,$5,${d ?? 'null'})`, [L, mineId, blocks[b].id, t, uid]);
      globalThis.__tk = { MINE: mineId, TEAM: team }; }
    addr = addr.replace('MINE', globalThis.__tk.MINE).replace('TEAM', globalThis.__tk.TEAM);
  }
  await mine.goto(`${base}/${addr}`); await mine.waitForTimeout(2200);
  await ref.goto(`${PROTO}${v8}`); await ref.waitForTimeout(1200);
  if (act) { await act(ref, 'v8'); await act(mine, 'ours'); }
  const [a, bb] = [await ref.screenshot(), await mine.screenshot()];
  // side by side: V8 left, ours right, same scale
  const comp = await (await browser.newContext({ viewport: { width: w * 2 + 24, height: hgt + 40 } })).newPage();
  await comp.setContent(`<body style="margin:0;background:#888;font:14px sans-serif"><div style="display:flex;gap:24px"><figure style="margin:0"><figcaption style="color:#fff;height:40px;line-height:40px">V8 · ${key} · ${w}</figcaption><img src="data:image/png;base64,${a.toString('base64')}"></figure><figure style="margin:0"><figcaption style="color:#fff;height:40px;line-height:40px">Ours</figcaption><img src="data:image/png;base64,${bb.toString('base64')}"></figure></div></body>`);
  await comp.screenshot({ path: `${OUT}/${key}-${w}.png` }); await comp.context().close();
  if (sels.length) {
    const [m1, m2] = [await measure(ref, sels.map((x) => x[2])), await measure(mine, sels.map((x) => x[1]))];
    sels.forEach(([label], i) => { const v = m1[i], o = m2[i]; if (!v && !o) return;
      const diffs = !v || !o ? ['missing on one side'] : Object.keys(v).filter((k) => (k === 'w' || k === 'h' || k === 'top' ? Math.abs(v[k] - o[k]) > 1 : v[k] !== o[k])).map((k) => `${k}: V8 ${v[k]} · ours ${o[k]}`);
      report.push(`${key} ${w} ${label}: ${diffs.length ? diffs.join('; ') : 'same'}`); });
  }
  await mine.context().close(); await ref.context().close();
}
writeFileSync(`${OUT}/report.txt`, report.join('\n') + '\n');
console.log(report.join('\n'));
await browser.close(); await touch.close(); await s.close(); await admin.end();
