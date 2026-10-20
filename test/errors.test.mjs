// T4 at the API boundary: denied, missing and cross-workspace answers must be byte-identical.
import { toPublicError, NOT_FOUND, logSafe } from '../packages/core/errors.mjs';
const r = [];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (id, name, ok) => r.push({ id, name, ok });
check('E1', 'RLS denial (42501) maps to not found', same(toPublicError({ code: '42501', message: 'new row violates row-level security policy for table "clients"' }), NOT_FOUND));
check('E2', 'Reference to another workspace (23503) maps to not found', same(toPublicError({ code: '23503' }), NOT_FOUND));
check('E3', 'Empty read (PGRST116) maps to not found', same(toPublicError({ code: 'PGRST116' }), NOT_FOUND));
check('E4', 'Invalid invitation (P0002) maps to not found', same(toPublicError({ code: 'P0002' }), NOT_FOUND));
check('E5', 'All four answers are identical', new Set(['42501', '23503', 'PGRST116', 'P0002'].map(c => JSON.stringify(toPublicError({ code: c })))).size === 1);
check('E6', 'Database text never reaches the client', !JSON.stringify(toPublicError({ code: '42501', message: 'table "clients"' })).includes('clients'));
check('E7', 'Unknown errors become a generic failure', toPublicError({ code: 'XX000' }).code === 'failed');
check('E8', 'Paused free-tier database maps to a retryable message', toPublicError({ code: '57P03' }).status === 503);
check('E9', 'Safe log line carries no ids or message text', same(Object.keys(logSafe({ code: '42501', message: 'id 123' }, '/clients')), ['route', 'class', 'db_code']));
for (const x of r) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const p = r.filter(x => x.ok).length; console.log(`\n${p}/${r.length} checks passed`); process.exit(p === r.length ? 0 : 1);
