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