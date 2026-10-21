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
| FMP-1 | Funnel Mapper Pro is part of the ecosystem. Funnel business records (avatars, offers and products, story bank, brand kits, related records) are managed in **Office → Funnels** on the ecosystem database (migration 0006). They are not built or duplicated inside Funnel Mapper Pro. Clients and Value Ladder reference them by ID. Supersedes the open question in ARCHITECTURE §6 and APP_STRUCTURE_REVIEW §3.1 |
| FMP-2 | Funnel Mapper Pro and its data, database and workflows are preserved. No rewrite, data move, database change or workflow change without explicit owner approval. Any connection between Office → Funnels and FMP (Stage 2) is designed first, with named data ownership and permissions, and approved before building |
