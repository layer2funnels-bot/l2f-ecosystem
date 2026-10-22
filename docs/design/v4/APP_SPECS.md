# App specs v4 (design, awaiting owner approval)

Read with `DESIGN_SYSTEM.md`. Every screen below exists in `ecosystem-v4.html`; open it and use the bottom-right **Prototype** button to switch organization, theme, Launcher time and weather. Routes in brackets are prototype routes (`nav('office/home')`). Product specs (`01_office…11_layer2_agents`) and the corrected `.md` files remain the source of truth for behaviour; this file is the source of truth for look and layout.

Planner is not designed in this round (owner request). Layer 2 Agents stays "coming later". Funnel Mapper Pro stays its own app.

## 1. Launcher [launcher]
- Sky follows local time: morning (5–12) sunrise, afternoon (12–17) bright sky, evening (17–21) sunset, night (21–5) stars and moon. Greeting matches ("Working late" at night).
- Weather tints the same sky, no weather panel: clear, cloudy (drifting clouds), rain (falling streaks, cooler tint), hot (heat haze, warm tint), cold (snow, icy tint). A small chip shows "Light rain · 16° · your location".
- Location: browser geolocation with permission; if denied, time-of-day only. Weather source must be $0: recommend MET Norway Locationforecast (free incl. commercial use, attribution, needs a User-Agent; call it from the server and cache 30 min). Users can turn weather off in their profile.
- Apps sit on a frosted glass shelf (keeps contrast on any sky), grouped Everyday / Studio. "Find an app" (`/` focuses, Enter opens first match). Tiles: Locked, Soon, Not here, Next round states open explanation dialogs. Opening an app zooms it out of its icon.
- App switcher in every app: grid button → Back to Launcher + all apps.

