// Browser side of the API: every request carries the bearer token and x-org-id. A 401 triggers one token refresh, then "session expired".
import { createOrgCache, orgHeaders } from '/packages/core/org-switch.mjs';
export const NO_ORG = '00000000-0000-0000-0000-000000000000';

export function createApiClient({ session, auth, fetchImpl = (...a) => fetch(...a), onExpired }) {
  const cache = createOrgCache(null);
  const state = { org: null };
  const raw = async (op, input, org) => {
    let r;
    try {
      r = await fetchImpl(`/api/${op}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session.get()?.access ?? ''}`, ...orgHeaders(org ?? NO_ORG) }, body: JSON.stringify(input ?? {}) });
    } catch { return { ok: false, status: 0, error: { code: 'offline' } }; }
    let body = null; try { body = await r.json(); } catch { /* not json */ }
    return { status: r.status, ...(body ?? { ok: false, error: { code: 'failed' } }) };
  };
  const refresh = async () => {
    const cur = session.get(); if (!cur?.refresh) return false;
    const r = await auth.refresh(cur.refresh);
    if (r.ok && r.data?.access_token) { session.set(r.data); return true; }
    return false;
  };
  async function call(op, input, { org = state.org } = {}) {
    if (session.needsRefresh() && !(await refresh()) && session.expired()) { onExpired?.(); return { ok: false, status: 401, error: { code: 'session_expired' } }; }
    let res = await raw(op, input, org);
    if (res.status === 401 && (await refresh())) res = await raw(op, input, org);
    if (res.status === 401) { onExpired?.(); }
    return res;
  }
  return { call, cache, state, setOrg(id) { state.org = id; cache.reset(id); } };
}
