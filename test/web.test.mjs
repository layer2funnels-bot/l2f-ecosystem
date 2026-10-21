// Browser-side logic that must not depend on a browser: input validation rules shared with the server. UI state tests are added below.
import { recorder } from './lib.mjs';
import { validate } from '../packages/core/validate.mjs';
import { parseRoute, routeForPage, pageKeyFor, defaultOrg, hrefFor, FUNNEL_TYPES } from '../apps/web/js/routes.js';
import { createSession, parseAuthHash } from '../apps/web/js/session.js';
import { createAuthClient, isEmail } from '../apps/web/js/gotrue.js';
import { MESSAGES, messageFor, fieldLabel } from '../apps/web/js/messages.js';
import * as errors from '../packages/core/errors.mjs';
import { FUNNEL_TYPES as SERVER_TYPES } from '../packages/core/funnel-operations.mjs';
import { FIELD_DEFS } from '../apps/web/js/views/funnels.js';
import { operations } from '../packages/core/operations.mjs';
import { permissionSet, canWith, canAnywhereWith } from '../apps/web/js/perm.js';
import { reasonChips, foldEffective, levelMatrix } from '../apps/web/js/views/admin.js';
import { MIN_PASSWORD } from '../apps/web/js/gotrue.js';
import { dirty } from '../apps/web/js/dirty.js';
const { results, check } = recorder();
const spec = { name: { type: 'text', required: true, max: 5 }, tags: { type: 'list', items: 'text', max: 2, itemMax: 3 }, price: { type: 'number' }, cur: { type: 'currency' }, c: { type: 'hex' } };
check('V1', 'Valid input passes and only declared fields come through', JSON.stringify(validate(spec, { name: 'abc', tags: ['a', 'bc'], price: 4.5, cur: 'USD', c: '#aabbcc' }).value) === '{"name":"abc","tags":["a","bc"],"price":4.5,"cur":"USD","c":"#aabbcc"}');
check('V2', 'Unknown, missing and wrongly typed fields are reported by name only', validate(spec, { x: 1, name: 5 }).fields.join() === 'name,x');
check('V3', 'List size and item size are separate limits', !validate(spec, { name: 'a', tags: ['a', 'b', 'c'] }).ok && !validate(spec, { name: 'a', tags: ['abcd'] }).ok && validate(spec, { name: 'a', tags: ['abc'] }).ok);
check('V4', 'Numbers must be finite and not negative; currency must be 3 capitals; colours #rrggbb',
  !validate(spec, { name: 'a', price: -1 }).ok && !validate(spec, { name: 'a', price: NaN }).ok && !validate(spec, { name: 'a', cur: 'usd' }).ok && !validate(spec, { name: 'a', c: 'red' }).ok);
check('V5', 'Arrays and primitives are not accepted as the whole input', !validate(spec, []).ok && !validate(spec, 'x').ok);

// ---- routes
check('W1', 'Routes parse: auth screens, Launcher, Office, Funnels list and record, unknown', ['#/signin', '#/launcher', '#/office', '#/office/funnels', '#/office/funnels/avatars', '#/office/funnels/offers/new', '#/nope', '#/office/funnels/nope']
  .map((h) => parseRoute(h).name).join() === 'signin,launcher,office,funnels,funnel-list,funnel-record,not-found,not-found' && parseRoute('#/invite?token=abc').query.token === 'abc' && parseRoute('').name === 'home');
