// Drive sharing, owner locks and folder passwords (migration 0046). Everything is judged through the real API and row-level security, as each kind of person:
// owner, admin, editor, viewer, a person with no Drive access, a client, someone from another organization, and link holders.
import { randomUUID as id } from 'node:crypto';
import { openDb, migrate, session, recorder } from './lib.mjs';
import { createApi } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';
import { createMemoryStorage } from '../packages/core/storage-adapter.mjs';
import { hashPassword, verifyPassword } from '../packages/core/drive-password.mjs';

const db = await openDb(); await migrate(db);
const { asUser, asSuper } = session(db); const { results, check } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;
let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }), storage: createMemoryStorage() });
const J = async (op, input, u, org = L) => { const r = await api.handle({ operation: op, input, auth: u ? { userId: u, email: 'x@example.com' } : undefined, headers: { 'x-org-id': org } }); return { ...r, row: r.body?.data?.[0], data: r.body?.data ?? [] }; };
const names = (r) => r.data.map((x) => x.name).sort().join('|');

await asSuper();
const L = id(), A = id(); await db.query("insert into workspaces (id,slug,name) values ($1,'layer2funnels','Layer2Funnels'),($2,'aurj','Aurj')", [L, A]);
const U = { OWN: id(), ADM: id(), ED: id(), VW: id(), NA: id(), CL: id(), OTH: id() };
await db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','owner'),($1,$3,'staff','admin'),($1,$4,'staff','editor'),($1,$5,'staff','viewer'),($1,$6,'staff','viewer'),($7,$8,'staff','owner')", [L, U.OWN, U.ADM, U.ED, U.VW, U.NA, A, U.OTH]);
const C1 = id(); await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'A client')", [C1, L]);
await db.query("insert into memberships (workspace_id,user_id,kind,client_id) values ($1,$2,'client',$3)", [L, U.CL, C1]);
for (const u of [U.ADM, U.ED, U.VW]) await db.query("insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,'drive')", [L, u]);   // NA has no Drive access at all

// ---------------------------------------------------------------- setup: a library, a team folder, a private folder
const mk = async (u, name, extra = {}) => (await J('drive.files.create', { space: 'shared', name, kind: 'document', body: `body of ${name}`, ...extra }, u)).row;
const FOLDER = (await J('drive.folders.create', { space: 'shared', name: 'Team' }, U.OWN)).row.id;
const docA = await mk(U.OWN, 'Doc A'); const docB = await mk(U.OWN, 'Doc B secret plan'); const inTeam = await mk(U.OWN, 'Team plan', { folder: FOLDER });
check('SH0', 'Setup: the owner made documents; an admin, an editor and a viewer can read the library; a person with no Drive access cannot', names(await J('drive.files.list', { space: 'shared', anywhere: true }, U.VW)).includes('Doc A')
  && (await J('drive.files.get', { id: docA.id }, U.NA)).status === 404 && (await J('drive.files.get', { id: docA.id }, U.CL)).status === 404 && (await J('drive.files.get', { id: docA.id }, U.OTH)).status === 404);

// ---------------------------------------------------------------- sharing with people
let r = await J('drive.shares.set', { file: docA.id, user: U.NA, role: 'viewer' }, U.OWN);
check('SH1', 'The owner shares a file with a team member as Viewer; the person can now find, open and read it (and nothing else)', r.status === 200
  && (await J('drive.files.get', { id: docA.id }, U.NA)).status === 200 && names(await J('drive.files.list', { space: 'shared', anywhere: true }, U.NA)) === 'Doc A' && (await J('drive.files.get', { id: docB.id }, U.NA)).status === 404
  && (await J('drive.files.version', { file: docA.id }, U.NA)).row?.body === 'body of Doc A');
check('SH2', 'A Viewer share cannot rename, edit, trash, delete or add a version', (await J('drive.files.update', { id: docA.id, name: 'hacked' }, U.NA)).status === 404 && (await J('drive.files.archive', { id: docA.id }, U.NA)).status === 404
  && (await J('drive.files.versions.add', { id: docA.id, body: 'x' }, U.NA)).status !== 200 && (await rows('select name from files where id = $1', [docA.id]))[0].name === 'Doc A');
