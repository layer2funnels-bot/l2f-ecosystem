// Runs one API request inside one database transaction as the signed-in user, the way PostgREST does:
// role, JWT claims and request headers (x-org-id) are set LOCAL, so nothing survives past the transaction.
// acquire() -> { query(sql, params) -> { rows }, release() }. Works with a pg Pool client or any single connection.
const ROLES = new Set(['app_user', 'authenticated']);   // fixed allowlist: `set role` cannot take parameters

export function createPgExecutor({ acquire, role = 'authenticated' }) {
  if (!ROLES.has(role)) throw new Error('unsupported database role');
  return {
    async withRequest({ userId, email = null, orgId }, fn) {
      const c = await acquire();
      try {
        await c.query('begin');
        await c.query(`set local role ${role}`);
        await c.query("select set_config('request.jwt.claims', $1, true), set_config('request.headers', $2, true)", [
          JSON.stringify({ sub: userId, email, role: 'authenticated' }),
          JSON.stringify({ 'x-org-id': orgId }),
        ]);
        const out = await fn(async (sql, params = []) => (await c.query(sql, params)).rows);
        await c.query('commit');
        return out;
      } catch (e) {
        try { await c.query('rollback'); } catch { /* connection already gone */ }
        throw e;
      } finally { c.release(); }
    },
  };
}
