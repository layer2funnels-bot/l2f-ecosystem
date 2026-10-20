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
| D14 | Supabase Storage before R2; Mumbai region recommended | docs | Resolves Phase 2 vs blueprint |
| D15 | Tests run on PostgreSQL 17 (PGlite) and a real server; CI uses postgres:17 | `test/` | Matches live Supabase 17 |
| A1 | Identity resolved like Supabase `auth.uid()` (legacy claim, then `request.jwt.claims`) | `private.current_user_id()` | Fixed by F1 |
| A2–A4 | Append-only audit; uniform denials; `check_function_bodies = off` | unchanged | — |
| A5 | Hosting: Cloudflare Pages free; Vercel Hobby excluded | not deployed | V12 |
