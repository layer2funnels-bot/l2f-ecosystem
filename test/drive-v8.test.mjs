// Drive V8 (migration 0061), for BOTH organizations: Move/Copy between Library and Personal (03 §4, OR-22/23), stars and opens per person,
// autosave thinning and the original + latest rule (03 §5), Reset to original (byte-identical), document attachments (OR-28), presence.
import { randomUUID as id, createHash } from 'node:crypto';
import { openDb, migrate, session, recorder } from './lib.mjs';
import { createApi } from '../packages/core/api.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
import { createRateLimiter } from '../packages/core/rate-limit.mjs';
import { createSafeLogger } from '../packages/core/safe-log.mjs';
import { createMemoryStorage } from '../packages/core/storage-adapter.mjs';

const db = await openDb(); await migrate(db);
const { asSuper } = session(db); const { results, check } = recorder();
const rows = async (s, p = []) => (await db.query(s, p)).rows;
let chain = Promise.resolve();
const acquire = () => { const prev = chain; let release; chain = new Promise((r) => { release = r; }); return prev.then(() => ({ query: (s, p) => db.query(s, p), release })); };
const BIG = { read: { max: 1e6, windowMs: 6e4 }, write: { max: 1e6, windowMs: 6e4 }, sensitive: { max: 1e6, windowMs: 6e4 } };   // 'save' falls back to its default
const storage = createMemoryStorage();
const api = createApi({ executor: createPgExecutor({ acquire, role: 'app_user' }), logger: createSafeLogger(() => {}), limiter: createRateLimiter({ limits: BIG }), storage });
const J = async (op, input, u, org) => { const r = await api.handle({ operation: op, input, auth: { userId: u, email: 'x@example.com' }, headers: { 'x-org-id': org } }); return { ...r, row: r.body?.data?.[0], rows: r.body?.data ?? [] }; };
const sha = (b) => createHash('sha256').update(b).digest('hex');

await asSuper();
const ORGS = { L: { id: id(), slug: 'layer2funnels', name: 'Layer2Funnels' }, A: { id: id(), slug: 'aurj', name: 'Aurj' } };
for (const o of Object.values(ORGS)) await db.query('insert into workspaces (id,slug,name) values ($1,$2,$3)', [o.id, o.slug, o.name]);
for (const k of Object.keys(ORGS)) {
  const o = ORGS[k]; o.U = { OWN: id(), ED: id(), ED2: id(), VW: id() }; o.C = id();
  await db.query("insert into memberships (workspace_id,user_id,kind,role) values ($1,$2,'staff','owner'),($1,$3,'staff','editor'),($1,$4,'staff','editor'),($1,$5,'staff','viewer')", [o.id, o.U.OWN, o.U.ED, o.U.ED2, o.U.VW]);
  for (const u of [o.U.ED, o.U.ED2, o.U.VW]) for (const app of ['drive', 'clients']) await db.query('insert into app_grants (workspace_id,user_id,app_key) values ($1,$2,$3)', [o.id, u, app]);
  await db.query("insert into clients (id,workspace_id,name) values ($1,$2,'A client')", [o.C, o.id]);
}
const doc = async (o, u, space, name, extra = {}) => (await J('drive.files.create', { space, name, kind: 'document', body: `{"v":1,"text":"${name}"}`, ...extra }, u, o.id)).row;
const stored = async (o, u, space, name, mime = 'image/png', bytes = Buffer.from(`png ${name} ${id()}`)) => {
  const s = await J('drive.uploads.sign', { space, name, size_bytes: bytes.length, mime_type: mime }, u, o.id); await storage.put(s.row.path, bytes);
  return (await J('drive.files.create', { space, name, kind: 'file', mime_type: mime, size_bytes: bytes.length, storage_path: s.row.path }, u, o.id)).row;
};
const folder = async (o, u, space, name, parent) => (await J('drive.folders.create', { space, name, ...(parent ? { parent } : {}) }, u, o.id)).row;
const list = async (o, u, space, extra = {}) => (await J('drive.files.list', { space, anywhere: true, ...extra }, u, o.id)).rows.map((x) => x.name).sort();
const objects = () => storage.files.size;

