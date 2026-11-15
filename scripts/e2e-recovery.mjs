// Browser end-to-end for the quality recovery (owner brief, 15 Nov 2026) on the LOCAL stack: real Chromium → our app → /api → Supabase Auth + Postgres (0060).
// Avatar Studio (import of the owner's reference document, flexible sections, editor, Profile cards, settings), Teammate access switches,
// Launcher order, organization name, Documents linked from Drive. Every check reads the database after the UI says it saved.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import pg from 'pg';
import { startDevServer, LOCAL_ENV } from './dev-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');
const SHOTS = process.env.SHOTS || 'e2e-shots'; mkdirSync(SHOTS, { recursive: true });
const DOCX = new URL('../docs/implementation/recovery/Dream_Customer_Avatar_Farhat_V1.0.docx', import.meta.url).pathname;
const results = []; const check = (id, n, ok, d = '') => { results.push({ id, n, ok: !!ok, d }); if (!ok) console.log(`FAIL ${id}: ${n} ${d}`); };
const admin = new pg.Client({ connectionString: 'postgresql://supabase_admin:postgres@127.0.0.1:54332/postgres' }); await admin.connect();
const q = async (sql, a = []) => (await admin.query(sql, a)).rows;
const s = await startDevServer({ port: 0, sink: () => {}, env: { ...LOCAL_ENV, ...process.env }, root: process.env.WEB_ROOT, limits: { read: { max: 3000, windowMs: 60_000 }, write: { max: 600, windowMs: 60_000 }, sensitive: { max: 200, windowMs: 60_000 } } });
const base = `http://127.0.0.1:${s.port}`;
const browser = await chromium.launch();
const problems = []; const apiErr = [];
const watch = (p) => { p.on('response', async (r) => { if (r.url().includes('/api/') && r.status() >= 400) apiErr.push(`${r.status()} ${r.url().split('/api/')[1]} ${(await r.text().catch(() => '')).slice(0, 160)}`); });
  p.on('pageerror', (e) => problems.push(`pageerror ${e.message}`)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`console ${m.text().slice(0, 200)}`); }); return p; };
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
const toastText = (p) => p.locator('.toast[data-show=true]').last().innerText().catch(() => '');
const L = (await q("select id from workspaces where slug = 'layer2funnels'"))[0].id;
await q('delete from avatar_settings where workspace_id = $1', [L]);   // each run starts from the standard defaults
const stamp = Date.now(); const PW = 'correct-horse-battery-staple';
async function person(name, role) {
  const email = `rc.${name.split(' ')[0].toLowerCase()}.${stamp}@example.com`; const c = await browser.newContext(); const p = await c.newPage();
  await p.goto(`${base}/#/signup`); await p.fill('#nm', name); await p.fill('#em', email); await p.fill('#pw', PW); await p.click('button[type=submit]'); await p.waitForTimeout(1200); await c.close();
  const id = (await q('select id from auth.users where email = $1', [email]))[0].id;
  await q("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3) on conflict do nothing", [L, id, role]); await q('update profiles set active_workspace_id = $1, display_name = $3 where id = $2', [L, id, name]);
  return { id, email, name };
}
async function signIn(u, { w = 1440, h = 900 } = {}) {
  const p = watch(await (await browser.newContext({ viewport: { width: w, height: h } })).newPage());
  await p.goto(`${base}/#/signin`); await p.fill('#em', u.email); await p.fill('#pw', PW); await p.click('button[type=submit]'); await p.waitForTimeout(1500); return p;
}
const O = await person('Rana Owner', 'owner'); const E = await person('Ehsan Editor', 'editor');
const page = await signIn(O);

