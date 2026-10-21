# Developer Handover and Technical Operations Manual (v0.3, 21 Oct 2026)

Status key: **Implemented+Tested** · **Prepared** (written, not run live) · **Planned** · **Blocked (owner)**. Audit details: `docs/AUDIT_REPORT.md`.

## 1. Status
| Item | Status | Evidence |
|---|---|---|
| Workspace + client isolation, roles, deactivation, last owner | Implemented+Tested | isolation 47/47 (PG17 + real PG) |
| Identity works with current Supabase claims | Implemented+Tested | F1a–c |
| No cross-workspace references | Implemented+Tested | F2a–e |
| Tamper-evident audit (auto for permissions, approvals, apps, connections) | Implemented+Tested | F3, F7d |
| Private policy helpers, pinned search paths | Implemented+Tested | F4a–d |
| Client-visible allowlist; Client Portal kill switch (G2) | Implemented+Tested | F5, T10a–e |
| Per-app access, Launcher registry, FMP entitlement | Implemented+Tested | F6, T9a–d |
| Approvals state machine | Implemented+Tested | F7a–e |
| Profiles, verified active workspace, invitation-only membership | Implemented+Tested | F8, INV1–11 |
| Integration layer schema (0003) | Implemented+Tested | I1–I7 |
| Shared authorization foundation, client/project scope, archive-before-delete, actor kind, app lifecycle (0004) | Implemented+Tested | authz 25/25 |
| Organization switching: request scope, resolver, page registry, browser cache module (0005) | Implemented+Tested | switch 23/23 |
| Office → Funnels data foundation (0006): avatars, offers/products, story bank, brand kits, references from Clients and Value Ladder | Implemented+Tested | funnels 38/38 |
| API error contract (T4) | Implemented+Tested | errors 9/9 |
| Restore drill (T17, local) | Implemented+Tested | drill 3/3 |
| Design tokens single source + contrast check | Implemented+Tested | `npm run check:tokens` |
| CI pipeline | Prepared | `.github/workflows/ci.yml` (no remote yet) |
| Nightly Supabase backup | Prepared | `scripts/backup-supabase.sh`, `backup.yml.disabled` |
| API layer: typed operations, error contract, `x-org-id` on every request, rate limit (T16), safe logs (T15) | Implemented+Tested | api 32/32 (PGlite, real PG, Supabase local stack) |
| JWT verification (HS256 + ES256/JWKS, WebCrypto) and HTTP routes (`/api/<operation>`, same-origin, size/type limits) | Implemented+Tested | http 29/29; real ES256 tokens from the local stack (`npm run test:e2e` 20/20, including Clients) |
| Auth shell (sign in/up, verify email, reset, accept invitation, no workspace, session expired) and Launcher, Office → Funnels screens | Implemented+Tested, **needs design** | browser run `npm run test:e2e:ui` 26/26 (real Chromium, real local Auth); logic tests web 24/24 |
| Organization list for the switcher (`my_organizations`, 0007) | Implemented+Tested | funnels-api 33/33 |
| Cloudflare Pages Function + build + headers | Prepared (not deployed) | `functions/api/[[route]].js`, `scripts/build-web.mjs`, `apps/web/_headers`, `wrangler.toml` |
| Clients app data layer and API (0008): profiles, stages, team notes, requests, updates; 34 operations | Implemented+Tested (no screens: waiting for designs) | clients 59/59 |
| Shared rate-limit store (0009) | Prepared, off by default | rate-limit-store 13/13, incl. two-instance proof |
| Funnel Mapper Pro read-only inventory and unedited code copy | Done, not wired to anything | docs/FMP_INVENTORY.md, docs/FMP_COPY_REPORT.md, `npm run check:fmp-copy` |
| CI: browser and end-to-end job, FMP copy job | Prepared (runs on the next push) | `.github/workflows/ci.yml` |
| Storage, Drive, Admin screens, other apps | Planned | Phase 5 |
| New Supabase project, hosting, SMTP, Git remote | Blocked (owner) | §6 |

