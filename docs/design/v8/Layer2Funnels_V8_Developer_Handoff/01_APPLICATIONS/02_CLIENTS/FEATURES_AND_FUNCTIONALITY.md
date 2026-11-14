# Clients · features and functionality

Status marks: **[E]** existing, keep · **[R]** redesigned (same function, new design) · **[N]** new, build it · **[F]** future, do not build (show "Later" only where stated). Functions are unchanged from v7; V8 changes only the visual design (section 3).

## 1. Change register for this app (what the repo does not have yet)

- [R] **All clients** with Table (default), Grid, Pipeline views. No separate Pipeline menu.
- [R] Statuses Lead, Proposal, Active, Paused, Past, **Lost** (asks for a reason).
- [N] Work › Brand Base shows the **submitted form answers**.
- [N] Work › Strategy **workspace**: client Customer Avatar (upload Word/PDF or create), Offers, Brand Kits, Funnel Strategy, custom sections. Separate client records, not links to Office files.
- [N] Work › **Copy** (sales copy library by asset with versions + approval), Build = progress only (built in GHL/ClickFunnels), Marketing = sections.
- [N] Custom **client sections** (tabs) per client and as defaults (Settings).
- [R] Requests & Approvals with a **request detail page** (conversation, actions, history). [N] SOP creation with auto-coloured document icons.

## 2. Full functional brief (authoritative, carried over from v7 unchanged except the Funnel Mapper rename)

### Clients · implementation brief

Repo: `apps/web/js/modules/clients.js` (≈30 % built: statuses Lead/Proposal/Active/Paused/Past, Table/Grid/Pipeline, client tabs Overview/Work/Requests & Approvals/Documents/Team Notes, stages Brand Base/Strategy/Copy/Build/Marketing, "Start a copy" from Library records, requests with versions, SOPs, Tools, Settings › Stages, client sharing, portal preview, form builder). Keep all of it; apply the design and add [N]. Prototype `clients6.js`, routes `#/clients/...`.

#### Navigation [R]
All clients · Requests & Approvals (new-replies count) · SOPs · Tools · Settings. **No separate Pipeline menu.**

#### Pages
| Page | Status | Spec |
|---|---|---|
| All clients | [R] | Title + hint. Toolbar: search, Open / Past and lost / All, stage filter, view switch **Table (default) · Grid · Pipeline**. Remember the user's last view per device, but first visit = Table. Table: client (initial tile, **name 14.5 px**, business), status pill, stage, lead, next action + due, value. Grid: cards with stage segments. **Pipeline**: columns **Lead, Proposal, Active, Paused, Past, Lost** with count and value; drag cards between columns (non-drag: right-click "Move to…", status select on the client page); moving to Lost asks a reason (Price / Chose another provider or an AI tool / Timing / No reply). |
| Client › Overview | [R] | Header: tile, name 28 px, business, lead, status, stage; Client sharing, Preview portal, ⋯. Tabs: Overview · Work · Requests & Approvals (count) · Documents · Team Notes · **custom sections** · "+ Section". Overview: stage bar (Done/In progress/Upcoming), Next action card, Timeline (client vs team events, log a call/note), details (status select, value, lead, contact, linked projects, linked funnels in Funnel Mapper), portal card. |
| Work › stage | [R] | Stage bar (clickable). Each stage can hold custom sections (Settings › Stages › "Steps & sections"). |
| Work › Brand Base | **[N]** | Shows the **submitted Brand Base form answers** grouped by form section (About the business, Audience, Brand voice, Files…), with "Submitted <date> by <contact>", Edit (team copy; original kept in history), Add a form, Ask for more info. Source: Forms responses linked to the client. |
| Work › Strategy | **[N]** | Workspace cards: **Customer Avatar** (client avatars: upload Word/PDF → same import as Office, or create; keeps the uploaded original), **Offers & Products** (same New offer page as Office, scoped to the client), **Brand Kits** (same as Office, scoped), **Funnel Strategy** (same document editor and default template as Office, client copy), + **Add a section** (e.g. Lead magnets). These are **client-owned records** (`client_id` set), never links to Office records. "Start a copy" from the Library stays available. |
| Work › Copy | **[N]** | Sales copy library grouped by asset (Quiz & results pages, Emails, Ads, Scripts, + Add group). Row: document icon (auto colour), name, version, status (Draft / Internal review / Sent for approval / Approved), "Send for approval" (creates an Approval request with that version). New copy (Drive doc in the client's scope), Upload (Word/PDF/Google Doc link). |
| Work › Build | [R] | Progress only: notice "built in the client's ClickFunnels or GoHighLevel", progress %, status, platform, owner, staging link, next step, build checklist, Update progress. |
| Work › Marketing | [R] | Placeholder with "Add a section". |
| Requests & Approvals | [R] | List: title (new-reply dot), client, kind (Request/Approval), status (Draft, Sent, Waiting, Responded, Approved, Changes requested, Withdrawn), stage, updated. Filters. Locked-portal notice. |
| Request detail | **[N]** page | Conversation (team message with attached version, client reply, composer "Reply to <name>" or "Internal note instead"), details, actions (Mark approved [logged as on behalf], Create revision, Send reminder, Withdraw, Make a task), history. Client replies trigger notifications (02 §6). |
| Documents | [R] | Stage folders + custom folders, upload, whiteboards; per file "Shown to client" toggle; client files are never in the shared Library. |
| Team Notes | [E] | Internal only, pinned notes. |
| SOPs | [R]+[N] | Grid of SOP documents; **New SOP** dialog (name, type Process/Stage SOP) creates a Drive doc in SOPs; **document icon colour assigned automatically** cycling 8 colours (`.docic`). |
| Tools | [E] | Forms, Value Ladder, Social Planner, Whiteboard. |
| Settings | [R]+[N] | Tabs: Delivery stages (rename, reorder, add, remove-if-empty, steps & sections per stage, client sees), Statuses, Brand Base form (opens Forms builder), **Client sections** (default extra tabs), Notifications (client replies, approvals, uploads, form submitted, idle 7 days). |

#### Shared client record
Clients is the source of truth for client identity and the Client service used by Funnel Mapper and Projects (`03_PERMISSIONS…` §3). Build the service in this app's phase: list/search/create/update/archive, duplicate detection by email + name, org scoping, audit.

#### Acceptance
- Default view Table; Pipeline available; Lost asks reason.
- Brand Base answers visible under Work after a real form submission.
- Client offer/brand kit/strategy created in a client do not appear in Office lists and vice versa.
- New SOP gets a coloured document icon automatically.
- A client created via the service from Funnel Mapper appears in All clients without refresh issues; duplicate email offers linking.


## 3. What V8 changes visually (no functional change)

- Stage bar: one connected stepper on a single baseline (done = action colour, current = brand colour, current page = tinted).
- Checklists stack vertically (v7 jammed items on one line).
- Facts list (right column) 15 px values, 14 px labels.
- Status shown as word + dot on neutral ground.