check('SH3', 'The same person cannot share it onward, and cannot see who else has it', (await J('drive.shares.set', { file: docA.id, user: U.VW, role: 'viewer' }, U.NA)).status === 404 && (await J('drive.shares.list', { file: docA.id }, U.NA)).data.every((x) => x.user_id === U.NA));
r = await J('drive.shares.set', { file: docA.id, user: U.NA, role: 'editor' }, U.OWN);
const ren = await J('drive.files.update', { id: docA.id, name: 'Doc A (edited)' }, U.NA); const ver = await J('drive.files.versions.add', { id: docA.id, body: 'new text' }, U.NA);
check('SH4', 'Changing the share to Editor lets the person rename and save a new version, but still not trash or delete', ren.status === 200 && ver.status === 200 && (await J('drive.files.version', { file: docA.id }, U.OWN)).row?.body === 'new text'
  && (await J('drive.files.archive', { id: docA.id }, U.NA)).status === 404 && (await J('drive.files.delete', { id: docA.id }, U.NA)).status === 404);
const shareId = (await J('drive.shares.list', { file: docA.id }, U.OWN)).data.find((x) => x.user_id === U.NA).id;
await J('drive.shares.remove', { id: shareId }, U.OWN);
check('SH5', 'Removing the share takes the access away at once', (await J('drive.files.get', { id: docA.id }, U.NA)).status === 404 && names(await J('drive.files.list', { space: 'shared', anywhere: true }, U.NA)) === '');
await J('drive.shares.set', { folder: FOLDER, user: U.NA, role: 'viewer' }, U.OWN);
const later = await mk(U.OWN, 'Added later', { folder: FOLDER });
check('SH6', 'Sharing a folder gives the folder and everything in it, including files added later; not the rest of the library', (await J('drive.folders.list', { space: 'shared' }, U.NA)).data.some((x) => x.id === FOLDER)
  && names(await J('drive.files.list', { space: 'shared', folder: FOLDER }, U.NA)) === 'Added later|Team plan' && (await J('drive.files.get', { id: docB.id }, U.NA)).status === 404);
check('SH7', 'A Viewer on a folder cannot add files to it; an Editor can', (await J('drive.files.create', { space: 'shared', name: 'nope', kind: 'document', body: 'x', folder: FOLDER }, U.NA)).status !== 200);
await J('drive.shares.set', { folder: FOLDER, user: U.NA, role: 'editor' }, U.OWN);
check('SH8', 'An Editor on a folder can add and edit files inside it (but still not elsewhere)', (await J('drive.files.create', { space: 'shared', name: 'by NA', kind: 'document', body: 'x', folder: FOLDER }, U.NA)).status === 200
  && (await J('drive.files.update', { id: inTeam.id, name: 'Team plan v2' }, U.NA)).status === 200 && (await J('drive.files.update', { id: docB.id, name: 'x' }, U.NA)).status === 404);
const shNA = (await J('drive.shares.list', { folder: FOLDER }, U.OWN)).data.find((x) => x.user_id === U.NA).id; await J('drive.shares.remove', { id: shNA }, U.OWN);
check('SH9', 'Only people who may share an item can: a viewer without sharing rights, a client and a stranger cannot create shares', (await J('drive.shares.set', { file: docB.id, user: U.NA, role: 'viewer' }, U.VW)).status === 404
  && (await J('drive.shares.set', { file: docB.id, user: U.NA, role: 'viewer' }, U.CL)).status === 404 && (await J('drive.shares.set', { file: docB.id, user: U.NA, role: 'viewer' }, U.OTH)).status === 404);
check('SH10', 'Clients and people from other organizations can never be given access', (await J('drive.shares.set', { file: docB.id, user: U.CL, role: 'viewer' }, U.OWN)).status !== 200 && (await J('drive.shares.set', { file: docB.id, user: U.OTH, role: 'viewer' }, U.OWN)).status !== 200
  && (await rows('select count(*)::int n from drive_shares where user_id = any($1)', [[U.CL, U.OTH]]))[0].n === 0);

// ---------------------------------------------------------------- share links
r = await J('drive.links.create', { file: docB.id, role: 'viewer' }, U.OWN); const tokV = r.row?.token; const linkV = r.row?.id;
r = await J('drive.links.create', { file: docB.id, role: 'editor', days: 30 }, U.ED); const tokE = r.row?.token;
check('LK1', 'Links store only a hash; the secret is shown once; the list never shows it', tokV?.length >= 40 && (await rows('select token_hash from drive_share_links')).every((x) => /^[0-9a-f]{64}$/.test(x.token_hash) && x.token_hash !== tokV)
  && !JSON.stringify((await J('drive.links.list', { file: docB.id }, U.OWN)).data).includes(tokV) && r.status === 200);
