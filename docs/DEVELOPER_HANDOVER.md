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
| API error contract (T4) | Implemented+Tested | errors 9/9 |
| Restore drill (T17, local) | Implemented+Tested | drill 3/3 |
| Design tokens single source + contrast check | Implemented+Tested | `npm run check:tokens` |
| CI pipeline | Prepared | `.github/workflows/ci.yml` (no remote yet) |
| Nightly Supabase backup | Prepared | `scripts/backup-supabase.sh`, `backup.yml.disabled` |
| Sign-in flows, API layer, storage, Launcher UI, rate limit (T16), log hygiene (T15) | Planned | Phase 5 |
| New Supabase project, hosting, SMTP, Git remote | Blocked (owner) | §6 |

## 2. Repository
```
migrations/0001_foundation.sql            Phase 4 schema (role creation made idempotent)
migrations/0002_hardening.sql             audit fixes F1–F9, apps, profiles, invitations
migrations/0003_integration_foundation.sql connections, external_refs, webhook_inbox, outbox (droppable)
migrations/0005_org_switching.sql          org_scope policies, app_pages, resolve_org_switch
migrations/0004_authorization_foundation.sql permission catalog, access levels, groups, assignments, overrides, lifecycle
seed/bootstrap.sql                        first owner + workspaces + FMP entry (run once, by owner)
packages/core/errors.mjs                  one public error vocabulary (denied = not found)
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
3. Create Supabase project (region: London unless the latency test in docs/INFRASTRUCTURE.md says otherwise); apply 0001→0005 in order; run `seed/bootstrap.sql` after the owner's first sign-in.
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
- Server-side workspace deletion must disable audit triggers and the last-owner guard deliberately.
- Supabase OAuth server (FMP Stage 2) is public beta.

## 8. Next action for the next session
Owner completes runbook steps 1–3; then build Phase 5 slice 0 (auth shell + Launcher) per `PHASE5_HANDOFF.md`.
