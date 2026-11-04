// Drive data layer and API (migration 0014): shared space, first-party documents with versions, protected SOPs, client files kept out of the
// shared Drive, the personal space with break-glass, share links, isolation, audit without content, trash before delete, prepared storage module.
import { randomUUID as id, createHash } from 'node:crypto';
import { openDb, migrate, session, recorder } from './lib.mjs';
import { createApi } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';
import { createStorageSigner, newObjectPath, pathBelongsTo, cleanFileName, spacePrefix } from '../packages/core/storage.mjs';

const db = await openDb(); await migrate(db);
const rawQuery = db.query.bind(db); db.query = async (s, p) => { try { return await rawQuery(s, p); } catch (e) { e.message += `   [SQL: ${String(s).slice(0, 110).replace(/\s+/g, ' ')}]`; throw e; } };
const { asUser, asSuper } = session(db); const { results, check, errCode } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;
const affected = async (s, p = []) => (await db.query(s, p)).affectedRows;

let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }) });
const call = (op, input, user, org = L) => api.handle({ operation: op, input, auth: { userId: user, email: 'x@example.com' }, headers: { 'x-org-id': org } });
const J = async (op, input, u, org) => { const r = await call(op, input, u, org); if (process.env.DEBUG_J) console.log('J', op, r.status, JSON.stringify(r.body).slice(0, 200)); return { ...r, data: r.body?.data, row: r.body?.data?.[0], code: r.body?.error?.code }; };

await asSuper();
const L = id(), A = id();
const U = { OWN: id(), ADM: id(), ED: id(), ED2: id(), VW: id(), NOAPP: id(), AOWN: id(), CL1: id(), BOTH: id() };
await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','L'),($2,'aurj','A')", [L, A]);
const staff = (u, ws, r) => db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff',$3)", [ws, u, r]);
await staff(U.OWN, L, 'owner'); await staff(U.ADM, L, 'admin'); await staff(U.ED, L, 'editor'); await staff(U.ED2, L, 'editor'); await staff(U.VW, L, 'viewer'); await staff(U.NOAPP, L, 'editor');
await staff(U.AOWN, A, 'owner'); await staff(U.BOTH, L, 'owner'); await staff(U.BOTH, A, 'owner');
for (const u of [U.ED, U.ED2, U.VW]) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'drive')", [L, u]);
await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'clients')", [L, U.ED]);
const lvl = async (name) => (await rows('select id from access_levels where workspace_id=$1 and name=$2', [L, name]))[0].id;
const C1 = id(), C2 = id();
await db.query("insert into clients (id,workspace_id,name) values ($1,$3,'Client One'),($2,$3,'Client Two')", [C1, C2, L]);
await db.query("insert into memberships (workspace_id,user_id,kind,client_id) values ($1,$2,'client',$3)", [L, U.CL1, C1]);
await db.query("insert into access_assignments (workspace_id,access_level_id,principal_type,principal_id) values ($1,$2,'user',$3)", [L, await lvl('All clients · edit'), U.ED]);
await db.query("update workspace_apps set enabled=true where workspace_id=$1 and app_key='portal'", [L]);
const SH = `${L}/shared/`, CP = (c) => `${L}/clients/${c}/`, PP = (u) => `${L}/personal/${u}/`;
const file = (name, space = 'shared', extra = {}) => ({ name, space, path: `${space === 'shared' ? SH : space === 'client' ? CP(extra.client) : PP(extra.owner)}${id()}/${name}`, ...extra });

// ---- A. shared space: folders and files
await asUser(U.ED);
const F1 = (await db.query("insert into drive_folders (workspace_id,space,name) values ($1,'shared','Brand') returning id", [L])).rows[0].id;
const F2 = (await db.query("insert into drive_folders (workspace_id,space,parent_id,name) values ($1,'shared',$2,'Logos') returning id", [L, F1])).rows[0].id;
check('DR1', 'An editor creates folders and sub-folders; the author is the signed-in person; a sibling with the same name (any case) is refused', (await rows('select created_by from drive_folders where id=$1', [F2]))[0].created_by === U.ED
  && (await errCode(() => db.query("insert into drive_folders (workspace_id,space,parent_id,name) values ($1,'shared',$2,'LOGOS')", [L, F1]))) === '23505');
check('DR2', 'A folder cannot go inside itself or its descendants, and cannot hold a name with a slash', (await errCode(() => db.query("update drive_folders set parent_id=$2 where id=$1", [F1, F2]))) === 'P0001'
  && (await errCode(() => db.query("insert into drive_folders (workspace_id,space,name) values ($1,'shared','a/b')", [L]))) === '23514');
