// The ecosystem backend: every Planner call goes to /api/planner.strategy.* with the shell session and the right organization.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApiBackend } from '../src/api/apiBackend.ts';

const store = (session: unknown) => { const m = new Map<string, string>([['l2f.session.v1', JSON.stringify(session)]]); return { getItem: (k: string) => m.get(k) ?? null } as unknown as Storage; };
const ORG = '11111111-1111-4111-8111-111111111111';

test('calls go through the shared API with the bearer token and the organization the call names', async () => {
  const seen: { url: string; headers: Record<string, string>; body: unknown }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => { seen.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) }); return new Response(JSON.stringify({ ok: true, data: [{ r: { ok: 1 } }] })); }) as unknown as typeof fetch;
  const b = createApiBackend({ fetchImpl, storage: store({ access: 'tok', userId: 'u1', name: 'Olive' }) });
  assert.deepEqual(b.me(), { id: 'u1', name: 'Olive' });
  assert.deepEqual(await b.rpc('planner_list_plans', { p_workspace: ORG }), { ok: 1 });
  await b.rpc('planner_get_plan', { p_plan: 'x' });   // later calls keep that organization
  assert.equal(seen[0]!.url, '/api/planner.strategy.list_plans');
  assert.equal(seen[0]!.headers.authorization, 'Bearer tok');
  assert.equal(seen[1]!.headers['x-org-id'], ORG);
  assert.deepEqual(seen[1]!.body, { args: { p_plan: 'x' } });
  await assert.rejects(b.rpc('drop_everything'), /unknown operation/);
});

test('a refusal or an unreachable server becomes an error, never an endless loading state', async () => {
  const refused = createApiBackend({ fetchImpl: (async () => new Response(JSON.stringify({ ok: false, error: { code: 'forbidden' } }), { status: 403 })) as unknown as typeof fetch, storage: store({ access: 't' }) });
  await assert.rejects(refused.rpc('planner_get_plan', { p_plan: 'x' }), (e: { code: string }) => e.code === 'forbidden');
  const offline = createApiBackend({ fetchImpl: (async () => { throw new TypeError('network'); }) as unknown as typeof fetch, storage: store({ access: 't' }) });
  await assert.rejects(offline.rpc('planner_get_plan', { p_plan: 'x' }), (e: { code: string }) => e.code === 'offline');
  assert.equal(createApiBackend({ storage: store(null) }).me(), null);   // signed out: the host shows "Sign in first"
});
// ---- session expiry: the cause of "the page only works after a browser refresh"
const rw = (session: unknown) => { const m = new Map<string, string>([['l2f.session.v1', JSON.stringify(session)]]); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } } as unknown as Storage; };
const ok = () => new Response(JSON.stringify({ ok: true, data: [{ r: 1 }] }), { status: 200 });

test('an expiring token is refreshed before the call, and the new token is used', async () => {
  const NOW = 1_000_000_000_000;
  const storage = rw({ access: 'old', refresh: 'r1', expiresAt: NOW + 10_000, userId: 'u1' });   // 10 s left
  const seen: string[] = [];
  const fetchImpl = (async (_u: string, init: RequestInit) => { seen.push((init.headers as Record<string, string>).authorization!); return ok(); }) as unknown as typeof fetch;
  let refreshCalls = 0;
  const auth = { refresh: async (t: string) => { refreshCalls++; assert.equal(t, 'r1'); return { ok: true, data: { access_token: 'new', refresh_token: 'r2', expires_in: 3600, user: { id: 'u1' } } }; } };
  const b = createApiBackend({ fetchImpl, storage, auth, now: () => NOW });
  await b.rpc('planner_get_plan', { p_plan: 'x' }); await b.rpc('planner_get_plan', { p_plan: 'y' });
  assert.equal(refreshCalls, 1);                       // once, not per call
  assert.deepEqual(seen, ['Bearer new', 'Bearer new']);
});

test('an expired session that cannot be refreshed ends as a clear message and sends nothing', async () => {
  const NOW = 1_000_000_000_000; let sent = 0;
  const storage = rw({ access: 'old', refresh: 'r1', expiresAt: NOW - 1000, userId: 'u1' });
  const b = createApiBackend({ fetchImpl: (async () => { sent++; return ok(); }) as unknown as typeof fetch, storage, auth: { refresh: async () => ({ ok: false }) }, now: () => NOW });
  await assert.rejects(b.rpc('planner_get_plan', { p_plan: 'x' }), (e: { code: string }) => e.code === 'session_expired');
  assert.equal(sent, 0);
});

test('a 401 triggers one refresh and one retry', async () => {
  const NOW = 1_000_000_000_000; const seen: string[] = [];
  const storage = rw({ access: 'stale', refresh: 'r1', expiresAt: NOW + 3_600_000, userId: 'u1' });   // looks valid, server disagrees
  const fetchImpl = (async (_u: string, init: RequestInit) => { const a = (init.headers as Record<string, string>).authorization!; seen.push(a); return a === 'Bearer fresh' ? ok() : new Response('{"ok":false}', { status: 401 }); }) as unknown as typeof fetch;
  const auth = { refresh: async () => ({ ok: true, data: { access_token: 'fresh', refresh_token: 'r2', expires_in: 3600 } }) };
  const b = createApiBackend({ fetchImpl, storage, auth, now: () => NOW });
  assert.equal(await b.rpc('planner_get_plan', { p_plan: 'x' }), 1);
  assert.deepEqual(seen, ['Bearer stale', 'Bearer fresh']);
});

