// Browser side of the API: every request carries the bearer token and x-org-id. A 401 triggers one token refresh, then "session expired".
// Calls made in the same moment (a screen loading its data with Promise.all) for the same organization go out as ONE request to
// /api/batch (at most BATCH_MAX per request): one database connection instead of several, which is the slow part of a request.
// Every caller still gets its own answer, exactly as if it had been sent alone.
import { createOrgCache, orgHeaders } from '../../../packages/core/org-switch.mjs';   // in the browser this resolves to /packages/core/… (a path cannot climb above the site root); in Node, to the repository file
export const NO_ORG = '00000000-0000-0000-0000-000000000000';
export const BATCH_MAX = 4;   // same limit as the server (packages/core/http.mjs)

export function createApiClient({ session, auth, fetchImpl = (...a) => fetch(...a), onExpired, batching = true }) {
  const cache = createOrgCache(null);
  const state = { org: null };
  const post = async (path, body, org) => {
    let r;
    try {
      r = await fetchImpl(`/api/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session.get()?.access ?? ''}`, ...orgHeaders(org ?? NO_ORG) }, body: JSON.stringify(body ?? {}) });
    } catch { return { ok: false, status: 0, error: { code: 'offline' } }; }
    let json = null; try { json = await r.json(); } catch { /* not json */ }
    return { status: r.status, ...(json ?? { ok: false, error: { code: 'failed' } }) };
  };
  const raw = (op, input, org) => post(op, input, org);
  let refreshing = null;   // one refresh at a time: the refresh token works once, and a batch can bring several 401s together
  const refresh = () => (refreshing ??= (async () => {
    const cur = session.get(); if (!cur?.refresh) return false;
    const r = await auth.refresh(cur.refresh);
    if (r.ok && r.data?.access_token) { session.set(r.data); return true; }
    return false;
  })().finally(() => { refreshing = null; }));
  // one round trip for several calls; the answer for the whole batch is 401 when the token is refused, otherwise one answer per call
  const rawBatch = async (calls, org) => {
    const res = await post('batch', { calls: calls.map((c) => ({ op: c.op, input: c.input ?? {} })) }, org);
    if (res.ok && Array.isArray(res.results) && res.results.length === calls.length) return res.results;
    return calls.map(() => res);     // offline or a refused token: every caller sees the same failure
  };
  const sendGroup = async (calls, org) => {
    if (calls.length === 1) return [await raw(calls[0].op, calls[0].input, org)];
    if (JSON.stringify(calls.map((c) => c.input ?? {})).length > 12000) return Promise.all(calls.map((c) => raw(c.op, c.input, org)));   // the server takes 16 KB per request
    return rawBatch(calls, org);
  };

  let queue = [];
  const flush = () => {
    const pending = queue; queue = [];
    const byOrg = new Map();
    for (const p of pending) { const k = p.org ?? NO_ORG; if (!byOrg.has(k)) byOrg.set(k, []); byOrg.get(k).push(p); }
    for (const [org, list] of byOrg) for (let i = 0; i < list.length; i += BATCH_MAX) {
      const chunk = list.slice(i, i + BATCH_MAX);
      sendGroup(chunk, org).then((rs) => chunk.forEach((p, n) => p.resolve(rs[n])), () => chunk.forEach((p) => p.resolve({ ok: false, status: 0, error: { code: 'offline' } })));
    }
  };
  const send = (op, input, org) => {
    if (!batching) return raw(op, input, org);
    return new Promise((resolve) => { queue.push({ op, input, org, resolve }); if (queue.length === 1) queueMicrotask(flush); });
  };

  async function call(op, input, { org = state.org } = {}) {
    if (session.needsRefresh() && !(await refresh()) && session.expired()) { onExpired?.(); return { ok: false, status: 401, error: { code: 'session_expired' } }; }
    let res = await send(op, input, org);
    if (res.status === 401 && (await refresh())) res = await send(op, input, org);   // the retries after one shared refresh go out together again
    if (res.status === 401) { onExpired?.(); }
    return res;
  }
  return { call, cache, state, setOrg(id) { state.org = id; cache.reset(id); } };
}