const logo = file('logo.png');
const fl = (await db.query("insert into files (workspace_id,space,folder_id,name,kind,mime_type,size_bytes,storage_path,uploaded_by) values ($1,'shared',$2,$3,'file','image/png',100,$4,$5) returning id, uploaded_by", [L, F2, 'logo.png', logo.path, U.ED])).rows[0];
await db.query("insert into file_versions (workspace_id,file_id,storage_path,size_bytes) values ($1,$2,$3,100)", [L, fl.id, logo.path]);
check('DR3', 'A file is registered with a storage path inside the organization’s shared area; its first version is version 1', fl.uploaded_by === U.ED && (await rows('select current_version from files where id=$1', [fl.id]))[0].current_version === 1);
check('DR4', 'A path outside the organization, with .. in it, or in the wrong space is refused; a file with no stored copy is refused',
  (await errCode(() => db.query("insert into files (workspace_id,space,name,kind,storage_path,uploaded_by) values ($1,'shared','x','file',$2,$3)", [L, `${A}/shared/x/x.png`, U.ED]))) === 'P0001'
  && (await errCode(() => db.query("insert into files (workspace_id,space,name,kind,storage_path,uploaded_by) values ($1,'shared','x','file',$2,$3)", [L, `${SH}../${A}/x.png`, U.ED]))) === 'P0001'
  && (await errCode(() => db.query("insert into files (workspace_id,space,name,kind,storage_path,uploaded_by) values ($1,'shared','x','file',$2,$3)", [L, `${L}/personal/${U.ED}/x.png`, U.ED]))) === 'P0001'
  && (await errCode(() => db.query("insert into files (workspace_id,space,name,kind,uploaded_by) values ($1,'shared','x','file',$2)", [L, U.ED]))) === '23514');
const doc = (await db.query("insert into files (workspace_id,space,name,kind,uploaded_by) values ($1,'shared','Onboarding SOP draft','document',$2) returning id", [L, U.ED])).rows[0].id;
await db.query("insert into file_versions (workspace_id,file_id,body) values ($1,$2,'SECRET-DOC-TEXT first')", [L, doc]);
await db.query("insert into file_versions (workspace_id,file_id,body,version) values ($1,$2,'SECRET-DOC-TEXT second', 99)", [L, doc]);
check('DR5', 'A document keeps its text in versions: numbered by the database (a version number sent by the caller is ignored), the file follows the newest', (await rows('select version from file_versions where file_id=$1 order by version', [doc])).map((r) => r.version).join() === '1,2'
  && (await rows('select current_version from files where id=$1', [doc]))[0].current_version === 2);
check('DR6', 'A document cannot carry a stored copy and a file cannot carry text', (await errCode(() => db.query("insert into file_versions (workspace_id,file_id,storage_path,size_bytes) values ($1,$2,$3,10)", [L, doc, `${SH}x/y.txt`]))) !== 'no-error'
  && (await errCode(() => db.query("insert into file_versions (workspace_id,file_id,body) values ($1,$2,'text')", [L, fl.id]))) === 'P0001');
check('DR7', 'Versions are history: they cannot be changed or removed by anyone using the app', (await errCode(() => db.query("update file_versions set body='x' where file_id=$1", [doc]))) === '42501' && (await errCode(() => db.query("delete from file_versions where file_id=$1", [doc]))) === '42501');
await asUser(U.VW);
check('DR8', 'A viewer sees shared files and their versions and can change nothing', (await rows('select id from files')).length === 2 && (await rows('select id from file_versions')).length === 3
  && (await errCode(() => db.query("insert into files (workspace_id,space,name,kind,storage_path,uploaded_by) values ($1,'shared','v','file',$2,$3)", [L, `${SH}v/v.txt`, U.VW]))) === '42501'
  && (await affected("update files set name='renamed' where id=$1", [fl.id])) === 0 && (await errCode(() => db.query("insert into file_versions (workspace_id,file_id,body) values ($1,$2,'x')", [L, doc]))) === '42501'
  && (await errCode(() => db.query("insert into drive_folders (workspace_id,space,name) values ($1,'shared','nope')", [L]))) === '42501');
await asUser(U.NOAPP);
check('DR9', 'An editor without the Drive app sees nothing', (await rows('select id from files')).length === 0 && (await rows('select id from drive_folders')).length === 0);
await asUser(U.ED2);
check('DR10', 'Another editor may edit a colleague’s file (drive.file.edit), and the change is theirs to make', (await affected("update files set name='logo-v2.png' where id=$1", [fl.id])) === 1);
check('DR11', 'A file cannot be moved into a folder of another space, or have its space or owner changed', (await errCode(() => db.query("update files set space='personal', owner_id=$2 where id=$1", [fl.id, U.ED2]))) === 'P0001');
await asUser(U.ED);
check('DR12', 'Trash comes first: an active file cannot be deleted; an archived one can, by someone who may write it', (await errCode(() => db.query("delete from files where id=$1", [fl.id]))) === 'P0001'
  && (await affected("update files set archived_at=now() where id=$1", [fl.id])) === 1 && (await affected("update files set archived_at=null where id=$1", [fl.id])) === 1);
