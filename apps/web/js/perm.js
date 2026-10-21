// What a person may do here, from access.mine: organization-wide, and on single clients. The database decides; this only decides which buttons to show.
export function permissionSet(rows) {
  const ws = new Set(); const byClient = new Map();
  for (const r of rows) {
    if (r.scope === 'workspace') ws.add(r.permission_key);
    else if (r.scope === 'client' && r.client_id) { if (!byClient.has(r.client_id)) byClient.set(r.client_id, new Set()); byClient.get(r.client_id).add(r.permission_key); }
  }
  return { ws, byClient };
}
export const canWith = (mine, perm, clientId) => mine.ws.has(perm) || Boolean(clientId && mine.byClient.get(clientId)?.has(perm));
export const canAnywhereWith = (mine, perm) => mine.ws.has(perm) || [...mine.byClient.values()].some((s) => s.has(perm));
