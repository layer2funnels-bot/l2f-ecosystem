# Handoff for the next chat: finishing the other apps

Written 29 Oct 2026 at the end of the Projects work. Read this first, then `CHANGES_FOR_MAIN_CHAT.md` (what changed) and
`docs/apps/PROJECTS_AUDIT.md` (the worked example). Repository `layer2funnels-bot/l2f-ecosystem`, branch `claude/quirky-fermi-7vkj1c`.

## Who the owner is and what they want
A solo entrepreneur running two organizations (Layer2Funnels and Aurj) who has **no time to specify features**. Each app must have what is
needed to finish real work, judged against the market leaders (Asana/ClickUp for Projects). **You decide the features**, explain them in plain
English and ask only for business decisions. They rate the ecosystem low because apps felt basic, laggy and error-prone, so **speed and
reliability come first**, then features. One app at a time.

## Hard rules (from the owner; never break)
- Never expose credentials, keys or secrets. Never mix Layer2Funnels and Aurj data or permissions.
- No money, no paid services, no upgrades. No destructive operations.
- Migrations only on the **local** stack (`npm run stack:migrate` refuses anything else). Nothing applied to staging or production, no deploys, no merges, and no live auth, DNS or infrastructure changes without explicit approval.
- Client Portal stays unreleased until its G2 security gate passes. Leave **Funnel Mapper Pro** alone until the owner says otherwise.
- **Pull requests: do not open new ones for now.** GitHub Actions minutes ran out (they reset around 1 Nov 2026). Commit per release and push to the branch. Draft PR #34 already exists for this branch.

## App order (one at a time; each ends with a report to the owner)
| # | App | Why this order | Benchmark (what "complete" means) |
|---|---|---|---|
| 1 | **Clients** | The hub of agency work; Projects already links to it. It can reuse the comments, history, followers and notifications built for Projects at once (add `client` to `private.collab_scope`). | HubSpot / Pipedrive / ClickUp CRM: contacts per client, activity timeline, notes, tasks from requests, pipeline with values |
| 2 | **Drive + Docs + Sheets** | Every app stores files there. The owner named "word editor, sheet editor, image editor, PDF editor". | Google Drive / Docs / Sheets: previews, share a file, comments on documents, templates, basic image crop and resize, PDF viewer with annotate |
| 3 | **Planner** | The owner said it is good but **laggy, with errors and pages that do not load**. Do a speed and reliability pass first (count requests per page, use `/api/batch`, one-request panels like `tasks.panel`), then the gaps. | Asana Goals / Weekdone |
| 4 | **Office Home** | A real "my day" across apps: notifications inbox, my tasks, approvals, deadlines. | Asana Home / ClickUp Home |
| 5 | **Social Planner** | | Buffer / Later: approval flow, best times, a content library (real publishing needs approved integrations: ask) |
| 6 | **Form Builder** | Forms → tasks and clients (needs an owner decision on who may set this up) | Typeform / Tally / Jotform |
| 7 | **Whiteboard** | | Miro: templates, sticky notes, comments, export |
| 8 | **Value Ladder** | | Its own niche: visual ladder, link to forecasts |
| 9 | Client Portal | Only after G2 passes | |
| — | Funnel Mapper Pro | Not until the owner says so | |

## The method (exactly what was done for Projects; do the same for every app)
1. **Audit** with the `app-audit` skill (`.claude/skills/app-audit/SKILL.md`). Map the app's real screens (`apps/web/js/modules/<app>.js`), API operations (`packages/core/<app>-operations.mjs`), tables and policies (`migrations/`) and tests. Compare it with the benchmark above.
2. **Write the audit** as `docs/apps/<APP>_AUDIT.md`: one-paragraph verdict, a comparison table (capability · leader · ours · release), releases R1…R5 grouped by job ("work together", "organize", "repeat", "oversee", "automate"), what is skipped on purpose and the decisions the owner must make. Tell the owner the plan in plain English and start; don't wait for approval of technical choices.
3. **Each release is test-first** (`superpowers:test-driven-development`):
   - Write `test/<app>-<release>.test.mjs` first (PGlite, pattern in `test/projects-automations.test.mjs`). Every release tests the feature **and** isolation: another organization gets 404, a viewer cannot write, a scoped member sees only their scope. Run it and watch it fail.
   - Migration `migrations/00NN_<name>.sql`: composite keys `(workspace_id, …)`, guard triggers that copy `client_id`/`project_id` and refuse moves, restrictive `org_scope` policy, permission policies via `private.has_permission`, audit trigger, grants to `app_user` only, the anon/authenticated revoke block. A `security definer` function needs `set search_path = ''` and its own org check, and `app_user` needs an explicit `grant execute` on any `private` function an invoker function calls.
   - Operations with `defineOperation` (staff audience by default); register the suite in `test/run.mjs`. A new `public` function must be added to the F4c allow-list in `test/audit.test.mjs`.
   - UI in the app's module; plain words; every state (loading, empty, error, no access, archived, rate-limited); 44 px targets.
   - **Mutation check**: break the org fence or the permission check on purpose and confirm a test fails, then restore it.
