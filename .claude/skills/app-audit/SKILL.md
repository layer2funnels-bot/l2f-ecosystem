---
name: app-audit
description: Use when the owner names one Layer2Funnels/Aurj ecosystem app (Planner, Projects, Clients, Drive, Forms, Value Ladder, Social Planner, Whiteboard, Portal, Office, Launcher, Funnel Mapper Pro...) and asks to finish it, check it, find what is missing, or make it feel native to the ecosystem. Maps the app's real screens, API operations, tables, policies and tests, finds missing features and broken workflows, and ends with a plain-English report and a ranked plan. One app at a time.
---

# App audit (Layer2Funnels ecosystem)

The owner is not technical. They name an app; you work out what it needs. Never ask them to list features, menus or buttons:
read the repository. Ask only about business decisions (what a feature should do for customers, spending, go-live).

Work on **one app**. Shared-platform fixes are in scope only when this app needs them; record other apps' problems as follow-ups.

## 1. Locate the app (read, do not guess)

| Layer | Where to look |
|---|---|
| Manifest (name, group, plate, permission prefix, status) | `apps/<app>/app.manifest.json` (`packages/core/manifests.mjs` validates) |
| Shell route and screen | `apps/web/js/routes.js` (`parseRoute`, `hrefFor.app`, `pageKeyFor`, `routeForPage`), `apps/web/js/app.js` (the `switch (route.name)`), `apps/web/js/modules/<app>.js` or `views/*.js` |
| Separate front end, if any | `apps/<app>/` (e.g. Planner: React, mounted by `apps/web/js/modules/planner.js` from `/planner/embed.js`) |
| API operations | `packages/core/*-operations.mjs`, registered in `packages/core/operations.mjs` |
| Tables, policies, permissions, functions | `migrations/NNNN_*.sql` (`grep -n "<prefix>" migrations/*.sql`); permission rows are `insert into public.permissions` |
| Tests | `test/*.test.mjs` (database + API, PGlite), `apps/<app>/test`, browser journeys `scripts/e2e-*.mjs` |
| Product intent | `docs/` (design specs, handoffs, `DECISIONS.md`, `UIUX_HANDOFF.md`), the app's README |

Check `git log --oneline -- <paths>` and open PRs for the app before changing anything: preserve newer work.

## 2. Capability map

Write a table of every capability the app offers or promises: **screen / route → operation(s) → table(s) → policy → test(s)**.
Mark each row: Works (evidence: a test or a run) · Partial · Missing · Promised only (in docs/manifest, nothing built).
Sources of "promised": manifest `searchTypes`/`embeds`/`reuses`, design specs in `docs/`, empty-state copy, menu items.

## 3. Find the gaps

Look for each of these; every finding needs a file:line or a reproduction.

**Native ecosystem behaviour** (the Planner integration proved these; see `docs/PLANNER_INTEGRATION_STATUS.md`)
- Opens from the Launcher, the header app switcher and any Office menu item to the same address; no link lands on "isn't built yet" (`#/app/<key>` falls through to `appNotBuiltView` unless routed).
- Uses the shell's header and organization switcher; no second header, sign-in, organization picker or theme toggle.
- API calls go through the shell's client (`apps/web/js/api.js`): one token refresh path, the shell's "session expired" screen.
- Organization switch follows `UIUX_HANDOFF.md` §7b: old data leaves the screen at once, the person stays in the app, a record is never carried (info line + "Switch back"), `pageKeyFor`/`routeForPage` know the app.
- Shared tokens (`packages/ui/tokens.css`) and self-hosted fonts (`apps/web/fonts.css`); light/dark and the Aurj palette follow `<html data-theme data-org>`. Page policy (`apps/web/_headers`): no external styles, fonts or scripts.
- Phone: the app's sections in the bottom bar, no sideways scroll, 44px targets.
- Search and notifications: the shell's are placeholders today; do not build a second global system. In-app search is fine.

**Workflows**: dead buttons or links, actions with no confirmation or undo, forms without validation messages, missing loading / empty / error states (six states), direct URLs that fail after a refresh, pages that need a manual refresh, lists that never page.

**Data and security (WCIGA, SDOR)**
- Every app table: RLS enabled and forced, the restrictive `org_scope` policy (rows tied to the request's `x-org-id`), composite `(workspace_id, …)` foreign keys, no browser-role grants.
- Operations that take an organization argument refuse one that differs from `x-org-id`.
- Access is decided in the database (`private.permission_decision`: membership, app switched on, app grant, role floor), never only in the screen.
- One owner per kind of data (SDOR): the app reuses Clients, Projects, Drive records instead of copying them.
- Layer2Funnels and Aurj stay separate: test a person in both organizations, a person in one, and a member without the app grant.

**Tests**: capabilities with no test; tests that would pass without the feature (mutation check: `npm run test:mutation`).

## 4. Report to the owner

Write `docs/apps/<APP>_AUDIT.md`:
1. **In one paragraph**: what state the app is in, in plain words.
2. **What works** (with evidence).
3. **Gaps**, ranked: security/data first, then broken workflows, then ecosystem fit, then polish. Each: what the person sees, why it matters, the fix, size (S/M/L).
4. **Needs your decision**: only business choices, each with the options and their consequences in plain English.
5. **Plan**: the order you will fix things, smallest safe steps first.

Then implement with the existing skills: `superpowers:writing-plans` → `superpowers:test-driven-development` (or `superpowers:subagent-driven-development` for independent tasks) → `superpowers:systematic-debugging` for failures. For a new feature with unclear behaviour, write acceptance criteria with `user-stories` and turn them into checks with `test-scenarios`.

## 5. Definition of done and release gate

A change is done only when all apply (adapted from addyosmani/agent-skills `references/definition-of-done.md`, MIT):
- Behaviour verified at runtime (browser journey for anything a person sees), not only compiled.
- New behaviour has a test that fails without the change; existing suites still pass.
- Loading, empty, error and no-access states handled; WCIGA checks above pass.
- Docs describe the current state (`docs/<APP>_…STATUS.md` or the audit file).
- `security-review` and `code-review` run on the diff; findings fixed or answered.

Commands (record each as RUN AND PASSED / RUN AND FAILED / NOT RUN + reason):
```
npm test                                  # all database + API suites (PGlite)
npm --prefix apps/<app> test && npx --prefix apps/<app> tsc --noEmit   # if the app has its own package
npm run build:web && npm run check:tokens && npm run check:secrets && npm run check:licences
npm run stack:start && npm run stack:migrate   # local Supabase stack (Docker + Supabase CLI) — local only
node scripts/e2e-<app>.mjs                # the app's browser journey, if any; node scripts/e2e-ui.mjs for the whole site
```
`scripts/stack-migrate.mjs` refuses non-local databases. A fresh stack has no data: some `e2e-ui.mjs` checks (Projects P1) expect at least one project.

## Never (owner authorization required)
Apply migrations to staging or production, deploy, merge, change live auth/DNS/cloud settings, spend money, or switch an app on for real organizations. Client Portal stays locked until its G2 security gate passes. Do not claim staging, production or CI results you did not see.
