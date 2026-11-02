# Handoff for the next chat (written 2 Nov 2026)

Read this file first. It is written so a new chat can continue without the old conversation. Facts are marked **verified** (checked in this repository or on the live systems during the last sessions) or **check** (believed true, confirm before relying on it).

## 1. Who you are working for and how they want to be talked to
- The owner is a non-technical founder (email on the account: th272709@gmail.com). Pronouns are not stated: use "they".
- Reports must be **short, plain English**: what is **Done**, what is **Blocked**, what **Needs approval**. One next action at the end. Evidence, never claims. Never invent results.
- They said repeatedly: do things yourself, do not hand them steps. The only things they must do themselves are approvals and anything that needs their own login (dashboards, billing).
- Budget: $0 extra spend. No paid services without asking. Never ask for passwords, keys or tokens in chat. The owner pasted their database password into chat once (treat it as exposed; resetting it is the owner's decision; never use or store it).
- Do not create pull requests unless asked; do not merge or change live settings, data or schemas without a clear go-ahead from the owner (a plain "merge it" or "apply it" counts; silence does not).

## 2. The product
Two organizations on one platform: **Layer2Funnels** (team, `l2f`) and **Aurj** (`aurj`). One sign-in, many apps, each organization sees only its own data (enforced in the database, not in the screens).
Apps: Launcher, Office (home, funnels, strategies, documents, team, admin), Projects, Clients, Drive, Client Portal (locked on purpose), Form Builder, Value Ladder, Whiteboard, Social Planner, Planner (strategy: plans, goals, KPIs), Funnel Mapper Pro (separate product, own folder `apps/funnel-mapper`, never touch its original repo), Layer 2 Agents (coming soon, no AI is switched on).
Design: the approved **Design V4** ("Signal": side rail per app, light/dark, two organization themes, fonts self-hosted). Source of truth: `docs/design/v4/`. Audit with evidence: `docs/DESIGN_AUDIT_V4.md`.

## 3. Where everything lives (verified)
| Thing | Where |
|---|---|
| Code | GitHub `layer2funnels-bot/l2f-ecosystem` (private). Production branch: `main`. |
| Live site | https://l2f-ecosystem.pages.dev (Cloudflare Pages project `l2f-ecosystem`; production = `main`; every other branch gets a preview URL like `https://<branch>.l2f-ecosystem.pages.dev`; previews use the **live database**) |
| Database | Supabase project `l2f-ecosystem`, ref `dfitnxilkezepkhdmzuh`, region ap-south-1 (Mumbai) |
| API | A Cloudflare Pages Function: `functions/api/[[route]].js` (new server per request). Runtime secrets: `DATABASE_URL` (Session pooler string, password URL-encoded), `SUPABASE_JWKS_URL`, `SUPABASE_JWT_ISSUER`, `RATE_LIMIT_STORE`, `S3_*`, `STORAGE_*`, `WEATHER_USER_AGENT`. Build variables: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `STORAGE_CONNECT_ORIGIN`. Production and Preview have **separate** variable sets. Error `28P01` = wrong database password. |
| Files | Supabase Storage now; Cloudflare R2 through the same adapter later (8 GB cap) |
| Build | Cloudflare runs only `node scripts/build-web.mjs` (it also installs and builds Planner by itself; on Cloudflare a Planner build failure stops the deploy). Output `dist/web`. |

## 4. Current state (verified on 2 Nov 2026)
- **`main`** contains: Design V4 across the app (PR #29), Planner inside the shell (PR #36/#37), Projects "working together" features (comments, notifications bell, sections, tags, subtasks, recurring work, dependencies, workload, portfolio, rules; migrations 0034–0038), a speed batch API, the Planner build fix.
- **Live database is at migration 0033 only.** The repository is at **0041**. So the live site's code is ahead of its database. Until 0034–0041 are applied on the live database, these will show errors: the header notifications bell, new Projects functions (sections, tags, rules, comments), Team (after PR #38), Your profile (after PR #38).
- **Open pull request #38** (branch `claude/exciting-dirac-kjybj0`): Your profile for everyone, invitation fix, "Write the email" button, migration 0041. All local tests pass (unit and API suites, browser suite 248/248). GitHub CI result: **check** (it was started at the end of the last session).
- **Ready-made live script:** `scripts/golive-0034-0041.sql` brings the live database from 0033 to 0041 in one all-or-nothing step. Tested from a 0033 database: result identical to the full migration, refuses a second run. The owner runs it in the Supabase SQL Editor (paste, Run), or approves the assistant running it through the Supabase connector (the connector's approval prompt timed out once at 60 s; the SQL Editor is the reliable route). After it runs, verify with `list_migrations` (should end `0041_profiles`) and a table count, then merge PR #38.
- Planner: migration 0033 and its code are live and the owner confirmed it works. In the app database it is `active` and enabled in both organizations; the owner is the only member of either organization right now.
- GitHub Actions **works again** (it was blocked by a billing restriction earlier). CI jobs: `test` (unit and API, PGlite and real Postgres, restore drill, mutation controls), `e2e` (API journey, browser suite, component gallery), `fmp-copy`. Always wait for CI before merging.

## 5. What was fixed in the last session (2 Nov)
1. **"They signed up through my link but got no access."** Cause: the invitation token was stored only in the browser tab (`sessionStorage`). The e-mail confirmation opens a new tab, so the token was lost. Fix (in PR #38): the token is also kept in local storage and rides on the confirmation link as `?invite=`.
2. **"Nobody receives an invitation e-mail."** The app has **never sent e-mail** (no mail provider connected, by design until go-live). The dialog now says so and has a **Write the email** button that opens the owner's own mail program with the message ready. Real sending is a decision for the owner (see section 8).
3. **Profiles.** New page `#/profile` (avatar menu > Your profile): photo, name, email, password, for everyone including clients. The photo is a small square JPEG (max 12,000 characters, the API body limit is 16 KB) kept in `profiles.avatar_data`. `team_list` says who has a photo; the Team profile drawer shows it. Supabase Auth sends the confirmation e-mail when someone changes their e-mail.

## 6. How to work in this repository (verified)
- Read `AGENTS.md` (Next.js note is irrelevant: the web app is **plain ES modules** in `apps/web/js`, hash routes, `apps/web/*.css`; Planner is React + Vite in `apps/planner`, Whiteboard bundle in `apps/whiteboard`).
- Branch rule: develop on `claude/exciting-dirac-kjybj0`. After a merge, restart it from main: `git fetch origin main && git checkout -B claude/exciting-dirac-kjybj0 origin/main`. A force push is blocked by the sandbox: if the remote branch holds only merged history, join it with `git merge -s ours origin/claude/exciting-dirac-kjybj0` and push normally.
- **Never use a bare `git stash`** (the stash is shared between sessions).
- Tests: `DRIVERS=pglite npm test` (all suites, about 3 minutes), `npm run check:tokens`, `npm run check:secrets`, `node test/design-v4.test.mjs` (no hard-coded hex colours in `ui.css`: use tokens such as `var(--danger)`, `var(--surface)`; there is no `--on-action` token).
- Browser suites need the local stack: docker daemon (`pkill dockerd; nohup dockerd &` then wait for `docker info`), `npm run stack:start`, `npm run stack:migrate`, then `PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright node scripts/e2e-ui.mjs` (about 8 minutes, prints results only at the end). **Run `supabase db reset` + `npm run stack:migrate` before every full e2e run** (it is not repeatable on a used database). `scripts/e2e-planner.mjs`, `scripts/e2e-projects.mjs`, `npm run test:e2e`, `npm run test:gallery` are the others CI runs.
- Local debugging scripts named `scripts/_*.mjs` are git-ignored on purpose (`.git/info/exclude`): do not commit them.
- Class-name collisions with the generated V4 stylesheet (`apps/web/v4.css`, built from the prototype) have caused real bugs: `.pri` (priority label) vs buttons (use `.btn.primary`), `.sw`, `.sp-bar` (progress bar), `.sp-prev` (post preview). Check `grep -n "\.yourclass" apps/web/*.css` before inventing a class. Never hand-edit `v4.css`.
- Rate limits: reads 300 a minute per person, writes 30, sensitive 5 (tests lift them).
- A view must not rely on being attached to the page when its data arrives (`root.isConnected` race): the registry loads before any view starts (`app.js`).
- Supabase connector: `list_migrations`, `execute_sql` (read-only queries are fine), `get_advisors`, `query_logs` work. Writes through it need an approval prompt that can time out. The connector runs as `postgres` (bypasses row security), so security tests must run through the API as `app_user`.

## 7. Open work, in suggested order
1. **Owner approval needed:** apply `scripts/golive-0034-0041.sql` to the live database, then merge PR #38 once CI is green, then check the live site (profile page, bell, Team, Projects) and tell the owner.
2. Verify the invitation fix on the live site with a real test (invite a spare email, sign up, confirm in a different browser). In the Supabase dashboard (Authentication > URL Configuration) the **Site URL** must be `https://l2f-ecosystem.pages.dev` and **Redirect URLs** should include `https://l2f-ecosystem.pages.dev/**` so the `?invite=` part survives (**check**; if not allowed, Supabase falls back to the Site URL and only the local-storage copy of the token helps, which works on the same browser).
3. Fallback for people who confirm on another device: add a database function that lists invitations waiting for the signed-in person's e-mail, so the "no organization yet" page can offer "Join Layer2Funnels" without the token (needs a migration and tests; not built).
4. Real invitation e-mail: needs a mail sender (options: Supabase custom SMTP with a free-tier provider, or an e-mail API). Costs and a provider account are an owner decision.
5. Design V4 leftovers (`docs/DESIGN_AUDIT_V4.md`): Value Ladder cards, hover/press timing pass, other apps at phone width, Office Funnels/Team/Admin and Whiteboard comparison, Drive extras (Starred, Shared with me, storage meter, People filter: no data behind them yet), Launcher weather chip.
6. Planner follow-ups (`docs/PLANNER_INTEGRATION_STATUS.md`): search types, notifications for Planner, styling still Planner's own inside a shadow root.
7. Go-live pack (`docs/GO_LIVE_RUNBOOK.md`, `docs/GO_LIVE_PACK.md`): R2 CORS rule, real latency measurement, Client Portal stays locked until the owner opens it.
8. Housekeeping: close the stale PR #33 (`feature/planner-strategy`, already merged through other PRs) after confirming it has nothing unique.

## 8. Decisions waiting for the owner
- Apply migrations 0034–0041 to the live database now? (recommended: yes, via the one script)
- Reset the database password (it was pasted into chat once)? If yes, update `DATABASE_URL` in Cloudflare (Production and Preview) afterwards.
- How should invitations be e-mailed (provider, cost)? Until then owners copy the link or use "Write the email".
- Should comments be visible to clients ("shared with client" comments)? Currently internal only.
- Client Portal opening date (locked on purpose; Gate G2 security tests must pass first).

## 9. Hard rules that must never be broken
- Organization isolation is the security boundary: every table has the restrictive `org_scope` policy; the browser roles `anon` and `authenticated` get nothing; the API runs as `app_user`; UI hiding is never security. Cross-organization tests exist in `test/isolation.test.mjs` and per feature.
- The original Funnel Mapper Pro repository and other Supabase projects are never touched. `docs/FMP_*.md` explains the copy in `apps/funnel-mapper`.
- No fake success: disabled things say why; AI features stay off until the owner approves a provider, cost and data rules.
- Permanent delete is owner-only; client data is never in the shared Drive; the Client Portal stays locked.

## 10. Other documents worth opening (all in `docs/`)
`DECISIONS.md` (every decision with a code), `ARCHITECTURE.md`, `DEVELOPER_HANDOVER.md`, `SESSION_HANDOFF.md` (older, batches 1–3), `DESIGN_STATUS.md`, `DESIGN_AUDIT_V4.md`, `PLANNER_INTEGRATION_STATUS.md`, `PERFORMANCE.md`, `GO_LIVE_RUNBOOK.md`, `INFRASTRUCTURE.md`, `RATE_LIMIT_DESIGN.md`, `INDEPENDENT_ACCOUNTS.md`.