const open = (tok, u, org) => J('drive.links.open', { token: tok }, u, org);
const o1 = await open(tokV, U.NA);
check('LK2', 'A team member opening a View link gets that file, read-only: it can be read but not changed', o1.status === 200 && o1.row?.id === docB.id && o1.row?.role === 'viewer' && (await J('drive.files.get', { id: docB.id }, U.NA)).status === 200
  && (await J('drive.files.update', { id: docB.id, name: 'x' }, U.NA)).status === 404 && (await J('drive.files.versions.add', { id: docB.id, body: 'x' }, U.NA)).status !== 200 && names(await J('drive.files.list', { space: 'shared', anywhere: true }, U.NA)) === 'Doc B secret plan');
const o2 = await open(tokE, U.NA);
check('LK3', 'An Edit link lets the person edit that file (and only that file)', o2.row?.role === 'editor' && (await J('drive.files.versions.add', { id: docB.id, body: 'edited via link' }, U.NA)).status === 200 && (await J('drive.files.update', { id: docA.id, name: 'x' }, U.NA)).status === 404);
check('LK4', 'Clients, people from other organizations, and nobody signed in get nothing from a link', (await open(tokV, U.CL)).status === 404 && (await open(tokV, U.OTH)).status === 404 && (await open(tokV, U.OTH, A)).status === 404 && (await open(tokV, null)).status !== 200
  && (await open(tokV, U.NA, A)).status === 404 && (await open('x'.repeat(43), U.NA)).status === 404);
await J('drive.links.revoke', { id: linkV }, U.OWN); const linkE = (await rows('select id from drive_share_links where role = $1', ['editor']))[0].id;
check('LK5', 'Revoking a link ends it: new openings fail and what people got through it is withdrawn at once', (await open(tokV, U.VW)).status === 404 && (await rows('select count(*)::int n from drive_shares where link_id = $1', [linkV]))[0].n === 0);
await J('drive.links.revoke', { id: linkE }, U.OWN);
check('LK6', 'After both links are revoked the person has no access any more', (await J('drive.files.get', { id: docB.id }, U.NA)).status === 404);
const tokX = (await J('drive.links.create', { file: docB.id, role: 'viewer', days: 1 }, U.OWN)).row.token; await open(tokX, U.NA);
check('LK7', 'An expired link stops working, and so does the access it had already given', await (async () => { await asSuper(); await db.exec('set session_replication_role = replica'); await db.query("update drive_share_links set created_at = now() - interval '3 days', expires_at = now() - interval '1 day' where token_hash = encode(sha256(convert_to($1,'UTF8')),'hex')", [tokX]); await db.exec('set session_replication_role = origin');
  return (await open(tokX, U.VW)).status === 404 && (await J('drive.files.get', { id: docB.id }, U.NA)).status === 404; })());
r = await J('drive.links.create', { file: docB.id, role: 'viewer', never: true }, U.OWN);
check('LK8', 'A link can be made without an expiry', r.row?.expires_at === null && (await open(r.row.token, U.NA)).status === 200);
check('LK9', 'The shared-with-me list shows what was shared, nothing else', (await J('drive.shares.mine', {}, U.NA)).data.map((x) => x.name).join() === 'Doc B secret plan' && (await J('drive.shares.mine', {}, U.CL)).data.length === 0);
await J('drive.links.revoke', { id: r.row.id }, U.OWN);

