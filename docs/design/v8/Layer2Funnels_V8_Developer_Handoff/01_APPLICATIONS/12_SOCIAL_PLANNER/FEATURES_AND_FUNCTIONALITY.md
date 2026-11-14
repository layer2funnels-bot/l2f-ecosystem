# Social Planner · features and functionality

Status marks: **[E]** existing, keep · **[R]** redesigned (same function, new design) · **[N]** new, build it · **[F]** future, do not build (show "Later" only where stated). Functions are unchanged from v7; V8 changes only the visual design (section 3).

## 1. Change register for this app (what the repo does not have yet)

- [R] Portal: tabs Home, Requests, Approvals, My notes (Messages and Files removed).
- [N] Whiteboard folders; [R] full-page canvas with floating tools.

## 2. Full functional brief (authoritative, carried over from v7 unchanged except the Funnel Mapper rename)

#### Social Planner [E]
Keep. Additions: **Pipeline** board (Idea, Draft, In review, Approved, Scheduled in GHL, Posted) and **Campaigns** (posted vs planned). Publishing stays in GoHighLevel: "Send approved to GHL" exports CSV [F for API].



## 3. What V8 changes visually (no functional change)

- Shared Ledger rules (flat columns and cards, word + dot status).

## 4. Existing behaviour as specified in V4 (approved 23 Oct 2026)

For apps marked [E] ("keep as built") this is the detailed description of what exists. It is historical: where it disagrees with §2 or a later decision (e.g. Portal Messages/Files removed, "Form Builder" renamed "Forms"), §2 and `04_OPEN_DECISIONS.md` win. Visual values here are superseded by V8.

#### 10. Social Planner [social/*] (light version, as allowed)
Calendar (posts coloured by channel), Posts, Queue, Approvals, Channels (Connect disabled until provider review). Composer drawer: channels, text, media from Drive (reference), per-channel preview, date/time, Submit for review / Save draft. Banner: nothing publishes until channels are connected and approved.

---
#### Social Planner (campaigns [addition], light version [existing])
- **Campaigns:** name, goal, dates, channels, owner, optional client or internal, optional link to funnel/offer. Status Draft > Planned > Active > Paused > Completed > Archived. Campaign page: posts list, calendar, progress counts (drafted / in review / scheduled / published / failed).
- **Posts:** in a campaign or stand-alone; add, duplicate, reorder, bulk-add; per-channel variants and preview; media by reference from Drive; time zone shown (team in Pakistan, clients abroad).
- **States:** Draft > In review > Approved > Scheduled > Publishing > Published, plus Failed (reason, retry) and Cancelled. Review uses Approvals v2.
- **Channels:** capability table per platform (text limit, media types, scheduling support). Connect disabled until provider review and owner approval.
- **Manual path:** "Mark as posted manually", labelled as the person's own confirmation, never as published by us.
- **Not in this round:** analytics, auto-publish, evergreen recycling.
- Workflows: plan a campaign, write posts, send for review, approve, schedule (record only), mark posted. Screens: calendar, posts, queue, approvals, channels, campaigns, campaign page, composer drawer. States: empty, loading, error, no-access, Connect disabled banner. Relationships: Approvals, Drive (media), Clients, Office > Funnels (offer link). Permissions: `social.*` (view/create/edit/review/delete owner-only), client scope. Dependencies: migration 0026.
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
