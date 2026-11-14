# P00 notes (for the next session)

Branch `claude/epic-bohr-nc9jar`, draft PR #56. Reference docs: `V8_IMPLEMENTATION_TRACKER.md`, `ECOSYSTEM_PLAN.md` (do not re-review the V8 package).

## Done
- Tokens: V8 colours in `packages/ui/tokens.json` (3 values darkened for 4.5:1). `--font-d` = Geist; Bricolage only on the Launcher hero.
- `apps/web/v8.css` generated (`npm run css:v8`), **not loaded** (prototype class names collide with live markup). Adopt rules per rebuilt component.
- Shell (`apps/web/js/views/shell.js`, `apps/web/shell-v8.css`, scoped `.shell.v8`): rail, sidebar (collapse), 52 px app bar, phone apps-and-account sheet.
- Launcher: V8 sizes (`apps/web/sky.css`), Khushab weather + snowfall, no on/off switches (owner).
- Search: `packages/core/search-operations.mjs`, `apps/web/js/views/search.js` (`.gsx-*`). Client spaces never searched.
- Notifications: migration 0054 (`my_inbox`, `private.notify`, `notification_prefs`, Drive share trigger), drawer `.nfx-*`.

## Remaining in P00
Profile page (`#/profile/{about,account,notifications,appearance}`, notification prefs UI), organization branding (Office › Admin › Branding + logo columns), shared components (single-instance dialog, drawer with independent scroll, context menu, 10 s error state, request de-duplication in `apps/web/js/api.js`), P00 report.

## Working rules (owner, 14 Nov)
- Before every push: `npm test` + the browser suite the change touches (`npm run test:e2e:ui`; `test:e2e` for migrations/grants). New SQL functions: revoke from anon/authenticated and add RPC names to `test/audit.test.mjs` F4c.
- Local stack: `dockerd &`, `npm run stack:start && npm run stack:migrate`; reset `apps.lifecycle` for forms/value_ladder/social_planner/whiteboard to `coming_soon` after onboarding runs.
- Batch related work per commit; short reports.