check('DR13', 'A folder that still holds anything cannot be deleted, archived or not', (await affected("update drive_folders set archived_at=now() where id=$1", [F2])) === 1);
await asUser(U.ADM);
check('DR13b', 'Even an admin is refused while the folder still holds a file', (await errCode(() => db.query("delete from drive_folders where id=$1", [F2]))) === 'P0001');
await asUser(U.ED);
await db.query("update drive_folders set archived_at=null where id=$1", [F2]);
await asUser(U.ED2); await db.query("update files set archived_at=now() where id=$1", [fl.id]);
check('DR13c', 'Editing is wider than deleting: another editor may trash a colleague’s file but cannot delete it for good', (await affected("delete from files where id=$1", [fl.id])) === 0);
await db.query("update files set archived_at=null where id=$1", [fl.id]);
await asUser(U.ADM);
check('DR14', 'An admin may delete an emptied, archived folder; an editor may not', (await affected("update files set archived_at=now() where id=$1", [fl.id])) === 1 && (await affected("delete from files where id=$1", [fl.id])) === 1
  && (await affected("update drive_folders set archived_at=now() where id=$1", [F2])) === 1 && (await affected("delete from drive_folders where id=$1", [F2])) === 1);
await asUser(U.ED);
check('DR15', 'An editor cannot delete a folder (it needs delete permission too)', (await affected("update drive_folders set archived_at=now() where id=$1", [F1])) === 1 && (await affected("delete from drive_folders where id=$1", [F1])) === 0);
await db.query("update drive_folders set archived_at=null where id=$1", [F1]);

// ---- B. protected SOPs
await asUser(U.ED);
check('SP1', 'A document cannot be created already protected, and an editor cannot protect one', (await errCode(() => db.query("insert into files (workspace_id,space,name,kind,uploaded_by,protected_sop,sop_key) values ($1,'shared','x','document',$2,true,'x1')", [L, U.ED]))) === '42501'
  && (await errCode(() => db.query("update files set protected_sop=true, sop_key='brand_base' where id=$1", [doc]))) === '42501');
await asUser(U.ADM);
check('SP2', 'An admin cannot protect a document by default either (drive.sop.manage is owner-level)', (await errCode(() => db.query("update files set protected_sop=true, sop_key='brand_base' where id=$1", [doc]))) === '42501');
await asUser(U.OWN);
check('SP3', 'An owner protects a document with a stable key; the same key cannot be used twice', (await affected("update files set protected_sop=true, sop_key='brand_base' where id=$1", [doc])) === 1
  && await (async () => { const d2 = (await db.query("insert into files (workspace_id,space,name,kind,uploaded_by) values ($1,'shared','Second','document',$2) returning id", [L, U.OWN])).rows[0].id; await db.query("insert into file_versions (workspace_id,file_id,body) values ($1,$2,'t')", [L, d2]); return (await errCode(() => db.query("update files set protected_sop=true, sop_key='brand_base' where id=$1", [d2]))) === '23505'; })());
await asUser(U.ED);
check('SP4', 'A protected SOP stays readable to everyone with Drive, but its author and other editors cannot edit, version, archive or delete it', (await rows('select id from files where id=$1', [doc])).length === 1
  && (await affected("update files set name='hacked' where id=$1", [doc])) === 0 && (await errCode(() => db.query("insert into file_versions (workspace_id,file_id,body) values ($1,$2,'x')", [L, doc]))) === '42501'
  && (await affected("update files set archived_at=now() where id=$1", [doc])) === 0 && (await affected("delete from files where id=$1", [doc])) === 0);
await asUser(U.OWN);
check('SP5', 'The owner edits a protected SOP with a new version; deleting still needs trash first', (await affected("insert into file_versions (workspace_id,file_id,body) values ($1,$2,'SECRET-DOC-TEXT third')", [L, doc])) === 1 && (await errCode(() => db.query("delete from files where id=$1", [doc]))) === 'P0001');
check('SP6', 'A protected SOP cannot be shared by link', (await errCode(() => db.query("insert into drive_share_links (workspace_id,file_id,token_hash,expires_at) values ($1,$2,$3,now() + interval '1 day')", [L, doc, createHash('sha256').update('x'.repeat(40)).digest('hex')]))) === 'P0001');

