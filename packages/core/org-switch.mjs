// Organization switching in the browser (owner requirement 21 Oct 2026). Framework-neutral.
// Rules: stay in the same app; land on the equivalent page when allowed; never auto-open the Launcher;
// never show anything from the previous organization once the switch starts.

// A cache that only ever answers for the CURRENT organization. Every entry is tagged with its organization,
// late responses for the previous organization are refused, and switching wipes everything.
export function createOrgCache(initialOrg = null) {
  let org = initialOrg;
  const store = new Map();
  return {
    get org() { return org; },
    set(key, value, forOrg) { if (!forOrg || forOrg !== org) return false; store.set(key, { org: forOrg, value }); return true; },
    get(key) { const e = store.get(key); return e && e.org === org ? e.value : undefined; },
    size() { return store.size; },
    reset(newOrg) { store.clear(); org = newOrg; },
  };
}

// Every API request carries the active organization; the database narrows to it (migration 0005).
export const orgHeaders = (orgId) => (orgId ? { 'x-org-id': orgId } : {});

// rpc(name, args) -> rows. `current` = { app, page }. Record ids are never carried across organizations.
export async function switchOrganization({ rpc, cache, targetOrg, current }) {
  const [r] = await rpc('resolve_org_switch', { p_org: targetOrg, p_app: current.app, p_page: current.page ?? null });
  if (!r || r.outcome === 'not_available') {
    // Nothing changes: same organization, same page, same data. Show the message in place.
    return { outcome: 'not_available', message: r?.message ?? 'Nothing was changed.', route: { ...current }, org: cache.org };
  }
  cache.reset(r.org_id);                       // wipe records, ids, search results of the previous organization
  const route = r.outcome === 'app_unavailable'
    ? { app: current.app, page: null, explain: true }          // stay in the app and explain; no redirect
    : { app: r.app_key, page: r.page_key, explain: Boolean(r.message) };
  return { outcome: r.outcome, message: r.message, route, org: r.org_id, orgName: r.org_name, headers: orgHeaders(r.org_id) };
}
