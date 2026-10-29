# Layer2Funnels ecosystem: what exists today (for Claude Design)

Written 29 Oct 2026 from the code on branch `claude/quirky-fermi-7vkj1c`. This is the real current product: every app, its menu, its
screens and what a person can do there. Use it to design the next version. Design what is listed here (nothing may disappear) and improve
how it looks and flows. Items marked **Missing** are the gaps the build plan will add next. Design room for them.

Existing design material: `docs/design/v4/DESIGN_SYSTEM.md`, `docs/design/v4/APP_SPECS.md`, `docs/design/v4/ecosystem-v4.html`, the
approved designs `docs/design/01…10`, and the tokens `packages/ui/tokens.json` (light/dark × Layer2Funnels/Aurj themes).

## Rules any design must respect (enforced by the database, not optional)
- **Two organizations, never mixed**: Layer2Funnels and Aurj. One switcher in the header and one active organization. Nothing from one shows in the other.
- **People see only what they may see.** Levels per app: owner, admin, editor, viewer, plus scoped levels such as "Project member", which covers only assigned projects. Being refused looks **exactly like "not found"**, and counts never include hidden items.
- **Archive before delete.** Most records are archived first and can be restored.
- **Clients never see internal work** unless it is explicitly shared. Comments are always internal.
- Every screen needs these states: loading (skeleton), empty, error with retry, no access (same as not found), archived (read-only), offline or saving, session expired, and **rate-limited** ("too many requests, wait a moment").
- Touch targets are at least 44 px. Full keyboard use. Contrast is checked in CI. Reduced motion is respected.

## The shell (around every app)
- **Header**: app grid (switch app) · organization switcher (Layer2Funnels / Aurj, logo plus name) · search box ("Search Layer2Funnels") · **notifications bell** with an unread number · profile menu (Appearance: System, Light or Dark; weather on or off; sign out).
- **Notifications** (bell panel): "assigned to you", "mentioned you", "commented on a task you follow", "finished a task you follow", "is no longer blocked". Each opens the record. Mark one or all as read.
- **Sign-in pages**: sign in · sign up · check your email · forgot password · reset password · accept invitation (the email must match) · no organization yet · session expired.
- **Launcher** (`#/launcher`): a sky that follows the time of day and the local weather. A frosted shelf of app tiles in two groups, **Everyday** (Office, Projects, Clients, Drive, Planner, Client Portal) and **Studio** (Funnel Mapper Pro, Whiteboard, Social Planner, Form Builder, Value Ladder, Layer 2 Agents). "Find an app" (`/` key). Tiles show live, building, coming soon or locked.

## Office (`#/office`): home, team and admin
Left menu: **Home · Planner · Projects · Funnels · Documents · Team · Apps · Admin** (Admin is for owners and admins only).
- **Home**: Needs your attention, deadlines, approvals and reviews assigned to you, recent changes (records, access, files), Approved SOPs, coming up.
- **Funnels** (business records): Funnels home · **Avatars** · **Offers & Products** · **Story bank** · **Brand kits** (list, record, archive, client-visible toggle) · **Funnel Strategies** (list, strategy with a funnel overview). "Open Funnel Mapper Pro" link.
- **Documents**: the organization's documents (Drive-backed).
- **Team**: active members and invitations (invite someone, copy the invitation link, invite again, cancel).
- **Apps**: which apps are turned on. Client Portal stays locked until an owner turns it on.
- **Admin**: **Members** (invite, change role, deactivate) · **Storage** (usage against the 8 GB cap) · **Client access** (invite a client, link to a client record) · **Access**: Levels · Assignments (give a level at organization, client or project scope; deny always wins) · Effective access (what someone can do and *why*) · History.