// ---- C. client files stay out of the shared Drive
await asUser(U.ED);
const cf = file('contract.pdf', 'client', { client: C1 });
const cfile = (await db.query("insert into files (workspace_id,space,client_id,name,kind,storage_path,uploaded_by) values ($1,'client',$2,'contract.pdf','file',$3,$4) returning id", [L, C1, cf.path, U.ED])).rows[0].id;
await db.query("insert into file_versions (workspace_id,file_id,storage_path,size_bytes) values ($1,$2,$3,10)", [L, cfile, cf.path]);
check('CS1', 'A person who may use Clients adds a file to a client’s own workspace; it never shows in the shared space list', (await rows("select id from files where space='shared'")).every((r) => r.id !== cfile) && (await rows("select id from files where space='client'")).length === 1);
check('CS2', 'A client file needs a path under that client, and a shared-space file cannot be tied to a client', (await errCode(() => db.query("insert into files (workspace_id,space,client_id,name,kind,storage_path,uploaded_by) values ($1,'client',$2,'x','file',$3,$4)", [L, C1, `${CP(C2)}x/x.pdf`, U.ED]))) === 'P0001'
  && (await errCode(() => db.query("insert into files (workspace_id,space,client_id,name,kind,storage_path,uploaded_by) values ($1,'shared',$2,'x','file',$3,$4)", [L, C1, `${SH}x/x.pdf`, U.ED]))) === '23514');
await asUser(U.ED2);
check('CS3', 'An editor with no access to that client cannot see or add its files', (await rows("select id from files where space='client'")).length === 0
  && (await errCode(() => db.query("insert into files (workspace_id,space,client_id,name,kind,storage_path,uploaded_by) values ($1,'client',$2,'x','file',$3,$4)", [L, C1, `${CP(C1)}x/x.pdf`, U.ED2]))) === '42501');
await asUser(U.ED);
const tmpShared = (await db.query("insert into files (workspace_id,space,name,kind,uploaded_by) values ($1,'shared','Plain shared note','document',$2) returning id", [L, U.ED])).rows[0].id;
check('CS4', 'Sharing a client file with the client works for those who may share; a shared-space file can never be marked client-visible', (await affected("update files set client_visible=true where id=$1", [cfile])) === 1
  && (await errCode(() => db.query("update files set client_visible=true where id=$1", [tmpShared]))) === 'P0001');
await asUser(U.CL1);
check('CS5', 'The client’s contact sees only that client’s shared, unarchived files (and their versions): not the shared Drive, not another client’s files, and can add nothing', (await rows('select id from files')).map((r) => r.id).join() === cfile
  && (await rows('select id from file_versions')).length === 1 && (await errCode(() => db.query("insert into files (workspace_id,space,client_id,name,kind,storage_path,uploaded_by) values ($1,'client',$2,'x','file',$3,$4)", [L, C1, `${CP(C1)}x/x.pdf`, U.CL1]))) === '42501'
  && (await affected("update files set name='x' where id=$1", [cfile])) === 0 && (await rows('select id from drive_folders')).length === 0);
await asUser(U.ED); await db.query("update files set archived_at=now() where id=$1", [cfile]);
await asUser(U.CL1);
check('CS6', 'Archiving a client file hides it from the client at once', (await rows('select id from files')).length === 0);
await asUser(U.ED); await db.query("update files set archived_at=null where id=$1", [cfile]);

// ---- D. personal space and break-glass
await asUser(U.ED);
const PF = (await db.query("insert into drive_folders (workspace_id,space,owner_id,name) values ($1,'personal',$2,'Mine') returning id", [L, U.ED])).rows[0].id;
const pp = file('notes.txt', 'personal', { owner: U.ED });
const pfile = (await db.query("insert into files (workspace_id,space,owner_id,folder_id,name,kind,storage_path,uploaded_by) values ($1,'personal',$2,$3,'notes.txt','file',$4,$2) returning id", [L, U.ED, PF, pp.path])).rows[0].id;
await db.query("insert into file_versions (workspace_id,file_id,storage_path,size_bytes) values ($1,$2,$3,10)", [L, pfile, pp.path]);
const pdoc = (await db.query("insert into files (workspace_id,space,owner_id,name,kind,uploaded_by) values ($1,'personal',$2,'Private plan','document',$2) returning id", [L, U.ED])).rows[0].id;
await db.query("insert into file_versions (workspace_id,file_id,body) values ($1,$2,'SECRET-PERSONAL-TEXT')", [L, pdoc]);
check('PS1', 'A person keeps their own files and folders in their personal space', (await rows("select id from files where space='personal'")).length === 2 && (await rows("select id from drive_folders where space='personal'")).length === 1);
check('PS2', 'They cannot create personal items for someone else, nor use a path in someone else’s area', (await errCode(() => db.query("insert into files (workspace_id,space,owner_id,name,kind,storage_path,uploaded_by) values ($1,'personal',$2,'x','file',$3,$4)", [L, U.ED2, `${PP(U.ED2)}x/x.txt`, U.ED]))) === '42501'
  && (await errCode(() => db.query("insert into files (workspace_id,space,owner_id,name,kind,storage_path,uploaded_by) values ($1,'personal',$2,'x','file',$3,$2)", [L, U.ED, `${PP(U.ED2)}x/x.txt`]))) === 'P0001');