check('W2', 'A record route never maps to a record page after a switch: it lands on the list, in the same app', routeForPage('office', 'funnels.avatar') === '#/office/funnels/avatars' && routeForPage('office', 'funnels.offers') === '#/office/funnels/offers');
check('W3', 'The switch never lands on the Launcher: unknown pages fall back to the app home, other apps to their own placeholder', routeForPage('office', 'whatever') === '#/office' && routeForPage('projects', null) === '#/app/projects' && !routeForPage('office', null).includes('launcher'));
check('W4', 'Page keys sent to resolve_org_switch match the registry in migration 0006', pageKeyFor(parseRoute('#/office/funnels/avatars')).page === 'funnels.avatars' && pageKeyFor(parseRoute('#/office/funnels/avatars/abc')).page === 'funnels.avatar' && pageKeyFor(parseRoute('#/office')).page === 'home');
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('../migrations/0006_funnels_foundation.sql', import.meta.url), 'utf8');
check('W5', 'Every page key the UI uses is registered in app_pages', FUNNEL_TYPES.every((t) => sql.includes(`'${t.page}'`) && sql.includes(`'${t.record}'`)) && sql.includes("'funnels',"));
check('W6', 'First sign-in default: highest role, then name', defaultOrg([{ name: 'Aurj', role: 'editor' }, { name: 'Layer2Funnels', role: 'owner' }]).name === 'Layer2Funnels' && defaultOrg([{ name: 'B', role: 'admin' }, { name: 'A', role: 'admin' }]).name === 'A');
// ---- messages
const codes = Object.values(errors).filter((e) => e && typeof e === 'object' && e.code).map((e) => e.code);
check('W7', 'Every API error code in the contract has a plain-words message in the browser', codes.length >= 9 && codes.every((c) => MESSAGES[c]));
check('W8', 'Messages never contain technical words', Object.values(MESSAGES).every((m) => !/constraint|policy|rls|postgres|sql|jwt|token|42501|uuid/i.test(m)) && messageFor('weird') === MESSAGES.failed && fieldLabel('zzz') === 'a field');
// ---- UI field definitions vs server specs (no field the server would refuse, none missing)
const NOT_YET = { brand_kits: ['logo_file_id'] };   // logos are Drive files; the picker arrives with Drive
const sameFields = Object.entries(SERVER_TYPES).every(([k, spec]) => JSON.stringify(Object.keys(spec.fields).filter((f) => !(NOT_YET[k] ?? []).includes(f)).sort()) === JSON.stringify(FIELD_DEFS[k].map((f) => f.k).sort()));
check('W9', 'The UI edits exactly the fields the server accepts (logo waits for Drive), for all four record types', sameFields);
check('W10', 'Every UI route type has all eight server operations', FUNNEL_TYPES.every((t) => ['list', 'get', 'create', 'update', 'archive', 'restore', 'share', 'delete'].every((a) => operations[`funnels.${t.key}.${a}`])));
check('W11', 'Every operation declares a known rate-limit class, and all mutating funnel operations are write-class', Object.values(operations).every((o) => ['read', 'write', 'sensitive'].includes(o.class)) && ['create', 'update', 'archive', 'restore', 'share', 'delete'].every((a) => operations[`funnels.avatars.${a}`].class === 'write'));
// ---- session
let t = 1_000_000; const mem = new Map(); const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
const ses = createSession({ storage, now: () => t });
ses.set({ access_token: 'a', refresh_token: 'r', expires_in: 3600, user: { email: 'x@example.com', id: 'u' } });
check('W12', 'Session stores tokens, survives a reload, and knows when to refresh or has expired', ses.signedIn() && createSession({ storage, now: () => t }).get().email === 'x@example.com' && !ses.needsRefresh() && (t += 3_560_000, ses.needsRefresh()) && !ses.expired() && (t += 100_000, ses.expired()));
ses.clear(); check('W13', 'Clearing the session removes it from storage', !ses.signedIn() && !storage.getItem('l2f.session.v1'));
check('W14', 'Auth e-mail links: tokens are read from the URL hash, errors are noticed, nothing else is trusted', parseAuthHash('#access_token=A&refresh_token=R&expires_in=60&type=recovery').type === 'recovery' && parseAuthHash('#/signin') === null && parseAuthHash('#error_code=otp_expired').error === 'otp_expired');
// ---- auth client against a fake server
const calls = []; const fake = async (u, o) => { calls.push({ u, o }); return { ok: true, status: 200, json: async () => ({ access_token: 'T' }) }; };
const ac = createAuthClient({ baseUrl: 'http://x.test/', publishableKey: 'sb_publishable_k', fetchImpl: fake, redirectTo: 'https://app.test/' });
await ac.signIn('a@b.co', 'pw'); await ac.signUp('a@b.co', 'pw'); await ac.setPassword('TOK', 'newpw');
check('W15', 'Auth calls use the publishable key only; the user token only where needed; sign-up and recovery carry the redirect', calls.every((c) => c.o.headers.apikey === 'sb_publishable_k') && calls[0].u === 'http://x.test/auth/v1/token?grant_type=password' && !calls[0].o.headers.authorization && calls[1].u.includes('redirect_to=https%3A%2F%2Fapp.test%2F') && calls[2].o.headers.authorization === 'Bearer TOK' && calls[2].o.method === 'PUT');
const offline = createAuthClient({ baseUrl: 'http://x.test', publishableKey: 'k', fetchImpl: async () => { throw new Error('net'); } });
check('W16', 'A network failure is reported as offline, never thrown', (await offline.signIn('a@b.co', 'x')).offline === true);
check('W17', 'E-mail shape check accepts normal addresses and refuses junk', isEmail('a.b+c@example.co.uk') && !isEmail('a@b') && !isEmail('a b@c.com') && !isEmail(''));
const secretsInWeb = ['config.js', 'js/app.js', 'js/api.js', 'js/gotrue.js'].map((f) => readFileSync(new URL(`../apps/web/${f}`, import.meta.url), 'utf8')).join('\n');
check('W18', 'No privileged key names or JWT-shaped strings in browser code', !/service_role|sb_secret_|SERVICE_ROLE|eyJ[A-Za-z0-9_-]{10,}\./.test(secretsInWeb));
const noInner = ['js/app.js', 'js/dom.js', 'js/views/auth.js', 'js/ui.js', 'js/perm.js', 'js/dirty.js', 'js/views/funnels.js', 'js/views/launcher.js', 'js/views/shell.js', 'js/views/admin.js', 'js/views/home.js'].map((f) => readFileSync(new URL(`../apps/web/${f}`, import.meta.url), 'utf8')).join('\n').replace(/\/\/.*$/gm, '');   // comments may mention the words
check('W19', 'No innerHTML, insertAdjacentHTML, document.write or eval anywhere in browser code (data can never become markup)', !/innerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(noInner));

