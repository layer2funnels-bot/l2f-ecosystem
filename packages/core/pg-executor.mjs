// Runs one API request inside one database transaction as the signed-in user, the way PostgREST does:
// role, JWT claims and request headers (x-org-id) are set LOCAL, so nothing survives past the transaction.
// acquire() -> { query(sql, params) -> { rows }, release(), simple?(sql), escapeLiteral?(text) }. Works with a pg Pool client or any single connection.
// When the connection offers `simple` and `escapeLiteral` (the real server does), the per-request setup (begin, role, claims, headers) goes out as ONE message instead of
// three: fewer round trips to the database, which matters most for a database far from the Worker. The values are escaped by the driver itself, never concatenated raw.
// The query function every operation gets: rows, plus the changed-row count and column types as hidden properties
// (Projects V2 reads them through packages/core/pm/server/db.ts; JSON output and every other caller see plain rows).
const rowsOf = (c) => async (sql, params = []) => {
  const r = await c.query(sql, params); const rows = r.rows ?? [];
  Object.defineProperties(rows, { rowCount: { value: r.rowCount ?? r.affectedRows ?? rows.length }, fields: { value: r.fields ?? [] } });
  return rows;
};
const ROLES = new Set(['app_user']);   // fixed allowlist: `set role` cannot take parameters

export function createPgExecutor({ acquire, role = 'app_user' }) {
  if (!ROLES.has(role)) throw new Error('unsupported database role');
  return {
    // For the public share-link endpoint: no person, no organization. Same role, no claims, so only the one security-definer function it calls can read anything.
    async withPublic(fn) {
      const c = await acquire();
      try {
        await c.query('begin'); await c.query(`set local role ${role}`);
        const out = await fn(rowsOf(c));
        await c.query('commit'); return out;
      } catch (e) {
        try { await c.query('rollback'); } catch { /* connection already gone */ }
        throw e;
      } finally { c.release(); }
    },
    async withRequest({ userId, email = null, emailVerified = false, orgId }, fn) {
      const c = await acquire();
      try {
        const claims = JSON.stringify({ sub: userId, email, role: 'authenticated', ...(emailVerified ? { email_verified: true } : {}) }), headers = JSON.stringify({ 'x-org-id': orgId });
        if (c.simple && c.escapeLiteral) {
          await c.simple(`begin; set local role ${role}; select set_config('request.jwt.claims', ${c.escapeLiteral(claims)}, true), set_config('request.headers', ${c.escapeLiteral(headers)}, true)`);
        } else {
          await c.query('begin');
          await c.query(`set local role ${role}`);
          await c.query("select set_config('request.jwt.claims', $1, true), set_config('request.headers', $2, true)", [claims, headers]);
        }
        const out = await fn(rowsOf(c));
        await c.query('commit');
        return out;
      } catch (e) {
        try { await c.query('rollback'); } catch { /* connection already gone */ }
        throw e;
      } finally { c.release(); }
    },
  };
}