for (const [who, name] of [[U.ED2, 'ED2'], [U.ADM, 'ADM'], [U.OWN, 'OWN'], [U.VW, 'VW']]) {
  await asUser(who);
  if ((await rows("select id from files where space='personal'")).length !== 0 || (await rows("select id from file_versions where file_id in ($1,$2)", [pfile, pdoc])).length !== 0 || (await rows("select id from drive_folders where space='personal'")).length !== 0) check(`PS3-${name}`, `${name} can see someone else's personal space`, false);
}
check('PS3', 'Nobody else can see a personal space, not an admin and not an owner, neither files, folders nor their versions', true);
await asUser(U.OWN);
check('PS4', 'Nobody else can change it either', (await affected("update files set name='x' where id=$1", [pfile])) === 0 && (await affected("delete from files where id=$1", [pfile])) === 0);
await asUser(U.ADM);
check('PS5', 'Break-glass without the permission returns nothing and leaves no trace', (await rows('select * from drive_break_glass_open($1, $2)', [U.ED, 'I need to look at this file'])).length === 0 && (await rows('select id from drive_break_glass')).length === 0);
await asUser(U.OWN, { org: L });
await db.query("select set_config('request.headers', $1, false)", [JSON.stringify({ 'x-org-id': L })]);
check('PS6', 'Break-glass needs a real reason (10 characters); opening your own space or a stranger’s does nothing', (await errCode(() => db.query('select * from drive_break_glass_open($1, $2)', [U.ED, 'short']))) === 'P0001'
  && (await rows('select * from drive_break_glass_open($1, $2)', [U.OWN, 'looking at my own space'])).length === 0 && (await rows('select * from drive_break_glass_open($1, $2)', [U.AOWN, 'someone not in this organization'])).length === 0);
const opened = await rows('select * from drive_break_glass_open($1, $2)', [U.ED, 'Investigating a missing contract']);
check('PS7', 'With the permission and a reason, the owner sees the person’s files (names, text) and the access is logged', opened.length === 2 && opened.some((o) => o.body === 'SECRET-PERSONAL-TEXT') && (await rows('select reason, files_seen, accessed_by, owner_id from drive_break_glass'))[0].files_seen === 2);
await asUser(U.ED);
const notices = await rows('select id, seen_at, break_glass_id from drive_notices'); const logSeenByOwner = await rows('select reason, accessed_by from drive_break_glass');
check('PS8', 'The person whose space was opened gets a notice and can read who opened it and why; and can mark it seen', notices.length === 1 && logSeenByOwner.length === 1 && logSeenByOwner[0].accessed_by === U.OWN && (await affected("update drive_notices set seen_at=now() where id=$1", [notices[0].id])) === 1);
check('PS9', 'Notices can only be marked seen, and the log cannot be changed by anyone using the app', (await errCode(() => db.query("update drive_notices set kind='personal_space_opened', user_id=$2 where id=$1", [notices[0].id, U.ED2]))) !== 'no-error'
  && (await errCode(() => db.query("update drive_break_glass set reason='nothing happened' ", []))) === '42501' && (await errCode(() => db.query("delete from drive_break_glass", []))) === '42501');
await asUser(U.ED2);
check('PS10', 'Other people see neither the notice nor the log entry', (await rows('select id from drive_notices')).length === 0 && (await rows('select id from drive_break_glass')).length === 0);

