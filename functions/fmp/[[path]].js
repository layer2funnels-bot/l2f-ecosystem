// Cloudflare Pages Function: every /fmp/* request. Funnel Mapper is part of the ecosystem's one address (office.example.com/fmp; owner,
// 13 Nov 2026): this hands the request to the Funnel Mapper Worker through a service binding (FMP, in wrangler.toml), so it has no public
// address of its own and shares the ecosystem's sign-in cookie (same address). Until the binding exists the page says so; nothing else changes.
export async function onRequest({ request, env }) {
  if (!env.FMP) {
    return new Response('Funnel Mapper isn’t connected yet. An owner connects it when it goes live.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }
  return env.FMP.fetch(request);
}