## 2. Office [office/*]
Menu: Home, Planner, Projects, Funnels (Funnels home, Customer Avatars, Offers & Products, Stories, Brand Kit, Funnel Strategies), Documents, Team, Apps, Admin. Funnels is part of Office, not a separate app.
- Home (per corrected 04): Coming-up notice, focus numbers, Needs your attention, My work (tap circle = done), Deadlines (week strip + list), Recent updates ("Only from things you can open."), Shortcuts (Planner, Projects, Funnels, Documents), For owners and admins.
- Planner: placeholder state until designed.
- Projects: org project cards that open the Projects app (no duplicate project system).
- Funnels home: count tiles, Funnel Strategies summary, recently changed, Funnel Mapper Pro card that says linking is pending (never implies it works).
- Customer Avatar profile [office/avatar/clara]: centre portrait card (illustrated, colour per avatar, role badge, quote, "used in" chips); left specs Who they are (3 stat chips), Goals, Pains; right Motivations, Objections, Language they use (quote chips), Buying triggers; connector lines on desktop. Below: Evidence (Validated vs Assumption tags), Internal notes · never shared, Shared with clients. Header: version, reviewed date/owner, History, Edit. Phone: portrait first, then specs stacked.
- Offers & Products, Stories (with consent status), Brand Kit (singular; colours, fonts, voice do/don't, logo notes).
- Funnel Strategies (per corrected funnels md): list with status and map state; New = name + Blank document / Use template; full-page document editor with outline, formatting, save state, unsaved guard, linked assets (references), Funnel map panel ("No map linked yet", start-mapping action disabled until the link is built), internal notes.
- Documents: approved SOPs (owner protected), folders, opens in Drive. Team: directory + profile drawer showing only permitted work. Apps: Social Planner, Whiteboard, Form Builder, Value Ladder, Funnel Mapper Pro. Admin: Members, Access levels (samples until the catalog arrives), Effective access, Access history.

## 3. Projects [projects/*] (ClickUp structure, Asana calm)
Menu: Home, My Work, Projects, Docs, Whiteboards, Dashboards, AI Assist, App Center. Sidebar lists active projects (favourites starred) with +.
- **Smart search** (header, Ctrl/⌘K): one palette for projects, tasks, docs. Chips: All, Projects, Tasks, Docs, Archived, Assigned to me, Overdue. Understands `is:archived`, `@me`, `overdue`, typos (fuzzy), client names, tags and people. Highlights matches, arrow keys + Enter. Bottom row "Ask AI · Coming later" reserves the AI slot.
- **Archive**: from the project ⋯ menu. Archived projects disappear from the sidebar, lists, Home and dashboards; they appear only in search (badge "Archived"). Opening one shows a read-only banner with Restore.
- Project workspace tabs: Overview, List, Board, Calendar, Timeline, Docs, Whiteboards, Activity. List grouped by status with inline Add task; Board drag-and-drop (tap to change status on phones); Calendar month; Timeline (Gantt) with today line.
- Task drawer: editable title, status, assignee, dates, priority, tags, timer (start/pause/resume, logged time, manual add for authorised roles), description, subtasks, "Suggest with AI" (disabled until approved), attachments, comments + activity.
- My Work grouped Overdue / Today / This week / Later / Done. Dashboards: progress, workload ("for balancing, never for scoring"), overdue, time logged.
- AI-ready and integration-ready: AI Assist page shows the four planned assistants and guardrails, disabled. App Center lists providers with Connect disabled ("needs backend and admin approval"). Build every action through one service layer so the future agent and integrations call the same permission-checked functions.

## 4. Clients [clients/*] (per corrected file-clients.md)
Menu: Clients, Requests & Approvals, SOPs, Tools, Settings (Owner/Admin). Pipeline is a view, not a menu item.
- List: "Everyone you're delivering for." Filters Show (Open default/Closed/Archived/All), Stage, Account lead. Views Table · Grid · Pipeline (phone: stage selector + one column). First-use and no-match empty states. New client dialog (name required, business, contact, email, account lead; "starts in Brand Base, nothing shared").
- Client header: avatar, name, business, lead, status, stage. Actions: Manage client sharing, Edit details, Archive; archived → Restore, Delete permanently (owner, type name to confirm, irreversible warning).
- Tabs: Overview, Work, Requests & Approvals, Documents, Team Notes.
- Overview: journey Signed + 5 stages, Next action card (owner, due, open step), Waiting on the client, Updates for the client (Post update = saved as prepared), Needs attention, Latest decision, Team (roles are labels), Recent activity (team only).
- Work stages: Brand Base (answers by section, Add a form opens the **form builder inside Clients** as an overlay with Save/Cancel/unsaved guard, Request more info, note that Brand Kit lives in Strategy) · Strategy (overview of Customer Avatars, Offers & Products, Stories, one Brand Kit, Funnel Strategy Document; same components as Office › Funnels; banner "client-specific copies, started from Office › Funnels, never synced", awaiting approval) · Copy (versions, internal review, send exact version; flagged: earlier Copy requirements still missing) · Build (progress only + the ClickFunnels/GoHighLevel sentence) · Marketing (placeholder).
- Requests: client tab + cross-client page with Client column. New request: Information request / Approval, title, message, stage, attach existing file or upload any file; saved as prepared. Request drawer: exact version, attachments, internal review vs client approval, history, Review response / Create revision / Prepare reminder (backend) / Cancel.
- Documents: one workspace per client grouped by stage, search, Upload file, visibility Internal only / Shareable with client per file. Never in shared Drive. No Brand Kit card.
- Team Notes: "Team only" notice, add, pin, delete. SOPs: five protected links to Drive. Tools: by access. Settings: stage table, no Build checklist.

## 5. Client Portal [portal/*] (client view, preview ribbon until G2)
- Top navigation: Home, Requests (badge), Files, Messages, My notes. Phone: floating bottom bar.
- Journey road: six milestones Signed → Brand Base → Strategy → Copy → Build → Marketing on a curved road; done = coral/orange 3D pins, current = violet pin that gently bounces with "You are here" (no blue). Rocket progress bar "% of the way to launch".
- Next step card (exact version), approve → confetti + "Your wins" badge unlocks. "High five" to the account lead (hearts). Updates timeline, Your team.
- Requests: approve / request changes on the exact version; info requests with drop zone and answer box. Files with version. Messages threaded per request.
- **My notes**: the client's own private documents (practice, ideas). "Only you can see these"; optional "Share with team" (read only for the team). Every send/approve says "Preview only" until the Portal is live.

## 6. Drive [drive/*]
- Space switcher: current organization or Personal (private; admins can't open it). Big **New** button → Folder, Document, Sheet, Slides, Image, Upload files. "New folder" also in every toolbar.
- Menu: Home, My Drive, Shared with me, Shared drives, Recent, Starred, Trash (30-day restore).
- Folders and files in list or grid, multi-select bar (Share, Download, Move, Delete), star, details drawer with tabs Details / Manage access (people, Viewer/Editor, inherited vs direct, effective access, logged) / Versions (restore as new version). Whole-page drag-and-drop upload with progress toast. Protected SOP folder banner.
- Our own editors (not Google's): **Docs** (toolbar, outline, page, comments), **Sheets** (formula bar, cell refs, SUM/AVERAGE/arithmetic, sheet tabs, Enter moves down), **Slides** (navigator, 16:9 canvas, editable text, speaker notes, Present), **Image** (move, crop, rotate, text, markup, brightness/contrast/saturation, size; saving makes a new version, original kept).

## 7. Form Builder [forms/*]
Forms list, Submissions (export needs backend), Templates. Builder: field palette (11 types), canvas with select / move / duplicate / delete, properties (question, help, required, options, Show-if logic), Build ↔ Preview (phone/desktop frame), Publish dialog (share link, embed, send to client record). The same builder component opens inside Clients.

## 8. Value Ladder [ladder/*]
Ladder list with mini step charts; ladder map as rising 3D steps (lead magnet → front-end → core → upsell → high-ticket), "More value, higher price →". Step drawer: linked offer (reference, never changes the offer), broken-link warning, audience, assumptions, owner. History page.

## 9. Whiteboard [whiteboard/*]
Home: templates, recent boards. Board: dotted infinite canvas, pan (drag empty space / wheel), zoom (buttons, Ctrl+wheel), fit, minimap, frames, draggable sticky notes with editable text, shapes, left tool rail (bottom on phones: select, pan, sticky, text, shape, pen, frame, connector), top bar with save state, undo/redo, presence, comments, Present, Share.

## 10. Social Planner [social/*] (light version, as allowed)
Calendar (posts coloured by channel), Posts, Queue, Approvals, Channels (Connect disabled until provider review). Composer drawer: channels, text, media from Drive (reference), per-channel preview, date/time, Submit for review / Save draft. Banner: nothing publishes until channels are connected and approved.
