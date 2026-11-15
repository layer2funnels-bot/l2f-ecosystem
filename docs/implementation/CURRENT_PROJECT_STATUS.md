# Current project status — verified 15 Nov 2026

Legend: **Done** (built and tested) · **Incomplete** · **Untested** · **Blocked** (needs the owner).

## Application sequence (owner, 15 Nov 2026 — final)
P00 Foundation and Global Shell → P01 Office → **P02 Tasks** → P03 Drive with editors → P04 Projects → P05 Planner → P06 Clients → P07 Funnel Mapper → P08 Portal → P09 Whiteboard → P10 Forms → P11 Value Ladder → P12 Social Planner → P13 Agents → P14 Final Ecosystem Verification.
Next application: **P02 Tasks**. Page IDs in `V8_IMPLEMENTATION_TRACKER.md` (P02-xx …) are older reference IDs, not this order.

## P00 — Foundation and Global Shell: **Done** (not merged)
- Branch `claude/epic-bohr-nc9jar`, head `105494b` (variable Geist fix). PR [#56](https://github.com/layer2funnels-bot/l2f-ecosystem/pull/56): draft, CI green, Cloudflare preview green. **Not merged.**
- Needs migrations 0054 and 0055 on production for the bell (notifications) and Profile details to work on the preview/live site.

## P01 — Office: **Done** (not merged)
- Branch `p01-office` (pushed), head `0f892ee` + the handoff-docs commit. Built on top of P00.
- PR [#57](https://github.com/layer2funnels-bot/l2f-ecosystem/pull/57): draft, base `claude/epic-bohr-nc9jar` (shows Office only). Cloudflare preview deployed; GitHub CI result: check the PR. **Not merged.**
- Report: `docs/implementation/OFFICE_REPORT.md` (what was built, known differences from V8).
- Needs migrations 0056, 0057 and 0058 on production.

## P02 — Tasks: **Done** (not merged)
- Branch `p02-tasks` (stacked on `p01-office`), draft PR (see `TASKS_REPORT.md`). Migration 0059 local only.
- Tests: `tasks.test` 20/20, `e2e-tasks` 33/33, regression suites green.

## Database migrations — **Blocked: not applied to production**
| # | Name | Phase | Repo | Local stack | Production (`l2f-ecosystem`) |
|---|---|---|---|---|---|
| 0001–0053 | (history) | earlier | yes | applied | **applied** (verified with `list_migrations`, 15 Nov) |
| 0054 | notifications_every_app | P00 | yes (both branches) | applied | not applied |
| 0055 | profile_details | P00 | yes (both branches) | applied | not applied |
| 0056 | office_v8 | P01 | `p01-office` | applied | not applied |
| 0057 | avatar_studio | P01 | `p01-office` | applied | not applied |
| 0058 | admin_access_v8 | P01 | `p01-office` | applied | not applied |
| 0059 | tasks | P02 | `p02-tasks` | applied | not applied |

Each has a rollback in `migrations/rollback/`; `test/migration-rollback.test.mjs` passes (up → down → up).
Target verified: Supabase project `l2f-ecosystem`, ref `dfitnxilkezepkhdmzuh` (ap-south-1, ACTIVE_HEALTHY). Production and branch previews share this database.

**Why blocked:** the owner authorized applying them (15 Nov) on condition of a verified fresh backup through the approved process
(`scripts/backup-supabase.sh`: pg_dump + `age` encryption). That needs `SUPABASE_DB_URL` (session-pooler connection string) and the owner's
`AGE_RECIPIENT` public key. Neither is available in the cloud session, and credentials are never asked for in chat. So no backup was taken and
**nothing was applied**. See "Unblock" in `NEXT_SESSION_START_HERE.md`.

## Backup status
- No backup taken on 15 Nov (blocked as above). No managed backups exist (Supabase free plan). `.github/workflows/backup.yml.disabled` is prepared, not enabled.

## Git (verified 15 Nov)
- `claude/epic-bohr-nc9jar` — P00, pushed, = PR #56.
- `p01-office` — P01, pushed (nothing local-only after the handoff commit is pushed).
- `main` — has the V8 handoff docs (PR #55 merged), no P00/P01 code.
- Uncommitted changes: none.

## Tests (local Supabase stack, 15 Nov, on `p01-office`)
- `npm test`: 66 suites, no failures. `office.test` 33/33, `web.test` 56/56, `migration-rollback`, `audit`, `authz`, `shell-admin` green.
- Browser: `e2e-ui` 265/265, `e2e-onboarding` 22/22, `e2e-local` 71/71. Static checks green (fmp-copy needs full history: green in CI).
- V8 comparison: `scripts/v8-compare.mjs of-` (22 Office pages × 3 sizes) — shell measurements match.
- **Untested against production data**: everything (migrations not applied there).

## Outstanding issues
- Production migrations 0054–0058 (blocked on backup).
- Merge decisions for #56 then #57 (owner).
- Office known differences from V8 (deliberate, no fake controls): see `OFFICE_REPORT.md` › Known differences.
- Projects V2 list operations are slow (0.5–9 s, per-row `pm.project_role` RLS) — for the Projects phase.
- Local stack only: after `e2e-onboarding`, reset `apps.lifecycle='coming_soon'` for forms, value_ladder, social_planner, whiteboard before `e2e-ui`.