## Projects (`#/projects`): the most complete app (Asana/ClickUp level)
Left menu: **Projects · My Work · Workload · Portfolio · Search (Ctrl K)** · then the project list grouped as **Client projects** and **<Organization> projects**. Templates appear on Projects home.
- **Projects home**: projects by client and internal, status, due date, progress. "New project" (blank or **from a template**).
- **My Work**: my tasks grouped as overdue, today, this week, later, no date.
- **Workload**: a person × week grid of open tasks and estimated hours against a 40-hour week. "Over 40 h" is flagged, with separate overdue and no-date columns, and it can be narrowed to one project.
- **Portfolio**: every project I can open, with a progress bar, open, overdue and next due date.
- **Project page** header: breadcrumb (Projects / client), name, status chip, Template chip, due date. Actions: **Edit details · Duplicate · Save as template · Archive project**.
  Tabs: **Overview · List · Board · Calendar · Timeline · Report · Rules · Docs · Whiteboards**.
  - *Overview*: open, done and overdue numbers, time logged, deadlines.
  - *List*: toolbar (Find a task, Person, Tag, Group by status, section, person or priority, Sort, Hide done) · **sections** (add, rename, reorder, remove) · quick "Add a task" per group · rows with a check circle, title, tags, person, subtasks done, checklist, files, "Waiting on N", repeat mark, priority chip and due date (red when late) · **select several → bulk bar** (status, priority, assign, due date, section, archive).
  - *Board*: columns by status or by section, drag and drop.
  - *Calendar*: month grid with tasks on their due dates, previous and next month.
  - *Timeline*: bars from start to due date, a fixed width per day, weekly ticks, a Today button, horizontal scroll.
  - *Report*: tiles (open, overdue, blocked, done in 7 and 30 days, estimated work left) · tasks by status (single-colour bars with numbers) · people table (open, overdue, done, estimated left, billable time, other time).
  - *Rules*: each rule reads as a sentence ("**When a task moves to Blocked**, set priority to Urgent."). Pause or turn on, and Remove. "Add a rule": When (a task is added / moves to a status / moves into a section) → Then (assign it to / set priority to / make it due in N days / add the tag).
  - *Docs* and *Whiteboards*: the project's documents and boards (create new, open).
- **Task panel** (drawer): title, status, priority, person, start date, due date, repeat (daily, weekdays, weekly, every 2 weeks, monthly, yearly), estimate (hours), section, tags (add or create), notes, **checklist**, **subtasks**, **waiting on** (other tasks), **files** (attach from Drive or upload), **timer and logged time**, client-visible switch, **comments with @mentions** (picker that narrows as you type; edit and delete your own), **history** (who changed what), **Follow** button. Archive.
- **Missing** (design room needed): custom fields per project, several assignees, saved views shared with the team, custom statuses, duplicating a single task, email notifications, rules with conditions.