// ---------------------------------------------------------------- owner lock
const locked = await mk(U.OWN, 'Locked ledger'); const lf = (await J('drive.folders.create', { space: 'shared', name: 'Vault' }, U.OWN)).row.id; const inVault = await mk(U.OWN, 'Vault note', { folder: lf });
await J('drive.shares.set', { file: locked.id, user: U.ED, role: 'editor' }, U.OWN); const tokL = (await J('drive.links.create', { file: locked.id }, U.OWN)).row.token;
r = await J('drive.items.lock', { kind: 'file', id: locked.id, locked: true }, U.OWN); await J('drive.items.lock', { kind: 'folder', id: lf, locked: true }, U.OWN);
const vis = async (u, nm) => names(await J('drive.files.list', { space: 'shared', anywhere: true, q: nm }, u));
check('LC1', 'The owner locks a file and a folder; the owner still sees them, marked locked', r.status === 200 && (await J('drive.files.get', { id: locked.id }, U.OWN)).row?.locked === true && (await vis(U.OWN, 'Locked')).includes('Locked ledger') && (await J('drive.folders.list', { space: 'shared' }, U.OWN)).data.find((x) => x.id === lf)?.locked === true);
check('LC2', 'Nobody else sees a locked item: not an admin, not an editor, not a viewer, not a person it was shared with, not by search', (await Promise.all([U.ADM, U.ED, U.VW, U.NA].map(async (u) => (await J('drive.files.get', { id: locked.id }, u)).status === 404 && !(await vis(u, 'Locked')).includes('Locked')))).every(Boolean));
check('LC3', 'They cannot edit, add versions, trash, delete, share, link or download it', (await Promise.all([U.ADM, U.ED].map(async (u) => (await J('drive.files.update', { id: locked.id, name: 'x' }, u)).status === 404 && (await J('drive.files.versions.add', { id: locked.id, body: 'x' }, u)).status !== 200
  && (await J('drive.files.archive', { id: locked.id }, u)).status === 404 && (await J('drive.files.delete', { id: locked.id }, u)).status === 404 && (await J('drive.shares.set', { file: locked.id, user: U.VW, role: 'viewer' }, u)).status === 404
  && (await J('drive.links.create', { file: locked.id }, u)).status === 404 && (await J('drive.files.download', { id: locked.id }, u)).status !== 200 && (await J('drive.links.list', { file: locked.id }, u)).data.length === 0))).every(Boolean));
check('LC4', 'A locked folder hides itself and everything inside it, from admins too', (await J('drive.folders.list', { space: 'shared' }, U.ADM)).data.every((x) => x.id !== lf) && (await J('drive.files.get', { id: inVault.id }, U.ADM)).status === 404
  && !(await vis(U.ADM, 'Vault')).includes('Vault note') && (await J('drive.files.list', { space: 'shared', folder: lf }, U.ADM)).data.length === 0 && (await J('drive.files.create', { space: 'shared', name: 'x', kind: 'document', body: 'x', folder: lf }, U.ADM)).status !== 200);
check('LC5', 'A link to a locked file opens nothing', (await open(tokL, U.VW)).status === 404 && (await rows('select count(*)::int n from drive_shares where file_id = $1 and link_id is not null', [locked.id]))[0].n === 0);
await asUser(U.ADM, { org: L }); const forged = await db.query('update files set locked_at = null where id = $1 returning id', [locked.id]); await asSuper();
check('LC6', 'Only an owner can lock or unlock: an admin cannot (through the API or by writing the row), and a locked file stays locked', (await J('drive.items.lock', { kind: 'file', id: locked.id, locked: false }, U.ADM)).status === 404 && (await J('drive.items.lock', { kind: 'file', id: docA.id, locked: true }, U.ED)).status === 404
  && forged.rows.length === 0 && (await rows('select locked_at is not null as l from files where id = $1', [locked.id]))[0].l === true);
await asUser(U.ED, { org: L }); let edLock = 'no'; try { await db.query('update files set locked_at = now() where id = $1', [docA.id]); edLock = 'changed'; } catch { edLock = 'refused'; } await asSuper();
check('LC7', 'An editor cannot lock a file by writing the column either', edLock !== 'changed' || (await rows('select locked_at from files where id = $1', [docA.id]))[0].locked_at === null);
await J('drive.items.lock', { kind: 'file', id: locked.id, locked: false }, U.OWN); await J('drive.items.lock', { kind: 'folder', id: lf, locked: false }, U.OWN);
check('LC8', 'The owner unlocks and everything comes back as it was (shares included)', (await J('drive.files.get', { id: locked.id }, U.ADM)).status === 200 && (await J('drive.files.get', { id: inVault.id }, U.ADM)).status === 200 && (await J('drive.files.update', { id: locked.id, name: 'Locked ledger' }, U.ED)).status === 200);

