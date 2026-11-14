# P00 notes (for the next session)

Branch `claude/epic-bohr-nc9jar`, draft PR #56. Reference docs: `V8_IMPLEMENTATION_TRACKER.md`, `ECOSYSTEM_PLAN.md` (do not re-review the V8 package).

## Done
- Tokens: V8 colours in `packages/ui/tokens.json` (3 values darkened for 4.5:1). `--font-d` = Geist; Bricolage only on the Launcher hero.
- `apps/web/v8.css` generated (`npm run css:v8`), **not loaded** (prototype class names collide with live markup). Adopt rules per rebuilt component.
- Shell (`apps/web/js/views/shell.js`, `apps/web/shell-v8.css`, scoped `.shell.v8`): rail, sidebar (collapse), 52 px app bar, phone apps-and-account sheet.
- Launcher: V8 sizes (`apps/web/sky.css`), Khushab weather + snowfall, no on/off switches (owner).
- Search: `packages/core/search-operations.mjs`, `apps/web/js/views/search.js` (`.gsx-*`). Client spaces never searched.
- Notifications: migration 0054 (`my_inbox`, `private.notify`, `notification_prefs`, Drive share trigger), drawer `.nfx-*`.

## Done (14 Nov, later)
- V4 removed: `v8-ledger.css` (prototype cascade, `npm run css:ledger`), V8 icons (`npm run icons`), V8 tokens, `v8-base.css`. Report: `V8_FIDELITY_REPORT.md`.
- Profile page (4 tabs, 0055), apps and profile menus to V8, G L and ? shortcuts, notifications/search fixes, Planner retry, migration rollbacks (`MIGRATIONS_0054_0055.md`).
- Fidelity check: `node scripts/v8-compare.mjs [page]` (local stack) -> `e2e-shots/v8cmp/`.

## Remaining in P00
Launcher summary line with real counts (needs P01 Office data); shared context menu (adopted per app); P00 report. Branding is P01 (Office › Admin › Branding). 0054/0055 wait for the owner's approval to apply to production.

## Working rules (owner, 14 Nov)
- Before every push: `npm test` + the browser suite the change touches (`npm run test:e2e:ui`; `test:e2e` for migrations/grants). New SQL functions: revoke from anon/authenticated and add RPC names to `test/audit.test.mjs` F4c.
- Local stack: `dockerd &`, `npm run stack:start && npm run stack:migrate`; reset `apps.lifecycle` for forms/value_ladder/social_planner/whiteboard to `coming_soon` after onboarding runs.
- Batch related work per commit; short reports.

## Status 15 Nov (handoff)
- P00 complete and pushed to PR #56 (last: 105494b, variable Geist). Not merged. Migrations 0054/0055 local only (owner: not to production).
- P01 Office in progress on LOCAL branch `p01-office` (rebased on PR #56's branch). Only `claude/epic-bohr-nc9jar` may be pushed, and the owner
  wants ONE Office PR when Office is complete: keep committing on `p01-office`; when Office is done, merge it into the PR branch (or a fresh
  branch after #56 is merged) and open the Office PR. Plan: `OFFICE_PLAN.md`. Office Home is built (views/home.js, pages/office-home.css).
- Page method: prototype markup + `scripts/build-page-css.mjs` (add the page's classes and its real ancestor chain to PAGES) + compare with
  `scripts/v8-compare.mjs <page>`. Dump a prototype page: see the probe in the session (Chromium, computed styles).
- Owner decisions: one PR per complete app; Client Access Matrix = owners AND admins; no merge/deploy/production DB without approval.
