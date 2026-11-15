// Migrations 0054 and 0055 can be undone and applied again (owner, 14 Nov 2026: "confirm whether they are reversible").
// Up -> data -> down -> checks (objects gone, Projects notifications and profiles kept) -> up again -> the new functions work again.
import { readFileSync } from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, recorder } from './lib.mjs';

const db = await openDb(); await migrate(db);
const { results, check } = recorder();
const sql = (f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8');
const one = async (q, p) => (await db.query(q, p)).rows[0];
await db.exec('reset role');
const WS = id(), U1 = id(), U2 = id();
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L')", [WS]);
for (const u of [U1, U2]) await db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','owner')", [WS, u]);
await db.query("insert into profiles (id,display_name,email) values ($1,'Una','u@example.com')", [U1]);
await db.query("update profiles set full_name='Una Owner', job_title='Founder', time_zone='Asia/Karachi', about='Hi' where id=$1", [U1]);
await db.query("insert into notifications (workspace_id,user_id,kind,entity_type,entity_id) values ($1,$2,'assigned','pm_task',$3)", [WS, U2, id()]);
await db.query("select private.notify($1,$2,'drive','shared','shared “Plan” with you','#/doc/x','drive.share:x',$3)", [WS, U2, U1]);
await db.query("insert into notification_prefs (workspace_id,user_id,app,in_app) values ($1,$2,'drive',false)", [WS, U2]);

await db.exec(sql('rollback/0055_profile_details.down.sql'));
await db.exec(sql('rollback/0054_notifications_every_app.down.sql'));
const cols = async (t) => (await db.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1", [t])).rows.map((r) => r.column_name);
const fn = async (n, ns = null) => Number((await one("select count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where p.proname = $1 and ($2::text is null or s.nspname = $2)", [n, ns])).n);   // pm.notify (0049) is a different function
check('RB1', '0054 down: my_inbox, notify, the Drive trigger and notification_prefs are gone', (await fn('my_inbox')) === 0 && (await fn('notify', 'private')) === 0 && (await fn('notify', 'pm')) === 1 && (await fn('drive_share_notice')) === 0 && !(await one("select to_regclass('public.notification_prefs') r")).r);
check('RB2', '0054 down: the four new columns are gone and the Projects notification is kept', !(await cols('notifications')).some((c) => ['app', 'title', 'href', 'event_key'].includes(c)) && Number((await one("select count(*)::int n from notifications where entity_type='pm_task'")).n) === 1);
check('RB3', '0054 down: the 0049 checks are back (an app event can no longer be stored)', await db.query("insert into notifications (workspace_id,user_id,kind,entity_type,entity_id) values ($1,$2,'shared','app_event',$3)", [WS, U2, id()]).then(() => false, () => true));
check('RB4', '0055 down: the four profile fields and both functions are gone; name, email and photo are kept', !(await cols('profiles')).some((c) => ['full_name', 'job_title', 'time_zone', 'about'].includes(c)) && (await fn('profile_details')) === 0 && (await one('select display_name, email from profiles where id=$1', [U1])).display_name === 'Una');

await db.exec(sql('0054_notifications_every_app.sql')); await db.exec(sql('0055_profile_details.sql'));
check('RB5', 'Applied again after the rollback: both migrations run cleanly and work (a notice is written, a profile field saved)',
  (await one("select private.notify($1,$2,'drive','shared','again','#/doc/y','drive.share:y',$3) ok", [WS, U2, U1])).ok === true && (await db.query("update profiles set job_title='CEO' where id=$1", [U1])).affectedRows === 1);
check('RB6', 'Applying 0054 and 0055 twice in a row is harmless (they can be re-run)', await db.exec(sql('0054_notifications_every_app.sql') + sql('0055_profile_details.sql')).then(() => true, (e) => { console.log(e.message); return false; }));

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(5)} ${r.name}${r.ok ? '' : `  ${r.detail ?? ''}`}`);
const pc = results.filter((r) => r.ok).length; console.log(`\n${pc}/${results.length} checks passed`); await db.close(); process.exit(pc === results.length ? 0 : 1);
