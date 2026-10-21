# Decision register — implementation (reconciled with Blueprint v1.2, 20 Oct 2026)

Owner approvals live in `05_Decision_Register.md`. These are technical decisions made under the open-hand mandate; all are reversible.

| ID | Decision | Implemented as | Blueprint link |
|---|---|---|---|
| D1 | Only owners add/demote/remove owners; one active owner always | `mem_*` policies, `guard_last_owner` | Consistent with §4.2 |
| D2 | Editors delete own uploads; client/project delete needs admin | policies | Consistent |
| D3 | Editors see all clients in their workspace (with Clients app) | `clients_*` | Consistent |
| D4 | Requesters cannot approve own requests | `appr_*` + `approvals_decide` | R13 spirit |
| D5 | Clients see only own record and items marked `client_visible` (changed by audit F5) | policies | §10.3 allowlist |
| D6 | Brand Base: editors+ only | `bb_*` | Consistent |
| D7 | Per-app access: owners/admins all enabled apps; editors/viewers by grant; invitations grant Office, Projects, Planner, Drive, Clients by default | `can_use_app`, `app_grants` | §4.3 dimension 3, OV5 |
| D8 | Client Portal and external products switched on only by an owner; Portal off by default (G2 kill switch) | `wsapps_*`, `client_of` | R12, OV6 |
| D9 | Membership only via admin action or email-bound invitation; sign-up grants nothing | `create_invitation`, `accept_invitation` | §10.1 C, directive §6 |
| D10 | Policy helpers in `private` schema; only 3 RPCs in `public` | 0002 | R19 |
| D11 | Audit entries for permissions, approvals, app access, connections are written by triggers (`origin=system`) | `audit_change` | §10.1 A |
| D12 | Workspaces have `kind internal/external`; deletion is server-side only | 0002 | Directive §3 |
| D13 | Minimum integration layer as separate, droppable migration | 0003 | R28 (pending approval) |
| D14 | Supabase Storage before R2; region: see INFRASTRUCTURE.md §5 (London provisional; Mumbai if two more tests agree) | docs | Resolves Phase 2 vs blueprint |
| D15 | Tests run on PostgreSQL 17 (PGlite) and a real server; CI uses postgres:17 | `test/` | Matches live Supabase 17 |
| A1 | Identity resolved like Supabase `auth.uid()` (legacy claim, then `request.jwt.claims`) | `private.current_user_id()` | Fixed by F1 |
| A2–A4 | Append-only audit; uniform denials; `check_function_bodies = off` | unchanged | — |
| A5 | Hosting: Cloudflare Pages free; Vercel Hobby excluded | not deployed | V12 |
| D16 | Shared authorization foundation: catalog, access levels, groups, scoped assignments, allow/deny overrides; decision order deny > allow > role default; role floors; owner recovery for platform permissions | 0004, `private.permission_decision` | Owner rule (21 Oct) |
| D17 | Client and project access is scoped: editors see only assigned clients/projects unless given an organization-wide level (changes D3) | 0004 policies | WCIGA (21 Oct) |
| D18 | Archive before delete; hard delete owner-only and refused while work exists (changes D2) | 0004 trigger | App Foundation rule |
| D19 | Audit records actor kind; agent actions refused until Layer 2 Agents is approved | 0004 | AI & Integration rule |
| D20 | App lifecycle: coming-soon apps show a tile and hold no data | 0004 | Agents = coming soon |
| D21 | "Organization" in specs = `workspaces` row; table not renamed | docs | Terminology |

## Owner-approved design decisions (21 Oct 2026)
| ID | Decision |
|---|---|
| UX1 | One global organization switcher in every app header (replaces Phase 3 fixed labels) |
| UX2 | Projects: Home and My Work merged into one page |
| UX3 | Office → Documents is the Drive organization space (one store, no copy) |
| UX4 | SOPs live once in the Drive organization space as protected documents; Clients stages and other apps link to them |
| UX5 | Office → Admin → Access ships first with: access levels, assignments, effective-access view (groups and restriction screens later; backend already supports them) |
| UX6 | Client Portal on its own subdomain (proposed `portal.layer2funnels.com`, `portal.aurj...` later) with its own session; ecosystem chrome stays; client brand kit appears only inside portal content |
| UX7 | Organization switching keeps the current app and equivalent page; never auto-redirects to the Launcher; old-organization data cleared; isolation enforced in the database (`org_scope` policies, `resolve_org_switch`) |

