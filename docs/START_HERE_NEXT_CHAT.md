# START HERE: handoff for the next chat (14 Nov 2026)

Read this file first. It tells the whole story of this chat (how it started, what was built, what is live) and what to do next. Details live in the files it links to; don't re-derive what is written here.

---

## 1. The single most important facts
1. **Design V8 is now the design reference.** The owner made V8 because **V7 had many mistakes**. V7 (`docs/design/v7/`) is superseded: don't build from V7. Earlier rounds (v4, v5, v6) are history only.
2. **The live software uses the V4 design.** Everything at https://office.tabishriaz.com was built to Design V4 (`docs/design/v4/`, decision V4-19 "Design v4 is final", 23 Oct 2026). Funnel Mapper (the one app integrated in the V7 period) keeps its own navy + emerald look inside the ecosystem.
3. **The V8 package is not in the repository yet.** When the owner shares it: install it (e.g. `docs/design/v8/`, byte-identical, with an inventory), compare it with what is live (V4) and **inspect the real app before changing anything**. Preserve every working feature. Improve weak V8 ideas with a written reason instead of copying blindly.
4. **Funnel Mapper is live** at https://office.tabishriaz.com/fmp (14 Nov 2026), on the ecosystem's one sign-in, for Layer2Funnels and Aurj.
5. The owner's last scope instruction: **"We just need Funnel Mapper for now."** Don't start other apps unless the owner asks.

## 2. Who you work for and how
- The owner (Tabish Riaz) is a **non-technical founder** of Layer2Funnels (done-for-you funnel agency) and Aurj (Urdu/Hindi-first education). Pronouns not stated: use "they". Dictates voice notes (transcripts misspell "Claude" as "Cloud", "Funnel Mapper Pro" may appear garbled).
- Reports: **short, plain English**, Done / Blocked / Needs you, evidence not claims, one next action. No jargon.
- **$0 a month**: free plans only (Supabase, Cloudflare, GitHub, Brevo). Never buy or subscribe without asking.
- **Minimal questions.** They said "proceed independently", "Go ahead, do whatever you want", "Continue and complete the task. Don't ask for anything." Do routine work yourself; ask only for things that need their own logins or a business decision.
- **Never ask for passwords, keys or tokens in chat.** Credentials go into the cloud environment's *Network secrets* (the owner adds them; the proxy injects them).
- Never expose API keys in frontend code. Never invent credentials or DNS settings. Never rewrite history on others' branches.
- Security rules from the owner for infrastructure work: don't delete existing resources, don't modify unrelated applications, don't expose secrets, no destructive changes to production, minimum permissions, deploy only what is merged to `main`.
- Hard lesson from earlier rounds: never redesign Planner, Projects or Funnel Mapper from assumptions; inspect the real app and keep its functions.

## 3. The product (what exists)
- **One ecosystem, one address, one sign-in** for two strictly separate organizations: **Layer2Funnels** and **Aurj**. They never see each other's data.
- Apps (V4 design, live): Launcher, Office (Admin, Team, Documents, Apps), Projects (V2), Clients, Client Portal (locked preview), Drive with Docs / Sheets / Word / Image / PDF editors, Planner, Forms, Value Ladder, Social Planner, Whiteboard, **Funnel Mapper** (new, live 14 Nov).
- **Repository** `layer2funnels-bot/l2f-ecosystem` (private). Work branch `claude/exciting-dirac-kjybj0`; PR to `main`; after a merge restart the branch from `origin/main`.
  - Web app: plain ES modules (`apps/web/js`, hash routes `#/...`), built by `node scripts/build-web.mjs`.
  - API: Cloudflare Pages Function `functions/api/[[route]].js` → `packages/core` (typed operations `*-operations.mjs`).
  - Database: Supabase Postgres with row security, `migrations/00NN_*.sql` (live has 0001–0053).
  - Funnel Mapper: Next.js 16 app in `apps/funnel-mapper` (OpenNext on a Cloudflare Worker).
  - Tests: `npm test` (unit/API, pglite), `scripts/e2e-*.mjs` (browser, local Supabase stack), CI on GitHub Actions (free 2,000 min/month).
