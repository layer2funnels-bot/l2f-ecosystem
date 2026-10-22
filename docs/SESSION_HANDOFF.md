# Session handoff (kept current at the end of every batch)
Last updated: 22 Oct 2026, end of batch 2 (batch 1 merged as PR 9; batch 2 awaiting its PR).

## Working rules (from the owner)
- Repository: `layer2funnels-bot/l2f-ecosystem` only. **Never write to, merge into or push to the original Funnel Mapper Pro repository; never deploy; no live project, account, domain or key is touched.** Real data is never read or moved.
- Decide technical details yourself; ask only for approvals or business facts, once, with recommended answers.
- Every batch ends with `npm run test:all` passing, a pull request, CI green, **squash merge by the assistant** (GitHub tools; the `gh` CLI in the sandbox is not authenticated, the GitHub tool server is), and a plain-English report: built and tested, prepared, planned, risky.
- After a merge, restart the branch from main: `git fetch origin main && git checkout -B claude/exciting-dirac-kjybj0 origin/main`.
- Do **not** build Clients or Funnel Strategies screens until the owner says the designs are approved (design 09, plus the Funnel Strategies requirements).
- Funnel Mapper Pro (FMP) is a regular ecosystem app (same tab, same header and switcher). Its copy lives in `apps/funnel-mapper`; the pristine record is tag `fmp-copy-pristine`; every change goes into `docs/FMP_CHANGES.md` (`node scripts/fmp-copy.mjs verify`).

## State
- Migrations `0001` to `0023` (0016–0023: audience gate, approvals v2, portal, forms, ladder, planner, rate-limit grant, storage cap; the list that follows names 0001–0015) (foundation, permissions, org switching, clients, funnels records, rate limits, Data API lockdown 0010, scoped permissions 0011, shell/admin 0012, projects 0013, drive 0014, planner 0015). API: `packages/core/*-operations.mjs`, registered in `operations.mjs`. Web app: `apps/web` (plain ES modules, hash routes). Designs: `docs/design`, register `docs/DESIGN_STATUS.md` (also the list of differences between designs and the real permission catalog).
- Built to approved designs 01 to 07 and 08 (FMP look, step 1). Not built: Clients screens, Funnel Strategies, Launcher beyond what exists, notifications centre, search.
- Tests: `npm run test:all` (PGlite + real PostgreSQL, restore drill, FMP dry run, 54 mutation controls). Real stack: `npm run stack:start && npm run stack:migrate`, then `npm run test:e2e` (API, 49 checks) and `npm run test:e2e:ui` (browser, 80 checks; needs `PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright` in this sandbox). CI: jobs `test`, `e2e`, `fmp-copy`; `nightly-fmp.yml` (full FMP browser suite; the original side needs the owner's secret `FMP_READ_TOKEN`).
- Sandbox tips: real PostgreSQL 16 for tests: `service postgresql start` (login `tester:tester`). Docker for the Supabase stack: `pkill dockerd; nohup dockerd &`. Only one Supabase stack (ecosystem or FMP's own) at a time (same ports): stop one before starting the other. Playwright for FMP needs `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux*/chrome`. Never `pkill -f` a pattern that matches your own command line.
- Documents to read first: `docs/DEVELOPER_HANDOVER.md`, `docs/DECISIONS.md`, `docs/DESIGN_STATUS.md`, `docs/GO_LIVE_RUNBOOK.md`, `docs/FMP_MIGRATION_PLAN.md`, `docs/FMP_COPY_REPORT.md`.

## Key decisions (full list in docs/DECISIONS.md)
Organization = `workspaces` row; one permission engine (`private.has_permission`); Data API closed, API runs as `app_user`; archive before delete; audit never stores long text; FMP tables will live in schema `fmp` and be reached through the ecosystem API; region Mumbai if two more CloudPing tests agree, else London; stage names are placeholders; only the owner approves go-live, in one step.

## Owner approvals still pending
Go-live (all of `docs/GO_LIVE_RUNBOOK.md`); `FMP_READ_TOKEN` secret for the nightly job; design 09 Clients and Funnel Strategies; FMP hosting choice; independent-account policy; the FMP data migration.

## Done in batch 2 (22 Oct 2026)
FMP fonts self-hosted (FNT-1); research documents (`docs/FMP_HOSTING_OPTIONS.md`, `docs/INDEPENDENT_ACCOUNTS.md`, `docs/APPLICATION_OFFICE_IMPORT_PLAN.md`); API audience gate (0016, AUD-1); Approvals v2 (0017); Client Portal data layer with the G2 suite (0018, PRT-1; OFF by default); Form Builder (0019), Value Ladder (0020), Social Planner (0021); Whiteboard spike (`docs/WHITEBOARD_SPIKE.md`); rate-limit grant (0022); go-live rehearsal (`docs/GO_LIVE_REHEARSAL.md`) which found and fixed the Cloudflare one-connection-per-request defect. Correction: the earlier claim that a slug rule blocks independent accounts was wrong (see `docs/INDEPENDENT_ACCOUNTS.md`).

## Done in batch 3 (22 Oct 2026)
Storage adapter (Supabase now, R2 via S3 later) with 8 GB cap, Admin usage counter, tests with fake S3/Supabase servers and real local Supabase Storage; Storage files in the nightly backup and the restore rehearsal (rehearsal 42 passed / 0 failed / 4 gaps); database tools version 17 in CI (`check:pg17`); runbook: storage switch-over, R2 usage-alert checklist, dashboard-only settings checklist, `application-office` "delete at go-live with owner approval" (never touched: the mid-batch instruction arrived after a read-only look had begun; the project was left active and no copy was kept); FMP copy: model checks in the bottom bar are clickable (the React Flow watermark was already hidden and its MIT licence allows it; the bar already followed design V2).

## Done in the v4 round (23 Oct 2026)
Step 0: Design v4 files, `DESIGN_SYSTEM.md`, onboarding kit and decisions V4-1 to V4-12 recorded; APP_SPECS completeness appendix. Foundation PR: v4 tokens (`data-theme` light/dark x `data-org` l2f/aurj, one theme file `packages/ui/tokens.json`, contrast test, fixes applied), self-hosted fonts (Bricolage Grotesque, Geist, Geist Mono, Noto Nastaliq Urdu), twelve `apps/<app>/app.manifest.json` files with `packages/core/manifests.mjs` and `/app-manifests.json`, theme controller with System/Light/Dark in the profile menu, app switcher, shared drawer/chip/avatar/ribbon/no-access pieces, and a component gallery test (`npm run test:gallery`, 73 checks). Next: Launcher (sky, weather), then the app order in `docs/design/v4/CLAUDE_CODE_PROMPT.md`. Migrations 0024 to 0028 are planned and not written yet.

## What is next
Owner decisions: Vercel plan for FMP (`docs/FMP_HOSTING_OPTIONS.md`); independent-account policy; design approvals (Clients 09, Funnel Strategies, Portal screens, Forms, Value Ladder, Social Planner, Whiteboard) before any screen is built. Engineering that needs no decision: FMP step 2 (export palettes, real organization switcher) once the migration plan is approved; the Hyperdrive upgrade only if connection-per-request proves slow.