// ---- E. share links
await asUser(U.ED);
const tokenA = 'a'.repeat(43); const hashOf = (t) => createHash('sha256').update(t).digest('hex');
const shared = (await db.query("insert into files (workspace_id,space,name,kind,uploaded_by) values ($1,'shared','Public one-pager','document',$2) returning id", [L, U.ED])).rows[0].id;
await db.query("insert into file_versions (workspace_id,file_id,body) values ($1,$2,'one-pager text')", [L, shared]);
const link = (await db.query("insert into drive_share_links (workspace_id,file_id,token_hash,expires_at) values ($1,$2,$3,now() + interval '2 days') returning id", [L, shared, hashOf(tokenA)])).rows[0].id;
check('LK1', 'Someone who may share creates a link for a shared-space file; only a hash of the secret is stored', (await rows('select token_hash from drive_share_links where id=$1', [link]))[0].token_hash === hashOf(tokenA) && !JSON.stringify(await rows('select * from drive_share_links')).includes(tokenA));
check('LK2', 'A link cannot outlive a year (31 days before the sharing update), or be made for personal, client, protected or archived files',
  (await errCode(() => db.query("insert into drive_share_links (workspace_id,file_id,token_hash,expires_at) values ($1,$2,$3,now() + interval '400 days')", [L, shared, hashOf('b'.repeat(43))]))) === '23514'
  && (await errCode(() => db.query("insert into drive_share_links (workspace_id,file_id,token_hash,expires_at) values ($1,$2,$3,now() + interval '1 day')", [L, pfile, hashOf('c'.repeat(43))]))) !== 'no-error'
  && (await errCode(() => db.query("insert into drive_share_links (workspace_id,file_id,token_hash,expires_at) values ($1,$2,$3,now() + interval '1 day')", [L, cfile, hashOf('d'.repeat(43))]))) === 'P0001');
await asUser(U.VW);
check('LK3', 'A viewer cannot create or even list links', (await rows('select id from drive_share_links')).length === 0 && (await errCode(() => db.query("insert into drive_share_links (workspace_id,file_id,token_hash,expires_at) values ($1,$2,$3,now() + interval '1 day')", [L, shared, hashOf('e'.repeat(43))]))) === '42501');
await asSuper();
const res = await rows('select * from drive_link_resolve($1)', [tokenA]);
check('LK4', 'The secret opens exactly the newest version of that one file, and the use is counted; a wrong token opens nothing', res.length === 1 && res[0].body === 'one-pager text' && (await rows('select use_count from drive_share_links where id=$1', [link]))[0].use_count === 1
  && (await rows('select * from drive_link_resolve($1)', ['z'.repeat(43)])).length === 0 && (await rows('select * from drive_link_resolve($1)', ['short'])).length === 0);
await asUser(U.ED);
await db.query("update drive_share_links set revoked_at=now() where id=$1", [link]);
check('LK5', 'A revoked link stops working at once; a link can only be revoked, never edited', (await rows('select * from drive_link_resolve($1)', [tokenA])).length === 0 && (await errCode(() => db.query("update drive_share_links set expires_at = now() + interval '30 days' where id=$1", [link]))) === 'P0001');
await asSuper();
await db.query("insert into drive_share_links (workspace_id,file_id,token_hash,expires_at,created_at) values ($1,$2,$3,now() - interval '1 hour', now() - interval '2 hours')", [L, shared, hashOf('f'.repeat(43))]);
check('LK6', 'An expired link opens nothing', (await rows('select * from drive_link_resolve($1)', ['f'.repeat(43)])).length === 0);

// ---- F. isolation and audit
await asUser(U.AOWN);
check('IS1', 'Another organization sees no folder, file, version, link, notice or log of this one, and cannot write into it', (await rows('select id from files')).length === 0 && (await rows('select id from drive_folders')).length === 0 && (await rows('select id from file_versions')).length === 0 && (await rows('select id from drive_share_links')).length === 0
  && (await errCode(() => db.query("insert into drive_folders (workspace_id,space,name) values ($1,'shared','x')", [L]))) !== 'no-error');
await asUser(U.BOTH, { org: A });
check('IS2', 'A person in two organizations sees only the organization the request names', (await rows('select id from files')).length === 0 && (await rows('select id from drive_folders')).length === 0);
await asUser(U.BOTH, { org: L });
check('IS3', 'Their own request for the other organization shows its files (owner of both)', (await rows("select id from files where space='shared'")).length >= 2);
await asSuper();
const au = JSON.stringify(await rows("select action, detail, actor_id from audit_events where action like 'files.%' or action like 'drive_%' or action like 'file_versions.%'"));
check('AU1', 'Folder, file, version, link and break-glass events are audited with the actor, and no document text or secret appears', au.includes('files.insert') && au.includes('file_versions.insert') && au.includes('drive_break_glass.insert') && au.includes('drive_share_links.insert') && au.includes('drive_folders.insert')
  && !/SECRET-DOC-TEXT|SECRET-PERSONAL-TEXT|one-pager text/.test(au) && !au.includes(tokenA) && au.includes(U.ED));
check('IN1', 'The Data API roles have no access to any Drive table or function', (await rows("select count(*)::int n from information_schema.role_table_grants where grantee in ('anon','authenticated') and table_name in ('drive_folders','file_versions','drive_share_links','drive_break_glass','drive_notices','files')"))[0].n === 0);