// ---------------------------------------------------------------- folder passwords
const PF = (await J('drive.folders.create', { space: 'shared', name: 'Payroll' }, U.OWN)).row.id; const pdoc = await mk(U.OWN, 'Salaries 2026', { folder: PF }); const pdoc2 = await mk(U.OWN, 'Open note');
check('PW1', 'Only the owner (or the folder’s creator) can set a password: an admin and an editor cannot', (await J('drive.folders.setPassword', { id: PF, password: 'Hunter2-longer' }, U.ADM)).status === 404 && (await J('drive.folders.setPassword', { id: PF, password: 'Hunter2-longer' }, U.ED)).status === 404
  && (await J('drive.folders.setPassword', { id: PF, password: 'short' }, U.OWN)).status !== 200);
r = await J('drive.folders.setPassword', { id: PF, password: 'Correct horse 9!' }, U.OWN);
const stored = (await rows('select hash from drive_folder_passwords where folder_id = $1', [PF]))[0]?.hash;
check('PW2', 'The password is stored only as a salted PBKDF2 hash (never the text), and cannot be read through the API role', r.status === 200 && r.row.protected === true && /^pbkdf2-sha256\$\d+\$/.test(stored) && !stored.includes('horse') && await verifyPassword('Correct horse 9!', stored) && !(await verifyPassword('wrong', stored))
  && await (async () => { await asUser(U.OWN, { org: L }); try { const x = await db.query('select hash from drive_folder_passwords'); await asSuper(); return x.rows.length === 0; } catch { await asSuper(); return true; } })());
const leak = async (u) => [names(await J('drive.files.list', { space: 'shared', anywhere: true }, u)), names(await J('drive.files.list', { space: 'shared', anywhere: true, q: 'Salaries' }, u)), names(await J('drive.files.list', { space: 'shared', folder: PF }, u))].join(' / ');
check('PW3', 'Before unlocking, the folder shows as protected but nothing inside is visible: not in the folder, not in search or Recent (anywhere), not by direct id, not in counts', (await Promise.all([U.ADM, U.ED, U.VW].map(async (u) => !(await leak(u)).includes('Salaries') && (await J('drive.files.get', { id: pdoc.id }, u)).status === 404
  && (await J('drive.folders.list', { space: 'shared' }, u)).data.find((x) => x.id === PF)?.protected === true && (await J('drive.folders.list', { space: 'shared' }, u)).data.find((x) => x.id === PF)?.files === 0))).every(Boolean) && (await leak(U.ED)).includes('Open note'));
check('PW4', 'Versions, downloads, shares and links of an item inside are blocked too, and so is adding to the folder', (await J('drive.files.version', { file: pdoc.id }, U.ED)).status === 404 && (await J('drive.files.download', { id: pdoc.id }, U.ED)).status !== 200 && (await J('drive.shares.set', { file: pdoc.id, user: U.VW, role: 'viewer' }, U.ED)).status === 404
  && (await J('drive.files.create', { space: 'shared', name: 'sneak', kind: 'document', body: 'x', folder: PF }, U.ED)).status !== 200);
