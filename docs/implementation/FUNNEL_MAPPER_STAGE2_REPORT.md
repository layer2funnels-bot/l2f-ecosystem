# Funnel Mapper: stage 2 report (13 Nov 2026)

Stage 2 makes Funnel Mapper a real ecosystem app: one sign-in, one database, one permission system. Owner decisions (13 Nov): **retire independent accounts**, **host on Cloudflare**, **a fresh start** (no old data; only the 13 built-in templates, DECISIONS FM-9) and **one sign-in for every app** (FM-10).

## 1. Already present before this stage
Stage 1 (PR #47): code copy in `apps/funnel-mapper`, rename, original theme, migration 0052 (shared clients), `fmp.clients.*` operations, matching tool, dry run.

## 2. Done in this stage (tested)
- **Database, migration 0053** (`migrations/0053_funnel_mapper_data.sql`): funnels, versions, real numbers (actuals), products, share links (only a SHA-256 hash of the link is stored), comments, templates, saved styles/blocks, organization settings. Every table is limited to its organization; access needs the Funnel Mapper permission **and**, for client data, the right to see that client (a person limited to one client sees only that client's funnels). Public share links only through checked functions.
- **API** (`packages/core/fmp-data-operations.mjs`): every Funnel Mapper read and write is an operation (`fmp.funnels.*`, `fmp.versions.*`, `fmp.actuals.*`, `fmp.products.*`, `fmp.templates.*`, `fmp.assets.*`, `fmp.links.*`, `fmp.comments.*`, `fmp.settings.*`, `fmp.clients.trash/restore/purge`, `fmp.files.upload/url`), plus the public `/api/public/fmp-share` for share links (rate-limited).
- **The app** (`apps/funnel-mapper`): signs in with the ecosystem account; the server and the browser call the ecosystem API (browser through the same-site relay `/api/eco/[op]`, allow-listed). No direct database access is left in the app. Clients are the shared Clients-app records. Team, invitations, roles and branding are managed in **Office › Admin**; Funnel Mapper's Settings keeps profile, default currency, appearance and account. A new `/unavailable` page explains when Funnel Mapper isn't switched on for someone.
- **Independent accounts retired** in the code: private sign-up page, service key and invite code removed.
- **Images**: shrunk in the browser (WebP under 100 KB, same rule as before) and stored in the organization's files under `<org>/fmp/…`; shown through 1-hour signed addresses. The server image tool (sharp) is gone.
- **Cloudflare**: Next 16.4.6 with `@opennextjs/cloudflare`; the server bundle is **2.76 MiB compressed, under the free plan's 3 MiB limit** (was 3.79). `npm run cf:build` then `npm run cf:size` checks it. Nothing was deployed.
- **Fixes found on the way**: a person limited to one client could see other clients' funnels (fixed: client check on every table, FD3/FD10/FD11); typing one number in the real-numbers grid cleared the other numbers of that row (fixed, FD9); `org.list` needed the API's "no organization" marker (found in the browser test).

## 2a. Ecosystem-rule check (13 Nov, after the owner asked that Funnel Mapper follow every ecosystem rule)
Checked against `docs/EXTERNAL_APP_ONBOARDING.md` (14-point checklist) and the V7 brief `16_FUNNEL_MAPPER.md`. Fixed in this round:
- **Storage limit**: Funnel Mapper's images now count toward the one 8 GB limit like every other stored file (register `fmp.images`, same lock as Drive), show in Office › Admin › Storage as "Funnel Mapper images", and are known to the nightly file backup. Uploads are refused when the store is full (FD34; two new deliberate-break checks caught).
- **Organization switching, the same as every app** (owner, 13 Nov): Funnel Mapper uses the organization the ecosystem remembers for you (switch anywhere, it switches everywhere) and switches with the same rule (`org.switch`): you stay on the same page where it exists, a client or funnel never comes along (you land on its list with a note), and "isn't set up" when Funnel Mapper is off there. The switcher looks like the shared one (organization mark, "Your organizations", your role, "Current"). "All apps" goes back to the Launcher, from the sidebar and the editor (V7 16 §2). FD35 tests the rule.
- **Settings** (owner, 13 Nov): only Funnel Mapper's own settings (default currency, appearance). Profile, account, organization and team are the ecosystem's; your name in the sidebar opens your ecosystem profile.
- **Error state**: when the service is busy or out of reach, "This page couldn't load … Try again" (nothing changed), never "you have no access".
- **Aurj / organizations without Funnel Mapper**: "Funnel Mapper isn't set up for Aurj" with **Switch to Layer2Funnels** (V7 16 §4). Before this fix that case showed an error page.
- **Open in Clients** on each client page (V7 16 §4). Settings › Team links to Office › Admin.
- App manifest: reuses Clients; storage through the shared storage adapter.

Checklist items still open (each listed in §5): the ecosystem's own rail with search and notifications is not drawn inside Funnel Mapper (it runs as its own app at its own address; it has its own search, and notifications are off ecosystem-wide); Funnel Mapper items are not in the ecosystem's shared search yet. (One sign-in is done: §3.)

## 3. Fresh start and one sign-in (owner, 13 Nov)
- **No old data.** Nothing is copied from the old Funnel Mapper Pro database: Funnel Mapper starts empty on the shared client list. (A read-only look on 13 Nov found 4 clients and 7 funnels in Layer2Funnels and 3 empty personal workspaces; they stay in the old project, untouched, until you decide what to do with it.)
- **Templates:** the 13 built-in templates the old app showed, unchanged (`lib/templates13.ts` is byte-for-byte the original). The one saved team template in the old database ("L2F PT tripwire funnel") was a test copy and is not brought over.
- **One sign-in:** Funnel Mapper has no sign-in, password or invitation pages any more. It uses the ecosystem's session (one shared cookie for every app on the domain). Without it, Funnel Mapper opens the ecosystem sign-in page, which brings you back to the same page; signing out anywhere signs you out everywhere. Needs Funnel Mapper on the same domain as the web app at go-live (a sub-domain or path; free on Cloudflare).
- The monthly job that compared the copy with the original Funnel Mapper Pro (3 hours of CI each month) was retired: it tested the old database and sign-in, which Funnel Mapper no longer uses.

## 4. Tests (actual results, 13 Nov 2026)
| Check | Result |
|---|---|
| Ecosystem `npm test`, PGlite | all groups pass; `fmp-data` 33/33 |
| Ecosystem `npm test`, real PostgreSQL (`DRIVERS=pg`) | all groups pass |
| Mutation check (security rules removed on purpose must be caught) | **114/114 caught** |
| Migration rehearsal (`npm run dryrun:fmp`) | 12/12 |
| Funnel Mapper unit tests (incl. golden funnel 89.1 / 6,032.11 / 5,582.11 / 13.40x) | 280/280 |
| Typecheck / lint | clean / 0 errors |
| `next build` and Cloudflare build | pass; 2.76 MiB |
| Copy ledger `check:fmp-copy` | pass |
| Browser walkthrough on the local ecosystem (sign in → home → new shared client → new funnel → editor "Saved" → funnels, clients, templates, trash, settings) | pass, no server errors; funnel stored in `fmp.funnels` on the shared client |
| Second walkthrough: opened in Aurj → "not set up" → switch; organization from the Launcher; forged organization ignored; Open in Clients; logo upload (shrunk in the browser, stored, shown); editor All apps; Settings → Office › Admin | all pass, no errors |
| Mutation check after the storage change | 116/116 caught |
| One sign-in, browser test (web app 127.0.0.1:8788 + Funnel Mapper 127.0.0.1:3000): Funnel Mapper → ecosystem sign-in → back to the same page; the web app is signed in too; Funnel Mapper's renewal is used by the web app; sign-out in Funnel Mapper signs out everywhere; old sign-in pages gone; a foreign return address is ignored | 8/8 |
| Web unit tests for the shared session (W14a–e: old sessions moved, cookie scope, renewals shared, sign-out, return addresses) | pass |
| Ecosystem browser suites after the session change: API e2e 71/71, browser e2e 242/242, onboarding 22/22, gallery 77/77, docs 95/95, drive 64/64, media 48/48, sheets 70/70 | pass |
| Planner browser suite | PB1b fails, the same on the code before this change (not part of CI; a Planner header check, unrelated) |
| Third walkthrough: switcher like the shared one; switch to Aurj with Funnel Mapper off → "not set up" and the ecosystem remembers Aurj; switch back; same page kept (Templates); a client page → client list with the note; a switch made in another app shows in Funnel Mapper; Settings without profile/team/account; name opens the ecosystem profile | all pass, no errors |

**Not verified yet:** the long Funnel Mapper browser suite (≈195 tests) against the ecosystem; it was written for the old database and needs updating. Share links and image upload were tested at API level, not yet clicked through in a browser.

## 5. Remaining work (each needs the owner's go-ahead)
1. **Go-live of the ecosystem database** (the live one has no `fmp` schema yet): apply the pending migrations with the guarded scripts. Funnel Mapper then starts empty; nothing is moved.
2. **Cloudflare deploy** of Funnel Mapper on the same domain as the web app (needs your domain on Cloudflare and a Cloudflare login on this session or your account). Free plan; nothing to buy. Set `cookieDomain` / `appOrigins` in `apps/web/config.js` and Funnel Mapper's `ECOSYSTEM_*` and `NEXT_PUBLIC_SITE_URL` (go-live runbook).
3. Funnel Mapper's own long browser suite and its old database tests (`tests/e2e`, `tests/integration`) still target the old setup; rewrite them for the ecosystem (not run in CI).
4. Funnel Mapper items in the ecosystem's shared search.
5. What to do with the old Funnel Mapper Pro project (Supabase + Vercel): untouched; your decision.

## 6. Statement
No live database was changed, nothing was deployed, the original Funnel-Mapper repository and its live Supabase/Vercel projects were not touched. The old database was only read (counts and the template list).