4. **Browser journey** on the local stack: `scripts/e2e-<app>.mjs` (pattern: `scripts/e2e-projects.mjs`). Sign up real users, click through the release, fail on any script error or page-policy violation, take screenshots (`SHOTS=<dir>`) and **look at them**. Several real bugs were only found this way (empty date fields, squeezed timeline bars, uppercase names, a rate-limit failure).
5. **Speed check per screen**: count requests per page load. Calls a screen makes at the same moment are batched automatically, but a panel that loads many things should get one operation, like `tasks.panel`.
6. `npm test` (all suites) green → commit (`<App> R<n>: <what> …`) → push to the branch. At the end: update the audit with done and left, and send the owner a plain-English report (what you can do now, what was checked, what is left, decisions needed).
7. Use the `dataviz` skill for any chart (one hue, numbers printed, no rainbow palettes) and `frontend-design` or `artifact-design` for new screens.

## Skills to have
Already in the repository (load automatically): `.claude/skills/app-audit`, `.claude/skills/user-stories`, `.claude/skills/test-scenarios`.
Plugin used throughout: **superpowers** (test-driven-development, systematic-debugging, verification-before-completion, brainstorming).
It is enabled on the owner's claude.ai account (plugin directory), so new cloud sessions get it automatically. Only if a new chat
doesn't list `superpowers:*` skills, the owner adds it from the claude.ai plugin directory or types in Claude Code:
```
/plugin marketplace add obra/superpowers-marketplace
```
```
/plugin install superpowers@superpowers-marketplace
```
Optional, to save context in long sessions: context-mode (`/plugin marketplace add mksglu/context-mode`, then `/plugin install context-mode@context-mode`).
These are typed by the owner; the assistant cannot run `/plugin` itself.

## Local environment (cloud container)
```bash
nohup dockerd > /tmp/dockerd.log 2>&1 &
```
```bash
npx -y supabase@2.121.0 start -x studio,imgproxy,edge-runtime,logflare,vector,realtime,storage-api,mailpit,supavisor
```
```bash
npm run stack:migrate && npm run build:web
```
```bash
npm test
```
```bash
node scripts/e2e-projects.mjs
```
Playwright and Chromium are pre-installed (`require('playwright')` works). Don't reinstall them. Never `pkill -f` a pattern that matches your own command.

## Things learned the hard way
- Each screen's API calls count against **300 reads a minute** per person (V4-30). Keep panels to one request.
- Plain `date` columns must stay strings: `pg.types.setTypeParser(1082, v => v)` in the server and the PGlite `parsers` option in tests.
- Planner runs inside a **shadow root**; its CSS cannot leak into the shell and the shell's cannot leak into it.
- `.badge` needs `[hidden]{display:none}` or a hidden "0" shows.
- Browser test data must have unique names (the local database keeps earlier runs).
- A comment at the end of a line can silently swallow the next statement. Check the browser console in every journey.
- GitHub Actions: jobs ending in about 2 seconds with no logs mean the account is out of minutes, not a code failure.

## State at handoff
- Projects R1–R5 are done (migrations 0034–0038); see `docs/apps/PROJECTS_AUDIT.md` for what is left (custom fields first).
- Tests on 29 Oct: `npm test` 55/55 suites; `e2e-projects` 32/32; `e2e-ui` and `e2e-planner`: see the final report in the chat.
- Owner decisions pending: merging PR #34 once CI can run; applying 0034–0038 beyond local; "shared with client" comments in the Portal; Forms → tasks.
