# Funnel Mapper on Cloudflare (office.tabishriaz.com/fmp)

Owner decisions (13–14 Nov 2026): one address for every app; Funnel Mapper at `office.tabishriaz.com/fmp`; the assistant manages the Cloudflare deployment with a restricted token; nothing existing is deleted and nothing unrelated is changed.

## Architecture
```
browser ── office.tabishriaz.com ──► Pages project "l2f-ecosystem" (existing)
                                      ├─ /api/*  functions/api/[[route]].js   (ecosystem API, unchanged)
                                      ├─ /fmp/*  functions/fmp/[[path]].js    ──service binding FMP──►  Worker "funnel-mapper" (new, no public address)
                                      └─ everything else: the web app (static)
Worker "funnel-mapper" ──► https://office.tabishriaz.com/api/*  (ecosystem API, the person's own token)
browser ──► R2 bucket "l2f-ecosystem-files" (existing): signed uploads of Funnel Mapper images (<org>/fmp/...)
```
- One sign-in: same address, so the web app's session cookie (`l2f-session`, host-only) reaches Funnel Mapper. No cookie-domain or extra-origin setting is used.
- The gateway puts `/fmp` back on Funnel Mapper's site-relative redirects (`packages/core/fmp-gateway.mjs`, tested in `test/fmp-gateway.test.mjs`).
- Until the Worker exists and the binding is added, `/fmp` answers "Funnel Mapper isn't connected yet" (503); the rest of the site is unaffected.

## Cloudflare resources
| Resource | Exists already? | What happens | How |
|---|---|---|---|
| Account `d5ec27e33b46a9e645eb4d4d3b23cde6` | yes | nothing | — |
| Zone `tabishriaz.com`, custom domain `office.tabishriaz.com` on the Pages project | yes | nothing (no DNS record, route or custom domain is added) | — |
| Pages project `l2f-ecosystem` | yes | one new Function file (`functions/fmp/[[path]].js`) and the service binding `FMP → funnel-mapper` in `wrangler.toml` (PR #52, merged 14 Nov 2026). Dashboard environment variables unchanged | git (merge to `main` deploys) |
| Worker `funnel-mapper` | no | **created 14 Nov 2026** (from `main` 3429810, version `24e745b5`): Funnel Mapper (OpenNext build, ~2.3 MiB compressed, free plan). No route, no workers.dev, no preview URLs. Plain-text settings only (addresses and the publishable sign-in key); no secrets | `node scripts/fmp-cloudflare-golive.mjs deploy` (`apps/funnel-mapper/wrangler.production.jsonc`) |
| R2 bucket `l2f-ecosystem-files` | yes | **not modified**: its existing CORS rule already allows `https://office.tabishriaz.com` (GET, PUT, HEAD; content-type), which is what signed image uploads need. The `cors` command checked and changed nothing | `node scripts/fmp-cloudflare-golive.mjs cors` |

Outside Cloudflare (done 13 Nov, live Supabase `dfitnxilkezepkhdmzuh`): migrations 0052 and 0053 applied; Funnel Mapper switched on for Layer2Funnels and Aurj; app grants for every editor. After the Worker is live: `workspace_apps.launch_url = 'https://office.tabishriaz.com/fmp'` for both organizations (the Launcher tile).

## Token: minimum permissions
- **Account › Workers Scripts › Edit**: publish the `funnel-mapper` Worker.
- **Account › Workers R2 Storage › Edit**: add the CORS rule to `l2f-ecosystem-files`.

Not needed: Pages, DNS, Zone, Workers Routes, Account Settings (the account id is known). `node scripts/fmp-cloudflare-golive.mjs check` names any missing permission exactly.

## Order (each step is safe to repeat)
1. `git checkout main && git pull`: only deploy what is merged (the script refuses another checkout).
2. `node scripts/fmp-cloudflare-golive.mjs check`
3. `node scripts/fmp-cloudflare-golive.mjs deploy`: publishes the Worker.
4. Add the service binding to `wrangler.toml` (`[[services]] binding = "FMP" service = "funnel-mapper"`) and merge: the site deploys with `/fmp` connected. Never before step 3: a binding to a Worker that does not exist fails the site's deployment.
5. `node scripts/fmp-cloudflare-golive.mjs cors`
6. Set the Launcher address (SQL above).
7. `node scripts/fmp-cloudflare-golive.mjs verify`, then a signed-in walkthrough (Launcher → Funnel Mapper, client, funnel, logo upload, share link, sign-out).

## Undo
- Remove the `[[services]]` block from `wrangler.toml` and merge: `/fmp` says "not connected yet" again.
- The Worker can stay unused (it has no address); deleting it is the owner's decision.
- Remove the added CORS rule (the others are untouched).
- `update workspace_apps set launch_url = null where app_key = 'funnel_mapper_pro'`.

## Tested before go-live (local, one address: forwarder standing in for the Pages Function)
Production build with `basePath /fmp`: signed-out `/fmp` → ecosystem sign-in → back to the page; one host-only cookie; block artwork and assets under `/fmp`; new client (redirect stays under `/fmp`); logo upload (shrunk in the browser, signed upload); new funnel → editor; search; All apps → Launcher; sign-out everywhere: 10/10. Share links: create, open signed out, made-up link refused: 4/4. Cloudflare preview of the site with the gateway: `/fmp` 503 "not connected yet", site and API unaffected.

## Go-live log (14 Nov 2026)
- Token: saved by the owner as this cloud environment's network secret for `api.cloudflare.com` (the proxy adds it; it never enters the machine).
- Node's built-in `fetch` ignores the session proxy: run the script with `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.
- `wrangler deploy` signs static-file uploads (`/workers/assets/upload`) with its own short-lived upload key, which the proxy replaced with the API token (401). Fix used: a preload dispatcher that sends only those upload requests directly to Cloudflare and everything else through the proxy (no proxy variables for wrangler itself). 164 files uploaded; Worker published with no route. Command (in `apps/funnel-mapper`, after the build):
  `env -u HTTPS_PROXY -u https_proxy -u HTTP_PROXY -u http_proxy -u npm_config_https_proxy -u GLOBAL_AGENT_HTTPS_PROXY -u YARN_HTTPS_PROXY SPLIT_PROXY="$HTTPS_PROXY" FMP_DIR="$PWD" NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt NODE_OPTIONS="--import $PWD/../../scripts/cf-split-dispatcher.mjs" CLOUDFLARE_API_TOKEN=proxy-injected-placeholder CLOUDFLARE_ACCOUNT_ID=d5ec27e33b46a9e645eb4d4d3b23cde6 ./node_modules/.bin/wrangler deploy --config wrangler.production.jsonc`
- PR #52 added the binding; preview checked before merge (`/fmp/clients` → sign-in 307, `/fmp/robots.txt` 200, share page 200, `/api/health` 200).
- Live check found one bug: on the live address Next.js shortens the same-address sign-in redirect to `/#/signin?...` and the gateway added `/fmp` to it. The gateway now leaves the web app's `/#` routes alone (GW3).
- Launcher: `workspace_apps.launch_url = 'https://office.tabishriaz.com/fmp'` for both organizations.
