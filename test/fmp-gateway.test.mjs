// The /fmp gateway (functions/fmp/[[path]].js): Funnel Mapper under the ecosystem's one address.
import { recorder } from './lib.mjs';
import { onRequest } from '../functions/fmp/[[path]].js';
import { withBaseLocation } from '../packages/core/fmp-gateway.mjs';

const { results, check } = recorder();
const r = (status, location) => new Response(null, { status, headers: location ? { location } : {} });
const loc = (res) => res.headers.get('location');

check('GW1', 'Without the binding, /fmp says Funnel Mapper is not connected yet (503) and nothing else happens',
  await (async () => { const x = await onRequest({ request: new Request('https://o.test/fmp/clients'), env: {} }); return x.status === 503 && /isn’t connected yet/.test(await x.text()); })());
check('GW2', 'A redirect to one of Funnel Mapper\'s pages without /fmp gets /fmp (plain form submissions)',
  loc(withBaseLocation(r(303, '/clients/abc'))) === '/fmp/clients/abc' && loc(withBaseLocation(r(307, '/'))) === '/fmp/' && loc(withBaseLocation(r(303, '/clients?trashed=1'))) === '/fmp/clients?trashed=1');
check('GW3', 'Redirects already under /fmp, to full addresses or the web app’s own `/#` routes (the ecosystem sign-in) or protocol-relative ones are left alone',
  loc(withBaseLocation(r(303, '/fmp/clients'))) === '/fmp/clients' && loc(withBaseLocation(r(307, '/fmp'))) === '/fmp' && loc(withBaseLocation(r(307, 'https://o.test/#/signin?return=x'))) === 'https://o.test/#/signin?return=x'
  && loc(withBaseLocation(r(307, '/#/signin?return=x'))) === '/#/signin?return=x'
  && loc(withBaseLocation(r(302, '//evil.test/'))) === '//evil.test/' && withBaseLocation(r(200)).status === 200);
check('GW4', 'With the binding, the request goes to Funnel Mapper and its redirect is fixed on the way back',
  await (async () => { let seen; const x = await onRequest({ request: new Request('https://o.test/fmp/clients/new', { method: 'POST' }), env: { FMP: { fetch: async (q) => { seen = q; return r(303, '/clients/1'); } } } }); return seen.url === 'https://o.test/fmp/clients/new' && x.status === 303 && loc(x) === '/fmp/clients/1'; })());

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}${x.ok ? '' : `  [${x.detail}]`}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`);
process.exit(p === results.length ? 0 : 1);