- **Live**: Cloudflare Pages project `l2f-ecosystem` (custom domain `office.tabishriaz.com`, deploys from `main` through Cloudflare's GitHub connection), Supabase project `dfitnxilkezepkhdmzuh`, R2 bucket `l2f-ecosystem-files`, Cloudflare account `d5ec27e33b46a9e645eb4d4d3b23cde6`.
- **Security model (never weaken)**: organization isolation on every table (`org_scope` restrictive policies), nothing granted to `anon`/`authenticated`, API runs as `app_user`, permissions = `private.has_permission(org, key, client, project)` (app switched on ∧ app grant ∧ role ∧ levels with client/project scope), default deny, a refusal reads as "not found". Hiding in the UI is never security. Docs: `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/DEVELOPER_HANDOVER.md`.

## 4. How this chat started and what we did (in order)
This chat ran from mid-October to 14 Nov 2026 (it was summarized several times; the repository is the record).
1. **Foundations (Oct, PRs #1–#12)**: housekeeping; security lockdown (direct Supabase Data API cannot touch data); effective permissions with client/project scope; backend operations and screens for designs 01–08; data layers for Projects, Drive, Planner; Phase 6 data layers (Client Portal, Approvals, Form Builder, Value Ladder, Social Planner, Whiteboard spike); storage adapter (R2) with an **8 GB storage cap** and usage counter; nightly backups incl. files; go-live runbook and rehearsal.
2. **Funnel Mapper Pro preparation (Oct)**: an exact code copy of the separate `layer2funnels-bot/Funnel-Mapper` repo into `apps/funnel-mapper` (tag `fmp-copy-pristine`, every later change recorded in `docs/FMP_CHANGES.md`, checked by `npm run check:fmp-copy`), Cloudflare spike, migration plan and dry run.
3. **Design V4 build (Oct–early Nov, PRs #14–#31)**: V4 declared final by the owner. Launcher (sky, weather, find), Docs module, Whiteboard, Storage vs Drive visibility, Projects, Office, Clients, Drive + Sheets, Client Portal preview, Forms, Value Ladder, All boards, Social Planner, client onboarding (invite first), weather terms, fewer database messages per request, go-live packs. **This is what is live.**
4. **Live operations (early Nov, PRs #36–#46)**: CI fixes; Planner "every two weeks" (0040); **profiles** and **invitations that work** (Brevo e-mail, delivery status, resend, join without the link; 0041–0042); sign-up "account already exists"; Launcher profile menu and Client Portal tile (0043); **editors** (Word, Sheets, Image, PDF) and Drive sharing, owner lock, folder passwords (0044–0046); phone fixes; CI inside the free minutes; **Projects V2** replaces old Projects (0048–0051).
5. **Design V7 round (13 Nov)**: the owner sent the V7 package; it was installed at `docs/design/v7/` with an inventory and critique. **Now superseded by V8.** Only Funnel Mapper was worked on in this round.
6. **Funnel Mapper into the ecosystem (13–14 Nov, PRs #47–#54)**, the owner's decisions:
   - It lives in this repository and is called **"Funnel Mapper"** (no "Pro") (FM-6).
   - It keeps its own navy + emerald identity (FM-7).
   - **One client list**: the Clients app owns client identity (FM-8).
   - **Fresh start**: no old Funnel Mapper Pro data, only the **13 built-in templates** (FM-9).
   - **One sign-in** for every app, the main ecosystem sign-in (FM-10).
   - It follows **all ecosystem rules**: org switching like the other apps, the storage cap, permissions.
   - **Settings holds only Funnel Mapper's own settings.** Profile, organization, team and account belong to the ecosystem.
   - Available for **Layer2Funnels and Aurj**, for owners and editors.
   - **One address**: everything under `office.tabishriaz.com`, Funnel Mapper at **`/fmp`**.

   What was built:
   - Migrations **0052** (permissions, shared clients) and **0053** (Funnel Mapper data, the `fmp.images` register counted in the storage cap, org-switch pages), both applied live on 13 Nov.
   - Funnel Mapper reads and writes only through ecosystem API operations (`packages/core/fmp-data-operations.mjs`).
   - Shared session cookie `l2f-session` (host-only). The web app moves an old session over once and re-reads the cookie each time.
   - `basePath /fmp` and the gateway `functions/fmp/[[path]].js` → `packages/core/fmp-gateway.mjs` (service binding `FMP`; puts `/fmp` back on Funnel Mapper's own redirects; leaves the web app's `/#` routes alone).
   - Org switcher like the other apps; "All apps" goes back to the Launcher.
7. **Cloudflare go-live (14 Nov)**: the owner saved a Cloudflare token as a network secret. The Worker `funnel-mapper` was published from `main`, PR #52 added the binding, and the Launcher tile was pointed at `/fmp`. A live-only bug (the signed-out redirect went to `/fmp/#/signin`) was fixed in PR #53. All live checks pass. Full record, including how to undo everything: `docs/implementation/FUNNEL_MAPPER_CLOUDFLARE.md`.
8. **Handoff (14 Nov, PR #54)**: this file and the updated handoffs.

## 5. Current live state (verified 14 Nov 2026)
| Item | State |
|---|---|
| `main` | includes PRs #1–#53 (#54 = these docs) |
| Live database | migrations 0001–0053; Funnel Mapper switched on for both organizations; `launch_url` = `https://office.tabishriaz.com/fmp` |
| Cloudflare | Pages `l2f-ecosystem` with `functions/fmp` + binding `FMP`; Worker `funnel-mapper` (version `24e745b5`, no route, no workers.dev); R2 CORS unchanged (already allowed the site); DNS untouched |
| Live checks | signed-out `/fmp/clients` → ecosystem sign-in; share page answers, made-up link opens nothing; `/fmp/robots.txt` 200; `/api/health` 200 (`node scripts/fmp-cloudflare-golive.mjs verify`) |
| Not yet tested on live | a signed-in walkthrough (the assistant can't sign in as the owner); the owner was asked to try it |

## 6. Open items and owner decisions
1. **V8**: get the package, install it, compare with the live V4 and with Funnel Mapper, plan the work app by app (ask the owner which app first if V8 doesn't say).
2. Owner's signed-in Funnel Mapper walkthrough on live (Launcher → Funnel Mapper, client, funnel, logo upload, share link, sign-out); fix what they report.
3. Client accounts (people outside the team) have no Funnel Mapper access: owner's decision.
4. **Cloudflare token**: the owner gave a **full-access** token (expires 21 Nov 2026). Recommend replacing it with one limited to *Workers Scripts Edit* + *Workers R2 Storage Edit*, or deleting it when no more deploys are planned.
5. Funnel Mapper's own browser suite and old database tests (`apps/funnel-mapper/tests/e2e`, `tests/integration`) still target the old setup; rewrite for the ecosystem.
6. Funnel Mapper items in the ecosystem's shared search.
7. The old Funnel Mapper Pro project (separate repo, its Supabase and Vercel): untouched; owner decides when to retire it.
8. Older items still open (see `docs/NEW_CHAT_HANDOFF.md`): the database password was once pasted in chat (reset is the owner's call); Brevo/Supabase e-mail live tests.

## 7. Practical notes for this cloud environment
- Node's built-in `fetch` ignores the session proxy: for scripts that call `api.cloudflare.com` use `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`. `curl` works directly.
- Redeploying the Funnel Mapper Worker: `wrangler deploy` fails at the static-file upload (401) because the proxy replaces wrangler's upload key with the API token. Use `scripts/cf-split-dispatcher.mjs`; the exact command is in `docs/implementation/FUNNEL_MAPPER_CLOUDFLARE.md` (go-live log). Publish a Worker **before** adding a Pages binding to it, or the whole site deploy fails.
- Always run `verify` on the **live** address after a merge; `*.pages.dev` previews hide same-address behaviour.
- Supabase: use the Supabase MCP tools (project `dfitnxilkezepkhdmzuh`); live changes only with guarded scripts or `apply_migration`, after checking the current migration list.
- GitHub: use the GitHub MCP tools; wait for green CI (test, e2e, fmp-copy, Cloudflare Pages) before merging.
- Local stack: `npm run stack:start && npm run stack:migrate`; `PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright`. `apps/web/ui.css` must not contain hex colours (use tokens). Next free migration number: check `origin/main` right before creating one (0054 at the time of writing).

## 8. Where to read more
- Funnel Mapper: `docs/implementation/FUNNEL_MAPPER_STAGE2_REPORT.md`, `FUNNEL_MAPPER_CLOUDFLARE.md`, `FUNNEL_MAPPER_REPORT.md`, `docs/FMP_CHANGES.md`, decisions FM-6…FM-10 in `docs/DECISIONS.md`.
- V7 period handoff (now history): `docs/design/v7/CLAUDE_CODE_NEXT_CHAT_HANDOFF.md`.
- Onboarding, e-mail and profiles: `docs/ONBOARDING.md`; earlier handoff: `docs/NEW_CHAT_HANDOFF.md`.
- Design V4 (live): `docs/design/v4/`, `docs/design/DESIGN_INDEX.md`.