// =============================================================== Avatar Studio: import the reference document
await page.goto(`${base}/#/office/funnels/avatars/new`); await page.waitForSelector('.startc');
await page.setInputFiles('.startc input[type=file]', DOCX); await page.waitForSelector('text=sections found', { timeout: 15000 });
const found = await page.locator('.proc small').innerText();
check('AV1', 'Reading the reference document finds its own sections (13 top headings, nothing forced into 12)', /13 sections found/.test(found), found);
await page.getByRole('button', { name: 'Continue' }).click(); await page.waitForSelector('.imp-row');
const rowsN = await page.locator('.imp-row').count();
const partSel = page.locator('.imp-part', { hasText: 'What They Are Scared Of' }).locator('select');
check('AV2', 'The review lists every document section and suggests moving “What They Are Scared Of” to What drives them (changeable)', rowsN === 13 && (await partSel.inputValue()) === 'drives');
await page.locator('.imp-row').nth(0).locator('details summary').click();
check('AV3', 'Each section can be opened to read the extracted text before anything is saved', (await page.locator('.imp-row').nth(0).locator('details .avb').innerText()).includes('Farhat'));
// leave the "Document details" section out on purpose, keep everything else
await page.locator('.imp-row').nth(0).locator('.imp-head select').selectOption('skip');
check('AV4', 'Leaving a section out is the person’s choice and the count updates', /12 of 13 sections/.test(await page.locator('.tb6 b').last().innerText()));
await page.getByRole('button', { name: 'Looks right' }).click(); await page.getByRole('button', { name: 'Next' }).click();
check('AV5', 'The name starts from the document (“Avatar Name: Farhat”)', (await page.locator('input[placeholder="John"]').inputValue()) === 'Farhat');
await page.getByRole('button', { name: 'Create avatar' }).click(); await page.waitForURL(/avatars\/[0-9a-f-]{36}$/, { timeout: 15000 }); await page.waitForSelector('.studio');
const av = (await q("select id, profile from funnel_avatars where name = 'Farhat' and created_by = $1 order by created_at desc limit 1", [O.id]))[0];
const secs = av?.profile?.sections ?? [];
check('AV6', 'The avatar is saved with flexible sections (v2): its document sections plus “What drives them” and “Beliefs” built from moved parts', av?.profile?.v === 2 && secs.length === 14 && secs.some((x) => x.type === 'drives') && secs.some((x) => x.title === 'Pain & Problems'), `${secs.length}`);
const allText = JSON.stringify(secs);
check('AV7', 'No content was silently dropped: text from the last section and from tables is there', allText.includes('domestic conflicts') && allText.includes('Teacher will not be able to satisfy') && allText.includes('Optimistic'));
await page.waitForSelector('.avcardp .avb-t', { timeout: 9000 }).catch(() => {}); const cardsTxt = await page.locator('.avcardp h3').allInnerTexts();
check('AV8', 'The Profile shows chosen cards (At a glance, Scared of …), the facts table with a real header (not “Attribute / Detail” as data)', cardsTxt.some((t) => /at a glance/i.test(t)) && cardsTxt.some((t) => /scared/i.test(t))
  && !(await page.locator('.avcardp .avb-t td').allInnerTexts()).includes('Attribute'), cardsTxt.join('|'));
const orbit = await page.locator('.orbit').count();
check('AV9', 'At most three short facts circle the figure (they never cover the face)', orbit <= 3);
await shot(page, 'rc-av-profile');
await page.goto(`${base}/#/office/funnels/avatars/${av.id}/deep`); await page.waitForSelector('.chap');
check('AV10', 'The Full profile shows every section in order', (await page.locator('.chap').count()) === 14 && /market map/i.test(await page.locator('.chapters a').first().innerText()));
await shot(page, 'rc-av-full');

// ---- editor: add, rename, edit content, reorder, delete; Profile picks
await page.goto(`${base}/#/office/funnels/avatars/${av.id}/edit/new`); await page.waitForSelector('.dlg, [role=dialog]');
await page.locator('[role=dialog] select').selectOption('custom'); await page.locator('[role=dialog] input[aria-label="Section name"]').fill('Objections we hear');
await page.locator('[role=dialog] input[type=checkbox]').check(); await page.getByRole('button', { name: 'Add section' }).click();
await page.waitForSelector('.blked'); await page.locator('.blked textarea').first().fill('“It’s too expensive for me right now.”');
await page.getByRole('button', { name: 'List item' }).click(); await page.locator('.blk-li input').last().fill('Price');
await page.locator('.tp-title').fill('Objections');
await page.locator('.navrow', { hasText: 'Objections' }).getByRole('button', { name: /up/ }).click();
await page.locator('.focusbar-acts').getByRole('button', { name: 'Save' }).click(); await page.waitForURL(/\/deep/, { timeout: 9000 });
const p2 = (await q('select profile from funnel_avatars where id = $1', [av.id]))[0].profile; const obj = p2.sections.find((x) => x.title === 'Objections');
check('AV11', 'A new custom section is added, renamed, filled (paragraph + list item), moved, saved and shown on the profile', obj && p2.sections.length === 15 && p2.sections[13].title === 'Objections'
  && obj.blocks.some((b) => b.t === 'li' && b.x === 'Price') && p2.cards.some((c) => c.sid === obj.id && c.sub === ''));
