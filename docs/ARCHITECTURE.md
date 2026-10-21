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
| Funnel business records (Office → Funnels) | Schema in 0006 [Built]; UI Phase 5 | Phase 5 |
| Funnel Mapper Pro integration | Entitlement + link only; FMP untouched | Stage 2, only after explicit owner approval and a data-ownership design |
| AI | None (correct) | revenue-gated |

## 6. Funnel Mapper Pro and the Funnels menu (corrected 21 Oct 2026; decisions FMP-1, FMP-2)
Funnel Mapper Pro (FMP) is part of the Layer2Funnels ecosystem. Its funnel-mapping features, data and workflows are preserved.
| Responsibility | Owner |
|---|---|
| Avatars, offers and products, story bank, brand kits, other funnel business records | **Office → Funnels** (ecosystem database, migration 0006) |
| Funnel mapping (maps, nodes, canvas, FMP's own data and database) | **Funnel Mapper Pro** (unchanged) |
**[Built]** Business-record tables follow all foundation rules (organization-owned, `funnels.*` permissions, audit, archive-before-delete, `client_visible`). Clients and Value Ladder reference these records by ID. Nothing is duplicated inside FMP.
**Stage 1 (now):** the FMP tile and entitlement exist; the Funnels menu shows the business records plus a link that opens FMP. FMP has its own sign-in.
**Stage 2 (needs explicit owner approval, not designed yet):** any connection between Funnels and FMP (e.g. FMP reading avatars or brand kits, or Funnels listing FMP maps) is designed deliberately: which side owns each field, read versus write, which permission governs it. No FMP rewrite, data move, database change or workflow change without approval.

## 7. Organization switching (owner requirement, approved 21 Oct 2026) [Built + tested]
**Rule NAV1:** switching organization keeps the user in the same app and, when allowed, on the equivalent page. The Launcher is never opened automatically.
| Layer | Mechanism | Evidence |
|---|---|---|
| Database scope | Every request carries `x-org-id` (server code: `app.org_id`). A RESTRICTIVE policy on all 21 organization-owned tables hides every other organization's rows, even for people in both. It can only narrow, never widen; a malformed value shows nothing | S11–S17 |
| Switch resolver | `resolve_org_switch(org, app, page)` checks membership, sets the active organization, and returns one outcome: `same_page`, `record_not_carried` (one-record pages land on their list), `page_unavailable` (land on the app's home with an explanation), `app_unavailable` (stay, explain, offer next steps), `not_available` (nothing changes; identical for "not a member" and "doesn't exist") | S1–S10, S19 |
| Page registry | `app_pages`: each page declares its permission and whether it shows one record. New apps register their pages | S1, S4–S6 |
| Browser module | `packages/core/org-switch.mjs`: cache tagged by organization, wiped on switch, late responses from the old organization refused, all requests send the new header | B1–B4 |
**Rule NAV2:** record ids are never carried between organizations; deep links always include the organization; a link opened for the wrong active organization shows the standard denied/not-found state with a "switch organization" option only if the user belongs to the other one.
**Rule NAV3:** "My work" is the only multi-organization view; it makes one request per organization (each with its header) and shows two labelled groups (S18).
