# App Structure & Feature Review (21 Oct 2026)

Deliverable C. Labels: **[Brainstorm]** from your specs · **[Rec]** my proposal · **[Approved]** already decided in project records. Nothing here is built except where stated.

## 1. Cross-app problems found
| # | Problem | Where | [Rec] |
|---|---|---|---|
| X1 | Approvals designed 4 times | Clients, Portal, Social Planner, Forms | One Approvals service (exists in DB) with subject type, exact version, audience (internal review vs client approval) |
| X2 | Brand Kit in two places | Office → Funnels (organization) and Clients (per client) | One brand-kit record type in Office → Funnels (0006), scoped to organization or client; client kits never appear in Office lists. Not stored in FMP (FMP-1) |
| X3 | Customer Avatars in two places | Office Funnels and Clients → Strategy | Same avatar record type, owned by Office → Funnels (0006), scoped to organization or client; not stored in FMP (FMP-1) |
| X4 | Offers/products owner unclear | Funnels, Clients (value ladder), Value Ladder app | Offers and products are Office → Funnels records (0006, FMP-1); Clients and Value Ladder reference them by ID (spec agrees). FMP does not own them |
| X5 | Documents everywhere | Office Documents, Drive, Projects Docs, Clients Documents, SOPs & Tools | One storage + editor engine with `owner_app` + scope. Office **Documents = Drive's organization space** (not a second store). SOPs live once (Drive org space, protected) and are referenced by Clients stages |
| X6 | Integrations managed in several apps | Projects App Center, Social Planner Channels, Office Integrations | Connections are organization-level and live in Office → Admin → Integrations; apps show only the links/status relevant to them |
| X7 | Org switcher vs fixed label | Phase 3 design used fixed labels in Office/Clients | Specs now put the switcher in every header. **Adopt one global switcher** (simpler, consistent). Design change for tomorrow |
| X8 | Client Portal "owns its auth" | Portal spec | Shared identity, separate portal domain/session (ER12) |
| X9 | AI Assist menus | Projects, Forms, Whiteboard | Hide until a provider and budget are approved; keep data contracts ready |
| X10 | Admin surfaces scattered | Office Admin, Drive admin, Clients Settings | Office → Admin hosts members, access levels, apps, integrations, audit. Apps keep only contextual "Manage access" panels (Drive spec already asks for this) |
| X11 | Plans vs Planner | Office | Use **Planner** (one menu slot) [specs recommend] |
| X12 | Hidden cost/effort | Drive first-party Docs/Sheets/Slides/Image editors; Miro-level Whiteboard | Adopt open-source engines under a reviewed licence (blueprint Tier A); avoid AGPL unless separated; phase Docs + Image first, Sheets/Slides later. Realtime collaboration depends on free-tier limits [V] |

## 2. Per-app review
| App | Keep [Brainstorm] | Change / add [Rec] | Remove or defer [Rec] | Depends on |
|---|---|---|---|---|
| **Office** | Org switcher, Home, Planner, Projects, Funnels, Documents, Team, Apps, Admin | Projects menu = portfolio view of the Projects app; Documents = Drive org space; Admin = access, apps, integrations, audit | Yearly summaries (later) | Authorization UI, search, notifications |
| **Projects** | Home, My Work, Projects, task fields, timer, List/Board, project Docs/Whiteboards | Merge "Home" and "My Work" (two near-identical pages); timer uses server time; time edits are a permission (`projects.time.edit`) | AI Assist and App Center to later; Timeline/Dashboards next release | tasks/time tables, storage, editor engine |
| **Clients** | Clients list, Requests & Approvals, Overview/Work/Requests/Docs & Brand Kit/Notes, 5 stages, Build = progress only | "SOPs & Tools" becomes links to Drive SOPs; client team = "Client team" access level at client scope (built); Settings → Office Admin | Separate Settings menu | stages, requests, versions, approvals |
| **Client Portal** | Home with 6 milestones, Requests, Reviews, Files, Messages | Read only through projections (ER5); messages always attached to a request/file | Anything not explicitly shared | G2 gate, Clients workflow |
| **Drive** | 3 spaces, folders, trash, versions, contextual Manage access, first-party editors | Personal space as owner scope (ER10); break-glass needs reason + owner notice | Public links, client access (later) | storage, editor engine |
| **Form Builder** | List, Builder, Preview, Submissions, Publish | Internal forms first; public forms need a separate anonymous-submission service (bot protection, rate limit, retention) | Payments, signatures | consent/retention policy |
| **Value Ladder** | List, map, stage drawer, history | Reference-only to offers; broken-link states | Pricing changes | Office → Funnels offers (X4, 0006) |
| **Planner** | Overview, Strategy Map, Goals & Initiatives, My Goals, Metrics, Reviews, Reports, Templates | First release: Strategy Map, Goals & Initiatives, My Goals, Reviews; actions = Projects tasks [Approved] | Reports, Templates, metric integrations (next) | tasks |
| **Social Planner** | Calendar, Posts, Queue, Approvals, Channels | Publish **through GoHighLevel first** (blueprint R10; no new provider cost) | Direct network APIs, inbox, analytics | GHL connector (V5) |
| **Whiteboard** | Board home, editor, share, history, present/export | Open-source canvas engine; Phase A without live presence | Voting/timers, AI | realtime quota |
| **Layer 2 Agents** | Coming soon page | Built as `coming_soon` lifecycle: tile only, no data (AZ18) | Everything else | owner approval |

## 3. Decisions waiting for you (grouped)
1. ~~Funnel data owner~~ — decided 21 Oct (FMP-1): Office → Funnels owns avatars, offers/products, story bank, brand kits. Remaining: Stage 2 FMP connection design, only when you approve it (FMP-2).
2. Default client visibility for editors: **conservative default built** (assigned clients only; give "All clients" level to trusted staff). Confirm.
3. Drive admin break-glass policy (reason + audit + owner notice proposed).
4. Social Planner via GoHighLevel first (recommended) vs direct networks.
5. Editor engine and whiteboard engine choices (after licence check).