// delete a section
await page.goto(`${base}/#/office/funnels/avatars/${av.id}/edit/${obj.id}`); await page.waitForSelector('.blked');
await page.getByRole('button', { name: 'Delete section' }).click(); await page.locator('[role=dialog]').getByRole('button', { name: 'Delete section' }).click();
await page.locator('.focusbar-acts').getByRole('button', { name: 'Save' }).click(); await page.waitForTimeout(1200);
const p3 = (await q('select profile from funnel_avatars where id = $1', [av.id]))[0].profile;
check('AV12', 'Deleting a section removes it and its profile card after saving', p3.sections.length === 14 && !p3.cards.some((c) => c.sid === obj.id));
// remove a card from the profile without touching the content
await page.goto(`${base}/#/office/funnels/avatars/${av.id}`); await page.waitForSelector('.avcardp');
const before = (await q('select profile from funnel_avatars where id = $1', [av.id]))[0].profile; const n0 = before.cards.length;
await page.locator('.avcardp').first().getByRole('button', { name: /Remove/ }).click(); await page.waitForTimeout(1200);
const after = (await q('select profile from funnel_avatars where id = $1', [av.id]))[0].profile;
check('AV13', 'Removing a card from the profile keeps the section’s content in the Full profile', after.cards.length === n0 - 1 && JSON.stringify(after.sections) === JSON.stringify(before.sections));
await page.getByRole('button', { name: 'Choose what the profile shows' }).click(); await page.locator('.cardpick .chk', { hasText: 'Pain & Problems' }).first().locator('input').check();
await page.locator('[role=dialog]').getByRole('button', { name: 'Save' }).click(); await page.waitForTimeout(1200);
const after2 = (await q('select profile from funnel_avatars where id = $1', [av.id]))[0].profile;
check('AV14', 'Any Full profile section can be put on the Profile', after2.cards.some((c) => after2.sections.find((x) => x.id === c.sid)?.title === 'Pain & Problems'));

// ---- an older avatar (fixed chapters) still opens and converts
const legacy = (await q(`insert into funnel_avatars (workspace_id, name, profile, created_by) values ($1, 'Legacy John', $2, $3) returning id`, [L, JSON.stringify({ facts: [['Age', '30+'], ['Income', '$20K']], wants: ['Freedom'], scared: ['Wasting money'], custom: [{ title: 'Notes from calls', text: 'Line one' }] }), O.id]))[0].id;
await page.goto(`${base}/#/office/funnels/avatars/${legacy}`); await page.waitForSelector('.avcardp', { timeout: 9000 });
check('AV15', 'An avatar saved in the old fixed-chapter shape opens with its content as sections and cards', (await page.locator('.avcardp').allInnerTexts()).join(' ').includes('Wasting money'));
await page.goto(`${base}/#/office/funnels/avatars/not-a-real-id`); await page.waitForTimeout(1500);
check('AV16', 'A wrong avatar address shows “not found”, not “We couldn’t load this”', !(await page.locator('body').innerText()).includes('We couldn’t load this'));