for (const k of ['L', 'A']) {
  const o = ORGS[k]; const { OWN, ED, ED2, VW } = o.U; const N = o.name;
  // ---------------------------------------------------------------- Personal -> Library, folders recursive, versions move
  const pf = await folder(o, ED, 'personal', `${k} Proposals`); const pf2 = await folder(o, ED, 'personal', `${k} Drafts`, pf?.id);
  const pdoc = await doc(o, ED, 'personal', `${k} Brief`, { folder: pf.id }); const pdeep = await doc(o, ED, 'personal', `${k} Deep note`, { folder: pf2.id });
  await J('drive.files.versions.add', { id: pdoc.id, body: '{"v":2}' }, ED, o.id); await J('drive.files.versions.add', { id: pdoc.id, body: '{"v":3}' }, ED, o.id);
  const pimg = await stored(o, ED, 'personal', `${k} logo.png`);
  const versBefore = (await rows('select count(*)::int n from file_versions where file_id = $1', [pdoc.id]))[0].n; const objBefore = objects();
  check(`MV0${k}`, `${N}: before the move the teammates do not see the personal items`, !(await list(o, VW, 'shared')).includes(`${k} Brief`));
  let r = await J('drive.transfer', { folders: [pf.id], files: [pimg.id], to: 'shared' }, ED, o.id);
  const after = await rows('select id, space, owner_id, in_library, folder_id from files where id = any($1)', [[pdoc.id, pdeep.id, pimg.id]]);
  const fAfter = await rows('select id, space, owner_id, parent_id from drive_folders where id = any($1)', [[pf.id, pf2.id]]);
  check(`MV1${k}`, `${N}: Personal → Library moves a folder with everything inside it and a loose file, in one step`, r.status === 200 && r.row.files === 3 && r.row.folders === 2, JSON.stringify(r.body).slice(0, 200));
  check(`MV2${k}`, `${N}: the organization now owns them (Library: no personal owner, listed in the Library), structure kept`,
    after.every((f) => f.space === 'shared' && f.owner_id === null && f.in_library) && fAfter.every((f) => f.space === 'shared' && f.owner_id === null)
    && fAfter.find((f) => f.id === pf2.id).parent_id === pf.id && after.find((f) => f.id === pdeep.id).folder_id === pf2.id && after.find((f) => f.id === pdoc.id).folder_id === pf.id);
  check(`MV3${k}`, `${N}: history moves with the file and nothing is stored again`, (await rows('select count(*)::int n from file_versions where file_id = $1', [pdoc.id]))[0].n === versBefore && objects() === objBefore);
  check(`MV4${k}`, `${N}: a viewer in the organization can now find them; the stored picture still downloads`, (await list(o, VW, 'shared')).includes(`${k} Brief`) && (await J('drive.files.download', { id: pimg.id }, VW, o.id)).status === 200);
  check(`MV5${k}`, `${N}: the moved file can still be renamed and saved (its stored path stays valid)`, (await J('drive.files.update', { id: pimg.id, name: `${k} logo final.png` }, ED, o.id)).status === 200 && (await J('drive.files.versions.add', { id: pdoc.id, body: '{"v":4}' }, ED, o.id)).status === 200);

  // ---------------------------------------------------------------- Library -> Personal: shares removed after the warning
  const ldoc = await doc(o, ED, 'shared', `${k} Shared plan`);
  await J('drive.shares.set', { file: ldoc.id, user: VW, role: 'editor' }, OWN, o.id);
  await J('drive.links.create', { file: ldoc.id, days: 7 }, OWN, o.id);
  const prev = await J('drive.transfer.details', { files: [ldoc.id] }, ED, o.id);
  check(`MP1${k}`, `${N}: the preview names what would be lost (1 person, 1 link)`, prev.row?.people === 1 && prev.row?.links === 1, JSON.stringify(prev.row));
  check(`MP2${k}`, `${N}: a viewer cannot take a Library file into their Personal space`, (await J('drive.transfer', { files: [ldoc.id], to: 'personal' }, VW, o.id)).status === 404);
  check(`MP3${k}`, `${N}: another editor cannot take someone else's Library file`, (await J('drive.transfer', { files: [ldoc.id], to: 'personal' }, ED2, o.id)).status === 404);
  r = await J('drive.transfer', { files: [ldoc.id], to: 'personal' }, ED, o.id);
  const lrow = (await rows('select space, owner_id, in_library from files where id = $1', [ldoc.id]))[0];
  check(`MP4${k}`, `${N}: the uploader moves it to Personal: they own it, shares and links are gone`, r.status === 200 && r.row.shares_removed === 1 && r.row.links_revoked === 1 && lrow.space === 'personal' && lrow.owner_id === ED && !lrow.in_library
    && (await rows('select count(*)::int n from drive_shares where file_id = $1', [ldoc.id]))[0].n === 0 && (await rows('select count(*)::int n from drive_share_links where file_id = $1 and revoked_at is null', [ldoc.id]))[0].n === 0);
  check(`MP5${k}`, `${N}: nobody else can open it any more (not the person it was shared with, not the owner of the organization)`, (await J('drive.files.get', { id: ldoc.id }, VW, o.id)).status === 404 && (await J('drive.files.get', { id: ldoc.id }, OWN, o.id)).status === 404);
  const odoc = await doc(o, ED2, 'shared', `${k} Team SOP`);
  check(`MP6${k}`, `${N}: an owner (may delete anyone's files) can take a teammate's Library file`, (await J('drive.transfer', { files: [odoc.id], to: 'personal' }, OWN, o.id)).status === 200);
  check(`MP7${k}`, `${N}: a viewer cannot put Personal items into the Library (no right to add files there)`, (await J('drive.transfer', { files: [(await doc(o, VW, 'personal', `${k} vw`)).id], to: 'shared' }, VW, o.id)).status === 404);

  // ---------------------------------------------------------------- Copy: new items, same stored bytes, no sharing, current version only
  const simg = await stored(o, ED, 'shared', `${k} banner.png`); await J('drive.shares.set', { file: simg.id, user: VW, role: 'viewer' }, OWN, o.id);
  const obj0 = objects();
  r = await J('drive.transfer', { files: [simg.id], folders: [pf.id], to: 'personal', copy: true }, ED, o.id);
  const copies = await rows("select f.id, f.name, f.space, f.owner_id, f.storage_path, (select count(*)::int from file_versions v where v.file_id = f.id) as nv from files f where f.owner_id = $1 and f.space = 'personal' and f.name in ($2, $3, $4)", [ED, `${k} banner.png`, `${k} Brief`, `${k} Deep note`]);
  const src = (await rows('select storage_path from files where id = $1', [simg.id]))[0];
  check(`CP1${k}`, `${N}: Library → Personal copy makes new private items (a folder copy keeps its inside)`, r.status === 200 && copies.length === 3 && copies.every((c) => c.space === 'personal' && c.owner_id === ED), JSON.stringify(r.body).slice(0, 200));
  check(`CP2${k}`, `${N}: the copy reuses the stored bytes (nothing uploaded or stored twice) and starts with one version`, objects() === obj0 && copies.find((c) => c.name === `${k} banner.png`).storage_path === src.storage_path && copies.every((c) => c.nv === 1));
  check(`CP3${k}`, `${N}: the copy is not shared; the original keeps its share and stays in the Library`, (await rows('select count(*)::int n from drive_shares where file_id = any($1)', [copies.map((c) => c.id)]))[0].n === 0
    && (await rows('select count(*)::int n from drive_shares where file_id = $1', [simg.id]))[0].n === 1 && (await list(o, VW, 'shared')).includes(`${k} banner.png`));
  r = await J('drive.transfer', { files: [simg.id], to: 'shared', copy: true }, ED, o.id);
  check(`CP4${k}`, `${N}: copying into the same place names it "Copy of …"`, r.status === 200 && (await list(o, ED, 'shared')).includes(`Copy of ${k} banner.png`));

  // ---------------------------------------------------------------- what never moves
  const cdoc = (await J('drive.files.create', { space: 'client', client: o.C, name: `${k} client contract`, kind: 'document', body: 'x' }, OWN, o.id)).row;
  check(`NM1${k}`, `${N}: a client's file never moves or copies into Library/Personal`, (await J('drive.transfer', { files: [cdoc.id], to: 'personal', copy: true }, OWN, o.id)).status === 404 && (await J('drive.transfer', { files: [cdoc.id], to: 'shared' }, OWN, o.id)).status === 404);
  const app = (await J('drive.files.create', { space: 'shared', app: 'forms', name: `${k} form file`, kind: 'document', body: 'x' }, ED, o.id)).row;
  check(`NM2${k}`, `${N}: an app-owned file (Forms) never moves this way`, (await J('drive.transfer', { files: [app.id], to: 'personal' }, OWN, o.id)).status === 404);
  const sop = await doc(o, OWN, 'shared', `${k} SOP doc`); await asSuper(); await db.query('update files set protected_sop = true, sop_key = $2 where id = $1', [sop.id, `sop_${k.toLowerCase()}_v8`]);
  check(`NM3${k}`, `${N}: a protected SOP never leaves the Library (copying it is fine)`, (await J('drive.transfer', { files: [sop.id], to: 'personal' }, OWN, o.id)).status === 404 && (await J('drive.transfer', { files: [sop.id], to: 'personal', copy: true }, OWN, o.id)).status === 200);
  check(`NM4${k}`, `${N}: a folder cannot go inside itself`, (await J('drive.transfer', { folders: [pf.id], to: 'shared', folder: pf2.id }, ED, o.id)).status !== 200);
  check(`NM5${k}`, `${N}: a guard still refuses a direct change of space outside the move function`, (await J('drive.files.update', { id: pdoc.id, name: 'x' }, ED, o.id)).status === 200
    && await db.query("update files set space = 'personal', owner_id = $2, in_library = false where id = $1", [pdoc.id, ED]).then(() => false, () => true));

  // ---------------------------------------------------------------- stars and opens are each person's own
  await J('drive.stars.set', { file: pdoc.id, on: true }, ED, o.id); await J('drive.stars.set', { folder: pf.id, on: true }, ED, o.id); await J('drive.stars.set', { file: pdoc.id, on: true }, ED, o.id);
  const st = (await J('drive.stars.list', {}, ED, o.id)).rows;
  check(`ST1${k}`, `${N}: stars are kept per person on the server (a file and a folder, no duplicates)`, st.length === 2 && (await J('drive.stars.list', {}, VW, o.id)).rows.length === 0);
  check(`ST2${k}`, `${N}: you cannot star something you cannot see`, (await J('drive.stars.set', { file: ldoc.id, on: true }, VW, o.id)).status !== 200);
  await J('drive.stars.set', { file: pdoc.id, on: false }, ED, o.id);
  check(`ST3${k}`, `${N}: un-starring removes it`, (await J('drive.stars.list', {}, ED, o.id)).rows.length === 1);
  await J('drive.opens.touch', { file: simg.id }, ED, o.id); await J('drive.opens.touch', { file: pdoc.id }, ED, o.id);
  const rec = (await J('drive.recent', { limit: 5 }, ED, o.id)).rows;
  check(`RC1${k}`, `${N}: Recent starts with what you opened, newest first, with the time you opened it`, rec[0]?.id === pdoc.id && rec[1]?.id === simg.id && !!rec[0].opened_at);
  check(`RC2${k}`, `${N}: someone else's opens are not yours; client files never show in Recent`, !(await J('drive.recent', { limit: 50 }, VW, o.id)).rows.some((x) => x.opened_at) && !rec.some((x) => x.id === cdoc.id));

  // ---------------------------------------------------------------- saving: autosave thinning, original + latest
  const tdoc = await doc(o, ED, 'shared', `${k} Thin me`);
  for (let i = 0; i < 6; i++) await J('drive.files.versions.add', { id: tdoc.id, body: `{"n":${i}}`, note: 'Autosave' }, ED, o.id);
  await J('drive.files.versions.add', { id: tdoc.id, body: '{"n":"manual"}' }, ED, o.id);
  await J('drive.files.versions.add', { id: tdoc.id, body: '{"n":"auto2"}', note: 'Autosave' }, ED, o.id);
  const tv = await rows('select version, note, body from file_versions where file_id = $1 order by version', [tdoc.id]);
  check(`SV1${k}`, `${N}: autosaves within 10 minutes keep only the newest one; the first version and the manual save stay`, tv.length === 3 && tv[0].version === 1 && tv[1].body === '{"n":"manual"}' && tv[1].note === null && tv[2].body === '{"n":"auto2"}', JSON.stringify(tv.map((x) => x.version)));
  check(`SV2${k}`, `${N}: version numbers keep rising (conflict detection unchanged)`, tv.at(-1).version === 9 && (await J('drive.files.versions.add', { id: tdoc.id, body: '{}', expected: 3 }, ED, o.id)).status === 409);
  for (let i = 0; i < 3; i++) await J('drive.files.versions.add', { id: tdoc.id, body: `{"m":${i}}`, note: 'Autosave' }, ED2, o.id);
  check(`SV3${k}`, `${N}: another person's autosaves never replace yours`, (await rows("select count(*)::int n from file_versions where file_id = $1 and note = 'Autosave'", [tdoc.id]))[0].n === 2);
  const img = await stored(o, ED, 'shared', `${k} hero.png`); const orig = (await rows('select storage_path from file_versions where file_id = $1 and version = 1', [img.id]))[0].storage_path;
  for (let i = 0; i < 3; i++) { const b = Buffer.from(`edit ${i} ${k}`); const s = await J('drive.uploads.sign', { space: 'shared', name: 'hero.png', size_bytes: b.length, mime_type: 'image/png' }, ED, o.id); await storage.put(s.row.path, b); await J('drive.files.versions.add', { id: img.id, storage_path: s.row.path, size_bytes: b.length }, ED, o.id); }
  const iv = await rows('select version, storage_path from file_versions where file_id = $1 order by version', [img.id]);
  check(`SV4${k}`, `${N}: an image keeps its original upload and the latest edit only`, iv.length === 2 && iv[0].version === 1 && iv[0].storage_path === orig && iv[1].version === 4);
  r = await J('drive.files.resetOriginal', { id: img.id, expected: 4 }, ED, o.id);
  const after2 = await rows('select version, storage_path, note from file_versions where file_id = $1 order by version', [img.id]);
  check(`SV5${k}`, `${N}: Reset to original makes the original the newest version, byte-identical (same stored object), and is logged`, r.status === 200 && after2.at(-1).storage_path === orig && after2.at(-1).note === 'Reset to original'
    && sha(await storage.get(after2.at(-1).storage_path)) === sha(await storage.get(orig)) && (await rows("select count(*)::int n from audit_events where action = 'drive.reset_original' and subject_id = $1", [img.id]))[0].n === 1);
  check(`SV6${k}`, `${N}: a viewer cannot reset; a stale version number is refused`, (await J('drive.files.resetOriginal', { id: img.id }, VW, o.id)).status === 404 && (await J('drive.files.resetOriginal', { id: img.id, expected: 1 }, ED, o.id)).status === 409);

  // ---------------------------------------------------------------- attachments (pictures inside a document)
  const d1 = await doc(o, ED, 'shared', `${k} With picture`); const d2 = await doc(o, ED, 'personal', `${k} Private with same picture`);
  const pic = Buffer.from(`\x89PNG picture bytes ${k}`); const h = sha(pic);
  let s = await J('drive.assets.sign', { file: d1.id, sha256: h, mime_type: 'image/png', size_bytes: pic.length }, ED, o.id);
  check(`AT1${k}`, `${N}: a new picture gets an upload address under the organization's attachments`, s.status === 200 && s.row.path === `${o.id}/assets/${h}.png` && !s.row.asset);
  await storage.put(s.row.path, pic);
  const reg = await J('drive.assets.register', { file: d1.id, sha256: h, path: s.row.path, mime_type: 'image/png', width: 10, height: 10 }, ED, o.id);
  const obj1 = objects();
  const again = await J('drive.assets.sign', { file: d2.id, sha256: h, mime_type: 'image/png', size_bytes: pic.length }, ED, o.id);
  check(`AT2${k}`, `${N}: the same picture again (another document, even a personal one) is reused, not uploaded or stored again`, reg.status === 200 && again.row?.reused === true && again.row.asset === reg.row.asset && objects() === obj1);
  check(`AT3${k}`, `${N}: attachments are not Drive files (nothing new listed)`, !(await list(o, ED, 'shared')).some((n) => /picture/.test(n) && n.endsWith('.png')));
  check(`AT4${k}`, `${N}: a teammate who can open the document gets the picture; nobody gets it through a document they cannot open`, (await J('drive.assets.url', { file: d1.id, assets: [reg.row.asset] }, VW, o.id)).rows.length === 1
    && (await J('drive.assets.url', { file: d2.id, assets: [reg.row.asset] }, VW, o.id)).rows.length === 0);
  const fake = Buffer.from('not the same'); const fh = sha(Buffer.from('claimed')); s = await J('drive.assets.sign', { file: d1.id, sha256: fh, mime_type: 'image/png', size_bytes: fake.length }, ED, o.id); await storage.put(s.row.path, fake);
  check(`AT5${k}`, `${N}: a picture whose bytes do not match its hash is refused (no picture can stand in for another)`, (await J('drive.assets.register', { file: d1.id, sha256: fh, path: s.row.path, mime_type: 'image/png' }, ED, o.id)).status === 422);
  check(`AT6${k}`, `${N}: a viewer cannot attach pictures to a document they cannot edit`, (await J('drive.assets.sign', { file: d1.id, sha256: sha(Buffer.from('v')), mime_type: 'image/png', size_bytes: 1 }, VW, o.id)).status === 404);
  // ---------------------------------------------------------------- presence
  await J('drive.presence.beat', { file: d1.id, mode: 'editing' }, ED, o.id);
  const seen = (await J('drive.presence.beat', { file: d1.id }, VW, o.id)).rows;
  check(`PR1${k}`, `${N}: presence shows who else really has the file open (and how)`, seen.length === 1 && seen[0].user_id === ED && seen[0].mode === 'editing');
  check(`PR2${k}`, `${N}: nobody sees presence on a file they cannot open`, (await J('drive.presence.beat', { file: d2.id }, VW, o.id)).status !== 200);
  o.made = { pdoc, d1, reg };
}

// ---------------------------------------------------------------- the two organizations never mix
const L = ORGS.L, A = ORGS.A;
check('ISO1', 'An Aurj item cannot be moved or copied from the Layer2Funnels side (by id)', (await J('drive.transfer', { files: [A.made.pdoc.id], to: 'personal', copy: true }, L.U.OWN, L.id)).status === 404);
check('ISO2', 'An Aurj attachment is never reachable through a Layer2Funnels document', (await J('drive.assets.url', { file: L.made.d1.id, assets: [A.made.reg.row.asset] }, L.U.ED, L.id)).rows.length === 0);
check('ISO3', 'Stars of one organization do not show in the other', (await J('drive.stars.list', {}, L.U.ED, A.id)).rows.every((s) => !s.file_id || s.file_id !== L.made.pdoc.id));

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(6)} ${x.name}${x.ok ? '' : `  [${x.detail}]`}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`); await db.close(); process.exit(pc === results.length ? 0 : 1);