## Clients (`#/clients`)
- **List**: views **Grid · Table · Pipeline**. Status filter: **Lead · Proposal · Active · Paused · Past · Archived**. Search clients. "Create client" (name, business, website, email, phone, country, niche, status).
- **Client record** tabs: **Overview · Work · Requests & Approvals · Documents · Team Notes**.
  - Overview: details, stage steps (the client's journey).
  - Work: the client's projects (links into Projects).
  - Requests & Approvals: create a request ("What do you need?", details, due date) and follow approvals.
  - Documents: client files and brand kit; "Start copy" from a library record (start from, what to copy).
  - Team Notes: internal notes ("New note").
  - Link: preview what the client would see in the Portal.
- Archive a client (staff cannot delete).
- **Missing**: comments, mentions and history on clients (the shared services exist and only need connecting), a client activity timeline, tasks from requests, contacts per client, email logging.

## Drive (`#/drive`) and the editors
- Spaces: **Shared** (the organization's) and **Personal**. Views: **Files** (folders), **Recent**, **Trash**.
- Actions: upload, new folder, rename, **Move to** (folder picker), Details, Move to Trash, restore, **Delete for good** (from Trash), search files, multi-select.
- Files can belong to a client or project ("Where this lives"). Storage cap shown in Admin.
- **Docs editor** (`#/doc/<id>`): toolbar (text style: Heading 1–3, quote; bold, italic; bulleted and numbered lists; link; undo, redo), **outline** sidebar, **version history** with restore, autosave with a **conflict dialog** ("Keep editing / Load theirs, discard mine / Save mine as the newest"), read-only and archived states, "Where this document lives".
- **Sheets editor** (`#/sheet/<id>`): cells grid, **formula bar**, several sheets (add, rename, delete), selected-cell indicator.
- **Missing**: file previews (images, PDF), sharing a single file with a person, comments on documents, real-time co-editing, image editor, PDF editor, templates gallery for documents.

## Whiteboard (`#/whiteboards`)
- Boards list with search and a "Show" filter, plus "Where does it belong?" (client or project). Create a board.
- Board (`#/board/<id>`): an Excalidraw canvas (shapes, arrows, text, freehand), saved to Drive with the client or project link.
- **Missing**: templates (flowchart, mind map, funnel), sticky notes as a first-class tool, comments, export to image or PDF.

## Social Planner (`#/social`)
- Three views: **Calendar** (month grid of posts, previous/next month) · **Posts** (list, search, "Show" filter) · **Campaigns**.
- **Campaign** (`#/social/c/<id>`): name, goal, starts and ends, for which client; states Draft → Planned → Active → Paused → Completed; progress (posted out of planned).
- **Post**: title, caption, channel (with that channel's media limit), planned for (date and time), state **Idea → Draft → In review → Approved → Scheduled → Posted** (or Failed with "What went wrong?", or Cancelled), attach media from Drive, **Preview**, "Make drafts" (copies a post as drafts for other channels you pick).
- **Missing**: real publishing to networks (needs approved integrations), approval by the client, best-time hints, analytics.

## Form Builder (`#/forms`)
- List (search, status filter) and **Templates** (`#/forms/templates`). "Create form" (name, belongs to, start from a template).
- **Builder**: questions (short text, long text, email, phone, web address, number, date, dropdown, checkboxes, yes or no, file upload with accepted types), **conditions** ("Show this question when…"), description, confirmation message, redirect after submit, privacy and retention note. **Preview**. **Publish / Unpublish**, **Create public link**, versions ("Save as new version", restore), duplicate, archive.
- **Answers**: search the answers and "Record a submission" by hand.
- **Missing**: a submission creating a task or a client (Forms → Projects/Clients), notifications on new answers, a results summary with charts, payments.

## Value Ladder (`#/ladder`)
- List of ladders (search, show filter). Create (name, audience, for which client, currency).
- **Ladder** (`#/ladder/l/<id>`): **steps from free to premium** (step name, step type, price, linked offer from Offers & Products, "Converts (%)"), reorder (earlier or later), remove a step. Assumptions and notes. **Versions** ("Save version" with a note), duplicate, archive. Price totals per currency (currencies never mixed).
- **Missing**: a visual ladder or funnel diagram, a link to Funnel Mapper Pro forecasts.

## Planner (`#/planner`): strategy, goals and KPIs (React, inside the shell)
Menu: **Home · My work · Plans · Alignment · Reports · Strategy model**. Pages: Overview, Plans, Goals, **My goals**, **Metrics** (KPIs),
**Reviews** (check-ins), **Strategy map**, **Strategy builder**, **Templates**, Plan settings.
- The owner says it is good but **laggy, with errors and pages that sometimes do not load**. A speed and reliability pass is planned. The design should keep its structure and make loading states calmer.

## Client Portal (`#/portal`): locked
What a client will see: **Your journey** (milestones), open requests to answer or upload, approvals of an exact version, files, updates.
It stays **off** until its security gate (G2) passes and an owner turns it on. Design it, but show it as "Locked" in staff views.

## Funnel Mapper Pro: leave as is for now
A separate app (`apps/funnel-mapper`) that keeps its own mapping UI. It is not part of this design round.

## Layer 2 Agents: coming later
One tile and one "coming soon" page. No forms and no waitlist.
