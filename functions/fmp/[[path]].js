// Cloudflare Pages Function: every /fmp/* request. Funnel Mapper is part of the ecosystem's one address (office.example.com/fmp; owner,
// 13 Nov 2026): the request goes to the Funnel Mapper Worker through a service binding (FMP, in wrangler.toml), so it has no public
// address of its own and shares the ecosystem's sign-in cookie (same address). Until the binding exists the page says so; nothing else changes.
import { fmpGateway } from '../../packages/core/fmp-gateway.mjs';

export async function onRequest({ request, env }) {
  return fmpGateway(request, env);
}