// ---- Admin routes, scoped permissions, access explanations, unsaved-work registry (screens built to designs 01 to 07)
check('W20', 'Admin routes parse (members, access with its three views) and map to the registry pages used by the switcher',
  parseRoute('#/office/admin').params.tab === 'members' && parseRoute('#/office/admin/access/effective').params.sub === 'effective' && parseRoute('#/office/admin/access').params.sub === 'levels' && parseRoute('#/office/admin/nope').name === 'not-found'
  && pageKeyFor(parseRoute('#/office/admin/members')).page === 'admin.members' && pageKeyFor(parseRoute('#/office/admin/access/levels')).page === 'admin.access' && routeForPage('office', 'admin.access') === '#/office/admin/access/levels'
  && parseRoute('#/office/planner').name === 'office-page' && parseRoute('#/office/team').params.page === 'team');
const mine = permissionSet([{ permission_key: 'funnels.avatar.view', scope: 'workspace' }, { permission_key: 'funnels.avatar.edit', scope: 'client', client_id: 'c1' }]);
check('W21', 'A person who holds a permission on one client only sees the buttons for that client, and no others', canWith(mine, 'funnels.avatar.edit', 'c1') && !canWith(mine, 'funnels.avatar.edit', 'c2') && !canWith(mine, 'funnels.avatar.edit', null)
  && canWith(mine, 'funnels.avatar.view', 'c2') && canAnywhereWith(mine, 'funnels.avatar.edit') && !canAnywhereWith(mine, 'funnels.avatar.create'));
check('W22', 'Access reasons are shown in plain words and a denial always reads as Deny wins',
  reasonChips('allow:role-owner')[0] === 'Owner level' && reasonChips('allow:level:Client team')[0] === 'Level: Client team' && reasonChips('deny:override:deny-level:abc:no drive').join() === 'Denied,Deny wins'
  && reasonChips('deny:no-grant')[0] === 'Not assigned' && reasonChips('deny:role-floor-admin')[0].includes('Admin') && reasonChips('deny:app-not-available')[0] === 'App not turned on' && reasonChips('???')[0] === 'No access');
const folded = foldEffective([{ permission_key: 'drive.file.view', app_key: 'drive', allowed: false, reason: 'deny:override:deny-level:x:why' }, { permission_key: 'drive.file.upload', app_key: 'drive', allowed: false, reason: 'deny:override:deny-level:x:why' },
  { permission_key: 'clients.client.view', app_key: 'clients', allowed: true, reason: 'allow:level:Client team' }, { permission_key: 'planner.goal.view', app_key: 'planner', allowed: true, reason: 'allow:role-editor' }, { permission_key: 'planner.goal.edit', app_key: 'planner', allowed: true, reason: 'allow:role-editor' }]);
check('W23', 'Effective access folds permissions into one row per area: Can edit, Can view or No access, with the reasons',
  folded.find((r) => r.area === 'Drive').result === 'none' && folded.find((r) => r.area === 'Drive').why.includes('Deny wins') && folded.find((r) => r.area === 'Clients').result === 'view' && folded.find((r) => r.area === 'Planner').result === 'edit' && folded.find((r) => r.area === 'Planner').why[0] === 'Editor level');
const matrix = levelMatrix([{ key: 'clients.client.view', app_key: 'clients', description: 'View a client', floor_role: 'viewer', default_role: 'admin' }, { key: 'clients.client.create', app_key: 'clients', description: 'Create a client', floor_role: 'editor', default_role: 'editor' }]);
check('W23b', 'Funnels permissions hosted by the Office app are shown as their own area, "Funnels records"', foldEffective([{ permission_key: 'funnels.avatar.view', app_key: 'office', allowed: true, reason: 'allow:role-editor' }])[0].area === 'Funnels records');
check('W24', 'The Levels table is read from the permission catalog: defaults and floors decide which level gets each ability', JSON.stringify(matrix[0].rows.map((r) => r.cells)) === '[[true,true,false,false],[true,true,true,false]]');
check('W25', 'Passwords need at least 10 characters (design 02)', MIN_PASSWORD === 10);
let saved = 0; dirty.set('Avatars', async () => { saved++; return true; });
check('W26', 'Unsaved work is registered with a label and a save action, and clearing it forgets it', dirty.isDirty() && dirty.get().label === 'Avatars' && (await dirty.get().save()) === true && saved === 1 && (dirty.clear(), !dirty.isDirty()));
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(4)} ${x.name}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); process.exit(p === results.length ? 0 : 1);