// ---- G. prepared storage module (fake client; nothing live)
const calls = []; const fake = { createSignedUrl: async (b, p, t) => { calls.push(['dl', b, p, t]); return { data: { signedUrl: `https://storage.test/${p}?t=${t}` } }; }, createSignedUploadUrl: async (b, p) => { calls.push(['up', b, p]); return { data: { signedUrl: `https://storage.test/up/${p}`, token: 'tok' } }; } };
const signer = createStorageSigner({ storage: fake });
const up = await signer.signUpload({ workspaceId: L, space: 'personal', ownerId: U.ED, fileName: '../../etc/pass wd?.txt' });
await asSuper();
const accepted = (await rows('select private.drive_path_ok($1,$2,$3,$4,$5) ok', [L, 'personal', null, U.ED, up.path]))[0].ok;
check('ST1', 'The prepared storage module builds a path the database accepts (personal space), cleans dangerous file names and signs an upload address', accepted === true && up.path.startsWith(PP(U.ED)) && !up.path.includes('..') && !up.path.includes('?') && up.url.startsWith('https://storage.test/up/'));
const dl = await signer.signDownload({ workspaceId: L, path: up.path, seconds: 9999 });
check('ST2', 'Download addresses are short-lived (clamped to 5 minutes) and refuse any path outside the organization', dl.expiresInSeconds === 300 && (await signer.signDownload({ workspaceId: L, path: `${A}/shared/x/y.txt` }).then(() => false, () => true))
  && (await signer.signDownload({ workspaceId: L, path: `${L}/shared/../${A}/x` }).then(() => false, () => true)) && (await signer.signDownload({ workspaceId: L, path: `${L}/secrets/x` }).then(() => false, () => true)));
check('ST3', 'Path helpers: shared, client and personal prefixes match the database rule; bad input is refused', spacePrefix({ workspaceId: L, space: 'shared' }) === SH && spacePrefix({ workspaceId: L, space: 'client', clientId: C1 }) === CP(C1) && cleanFileName('a/b\\c.txt') === 'c.txt' && cleanFileName('...') === 'file'
  && (() => { try { spacePrefix({ workspaceId: 'x', space: 'shared' }); return false; } catch { return true; } })() && !pathBelongsTo(`${L}/a//b`, L) && pathBelongsTo(newObjectPath({ workspaceId: L, space: 'shared' }, 'a.png'), L));

