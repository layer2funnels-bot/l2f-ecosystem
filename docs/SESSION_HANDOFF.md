# Session handoff (kept current at the end of every batch)
Last updated: 21 Oct 2026, end of batch 1 (batch 2 in progress, see "What is next").

## Working rules (from the owner)
- Repository: `layer2funnels-bot/l2f-ecosystem` only. **Never write to, merge into or push to the original Funnel Mapper Pro repository; never deploy; no live project, account, domain or key is touched.** Real data is never read or moved.
- Decide technical details yourself; ask only for approvals or business facts, once, with recommended answers.
- Every batch ends with `npm run test:all` passing, a pull request, CI green, **squash merge by the assistant** (GitHub tools; the `gh` CLI in the sandbox is not authenticated, the GitHub tool server is), and a plain-English report: built and tested, prepared, planned, risky.
- After a merge, restart the branch from main: `git fetch origin main && git checkout -B claude/exciting-dirac-kjybj0 origin/main`.
- Do **not** build Clients or Funnel Strategies screens until the owner says the designs are approved (design 09, plus the Funnel Strategies requirements).
- Funnel Mapper Pro (FMP) is a regular ecosystem app (same tab, same header and switcher). Its copy lives in `apps/funnel-mapper`; the pristine record is tag `fmp-copy-pristine`; every change goes into `docs/FMP_CHANGES.md` (`node scripts/fmp-copy.mjs verify`).

## State
- Migrations `0001` to `0015` (foundation, permissions, org switching, clients, funnels records, rate limits, Data API lockdown 0010, scoped permissions 0011, shell/admin 0012, projects 0013, drive 0014, planner 0015). API: `packages/core/*-operations.mjs`, registered in `operations.mjs`. Web app: `apps/web` (plain ES modules, hash routes). Designs: `docs/design`, register `docs/DESIGN_STATUS.md` (also the list of differences between designs and the real permission catalog).
- Built to approved designs 01 to 07 and 08 (FMP look, step 1). Not built: Clients screens, Funnel Strategies, Launcher beyond what exists, notifications centre, search.
- Tests: `npm run test:all` (PGlite + real PostgreSQL, restore drill, FMP dry run, 54 mutation controls). Real stack: `npm run stack:start && npm run stack:migrate`, then `npm run test:e2e` (API, 49 checks) and `npm run test:e2e:ui` (browser, 80 checks; needs `PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright` in this sandbox). CI: jobs `test`, `e2e`, `fmp-copy`; `nightly-fmp.yml` (full FMP browser suite; the original side needs the owner's secret `FMP_READ_TOKEN`).
- Sandbox tips: real PostgreSQL 16 for tests: `service postgresql start` (login `tester:tester`). Docker for the Supabase stack: `pkill dockerd; nohup dockerd &`. Only one Supabase stack (ecosystem or FMP's own) at a time (same ports): stop one before starting the other. Playwright for FMP needs `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux*/chrome`. Never `pkill -f` a pattern that matches your own command line.
- Documents to read first: `docs/DEVELOPER_HANDOVER.md`, `docs/DECISIONS.md`, `docs/DESIGN_STATUS.md`, `docs/GO_LIVE_RUNBOOK.md`, `docs/FMP_MIGRATION_PLAN.md`, `docs/FMP_COPY_REPORT.md`.

## Key decisions (full list in docs/DECISIONS.md)
Organization = `workspaces` row; one permission engine (`private.has_permission`); Data API closed, API runs as `app_user`; archive before delete; audit never stores long text; FMP tables will live in schema `fmp` and be reached through the ecosystem API; region Mumbai if two more CloudPing tests agree, else London; stage names are placeholders; only the owner approves go-live, in one step.

## Owner approvals still pending
Go-live (all of `docs/GO_LIVE_RUNBOOK.md`); `FMP_READ_TOKEN` secret for the nightly job; design 09 Clients and Funnel Strategies; FMP hosting choice; independent-account policy; the FMP data migration.

## What is next (batch 2, in this order)
Merge flow and this file; FMP fonts self-hosted; research documents (hosting, independent accounts, application-office import plan); Phase 6 data layers (Client Portal gate G2 suite, Approvals, Form Builder, Value Ladder, Social Planner, Whiteboard spike); local go-live rehearsal with gaps report.
