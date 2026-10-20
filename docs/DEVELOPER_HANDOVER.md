# Developer Handover and Technical Operations Manual

Status key: **Implemented+Tested** · **Implemented** · **Partial** · **Planned** · **Blocked**

Last verified: 47/47 database checks pass on PostgreSQL 16.4 (PGlite). Repository is local only (`git init`), not pushed.

## 1. Vision and scope (summary)
Two workspaces, Layer2Funnels and Aurj, with strict data isolation. Shared apps (Projects, Planner, Drive) show one workspace at a time. Office, Clients and Client Portal are per workspace. Staff roles: Owner, Admin, Editor, Viewer. Clients are external accounts limited to the Client Portal, which stays unreleased until gate G2 passes. Funnel Mapper Pro is a separate protected product: not inspected, changed or integrated. Children's data is out of scope.

## 2. Phase mapping
Programme Phase 4 = B0A–B0B (foundation). Programme Phase 5 = B1 (core operations). Programme Phase 6 = B2–B3. Phases 7 and 8 not started.

## 3. Status

| Item | Status | Evidence |
|---|---|---|
| Workspace isolation (DB, RLS) | Implemented+Tested | T1, T4, T6, T8 pass |
| Roles and permission policies (D1–D6) | Implemented+Tested | D-series checks pass |
| Last-owner safeguard | Implemented+Tested | D1e |
| Client isolation at DB layer | Implemented+Tested | T6a–h |
| Deactivation takes effect immediately | Implemented+Tested | T7 |
| Append-only audit log | Implemented+Tested | AU1–AU4 |
| RLS coverage on all public tables | Implemented+Tested | T11 (8 tables, forced, with policies) |
| Privileged key exposure check | Implemented+Tested | T12 on current tree (no client bundle exists yet) |
| Negative control (suite catches leaks) | Verified | Weakened policy → 7 failures |
| Authentication provider | Planned | Identity assumed via JWT subject; no sign-in flow built |
| API layer, server functions | Planned | Not built |
| Active-workspace filtering in shared apps (T2) | Planned | Requires API layer |
| Storage, signed URLs, share-link expiry (T5, T14) | Planned | Not built |
| Funnel Mapper Pro Launcher entry (T9) | Planned | Launcher not built |
| Client Portal (T10, G2) | Blocked by design | Stays disabled until T1–T9 pass for clients |
| Logging free of cross-workspace ids (T15) | Planned | Not built |
| Rate limiting (T16) | Planned | Not built |
| Backups and restore drill (T17) | Planned | Process designed (working doc §6); not built or run |
| CI pipeline | Planned | Not built |
| Git remote, hosting, deployment | Blocked | Needs owner approval (no remote, no paid tier) |

## 4. Repository
```
migrations/0001_foundation.sql   schema, helpers, RLS, grants, last-owner trigger
test/isolation.test.mjs          47-check RLS suite on real Postgres (PGlite)
scripts/check-secrets.sh         T12 privileged-key scan
docs/DECISIONS.md                decision register
docs/DEVELOPER_HANDOVER.md       this manual
docs/PHASE5_HANDOFF.md, docs/PHASE6_HANDOFF.md
```

## 5. Commands
```
npm install
npm test                 # runs migration on fresh Postgres and all isolation checks
npm run check:secrets    # T12
```
Troubleshooting: if a policy test fails, check `pg_policies` for the table and confirm the test user has a membership row. A `42P01` error about a missing relation during migration means statement ordering; keep `check_function_bodies = off` at the top.

## 6. Environment and hosting (not deployed)
| Need | Option | Constraint |
|---|---|---|
| Frontend | Cloudflare Pages or Netlify free | Commercial use generally permitted; verify current limits |
| Database, auth, storage | Supabase free | Pauses after ~1 week idle (outage for portal); no automated backups; 500 MB DB / 1 GB storage |
| Excluded | Vercel Hobby | Non-commercial terms |

Pricing and terms were not browsed in this session; re-verify before any signup.

## 7. Known risks
- **Migration runs as a superuser-equivalent.** Helper functions are `security definer` and bypass RLS by design. Production migrations must run as a role with `bypassrls` (Supabase `postgres`). The application role `app_user` never owns tables.
- **`RETURNING` on append-only tables** fails for non-admins. App code must not use it on `audit_events`.
- **Denied writes raise errors (42501); denied reads return empty.** The API layer must map both to one generic response to satisfy T4.
- **Free-tier data loss risk:** no automated backups. Mitigation designed, not implemented.
- **Drive files are not in the database dump.** Storage needs its own backup.
- **PGlite is not production Postgres.** Confirm all policies on Supabase before release (run the same suite against a staging project once approved).

## 8. Decisions and assumptions
See `docs/DECISIONS.md`. The blueprint files were not present, so decisions are marked "Pending" blueprint check.

## 9. Next action for the next session
1. Supply the Master Blueprint v1.2 and Decision Register, then reconcile `docs/DECISIONS.md`.
2. Owner approval to create a private Git remote (no cost) and push.
3. Choose authentication provider (Supabase Auth on free tier is the default proposal) and wire `current_user_id()` to it.
4. Build the API layer that maps denials to one response (T4) and add T2, T13, T16.
