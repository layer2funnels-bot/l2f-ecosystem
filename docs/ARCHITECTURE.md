# Ecosystem Architecture & Foundation Rules (v0.3, 21 Oct 2026)

Deliverable B. Labels: **[Built]** implemented + tested · **[Rec]** my recommendation, needs owner/ChatGPT review · **[Owner rule]** from Layer2Funnels_Combined_Rules.

## 1. Terminology (fixes a naming clash across documents)
| Term in specs | Meaning in code | Note |
|---|---|---|
| Organization (Layer2Funnels, Aurj) | a row in `workspaces` | [Rec] keep the table name; say "organization" in UI and docs. Renaming the table buys nothing and risks every policy |
| Workspace inside an app (client workspace, project workspace) | a **scope**: `client_id`, `project_id` | |
| Personal space (Drive) | owner-only scope `owner_user_id` | [Rec] not a third organization |
| App | row in `apps` (11 apps + Funnel Mapper Pro + `platform`) | lifecycle `active / coming_soon / deprecated / retired` [Built] |

## 2. Layers
1. **Identity**: one Supabase Auth project for staff, client contacts and future external users. No app keeps its own user table. [Built in schema; not live]
2. **Membership**: one row per person per organization; staff carry a role (owner/admin/editor/viewer), clients carry a client link. [Built]
3. **App access**: app enabled for the organization + app grant per person (owners/admins implicit). [Built]
4. **Permissions**: shared catalog + owner-defined access levels + groups + scoped assignments + allow/deny overrides, decided by one engine. [Built, 0004]
5. **Row policies**: every table asks the engine; the database refuses what the engine refuses. [Built]
6. **Audit**: tamper-evident, automatic for permission, approval, app, access and connection changes; records actor kind (user / integration / system; agent refused). [Built]
7. **Integration layer**: connections, secret names, webhook inbox, outbox with idempotency, external IDs. [Built schema; no provider]

## 3. Shared authorization foundation [Built — implements the owner rule]
**Model**: `permissions` (catalog: key `app.object.action`, floor role, default role, allowed scopes) · `access_levels` (per organization and app; owner-defined; starter templates seeded) · `access_level_permissions` (allow/deny) · `groups`, `group_members` · `access_assignments` (user or group → level, at organization, client or project scope, optional expiry) · `permission_overrides` (single allow/deny with reason and expiry).

**Decision order** (`private.permission_decision`, one place, used by every policy):
0 not an active staff member or app unavailable → deny · 1 role below the permission's floor → deny (a viewer can never write) · 2 owner + `platform.*` → allow (lockout recovery) · 3 any applicable **deny** → deny · 4 any applicable allow → allow · 5 role ≥ default role → allow · 6 deny.
Scope: organization grant covers everything inside; client grant covers that client and its projects; project grant covers that project. A deny at a broader scope beats a narrower allow.

**Acceptance criteria → evidence**: two apps, independent levels (AZ1) · restrict one capability, other apps unaffected (AZ2) · backend rejects direct calls (AZ3) · new permissions owner-only by default (AZ4) · audited changes + effective-access review with source (AZ10, AZ14) · client scope (AZ5) · deny wins (AZ6) · groups (AZ7) · role floor (AZ8) · owner-controlled, delegable, no lockout (AZ9) · expiry (AZ11) · org isolation of the access data itself (AZ13).
**Registering a new app**: insert its `apps` row, its permissions (default role conservative), optional starter levels; write policies with `private.has_permission(org, 'app.object.action', client, project)`. No app builds its own role system.
**Not built (by the rule's own timing)**: the admin screens. Planned home: Office → Admin → Access.

## 4. New ecosystem rules I recommend adding [Rec]
| ID | Rule | Why | Enforced by |
|---|---|---|---|
| ER1 One service per cross-cutting concern | Authorization, audit, approvals, comments/activity, notifications, search, file storage, editor engine and integrations exist once and are reused | Specs repeat these in 6 apps; separate copies would diverge and leak | Code review + architecture tests |
| ER2 Archive before delete | Records holding work are archived; hard delete is owner-only and only when empty | Owner rule "no silent loss"; cascades used to wipe projects/files [Built] | Trigger + permission [Built] |
| ER3 Audience is a field, default internal | Anything that could reach a client carries `client_visible`/audience = internal by default | Client App & Portal rule | Column + policy [Built for projects, files] |
| ER4 Exact-version approvals | What a client approves is an immutable snapshot; edits create a new version and re-open review | Client App & Portal rule | `approvals.version` [Built]; history table Phase 6 |
| ER5 Portal reads projections, not tables | Portal uses allow-listed views/RPCs exposing only client-facing columns | Stops a future internal column leaking | Phase 6 |
| ER6 Every write is attributable | actor + actor kind + connection | AI & Integration rule | [Built] |
| ER7 Search stores pointers only | Search index holds id + organization + scope; every hit is re-checked by policy before display; no counts of hidden hits | WCIGA | Phase 5 |
| ER8 App manifest | Each app declares permissions, events, owned tables, retention, retirement path, quota use | App Foundation rule | `apps` + `permissions` [Built]; manifest file per app Phase 5 |
| ER9 Free-tier budget register | Each feature declares what free quota it uses (DB, storage, email, realtime, functions, AI) | $0 constraint; quotas are shared | docs |
| ER10 Personal scope is private | Personal items are owner-only; admin "break-glass" needs reason, is audited and notifies the owner | Drive spec | Phase 5 Drive |
| ER11 Coming soon means no data | A coming-soon app shows a tile and nothing else; it cannot hold or read data | Layer 2 Agents rule | [Built] |
| ER12 Session ≠ identity | Client Portal gets its own domain and session; identity stays shared | Spec says Portal "owns auth/session"; avoids a second user database | Phase 6 |

## 5. Foundations: what exists, what's missing, when
| Foundation | State | When |
|---|---|---|
| Identity, membership, invitations | Built (not live) | go-live runbook |
| WCIGA at data layer, client/project scope | Built | — |
| Authorization foundation | Built (no UI) | Admin UI in Phase 5 |
| App registry + Launcher RPC | Built | UI Phase 5 |
| Profiles, active organization | Built | — |
| Audit + actor kind | Built | — |
| Approvals core | Built (versioning partial) | history Phase 6 |
| API layer (typed operations, error contract, rate limit, safe logs) | Error contract built; rest missing | **Phase 5 slice 0 — highest engineering priority** |
| Storage (files, versions, trash, signed links) | Metadata only | Phase 5 slice 3 |
| Comments/activity, notifications, search | Missing | Phase 5 (minimal versions) |
| Realtime/presence (Whiteboard, editors) | Missing | Later; check free Realtime quota [V] |
| Background jobs | Prepared (backup) | on demand first ($0) |
| Funnel Mapper Pro integration | Entitlement + link only | Stage 2 after owner approval |
| AI | None (correct) | revenue-gated |

## 6. Funnel Mapper Pro and the Funnels menu
The new pack calls FMP the funnel system of record and wants Office → Funnels to show funnels, avatars, offers, products, story bank, brand kit and copy. **[Rec]** Stage 1 (now): Funnels menu = portfolio page that opens FMP (built entitlement). Stage 2: shared sign-in, then FMP exposes a read API for the portfolio. Avatars/offers/story bank/brand kit: decide whether they live in FMP or in the ecosystem **after** FMP's code is reviewed — this is the single most important open data-ownership decision, because Clients and Value Ladder also reference offers, avatars and brand kits.