// ---- the organization is the ecosystem's, not Planner's own
test('the organization list carries the active one, and switching goes through the shared switch operation', async () => {
  const seen: { url: string; body: unknown }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => { seen.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ ok: true, data: url.endsWith('org.list') ? [{ org_id: ORG, name: 'Aurj', slug: 'aurj', member_kind: 'staff', is_active: true }, { org_id: 'b', name: 'L', slug: 'layer2funnels', member_kind: 'staff', is_active: false }, { org_id: 'c', name: 'Client', slug: 'x', member_kind: 'client', is_active: false }] : [{ outcome: 'same_page' }] }), { status: 200 }); }) as unknown as typeof fetch;
  const b = createApiBackend({ fetchImpl, storage: store({ access: 't', userId: 'u1' }) });
  const list = await b.listWorkspaces();
  assert.deepEqual(list.map((w) => [w.name, w.isActive]), [['Aurj', true], ['L', false]]);   // client contacts never see Planner
  await b.setActiveWorkspace('b');
  assert.equal(seen[1]!.url, '/api/org.switch');
  assert.deepEqual(seen[1]!.body, { org: 'b', app: 'planner' });
});

// ---- hosted by the ecosystem shell (src/embed.tsx): the shell's API client, the shell's organization
const OTHER = '22222222-2222-4222-8222-222222222222';
const hosted = (answer: (op: string) => unknown, seen: { op: string; input: unknown; org: string }[] = [], timeoutMs?: number) => createApiBackend({
  host: { org: ORG, me: { id: 'u1', name: 'Olive' }, call: async (op, input, org) => { seen.push({ op, input, org }); return answer(op) as never; } }, ...(timeoutMs ? { timeoutMs } : {}),
});

test('hosted: every call goes through the shell\'s client with the shell\'s organization, which a call cannot change', async () => {
  const seen: { op: string; input: unknown; org: string }[] = [];
  const b = hosted(() => ({ ok: true, data: [{ r: { ok: 1 } }] }), seen);
  assert.deepEqual(b.me(), { id: 'u1', name: 'Olive' });
  await b.rpc('planner_list_plans', { p_workspace: OTHER });   // the server refuses a mismatch (42501); the client never follows it
  await b.rpc('planner_get_plan', { p_plan: 'x' });
  assert.deepEqual(seen.map((s) => [s.op, s.org]), [['planner.strategy.list_plans', ORG], ['planner.strategy.get_plan', ORG]]);
  assert.deepEqual(seen[1]!.input, { args: { p_plan: 'x' } });
  await assert.rejects(b.setActiveWorkspace(OTHER), (e: { code: string }) => e.code === 'forbidden');   // only the shell's switcher switches
});

test('hosted: the organization list marks the shell\'s organization active, and client memberships are left out', async () => {
  const b = hosted(() => ({ ok: true, data: [{ org_id: ORG, name: 'L', slug: 'layer2funnels', member_kind: 'staff', is_active: false }, { org_id: OTHER, name: 'A', slug: 'aurj', member_kind: 'staff', is_active: true }, { org_id: 'c', name: 'C', slug: 'c', member_kind: 'client' }] }));
  const list = await b.listWorkspaces();
  assert.deepEqual(list.map((w) => [w.id, w.isActive]), [[ORG, true], [OTHER, false]]);
});
test('hosted: the shell\'s organization list is used as it is, without asking the server again', async () => {
  const seen: { op: string; input: unknown; org: string }[] = [];
  const b = createApiBackend({ host: { org: ORG, me: { id: 'u1', name: 'O' }, orgs: [{ org_id: ORG, name: 'L', slug: 'layer2funnels', member_kind: 'staff' }], call: async (op, input, org) => { seen.push({ op, input, org }); return { ok: true, data: [] }; } } });
  assert.deepEqual((await b.listWorkspaces()).map((w) => w.id), [ORG]);
  assert.equal(seen.length, 0);
});

test('hosted: an expired session, a refusal, no connection and no answer each end as a clear error', async () => {
  await assert.rejects(hosted(() => ({ ok: false, status: 401, error: { code: 'session_expired' } })).rpc('planner_get_plan', { p_plan: 'x' }), (e: { code: string }) => e.code === 'session_expired');
  await assert.rejects(hosted(() => ({ ok: false, status: 403, error: { code: 'forbidden' } })).rpc('planner_get_plan', { p_plan: 'x' }), (e: { code: string }) => e.code === 'forbidden');
  await assert.rejects(hosted(() => ({ ok: false, status: 0, error: { code: 'offline' } })).rpc('planner_get_plan', { p_plan: 'x' }), (e: { code: string }) => e.code === 'offline');
  const never = createApiBackend({ host: { org: ORG, me: { id: 'u1', name: 'O' }, call: () => new Promise(() => {}) }, timeoutMs: 30 });
  await assert.rejects(never.rpc('planner_get_plan', { p_plan: 'x' }), (e: { code: string }) => e.code === 'offline');
});