check('PW5', 'The setter is let in; protection state is reported to the person asking', (await J('drive.files.get', { id: pdoc.id }, U.OWN)).status === 200 && (await J('drive.folders.protection', { id: PF }, U.ED)).row?.unlocked === false && (await J('drive.folders.protection', { id: PF }, U.OWN)).row?.can_manage === true);
let w = await J('drive.folders.unlock', { id: PF, password: 'nope-nope-1' }, U.ED);
check('PW6', 'A wrong password is refused with the number of tries left, and unlocks nothing', w.status === 200 && w.row.unlocked === false && w.row.attempts_left === 4 && (await J('drive.files.get', { id: pdoc.id }, U.ED)).status === 404);
w = await J('drive.folders.unlock', { id: PF, password: 'Correct horse 9!' }, U.ED);
check('PW7', 'The right password opens the folder for that person: contents, search and Recent now include it; other people stay locked out', w.row.unlocked === true && (await leak(U.ED)).includes('Salaries 2026') && (await J('drive.files.get', { id: pdoc.id }, U.ED)).status === 200 && (await J('drive.files.get', { id: pdoc.id }, U.ADM)).status === 404);
await asSuper(); await db.query("update drive_unlocks set expires_at = now() - interval '1 minute' where user_id = $1", [U.ED]);
check('PW8', 'The unlock expires (12 hours) and the folder closes again', (await J('drive.files.get', { id: pdoc.id }, U.ED)).status === 404 && (await rows("select count(*)::int n from drive_unlocks where user_id = $1 and expires_at > now() + interval '11 hours'", [U.OWN]))[0].n === 1);
let last; for (let k = 0; k < 5; k += 1) last = await J('drive.folders.unlock', { id: PF, password: `wrong-${k}-pass` }, U.VW);
const after = await J('drive.folders.unlock', { id: PF, password: 'Correct horse 9!' }, U.VW);
check('PW9', 'Five wrong passwords lock that person out of that folder for 15 minutes: even the right password is refused then', last.row.attempts_left === 0 && after.row.unlocked === false && after.row.retry_after_seconds > 0 && (await J('drive.files.get', { id: pdoc.id }, U.VW)).status === 404);
check('PW10', 'The limit is per person and folder: another person can still try', (await J('drive.folders.unlock', { id: PF, password: 'Correct horse 9!' }, U.ADM)).row.unlocked === true);
await asSuper(); await db.query("update drive_unlock_attempts set at = now() - interval '16 minutes' where user_id = $1", [U.VW]);
check('PW11', 'After 15 minutes the person may try again', (await J('drive.folders.unlock', { id: PF, password: 'Correct horse 9!' }, U.VW)).row.unlocked === true);
const tokP = (await J('drive.links.create', { file: pdoc.id }, U.OWN)).row.token; await asSuper(); await db.query("delete from drive_unlocks where user_id = $1", [U.VW]);
const oP = await open(tokP, U.VW);
check('PW12', 'A share link to a file in a protected folder does not bypass the password (no name is revealed), and works once the folder is unlocked', oP.row?.protected_folder === PF && !oP.row?.name && (await J('drive.files.get', { id: pdoc.id }, U.VW)).status === 404
  && (await J('drive.folders.unlock', { id: PF, password: 'Correct horse 9!' }, U.VW)).row.unlocked === true && (await open(tokP, U.VW)).row?.name === 'Salaries 2026');
await J('drive.folders.setPassword', { id: PF, password: 'Another one 77!' }, U.OWN);
check('PW13', 'Changing the password closes the folder again for everybody who had opened it', (await J('drive.files.get', { id: pdoc.id }, U.VW)).status === 404 && (await J('drive.files.get', { id: pdoc.id }, U.ADM)).status === 404 && (await J('drive.folders.unlock', { id: PF, password: 'Correct horse 9!' }, U.ADM)).row.unlocked === false);
await J('drive.folders.setPassword', { id: PF }, U.OWN);
check('PW14', 'Removing the password makes the folder an ordinary folder again', (await J('drive.files.get', { id: pdoc.id }, U.ADM)).status === 200 && (await rows('select count(*)::int n from drive_folder_passwords where folder_id = $1', [PF]))[0].n === 0);
const sub = (await J('drive.folders.create', { space: 'shared', name: 'Sub' }, U.OWN, L)).row.id; await J('drive.files.update', { id: pdoc.id, folder: sub }, U.OWN);
await J('drive.folders.update', { id: sub, parent: PF }, U.OWN); await J('drive.folders.setPassword', { id: PF, password: 'Parent pass 123' }, U.OWN);
check('PW15', 'A password on a folder also protects the folders and files below it', (await J('drive.files.get', { id: pdoc.id }, U.ED)).status === 404 && !(await J('drive.folders.list', { space: 'shared', parent: sub }, U.ED)).data.length && (await J('drive.folders.protection', { id: sub }, U.ED)).status === 404);

// ---------------------------------------------------------------- organizations stay apart; hashing helpers
check('XO1', 'Nothing here is visible across organizations: the other organization’s owner sees none of it, with either organization selected', (await J('drive.files.list', { space: 'shared', anywhere: true }, U.OTH, A)).data.length === 0 && (await J('drive.files.get', { id: docB.id }, U.OTH, A)).status === 404 && (await J('drive.files.get', { id: docB.id }, U.OTH, L)).status === 404
  && (await J('drive.shares.list', { file: docB.id }, U.OTH, L)).data.length === 0);
const h1 = await hashPassword('same-password'); const h2 = await hashPassword('same-password');
check('XO2', 'The password hash is salted (the same password gives different hashes) and verifies only the right password', h1 !== h2 && await verifyPassword('same-password', h1) && !(await verifyPassword('same-passwor', h1)) && !(await verifyPassword('same-password', 'garbage')));

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}${x.ok ? '' : `  [${x.detail}]`}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`); await db.close(); process.exit(pc === results.length ? 0 : 1);