## 2. Repository
```
migrations/0001_foundation.sql            Phase 4 schema (role creation made idempotent)
migrations/0002_hardening.sql             audit fixes F1–F9, apps, profiles, invitations
migrations/0003_integration_foundation.sql connections, external_refs, webhook_inbox, outbox (droppable)
migrations/0005_org_switching.sql          org_scope policies, app_pages, resolve_org_switch
migrations/0004_authorization_foundation.sql permission catalog, access levels, groups, assignments, overrides, lifecycle
migrations/0009_rate_limit_store.sql        shared rate-limit counters (prepared, off by default)
migrations/0008_clients_foundation.sql    Clients: client_profiles, client_stages, client_notes, client_requests, client_updates
migrations/0007_my_organizations.sql      my_organizations() for the switcher
migrations/0006_funnels_foundation.sql    Office → Funnels records (funnel_avatars/offers/stories/brand_kits/references), funnels.* permissions, starter levels
seed/bootstrap.sql                        first owner + workspaces + FMP entry (run once, by owner)
packages/core/errors.mjs                  one public error vocabulary (denied = not found; adds rate_limited 429, org_required 400)
packages/core/api.mjs                     request pipeline: org header → identity → operation → input → rate limit → DB → public error
packages/core/operations.mjs              typed operations (launcher.list, org.switch, access.effective, clients.list, invitation.create/accept)
packages/core/validate.mjs, rate-limit.mjs, safe-log.mjs, pg-executor.mjs, jwt.mjs, http.mjs, server.mjs, funnel-operations.mjs
apps/web/                                 the browser app: static ES modules, no framework, no build step (see §12)
functions/api/[[route]].js                Cloudflare Pages Function (prepared)
scripts/dev-server.mjs, stack-migrate.mjs, e2e-local.mjs, e2e-ui.mjs, build-web.mjs
packages/ui/tokens.json → tokens.css      design tokens, generated
test/lib.mjs, isolation.test.mjs, audit.test.mjs, errors.test.mjs, run.mjs
scripts/check-secrets.sh, check-licences.mjs, build-tokens.mjs, mutation-check.mjs, restore-drill.mjs, backup-supabase.sh
.github/workflows/ci.yml, backup.yml.disabled
docs/ AUDIT_REPORT, DECISIONS, DEVELOPER_HANDOVER, PHASE5_HANDOFF, PHASE6_HANDOFF
```

## 3. Commands
```
npm ci
npm test                 # PG17 (PGlite): isolation + audit + API errors
npm run test:all         # + real PostgreSQL (PG_URL), restore drill, negative control
npm run check:secrets && npm run check:licences && npm run check:tokens
npm run tokens:build     # after editing packages/ui/tokens.json
```
Real-server tests need `PG_URL` (default `postgres://tester:tester@localhost:5432/postgres`, a superuser).

## 4. Rules for every new table (Phase 5+)
send `x-org-id` on every request and key every cache by organization (packages/core/org-switch.mjs); register pages in `app_pages`; register permissions in `permissions` and use `private.has_permission(org, 'app.object.action', client, project)` in every policy; `workspace_id not null`; composite FK `(workspace_id, x_id)` to any workspace-owned parent; enable + force RLS; explicit policy per command using `private.*` helpers and `private.can_use_app(workspace_id,'<app>')`; client access only via `client_visible and private.client_of(...)`; add audit trigger if it changes permissions or decisions; add allow + deny tests per role to `test/audit.test.mjs`; never `RETURNING` on `audit_events`; map every DB error through `toPublicError`.

## 5. Security model in one paragraph
Identity = Supabase Auth user id from the JWT. Authorization = active membership (role per workspace) + app grant + row policy, all enforced in Postgres. Clients reach only client-visible rows of their own client, and only while the owner has switched the Portal on. Sign-up creates an identity with no access; access comes from an email-bound invitation. Secrets never enter tables (`secret_ref` is a name).

