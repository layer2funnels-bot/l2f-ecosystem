# Next session — start here (written 15 Nov 2026, end of the P00–Tasks session)

**Project:** Layer2Funnels ecosystem (`layer2funnels-bot/l2f-ecosystem`): one shell (rail, Launcher, search, notifications, profile) and
many apps, rebuilt app by app to the V8 "Ledger" design. Two organizations share it — Layer2Funnels and Aurj — and their data never mixes.
Owner: Tabish (they/them in docs). Live site: `l2f-ecosystem.pages.dev` (Cloudflare Pages, deploys `main`). Database: Supabase project
`l2f-ecosystem`, ref `dfitnxilkezepkhdmzuh` (shared by production and previews).

## 1. Your assignment: the Quality Recovery (NOT a new app)
Read **`docs/implementation/recovery/RECOVERY_BRIEF.md`** in full — it is the owner's brief (10 parts: performance audit with
measurements, Launcher, Office incl. a flexible Avatar Studio editor, Stories, Teammate Access, client access, removing Access Review,
a complete Tasks repair, a proactive audit of P00/P01/Tasks, tests incl. live production verification, handoff updates, final report).
Reference files (avatar .docx, live screenshots) are next to it. **Do not start Drive or any other app until the recovery is done,
verified and handed off.** After that, the owner's explicit instruction is: **the following session starts Drive (P04).**

Suggested order: (1) reproduce the live failures first (Tasks on live, "We couldn't load this" on a customer avatar) — production vs
preview differences; (2) performance measurement baseline; (3) Tasks repair against V8 spec; (4) Avatar Studio flexible sections +
import mapping using the reference .docx; (5) Stories/Brand Kit save + navigate-back; (6) Teammate Access switches; (7) Launcher order +
bell colour; (8) Office org settings, default strategy template, Documents-from-Drive, client access, Access Review removal;
(9) audit tracker sweep; (10) handoff docs + report. Keep a defect tracker in `docs/implementation/recovery/AUDIT_TRACKER.md`.

## 2. State at handoff (verified 15 Nov 2026, 15:15 UTC)
- **Merged to `main` and live** (owner authorized): PR #56 P00 Shell, PR #57 P01 Office, PR #58 Tasks. `main` head after merges: `ed8468e`.
- **Production migrations applied** (owner authorized, after an in-database snapshot `backup_20261115`): 0054 notifications_every_app,
  0055 profile_details, 0056 office_v8, 0057 avatar_studio, 0058 admin_access_v8, 0059 tasks. Verified: all in `schema_migrations`;
  14 new tables with RLS; nothing granted to anon/authenticated; `clients.apps.manage` default admin; `tasks` app enabled for both orgs.
  **Next free migration number: 0060.** Every migration has a rollback in `migrations/rollback/`.
- Live check done only as files served (tasks.js, office views return 200). **Not verified signed-in on live** — the owner reports Tasks
  does not work on live and an avatar page fails to load. That is the first thing to reproduce.
- Branch for this work: `claude/epic-bohr-nc9jar` (restarted from `main`; holds only these handoff docs). Old branches `p01-office`,
  `p02-tasks` are merged; don't reuse them.

## 3. Sequence (owner, 15 Nov 2026 — replaces the earlier order)
P00 Foundation and Global Shell (done) · P01 Office (done, under repair) · **P02 Projects (NOT rebuilt to V8 — not complete)** ·
**P03 Tasks** (built earlier under the name "P02": branch `p02-tasks`, migration `0059_tasks`, docs `TASKS_PLAN.md`/`TASKS_REPORT.md` —
names kept, numbering is now P03) · P04 Drive · P05 Planner · P06 Clients · P07 Funnel Mapper · P08 Portal · P09 Whiteboard · P10 Forms ·
P11 Value Ladder · P12 Social Planner · P13 Agents · P14 Final Ecosystem Verification.
**Sequence exception (owner's decision):** after the recovery, go to **Drive (P04)** before Projects (P02). Projects stays deferred and incomplete.

## 4. How things work (enough to start without re-reading everything)
- Web: vanilla ES modules in `apps/web/js` (views in `js/views`, app modules in `js/modules`); shell in `js/views/shell.js` + `apps/web/shell-v8.css`;
  base styles `v8-base.css`; page CSS generated from the V8 prototype by `scripts/build-page-css.mjs` (roots `.v8p-office`, `.v8p-tasks`).
- Text size: `scripts/textscale.mjs` makes every px font size `calc(Npx * var(--ts,1))` (run it after adding CSS; CI `check:textscale`).
- Server operations: `defineOperation` in `packages/core` (`office-operations.mjs`, `tasks-operations.mjs`, …); DB runs as `app_user` with RLS and
  `private.*` security-definer helpers (`has_permission`, `is_staff`, `org_in_scope`, `can_use_app`, `request_org`).
- Shell hooks: `content.__side`, `content.__barRight`, `content.__focused`; unsaved work `dirty.set/clear`; `toast(text, ok, action)`.
- Avatar Studio: `js/views/office-avatars.js`, import `js/modules/avatarimport.js` (Word XML namespace parsing), table `funnel_avatars.profile` jsonb +
  `avatar_versions`. Teammate access: `js/views/office-team.js` / `office-admin.js`, functions `access_app_set`, `access_feature_set`
  (migration 0058). Access Review = `access_review_list/keep`, `app_usage.reviewed_at` (to be removed per brief Part 3-I; keep `app_touch` if used for last-used).
- Tests: `npm test` (pglite, `test/run.mjs`); local stack `npm run stack:start && npm run stack:migrate`; browser `scripts/e2e-*.mjs`
  (`e2e-ui` 265, `e2e-onboarding` 22, `e2e-local` 71, `e2e-tasks` 33 — all green at merge); `PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright`.
  After `e2e-onboarding`, reset `apps.lifecycle='coming_soon'` for forms, value_ladder, social_planner, whiteboard before `e2e-ui`.
  CI: test, e2e, fmp-copy, Cloudflare Pages. `scripts/rehearsal.mjs` R8d allows only listed text-only hosts.
- Production DB access in the cloud session: Supabase MCP tools (`apply_migration`, `execute_sql`, `list_migrations`, `get_advisors`).

## 5. Never
- Never merge, deploy, or change production data/schema without the owner's explicit approval for that step.
- Never ask for credentials in chat. $0/month (free plans only).
- Never re-apply migrations already in `list_migrations`; before any production migration take a verified backup (in-database snapshot
  schema was the approved method on 15 Nov).
- Never add fake buttons; never drop V4 functionality unless V8 removes it or the owner approves.
- Never enforce permissions only in the UI. Client Access Matrix = owners AND admins.
- Never claim live is fixed without testing it signed in on live (use a safe test account/organization; ask the owner to provide one
  through the app, not credentials in chat).
