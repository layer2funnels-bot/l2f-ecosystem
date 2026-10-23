// The per-request database setup: one message when the connection allows it, the same effect either way, and values always escaped.
import { recorder } from './lib.mjs';
import { createPgExecutor } from '../packages/core/pg-executor.mjs';
const { results, check } = recorder();
const lit = (t) => `'${String(t).replace(/'/g, "''")}'`;   // what pg's escapeLiteral does for text without backslashes
const mk = (simple) => { const log = []; const conn = { query: async (s, p) => { log.push(['q', s, p]); return { rows: [{ ok: 1 }] }; }, release: () => log.push(['release']), ...(simple ? { simple: async (s) => { log.push(['simple', s]); return []; }, escapeLiteral: lit } : {}) }; return { log, ex: createPgExecutor({ acquire: async () => conn }) }; };
const who = { userId: '3f0c2f5e-0000-4000-8000-000000000001', email: "o'brien@x.test", orgId: '00000000-0000-0000-0000-000000000000' };
const a = mk(true); await a.ex.withRequest(who, (q) => q('select 1'));
const b = mk(false); await b.ex.withRequest(who, (q) => q('select 1'));
check('PX1', 'With a simple-capable connection the setup is ONE message (begin, role, claims, headers), then the work, then commit: three messages instead of five', a.log.filter((x) => x[0] !== 'release').length === 3 && a.log[0][0] === 'simple' && /^begin; set local role app_user; select set_config\('request\.jwt\.claims'/.test(a.log[0][1]) && b.log.filter((x) => x[0] !== 'release').length === 5);
check('PX2', 'Both routes set the same claims and headers, and the same role', a.log[0][1].includes('request.headers') && a.log[0][1].includes('"x-org-id"') && b.log[2][2][1].includes('x-org-id') && b.log[1][1] === 'set local role app_user' && /app_user/.test(a.log[0][1]));
check('PX3', 'A quote in the e-mail cannot break out of the setup message (it is escaped, not pasted in)', a.log[0][1].includes("o''brien@x.test") && !/o'brien/.test(a.log[0][1].replace("o''brien", '')));
const bad = mk(true); bad.log.length = 0; let err = null; try { await bad.ex.withRequest(who, async () => { throw new Error('x'); }); } catch (e) { err = e; }
check('PX4', 'A failing request is rolled back and the connection is released', err && bad.log.some((x) => x[1] === 'rollback') && bad.log.at(-1)[0] === 'release');
let rejected = false; try { createPgExecutor({ acquire: async () => ({}), role: 'postgres' }); } catch { rejected = true; }
check('PX5', 'Only the fixed API role is accepted (it cannot be chosen from outside)', rejected);
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`); process.exit(pc === results.length ? 0 : 1);