## 6. Go-live runbook at $0 (each step needs owner approval)
1. Human owner on GitHub, Supabase, Cloudflare, domain, with 2FA (Phase 2 action #2).
2. Only at go-live and with approval: export `application-office` with `scripts/export-project.sh`, verify with `DUMP_FILE=... npm run drill:restore`, then decide on the slot (docs/INFRASTRUCTURE.md).
3. Create Supabase project (region: Mumbai if two more CloudPing tests agree with the first, otherwise London; see docs/INFRASTRUCTURE.md); apply 0001→0006 in order; run `seed/bootstrap.sql` after the owner's first sign-in.
4. Auth settings: custom SMTP (Brevo free, sender on layer2funnels.com with SPF/DKIM), Confirm email ON, min password 12, Google provider ON, redirect URLs = our domains only.
5. Run the test suites against a staging copy (PG_URL to the project's session pooler) before real data.
6. Private GitHub repo; push; CI runs.
7. Enable backups: add `SUPABASE_DB_URL` and `AGE_RECIPIENT` secrets, rename `backup.yml.disabled`, run once, then restore into a local server with `pg_restore` and check counts.
8. Front end on Cloudflare Pages; only the anon key in the browser (`check:secrets` guards).

## 7. Known risks
- Free tier pauses after 7 idle days; daily backup job connects daily but whether that counts as activity is **[V15] unverified**.
- No leaked-password check at $0.
- Functions are `security definer` and rely on the migration owner bypassing RLS (Supabase `postgres`). Keep it so.
- Storage files are not in DB dumps; Drive backup is Planned.
- Server-side workspace deletion must disable audit triggers, the last-owner guard and the archive-before-delete triggers (funnel and client records) deliberately.
- Supabase OAuth server (FMP Stage 2) is public beta. FMP Stage 2 needs explicit owner approval (FMP-2).

## 8. Next action for the next session
Slice 0 backend and the Funnels data foundation are built and tested locally. Remaining slice 0 work: HTTP route wiring + JWT verification (needs the hosting decision), the auth shell and Launcher UI (needs the approved auth-screen designs), then Office → Funnels screens. Owner completes runbook steps 1–3 before anything goes live.

## 9. Local Supabase stack (added 21 Oct 2026, Phase 5 slice 0)
`supabase/config.toml` is committed; no live project is involved. Needs Docker and the Supabase CLI (v2.121 tested).
```
npm run stack:start      # Postgres 17 + Auth + REST + Kong only (no Studio/Storage/Realtime); first start pulls images, ~3 min
npm run test:stack       # test/run.mjs against the local stack as supabase_admin (superuser)
npm run stack:stop
```
Result 21 Oct: isolation 47/47, audit 63/63, authz 25/25, switch 23/23, errors 9/9 on the local stack. The default `postgres` user there is **not** a superuser, so the suites use `supabase_admin` (local demo password only). The restore drill needs `pg_dump` 17 on PATH (`/usr/lib/postgresql/17/bin`).
The default demo keys printed by `supabase start` are public and local-only; never put them in a real environment.

## 10. API layer (slice 0 backend)
- A route handler calls `api.handle({ operation, input, auth: { userId, email }, headers })` and returns `{ status, body }`. `userId`/`email` come from a verified Supabase JWT (verification itself belongs to the route, not built here).
- `x-org-id` is required on every request (`NO_ORG` = nil UUID only for `org.switch` and `invitation.accept`). It is set transaction-locally with the user's claims by `pg-executor.mjs`, so migration 0005's `org_scope` policy narrows every query. Operations never take an organization from their input.
- New operation: add `defineOperation` in `operations.mjs` with a typed `input`, a rate-limit `class` (read 120/min, write 30/min, sensitive 5/min per person), and test it in `test/api.test.mjs`. All errors go through `toPublicError`.
- Logs: only allowlisted fields (`safe-log.mjs`); no bodies, ids, emails, tokens or database text.
- Limits are in memory (one free-tier server). A multi-instance deployment needs a shared store; the `take(key, class)` interface stays the same.
- HTTP: `packages/core/http.mjs` (standard Request/Response), JWT in `jwt.mjs`, wiring in `server.mjs`. Same-origin only: no CORS. A 401 `session_expired` is the one answer that tells a caller their own token is bad.
- Not yet: per-isolate rate limits only (Workers instances do not share memory: a shared store is needed before real traffic), CI job for the browser/e2e runs (needs Docker + Playwright).

## 11. Office → Funnels (0006) rules of use
- Tables: `funnel_avatars`, `funnel_offers`, `funnel_stories`, `funnel_brand_kits`, `funnel_references`. Permissions are `funnels.<avatar|offer|story|brandkit>.<view|create|edit|delete>`, `funnels.record.share`, `funnels.reference.view|manage`, registered under the Office app. Starter levels: “Funnels · edit”, “Funnels · read”.
- A record is org-wide (`client_id` null) or belongs to one client. `client_visible` needs a client and the `funnels.record.share` permission (default admin). Clients only ever see visible, unarchived records of their own client, and only while the Portal is on.
- Delete: archive first (`archived_at`), owner-only, refused while referenced. Audit records short labels and flags, never long text.
- Clients and Value Ladder call `funnel_references` (target by ID, one per row). Nothing here reads or writes Funnel Mapper Pro (FMP-2); FMP stays a link/entitlement only.
- The existing `brand_base_answers` (Clients → Brand Base) is a separate, older table. Whether Brand Base answers fold into brand kits is a product decision for the Funnels/Clients UI sessions; not changed here.

## 12. Web app and local run (slice 0, Funnels screens)
```
npm run stack:start && npm run stack:migrate     # local Supabase (Docker) + our migrations
npm run dev                                       # http://127.0.0.1:8788 — web app + /api through the same handler Pages will run
npm run test:e2e                                  # API end-to-end with real Auth tokens (20 checks)
npm run test:e2e:ui                               # real Chromium end-to-end (26 checks; needs Playwright installed globally; screenshots in ./e2e-shots)
SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... node scripts/build-web.mjs   # builds dist/web (never deploys)
```
- Local sign-up works without e-mail because the local stack has "confirm email" off. The e-mail screens (check your email, reset, invitation e-mail) are built to the live flow but their e-mail delivery is only tested at go-live (SMTP is runbook step 4).
- Tokens: stored in `localStorage` (static hosting has no server session). Defences: strict CSP (`_headers`), no `innerHTML` anywhere (tested), one refresh then "session ended". A future move to cookies is possible if the owner prefers; it changes `session.js`/`api.js` only.
- `x-org-id`: every request sends it; the nil UUID means "no organization chosen yet" and works only for listing organizations, switching and accepting an invitation.
- **Go-live additions beyond runbook §6** (all need owner approval): create the Pages project (build `node scripts/build-web.mjs`, output `dist/web`, flags in `wrangler.toml`), set encrypted variables `DATABASE_URL` (session pooler), `SUPABASE_JWKS_URL`, `SUPABASE_JWT_ISSUER`, rebuild with the live URL and publishable key, self-host the three fonts, set Auth redirect URLs to the Pages domain.
- Funnel Mapper Pro is a regular app (FMP-1): normal tile, same tab, ecosystem header. Until moving it onto the ecosystem sign-in and database is approved (FMP-2), its data and sign-in stay its own.

## 13. Clients data layer (0008) rules of use
- `clients` stays minimal and is readable by that client's own contact. Everything internal lives in **`client_profiles`** (business name, niche, contact details, status, stage, tags): no client policy exists on it, so a contact sees their client's name and nothing else (tested CT13, CA12).
- **Team notes are internal by construction**: `client_notes` has no `client_visible` column and no client policy (tested by looking at the catalog, CT14). There is no "share note" operation.
- Requests and updates carry `client_visible` (default internal); sharing needs `clients.record.share` (default admin). Clients only ever see visible, unarchived ones, only while the Portal is on. Client replies are **not** writable yet (Phase 6): staff log answers.
- Stages are the organization's own list (`client_stages`, `clients.stage.manage`). The five defaults are **placeholders** (Onboarding, Strategy, Build [progress only], Launch, Optimise): the specs say "5 stages" and "Build = progress only" but do not name them. Owner to confirm; editing them needs no code change.
- Archive before delete everywhere, now including `clients` itself (an empty client must be archived first); delete is owner-only and refused while the client has any work.
- Audit records flags and short labels, never note/update text or contact details.
- Overlap with Funnel Mapper Pro's own client list is documented in `docs/FMP_INVENTORY.md` §7; nothing connects them (FMP-2).

## 14. Funnel Mapper Pro code copy
`apps/funnel-mapper/` is an unedited code copy (654 files, source commit in `docs/fmp-copy-manifest.json`). `npm run check:fmp-copy` fails if any file differs, is missing, is extra, or is ignored by git. Reshaping it is **not started** and needs approved designs (and, per FMP-2, any data or database change needs explicit approval). Its dependencies are reported by `npm run check:licences` (informational): review the flagged licences before it is reshaped or deployed.

## 15. Designs (filed 21 Oct 2026)
`docs/design/` holds the design chat's prototypes and specs, exactly as delivered: 01 switcher, 02 auth, 03 launcher, 04 Office Home, 05 Admin, 06 Funnels, 07 shared states, 08 Funnel Mapper Pro in the ecosystem (all approved with changes, "Ready"), 09 Clients and 10 shell patterns (**delivered, awaiting owner approval**), and `DESIGN_INDEX.md` (owner decisions applied, checks done, assumptions A1–A28). The `.html` files are prototypes for look, copy and behaviour, not production code. `docs/DESIGN_STATUS.md` is now the single register (one row per screen, design status plus current build) with a list of differences between the designs and the data layer. Provisional screens built before the designs have not been reworked yet.

## 16. Security: the Data API is closed (migration 0010)
- Supabase's own interfaces (PostgREST `/rest/v1`, GraphQL) are open to every signed-in person for anything granted to `authenticated`. We grant **nothing**, so direct calls with a person's own token read and write nothing and call no function. Only our API (rate limits, typed operations, `x-org-id`, safe logs) reaches the data, as the role `app_user`.
- The API's database login (Supabase: `postgres` via the pooler) must be allowed to `set role app_user`. PostgreSQL 16+ gives a role's creator an admin-only link (no SET), so the migration runs `grant app_user to postgres with set true, inherit true`. **Check this after applying migrations on any new database** (`begin; set local role app_user; rollback;` as the API login); the local end-to-end run fails loudly if it is missing.
- Every new migration: grant to `app_user` only; never to `anon`/`authenticated`; revoke PUBLIC execute on new functions (F4b enforces it). `service_role` (server key) is never used by the API.
- Proof you can re-run: `node test/direct-access.test.mjs`, `npm run test:mutation` (DA controls), `npm run test:e2e` (E21–E28 against the real stack).
