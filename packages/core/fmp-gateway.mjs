// Funnel Mapper under the ecosystem's one address (office.example.com/fmp; owner, 13 Nov 2026). Used by functions/fmp/[[path]].js.
export const FMP_BASE = '/fmp';

/**
 * Every Funnel Mapper page lives under /fmp, so a redirect from Funnel Mapper to a path on this site without /fmp is one of its own pages.
 * Next.js leaves the base path off when a form is sent as a plain page submission (before its scripts have loaded); this puts it back.
 * Full addresses (the ecosystem sign-in) and paths already under /fmp are left as they are.
 */
export function withBaseLocation(res) {
  const loc = res.headers.get('location');
  if (!loc || !loc.startsWith('/') || loc.startsWith('//') || loc === FMP_BASE || loc.startsWith(`${FMP_BASE}/`) || loc.startsWith(`${FMP_BASE}?`)) return res;
  const headers = new Headers(res.headers); headers.set('location', `${FMP_BASE}${loc}`);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/** Hands the request to the Funnel Mapper Worker (service binding FMP); until it exists, says it is not connected yet. */
export async function fmpGateway(request, env) {
  if (!env.FMP) {
    return new Response('Funnel Mapper isn’t connected yet. An owner connects it when it goes live.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }
  return withBaseLocation(await env.FMP.fetch(request));
}