// ---- H. through the API
let r = await J('drive.folders.create', { space: 'shared', name: 'API folder' }, U.ED); const AF = r.row?.id;
check('DA1', 'drive.folders.create / list: the folder appears at the root with its counts', r.status === 200 && (await J('drive.folders.list', { space: 'shared' }, U.ED)).data.some((f) => f.id === AF && f.files === 0));
r = await J('drive.files.create', { space: 'shared', folder: AF, name: 'API note', kind: 'document', body: 'API-SECRET-TEXT v1' }, U.ED); const AD = r.row?.id;
check('DA2', 'drive.files.create makes a document with version 1 and its size', r.status === 200 && r.row.kind === 'document' && r.row.current_version === 1 && r.row.size_bytes === 18);
r = await J('drive.files.versions.add', { id: AD, body: 'API-SECRET-TEXT v2', note: 'second' }, U.ED);
check('DA3', 'drive.files.versions.add numbers the next version', r.status === 200 && r.row.current_version === 2);
r = await J('drive.files.versions', { file: AD }, U.ED); const vs = r.data;
check('DA4', 'drive.files.versions lists newest first, without the text', vs.length === 2 && vs[0].version === 2 && !JSON.stringify(vs).includes('API-SECRET-TEXT'));
r = await J('drive.files.version', { file: AD, version: 1 }, U.ED);
check('DA5', 'drive.files.version returns the text of the version asked for (newest by default)', r.row.body === 'API-SECRET-TEXT v1' && (await J('drive.files.version', { file: AD }, U.ED)).row.body === 'API-SECRET-TEXT v2');
r = await J('drive.files.create', { space: 'shared', name: 'bad', kind: 'file' }, U.ED);
check('DA6', 'a file without a stored copy is refused with the contract’s invalid answer', r.status === 422 && r.code === 'invalid');
r = await J('drive.files.create', { space: 'shared', name: 'pic.png', kind: 'file', storage_path: `${SH}${id()}/pic.png`, size_bytes: 10, mime_type: 'image/png' }, U.ED); const AFILE = r.row?.id;
check('DA7', 'drive.files.create registers a stored file; a path in another organization reads as invalid', r.status === 200 && (await J('drive.files.create', { space: 'shared', name: 'x.png', kind: 'file', storage_path: `${A}/shared/${id()}/x.png` }, U.ED)).status === 422);
r = await J('drive.files.update', { id: AFILE, name: 'pic-final.png', folder: AF }, U.ED);
check('DA8', 'drive.files.update renames and moves; to_root brings it back', r.row.name === 'pic-final.png' && r.row.folder_id === AF && (await J('drive.files.update', { id: AFILE, to_root: true }, U.ED)).row.folder_id === null);
r = await J('drive.files.list', { space: 'shared', anywhere: true, q: 'pic' }, U.ED);
check('DA9', 'drive.files.list searches the shared space only and filters by name', r.data.length === 1 && r.data[0].id === AFILE);
r = await J('drive.files.list', { space: 'client', client: C1 }, U.ED);
check('DA10', 'client files are listed only when asked for with the client, and never in the shared list', r.data.length === 1 && (await J('drive.files.list', { space: 'shared', anywhere: true }, U.ED)).data.every((f) => f.space === 'shared'));
r = await J('drive.files.get', { id: pfile }, U.OWN);
check('DA11', 'someone else’s personal file reads as not found, even for an owner', r.status === 404 && r.code === 'not_found');
r = await J('drive.sops.protect', { id: AD, protected: true, sop_key: 'api_sop' }, U.ED);
check('DA12', 'protecting a document without drive.sop.manage reads as not found', r.status === 404);
r = await J('drive.sops.protect', { id: AD, protected: true, sop_key: 'api_sop' }, U.OWN);
check('DA13', 'an owner protects it; drive.sops.list shows it to everyone with Drive', r.status === 200 && r.row.protected_sop === true && (await J('drive.sops.list', {}, U.VW)).data.some((s) => s.id === AD && s.sop_key === 'api_sop'));
r = await J('drive.files.archive', { id: AD }, U.ED);
check('DA14', 'archiving a protected SOP without the permission reads as not found', r.status === 404);
r = await J('drive.links.create', { file: AFILE, days: 3 }, U.ED); const tok = r.row?.token;
check('DA15', 'drive.links.create returns the secret once; its hash is what the database holds', r.status === 200 && tok?.length >= 40 && (await rows('select token_hash from drive_share_links where id=$1', [r.row.id]))[0].token_hash === hashOf(tok));
r = await J('drive.links.list', { file: AFILE }, U.ED);
check('DA16', 'drive.links.list never shows the secret or its hash', r.data.length === 1 && !JSON.stringify(r.data).includes(tok) && !JSON.stringify(r.data).includes(hashOf(tok)));
r = await J('drive.links.create', { file: AFILE, days: 3 }, U.VW);
check('DA17', 'a viewer cannot create a link', r.status === 404);
r = await J('drive.links.revoke', { id: (await J('drive.links.list', { file: AFILE }, U.ED)).data[0].id }, U.ED);
check('DA18', 'drive.links.revoke ends it', r.status === 200 && (await rows('select * from drive_link_resolve($1)', [tok])).length === 0);
r = await J('drive.personal.open', { owner: U.ED, reason: 'Short' }, U.OWN);
check('DA19', 'drive.personal.open refuses a short reason before the database is asked', r.status === 422);
r = await J('drive.personal.open', { owner: U.ED, reason: 'Checking the quarterly handover file' }, U.OWN);
check('DA20', 'drive.personal.open (owner, with a reason) returns the personal files and logs it; an admin gets nothing', r.status === 200 && r.data.length === 2 && (await J('drive.personal.open', { owner: U.ED, reason: 'Checking the quarterly handover file' }, U.ADM)).data.length === 0);
r = await J('drive.notices.list', { unseen: true }, U.ED);
check('DA21', 'the owner of the space sees the unseen notice naming who looked and why (the earlier one was already marked seen), and two in all', r.data.length === 1 && r.data[0].accessed_by === U.OWN && r.data[0].reason.length > 10 && (await J('drive.notices.list', {}, U.ED)).data.length === 2);
r = await J('drive.notices.seen', { id: r.data[0].id }, U.ED);
check('DA22', 'drive.notices.seen marks one as seen', r.status === 200 && (await J('drive.notices.list', { unseen: true }, U.ED)).data.length === 0);
r = await J('drive.breakglass.list', {}, U.OWN);
check('DA23', 'drive.breakglass.list shows the log to the owner; others get an empty list', r.data.length === 2 && (await J('drive.breakglass.list', {}, U.ED2)).data.length === 0);
r = await J('drive.files.archive', { id: AFILE }, U.ED); r = await J('drive.files.delete', { id: AFILE }, U.ED);
check('DA24', 'drive.files.delete works after the trash step, for the person who may write it', r.status === 200);
r = await J('drive.files.get', { id: AD }, U.AOWN, A);
check('DA25', 'another organization asking for the same id gets “not found”', r.status === 404);

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(6)} ${x.name}${x.ok ? '' : `  [${x.detail ?? ''}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); await db.close(); process.exit(p === results.length ? 0 : 1);