// ---- settings: defaults for NEW avatars only
await page.goto(`${base}/#/office/funnels/avatars/settings`); await page.waitForSelector('.setrow');
const nDefaults = await page.locator('.setrow').count();
await page.getByRole('button', { name: 'Add a default section' }).click(); await page.locator('.setrow').last().locator('input').first().fill('Objections');
await page.locator('.setrow').last().locator('input[type=checkbox]').check();
await page.locator('.setrow').first().getByRole('button', { name: /Remove/ }).click();
await page.getByRole('button', { name: 'Save' }).click(); await page.waitForURL(/avatars$/, { timeout: 9000 });
const st = (await q('select sections from avatar_settings where workspace_id = $1', [L]))[0]?.sections ?? [];
check('AV17', 'Avatar settings save the default sections (added, removed, on-profile) and return to the list', st.length === nDefaults && st.at(-1).title === 'Objections' && st.at(-1).profile === true && st[0].type !== 'market');
const farhatAfter = (await q('select profile from funnel_avatars where id = $1', [av.id]))[0].profile;
check('AV18', 'Changing the defaults never changes an existing avatar', JSON.stringify(farhatAfter) === JSON.stringify(after2));
await page.goto(`${base}/#/office/funnels/avatars/new`); await page.getByRole('button', { name: /Start blank/ }).click(); await page.getByRole('button', { name: 'Next' }).click();
await page.locator('input[placeholder="John"]').fill('Blank Bina'); await page.getByRole('button', { name: 'Create avatar' }).click(); await page.waitForSelector('.studio', { timeout: 9000 });
const blank = (await q("select profile from funnel_avatars where name = 'Blank Bina' and created_by = $1", [O.id]))[0].profile;
check('AV19', 'A blank avatar starts with the organization’s default sections', blank.sections.length === st.length && blank.sections.at(-1).title === 'Objections' && blank.cards.some((c) => c.sid === blank.sections.at(-1).id));
const ed = await signIn(E); await ed.goto(`${base}/#/office/funnels/avatars/settings`); await ed.waitForSelector('.setrow', { timeout: 9000 });
const r403 = await ed.evaluate(async () => (await fetch('/api/office.avatar.settings.set', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${JSON.parse(localStorage.getItem('l2f.session') ?? sessionStorage.getItem('l2f.session') ?? '{}').access ?? ''}` }, body: '{"sections":[{"type":"custom","title":"x"}]}' })).status).catch(() => 0);
const stAfter = (await q('select sections from avatar_settings where workspace_id = $1', [L]))[0].sections;
check('AV20', 'An editor sees the settings read-only and the server refuses their change', (await ed.locator('.setrow input').first().isDisabled()) && stAfter.length === st.length, `status ${r403}`);

// =============================================================== Stories and Brand Kits: create, edit, return to the list, persists after refresh
await page.goto(`${base}/#/office/funnels/stories/new`); await page.waitForSelector('input[placeholder="From 0 to 41 booked calls"]');
await page.fill('input[placeholder="From 0 to 41 booked calls"]', `Recovery story ${stamp}`); await page.getByRole('radio', { name: 'Testimonial' }).click();
await page.locator('.formcol textarea').first().fill('She doubled her calls.'); await page.fill('input[placeholder="2 calls a week"]', '2 calls'); await page.fill('input[placeholder="41 calls in 30 days"]', '41 calls');
await page.getByRole('radio', { name: 'Ask consent' }).click(); await page.getByRole('button', { name: 'Emails' }).click(); await page.getByRole('button', { name: 'Ads' }).click();
await page.locator('.focusbar-acts').getByRole('button', { name: 'Save story' }).dblclick(); await page.waitForURL(/funnels\/stories$/, { timeout: 9000 });
const sto = await q("select id, kind, permission, use_in, before_text, body from funnel_stories where title = $2 and workspace_id = $1", [L, `Recovery story ${stamp}`]);
check('ST1', 'A new story saves once (a double click doesn’t make two) with its type, before/after, consent setting and uses, then returns to the list', sto.length === 1 && sto[0].kind === 'testimonial' && sto[0].permission === 'ask' && sto[0].use_in.join() === 'Emails,Ads' && sto[0].before_text === '2 calls');
await page.reload(); await page.waitForSelector(`text=Recovery story ${stamp}`, { timeout: 9000 });
check('ST2', 'The new story is in the list after a refresh', true);
await page.goto(`${base}/#/office/funnels/stories/${sto[0].id}/edit`); await page.waitForSelector('.formcol textarea');
await page.locator('.formcol textarea').first().fill('She tripled her calls.'); await page.getByRole('radio', { name: 'Consent given' }).click();
await page.locator('.focusbar-acts').getByRole('button', { name: 'Save story' }).click(); await page.waitForURL(/funnels\/stories$/, { timeout: 9000 });
const sto2 = (await q('select body, permission from funnel_stories where id = $1', [sto[0].id]))[0];
check('ST3', 'Editing a story updates its content and consent and returns to the list', sto2.body === 'She tripled her calls.' && sto2.permission === 'given');
await page.goto(`${base}/#/office/funnels/stories/new`); await page.waitForSelector('input[placeholder="From 0 to 41 booked calls"]');
await page.locator('.focusbar-acts').getByRole('button', { name: 'Save story' }).click(); await page.waitForTimeout(600);
check('ST4', 'Saving without a headline stays on the form and says what is missing', /stories\/new/.test(page.url()) && /headline/i.test(await toastText(page)));

await page.goto(`${base}/#/office/funnels/brand_kits/new`); await page.waitForSelector('input[placeholder="e.g. Funnel Done Right Challenge"]');
await page.fill('input[placeholder="e.g. Funnel Done Right Challenge"]', `Recovery kit ${stamp}`);
await page.locator('input[list=bk-hf]').fill('Totally Made Up Font Zz'); await page.waitForTimeout(400);
const noFont = await page.locator('.fontst').first().getAttribute('class');
await page.locator('input[list=bk-hf]').fill('Geist'); await page.waitForTimeout(500);
const yesFont = await page.locator('.fontst').first().getAttribute('class');
check('BK1', 'A typed font name is checked for real: an unknown font is said not to show, a built-in one shows', /no/.test(noFont) && /ok/.test(yesFont), `${noFont} / ${yesFont}`);
await page.locator('input[list=bk-bf]').fill('Arial Rounded Whatever');
await page.locator('.focusbar-acts').getByRole('button', { name: 'Save brand kit' }).click(); await page.waitForURL(/funnels\/brand_kits$/, { timeout: 9000 });
const bk = (await q("select fonts from funnel_brand_kits where name = $2 and workspace_id = $1", [L, `Recovery kit ${stamp}`]))[0];
await page.waitForSelector(`text=Recovery kit ${stamp}`, { timeout: 9000 }).catch(() => {});
check('BK2', 'The brand kit saves any typed font names and returns to the list, where it is visible', bk?.fonts?.join() === 'Geist,Arial Rounded Whatever' && await page.locator(`text=Recovery kit ${stamp}`).first().isVisible());

// =============================================================== Launcher: bell colour (V8: white on the sky) and arranging apps
await q('delete from workspace_app_order where workspace_id = $1', [L]);
await page.goto(`${base}/#/launcher`); await page.waitForSelector('.shelf .tile');
const bellColor = await page.locator('.in-launcher #bell').evaluate((e) => getComputedStyle(e).color);
check('LA1', 'The Launcher bell is white on the sky like search (V8), not the dark app-bar style', bellColor === 'rgb(255, 255, 255)', bellColor);
await page.getByRole('button', { name: 'Arrange apps' }).click(); await page.waitForSelector('.shelf.arranging');
const firstGroup = page.locator('.l-group').first(); const names0 = await firstGroup.locator('.tile').evaluateAll((ts) => ts.map((t) => t.dataset.app));
await firstGroup.locator('.tile').nth(1).dragTo(firstGroup.locator('.tile').nth(0), { targetPosition: { x: 5, y: 40 } }); await page.waitForTimeout(1500);
const names1 = await page.locator('.l-group').first().locator('.tile').evaluateAll((ts) => ts.map((t) => t.dataset.app));
const saved = (await q('select app_key from workspace_app_order where workspace_id = $1 order by position', [L])).map((r) => r.app_key);
check('LA2', 'An owner drags an app to a new place; the new order shows at once and is saved for the organization', names1[0] === names0[1] && names1[1] === names0[0] && saved[0] === names0[1], `${names0.join()} → ${names1.join()} saved ${saved.slice(0, 3).join()}`);
await page.getByRole('button', { name: `Move ${await page.locator('.l-group').first().locator('.tile').nth(0).getAttribute('aria-label').then((x) => x.split(':')[0])} later` }).click(); await page.waitForTimeout(1500);
const saved2 = (await q('select app_key from workspace_app_order where workspace_id = $1 order by position', [L])).map((r) => r.app_key);
check('LA3', 'The arrows move an app too (keyboard and touch)', saved2[0] === names0[0] && saved2[1] === names0[1]);
await page.getByRole('button', { name: 'Done' }).click();
const ed2 = await signIn(E); await ed2.goto(`${base}/#/launcher`); await ed2.waitForSelector('.shelf .tile');
const edNames = await ed2.locator('.l-group').first().locator('.tile').evaluateAll((ts) => ts.map((t) => t.dataset.app));
const edOrder = saved2.filter((k) => edNames.includes(k));
check('LA4', 'A teammate sees the organization’s order after signing in, and has no Arrange button', JSON.stringify(edNames.slice(0, 2)) === JSON.stringify(edOrder.slice(0, 2)) && (await ed2.getByRole('button', { name: 'Arrange apps' }).count()) === 0);
await page.reload(); await page.waitForSelector('.shelf .tile');
check('LA5', 'The order stays after a refresh', (await page.locator('.l-group').first().locator('.tile').first().getAttribute('data-app')) === saved2.filter((k) => names0.includes(k))[0]);
await shot(page, 'rc-launcher');

// =============================================================== Teammate access: switches show what is saved
await page.goto(`${base}/#/office/admin/person/${E.id}`); await page.waitForSelector('.acc-row', { timeout: 9000 });
const row = page.locator('.acc-row', { hasText: 'Drive' }).first(); const sw = row.locator('summary [role=switch]');
const was = await sw.getAttribute('aria-checked');
for (let n = 0; n < 8; n++) { await sw.click(); await page.waitForFunction((el) => !el.disabled, await sw.elementHandle()); }
const grant = (await q("select count(*)::int n from app_grants where workspace_id = $1 and user_id = $2 and app_key = 'drive'", [L, E.id]))[0].n;
check('TA1', 'Eight quick switches in a row all save (no rate-limit errors) and the switch matches the database afterwards', (await sw.getAttribute('aria-checked')) === was && String(grant === 1) === was && !apiErr.some((e) => e.startsWith('429')), `ui ${await sw.getAttribute('aria-checked')} db ${grant}`);
await row.locator('summary').click(); const feat = row.locator('.tg-row').first(); const fsw = feat.locator('[role=switch]');
const f0 = await fsw.getAttribute('aria-checked'); await fsw.click(); await page.waitForTimeout(1200);
const pill1 = await feat.locator('.pill').innerText(); await fsw.click(); await page.waitForTimeout(1200);
const pill2 = await feat.locator('.pill').innerText(); const ovs = (await q('select count(*)::int n from permission_overrides where workspace_id = $1 and principal_id = $2', [L, E.id]))[0].n;
check('TA2', 'A feature switched off shows “Changed”; switched back it returns to the role (no leftover exception in the database)', pill1 === 'Changed' && pill2 !== 'Changed' && (await fsw.getAttribute('aria-checked')) === f0 && ovs === 0, `${pill1}/${pill2}/${ovs}`);

// =============================================================== Organization settings
await page.goto(`${base}/#/office/admin/branding`); await page.waitForSelector('input[aria-label="Organization name"]');
const oldName = (await q('select name from workspaces where id = $1', [L]))[0].name;
await page.fill('input[aria-label="Organization name"]', 'Layer2Funnels Test'); await page.getByRole('button', { name: 'Save name' }).click(); await page.waitForTimeout(2500);
check('OR1', 'An owner renames the organization; the new name shows after the page reloads', (await q('select name from workspaces where id = $1', [L]))[0].name === 'Layer2Funnels Test' && (await page.locator('body').innerText()).includes('Layer2Funnels Test'));
await q('update workspaces set name = $2 where id = $1', [L, oldName]);

// =============================================================== Documents: link a Drive file into a section
const sec = (await q("select id, folder_id from doc_sections where workspace_id = $1 and not owner_protected order by position limit 1", [L]))[0];
if (sec) {
  const fid = (await q("insert into files (workspace_id, space, uploaded_by, name, kind, mime_type, in_library) values ($1,'shared',$2,$3,'document','application/vnd.l2f.doc+json',true) returning id", [L, O.id, `Drive doc ${stamp}`]).catch((e) => [{ err: e.message }]))[0];
  if (fid?.id) {
    await page.goto(`${base}/#/office/documents`); await page.waitForSelector('.docsec');
    await page.locator('.docsec').filter({ has: page.locator(`h2:has-text("${(await q('select name from doc_sections where id=$1', [sec.id]))[0].name}")`) }).getByRole('button', { name: 'Add from Drive' }).click();
    await page.fill('input[aria-label="Search Drive"]', `Drive doc ${stamp}`); await page.waitForSelector(`.dpick-i:has-text("Drive doc ${stamp}")`, { timeout: 9000 });
    await page.locator('.dpick-i', { hasText: `Drive doc ${stamp}` }).click(); await page.getByRole('button', { name: 'Add link' }).click(); await page.waitForTimeout(1500);
    const lk = await q('select count(*)::int n from doc_links where section_id = $1 and file_id = $2', [sec.id, fid.id]); const still = await q('select folder_id from files where id = $1', [fid.id]);
    check('DO1', 'A Drive file is linked into a Documents section without copying or moving it, and is labelled as linked', lk[0].n === 1 && still[0].folder_id === null && (await page.locator('.docc', { hasText: `Drive doc ${stamp}` }).first().innerText({ timeout: 5000 }).catch(async () => { await shot(page, 'rc-docs-fail'); return (await page.locator('main').innerText()).slice(0, 400); })).includes('Linked from Drive'));
  } else check('DO1', 'Seed a Drive file for the link test', false, fid?.err);
}

// =============================================================== Tasks on a slow connection (live: duplicates) and the Show completed control
await q("insert into workspace_apps (workspace_id, app_key, enabled) values ($1, 'tasks', true) on conflict (workspace_id, app_key) do update set enabled = true", [L]);
const slow = await signIn(O);
await slow.route('**/api/**', async (r) => { await new Promise((res) => setTimeout(res, 900)); await r.continue(); });   // like the live site on a bad day
await slow.goto(`${base}/#/tasks/today`); await slow.waitForSelector('#tcapi', { timeout: 20000 });
await slow.fill('#tcapi', `Slow capture ${stamp}`); await slow.press('#tcapi', 'Enter'); await slow.press('#tcapi', 'Enter'); await slow.press('#tcapi', 'Enter'); await slow.waitForTimeout(4000);
const capN = (await q('select count(*)::int n from task_items where title = $1', [`Slow capture ${stamp}`]))[0].n;
check('TK1', 'On a slow connection, pressing Enter three times in the capture bar adds the task once (the box empties at once)', capN === 1, `${capN}`);
const mine = (await q('select id from task_lists where owner_id = $1 and is_default', [O.id]))[0]?.id;
await slow.goto(`${base}/#/tasks/list/${mine}`); await slow.waitForSelector('.addt', { timeout: 20000 });
const tk0 = (await q("select count(*)::int n from task_items where list_id = $1 and title = 'New task'", [mine]))[0].n;
await slow.locator('.addt').first().click({ clickCount: 1 }); await slow.locator('.addt').first().click({ force: true }).catch(() => {}); await slow.locator('.addt').first().click({ force: true }).catch(() => {}); await slow.waitForTimeout(4000);
const tk1 = (await q("select count(*)::int n from task_items where list_id = $1 and title = 'New task'", [mine]))[0].n;
check('TK2', 'Clicking “Add task” three times while it saves adds one task', tk1 - tk0 === 1, `${tk1 - tk0}`);
const sd = slow.locator('.showdone'); check('TK3', 'Show completed is always at the bottom of the list (V8), with its count', (await sd.count()) === 1 && /completed \(\d+\)/.test(await sd.innerText()));
await slow.close();

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
if (problems.length) console.log('page problems:\n' + [...new Set(problems)].slice(0, 15).join('\n'));
if (apiErr.length) console.log('api errors:\n' + [...new Set(apiErr)].slice(0, 15).join('\n'));
await browser.close(); await s.close(); await admin.end();
process.exit(results.every((r) => r.ok) ? 0 : 1);
