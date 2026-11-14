# Value Ladder · features and functionality

Status marks: **[E]** existing, keep · **[R]** redesigned (same function, new design) · **[N]** new, build it · **[F]** future, do not build (show "Later" only where stated). Functions are unchanged from v7; V8 changes only the visual design (section 3).

## 1. Change register for this app (what the repo does not have yet)

- [R] Portal: tabs Home, Requests, Approvals, My notes (Messages and Files removed).
- [N] Whiteboard folders; [R] full-page canvas with floating tools.

## 2. Full functional brief (authoritative, carried over from v7 unchanged except the Funnel Mapper rename)

#### Value Ladder [E]
Keep. Addition: revenue model strip above the ladder (visitors → step conversion % → revenue per month), editable rates, note that rates can come from Funnel Mapper forecasts later.



## 3. What V8 changes visually (no functional change)

- Shared Ledger rules. Ladder steps keep their 3D look (app identity); flattening is recommendation R5, not applied.

## 4. Existing behaviour as specified in V4 (approved 23 Oct 2026)

For apps marked [E] ("keep as built") this is the detailed description of what exists. It is historical: where it disagrees with §2 or a later decision (e.g. Portal Messages/Files removed, "Form Builder" renamed "Forms"), §2 and `04_OPEN_DECISIONS.md` win. Visual values here are superseded by V8.

#### 8. Value Ladder [ladder/*]
Ladder list with mini step charts; ladder map as rising 3D steps (lead magnet → front-end → core → upsell → high-ticket), "More value, higher price →". Step drawer: linked offer (reference, never changes the offer), broken-link warning, audience, assumptions, owner. History page.
#### Value Ladder
- Ladder list/create/duplicate. Steps typed (lead magnet, front-end, core, upsell, downsell, high-ticket, continuity); reorder, add/remove. Each step **references an Offers & Products record** (price and name read from it, never edited here; broken-link warning). Ladder belongs to the organization library or is a client-specific copy (V4-1). Per-step assumptions (conversion %, audience) kept as notes/numbers for later Funnel Mapper maths. Views: map, table, compare two versions. History. Status draft/approved. Sharing with a client only if the ladder belongs to that client. Image/PDF export needs backend.
- Workflows: build a ladder, link offers, compare versions, approve, copy for a client. States: empty, loading, error, no-access, broken link. Relationships: Office > Funnels offers, Clients. Permissions: `ladder.*`. Dependencies: 0020 (exists), 0028.
#### Other apps: workflow, states, relations, permissions, dependencies
| App | Core workflows | States to cover | Relations | Permissions | Depends on |
|---|---|---|---|---|---|
| Launcher | open app, find app, see why locked/soon | locked, soon, not here, next round, no weather | catalog, grants, weather op | `launcher_catalog()` | app manifests, MET op |
| Office | home, funnels records, strategies, documents, team, apps, admin | first use, no match, no access | Drive org space, Projects module, Admin | office/funnels/admin keys | Drive, Projects |
| Projects | plan, assign, track time, archive, search | empty, archived read-only, no access | Clients (optional), Drive docs, whiteboards | `projects.*` with client/project scope | 0013 |
| Clients | onboard, stages, requests, approvals, notes | first use, archived, client-scoped | Funnels copies, Forms, Drive, Portal | `clients.*` | 0025 |
| Drive | upload, organize, share, version, trash | empty, trash, protected SOP, personal | all apps (documents), storage adapter | `drive.*` | 0014, 0023 |
| Client Portal | see progress, approve, answer | preview-only ribbon (gate G2) | Clients, Approvals | projections only | G2 owner approval |
| Whiteboard | draw, open in context, All boards | empty, saving, newer version exists | Drive documents, Projects, Clients | Drive rights + context | 0024 |
| Planner | placeholder | soon | Projects tasks (later) | none yet | external onboarding, V4-9 |