## Funnel Mapper Pro decisions (owner clarification, 21 Oct 2026)
| ID | Decision |
|---|---|
| FMP-1 | Funnel Mapper Pro is a **regular app of the ecosystem**, like Clients or Whiteboard: not a separate or "connected" product (clarified 21 Oct, supersedes earlier "separate product" wording). Its Launcher tile is a normal tile that opens it in the same tab under the ecosystem header and switcher. Funnel business records (avatars, offers and products, story bank, brand kits, related records) are managed in **Office → Funnels** on the ecosystem database (migration 0006). They are not built or duplicated inside Funnel Mapper Pro. Clients and Value Ladder reference them by ID. Supersedes the open question in ARCHITECTURE §6 and APP_STRUCTURE_REVIEW §3.1 |
| FMP-2 | Funnel Mapper Pro and its data, database and workflows are preserved. No rewrite, data move, database change or workflow change without explicit owner approval. Any connection between Office → Funnels and FMP (Stage 2) is designed first, with named data ownership and permissions, and approved before building |
| FMP-3 | Funnel records use app `office` with `funnels.*` permission keys; org-wide or per-client; sharing with a client is a separate permission; references from Clients and Value Ladder are rows in `funnel_references` (by ID, never copies). Migration 0006 does not touch FMP |
| API-1 | API layer: every request carries `x-org-id` (nil UUID only for org switch and invitation accept); organization is never read from input; one error contract; rate classes read 120 / write 30 / sensitive 5 per minute per person; logs are allowlist-only |
| INF-1 | Local development uses the Supabase CLI local stack (Docker) with the suites run as `supabase_admin`; CI uses postgres:17 with PG17 client tools |
| WEB-1 | Hosting: Cloudflare Pages (free): static app in `apps/web` plus one Pages Function for `/api/*`. Built and run locally only; deployment needs owner approval (go-live in one step, owner decision 21 Oct) |
| WEB-2 | Browser app is plain ES modules, no framework and no build step; auth by direct calls to Supabase Auth with the publishable key; tokens in `localStorage` behind a strict CSP; no `innerHTML` (tested) |
| WEB-3 | Screens without an approved design are built on the tokens and carry a visible "Needs design" note; register in `docs/DESIGN_STATUS.md` |
| WEB-4 | Brand Base (Clients) and brand kits (Funnels) stay separate; revisit when the Funnels screens are designed (owner decision 21 Oct). Does not affect FMP or application-office |
| WEB-5 | Default organization at first sign-in = the one where the person holds the highest role, then by name |
| CLI-1 | Clients data layer: internal profile in its own table (never client-readable); team notes internal by construction; requests/updates shareable with `clients.record.share`; stages are an owner-editable list per organization (names are placeholders, to confirm) |
| CLI-2 | Archive before delete applies to `clients` too (an empty client must be archived first). Supersedes the "empty clients may be deleted directly" part of D18 |
| RL-1 | Shared rate limits live in a Postgres counter table behind a two-method interface, tiered after the in-memory limiter, writes and sensitive only, falling back to memory if the store fails; off until go-live (docs/RATE_LIMIT_DESIGN.md) |
| FMP-4 | Owner approved (21 Oct 2026) an exact, code-only copy of Funnel Mapper Pro into `apps/funnel-mapper/` (no data, no database connection, no deploy, no edits). The original repository and its live projects were only read. Reshaping waits for approved designs |
| FMP-5 | Rules unchanged: never edit, push to or delete anything in the original FMP repository or its Supabase/Vercel projects (push to the original is disabled in the working clone and confirmed); copy code only; no real data, no connection, no deploy until the owner approves. The pristine copy is tagged `fmp-copy-pristine`; after reshaping the copy may differ, and every change is recorded in `docs/FMP_CHANGES.md` |
| LIC-1 | Licence review of the FMP copy's dependencies (not shipped by the ecosystem yet): MPL-2.0 (lightningcss, axe-core: build/test tools, file-level copyleft, unmodified), LGPL-3.0-or-later (sharp's libvips binaries: dynamically linked, unmodified, replaceable), EPL-2.0 OR GPL-3.0-or-later (elkjs: use under EPL-2.0, unmodified), CC-BY-4.0 (caniuse-lite data: attribution kept in package), MIT AND Zlib / MIT AND ISC (permissive combinations). Accepted for study and local builds. Re-review before the copy is built into a production image |
| CLI-3 | Client stage names stay as the placeholders (Onboarding, Strategy, Build, Launch, Optimise); owner decision 21 Oct. The Clients design (09) lists other names; it is not approved yet, so nothing changes |
| SEC-1 | The only way in is our API (owner requirement, 21 Oct): `anon` and `authenticated` have **no** privileges on any table, sequence or function of ours (migration 0010; `auto_expose_new_tables = false`; private schema unexposed). The API server runs each request as the NOLOGIN role `app_user` (`set local role`, claims and `x-org-id` per transaction). Proved by a permanent test (`test/direct-access.test.mjs`, 19 checks), 5 mutation controls, and real HTTP calls against the local stack with real tokens (`scripts/e2e-local.mjs` E21–E28). New functions must still revoke PUBLIC execute (audit test F4b) |
