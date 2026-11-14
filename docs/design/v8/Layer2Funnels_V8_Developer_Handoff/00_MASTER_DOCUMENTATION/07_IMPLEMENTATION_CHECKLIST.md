# 07 · Implementation checklist

Tick each item in the app report. Page items link to the page entry in the app docs. Generated from the V8 crawl, so it matches the prototype exactly.

## Global shell, Launcher and Profile (P00)

**Pages**

- [ ] Launcher — `#/launcher` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Your profile (global) — `#/profile` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Sign in screens — `#/auth` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Shared states — `#/states` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Design system — `#/system` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Tabish Riaz — `#/profile/about` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Tabish Riaz — `#/profile/account` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Tabish Riaz — `#/profile/notifications` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Tabish Riaz — `#/profile/appearance` (desktop, tablet, phone; light/dark; both orgs)

**Dialogs**

- [ ] Decline this invitation?
- [ ] How search works
- [ ] More

**Flows (end-to-end tests)**

- [ ] Start the day
- [ ] Switch organization without losing place
- [ ] Find anything
- [ ] Act on a notification
- [ ] Edit my profile

**Acceptance:** every item in `IMPLEMENTATION_NOTES.md` › Acceptance

## Office (P01)

**Pages**

- [ ] Home — `#/office/home` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Funnels overview — `#/office/funnels` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Customer Avatars (list) — `#/office/avatars` (desktop, tablet, phone; light/dark; both orgs)
- [ ] New avatar: import or blank, choose 3D look — `#/office/avatar-new` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Avatar profile — `#/office/avatar/john` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Avatar full profile — `#/office/avatar/john/deep` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Avatar: edit chapters — `#/office/avatar/john/edit` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Avatar: use it — `#/office/avatar/john/use` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Avatar: evidence — `#/office/avatar/john/evidence` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Offers & Products — `#/office/offers` (desktop, tablet, phone; light/dark; both orgs)
- [ ] New offer — `#/office/offer-new` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Stories — `#/office/stories` (desktop, tablet, phone; light/dark; both orgs)
- [ ] New story — `#/office/story-new` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Brand Kits (many) — `#/office/brandkits` (desktop, tablet, phone; light/dark; both orgs)
- [ ] New brand kit — `#/office/brandkit-new` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Brand kit — `#/office/brandkit/l2f` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Funnel Strategies — `#/office/strategies` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Default strategy template — `#/office/strategy-template` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Strategy document — `#/office/strategy/s1` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Documents with sections — `#/office/documents` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Team — `#/office/team` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Member — `#/office/member/SN` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Apps — `#/office/apps` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Admin: people — `#/office/admin/people` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Person: relationships + app/feature access — `#/office/admin/person/SN` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Teammate access — `#/office/admin/teammates` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Client access (owner only) — `#/office/admin/clients` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Roles — `#/office/admin/roles` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Access review — `#/office/admin/review` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Storage & version rules — `#/office/admin/storage` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Organization branding — `#/office/admin/branding` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Audit log — `#/office/admin/audit` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Projects — `#/office/projects` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Admin — `#/office/admin` (desktop, tablet, phone; light/dark; both orgs)
- [ ] New funnel strategy — `#/office/strategy/new` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Layer2Funnels — `#/office/brandkit` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Funnel Done-For-You — `#/office/offer/dfy` (desktop, tablet, phone; light/dark; both orgs)
- [ ] John — `#/office/avatar/john/profile` (desktop, tablet, phone; light/dark; both orgs)
- [ ] market — `#/office/avatar/john/edit/market` (desktop, tablet, phone; light/dark; both orgs)

**Sidebar menu items**

- [ ] Home → `office/home`
- [ ] Projects → `office/projects`
- [ ] Funnels → `office/funnels`
- [ ] Documents → `office/documents`
- [ ] Team → `office/team`
- [ ] Apps → `office/apps`
- [ ] Admin → `office/admin`
- [ ] Overview → `office/funnels`
- [ ] Customer Avatars → `office/avatars`
- [ ] Offers & Products → `office/offers`
- [ ] Stories → `office/stories`
- [ ] Brand Kits → `office/brandkits`
- [ ] Funnel Strategies → `office/strategies`

**Dialogs**

- [ ] Add a chapter or section
- [ ] Add a relationship
- [ ] Invite someone
- [ ] New customer avatar
- [ ] New document section
- [ ] Profile photo

**Flows (end-to-end tests)**

- [ ] Work through my day
- [ ] Create a customer avatar from a document
- [ ] Edit an avatar chapter
- [ ] Create an offer / story / brand kit
- [ ] Change the default strategy template
- [ ] Give a teammate access to an app feature
- [ ] Set which apps clients can use

**Acceptance:** every item in `IMPLEMENTATION_NOTES.md` › Acceptance

## Clients (P02)

**Pages**

- [ ] All clients (table · grid · pipeline) — `#/clients/list` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Client overview — `#/clients/c/hk/Overview` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Work › Brand Base (submitted answers) — `#/clients/c/hk/Work/0` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Work › Strategy workspace — `#/clients/c/hk/Work/1` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Strategy › Customer Avatar — `#/clients/c/hk/Work/1/avatar` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Strategy › Offers — `#/clients/c/hk/Work/1/offers` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Strategy › Brand Kits — `#/clients/c/hk/Work/1/brand` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Work › Copy — `#/clients/c/hk/Work/2` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Work › Build — `#/clients/c/hk/Work/3` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Documents — `#/clients/c/hk/Documents` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Requests & Approvals — `#/clients/requests` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Request detail — `#/clients/r/r3` (desktop, tablet, phone; light/dark; both orgs)
- [ ] SOPs — `#/clients/sops` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Settings — `#/clients/settings/stages` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Harry Kaye PT — `#/clients/c/hk/requests` (desktop, tablet, phone; light/dark; both orgs)
- [ ] All clients — `#/clients/pipeline` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Tools — `#/clients/tools` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Settings — `#/clients/settings` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Harry Kaye PT — `#/clients/c/hk/Work` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Harry Kaye PT — `#/clients/c/hk/Requests & Approvals` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Harry Kaye PT — `#/clients/c/hk/Team Notes` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Harry Kaye PT — `#/clients/c/hk/Work/4` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Harry Kaye PT — `#/clients/c/hk/Work/1/strategy` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Harry Kaye PT — `#/clients/c/hk/Documents/Brand Base` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Harry Kaye PT — `#/clients/c/hk/Documents/Strategy` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Harry Kaye PT — `#/clients/c/hk/Documents/Copy` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Harry Kaye PT — `#/clients/c/hk/Documents/Build` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Harry Kaye PT — `#/clients/c/hk/Documents/Marketing` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Harry Kaye PT — `#/clients/c/hk/Documents/Contracts` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Settings — `#/clients/settings/statuses` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Settings — `#/clients/settings/brandbase` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Settings — `#/clients/settings/sections` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Settings — `#/clients/settings/notify` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Harry Kaye PT — `#/clients/c/hk/overview` (desktop, tablet, phone; light/dark; both orgs)

**Sidebar menu items**

- [ ] All clients → `clients/list`
- [ ] Requests & Approvals 3 → `clients/requests`
- [ ] SOPs → `clients/sops`
- [ ] Tools → `clients/tools`
- [ ] Settings → `clients/settings`
- [ ] Requests & Approvals 2 → `clients/requests`
- [ ] Requests & Approvals 1 → `clients/requests`
- [ ] Requests & Approvals → `clients/requests`

**Dialogs**

- [ ] Add a section
- [ ] Add to Strategy
- [ ] New SOP
- [ ] New client
- [ ] New folder
- [ ] New request
- [ ] Why was ${c.n} lost?

**Flows (end-to-end tests)**

- [ ] Add and qualify a client
- [ ] Deliver through the stages
- [ ] Ask a client to approve copy
- [ ] Create an SOP
- [ ] Preview what the client sees

**Acceptance:** every item in `IMPLEMENTATION_NOTES.md` › Acceptance

## Projects (P03)

**Pages**

- [ ] Home — `#/projects/home` (desktop, tablet, phone; light/dark; both orgs)
- [ ] My Work — `#/projects/mywork` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Workload — `#/projects/workload` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Portfolio — `#/projects/portfolio` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Files (new) — `#/projects/files` (desktop, tablet, phone; light/dark; both orgs)
- [ ] All projects — `#/projects/all` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Trash — `#/projects/trash` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Overview — `#/projects/p/p1/overview` (desktop, tablet, phone; light/dark; both orgs)
- [ ] List — `#/projects/p/p1/list` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Board — `#/projects/p/p1/board` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Calendar — `#/projects/p/p1/calendar` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Timeline — `#/projects/p/p1/timeline` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Report — `#/projects/p/p1/report` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Docs & links — `#/projects/p/p1/docs` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Collection — `#/projects/p/p1/collection` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Archived project — `#/projects/p/p5/overview` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Mindful Money course launch — `#/projects/p/p2/files` (desktop, tablet, phone; light/dark; both orgs)

**Sidebar menu items**

- [ ] Home → `projects/home`
- [ ] My Work 7 → `projects/mywork`
- [ ] Workload → `projects/workload`
- [ ] Portfolio → `projects/portfolio`
- [ ] Files → `projects/files`
- [ ] All projects → `projects/all`
- [ ] Harry Kaye quiz funnel 8 → `projects/p/:project/list`
- [ ] Mindful Money course launch 5 → `projects/p/:project/list`
- [ ] L2F website refresh 5 → `projects/p/:project/list`
- [ ] Funnel Done Right Challenge 5 → `projects/p/:project/list`
- [ ] My learning plan 1 → `projects/p/:project/list`

**Dialogs**

- [ ] Add a view
- [ ] Add link or embed
- [ ] Add section
- [ ] Add task
- [ ] Assignees
- [ ] Delete forever?
- [ ] Edit project
- [ ] Fields
- [ ] Keyboard shortcuts
- [ ] Log time
- [ ] New in this project
- [ ] New project
- [ ] Project members
- [ ] Quick add

**Flows (end-to-end tests)**

- [ ] Create a project
- [ ] Plan and run tasks in List
- [ ] Track time
- [ ] Check my work and workload
- [ ] Find a file attached anywhere
- [ ] Archive / trash / restore

**Acceptance:** every item in `IMPLEMENTATION_NOTES.md` › Acceptance

## Tasks (P04)

**Pages**

- [ ] Today — `#/tasks/today` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Upcoming — `#/tasks/upcoming` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Inbox — `#/tasks/inbox` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Teammates — `#/tasks/teammates` (desktop, tablet, phone; light/dark; both orgs)
- [ ] My tasks (blocks, show completed) — `#/tasks/list/mine` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Team list with access — `#/tasks/list/team` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Ayesha Raza — `#/tasks/teammates/AR` (desktop, tablet, phone; light/dark; both orgs)

**Sidebar menu items**

- [ ] Today 4 → `tasks/today`
- [ ] Upcoming → `tasks/upcoming`
- [ ] Inbox 2 → `tasks/inbox`
- [ ] Teammates → `tasks/teammates`
- [ ] My tasks 4 → `tasks/list/:list`
- [ ] Funnel Challenge 3 → `tasks/list/:list`
- [ ] Build team 2 → `tasks/list/:list`
- [ ] Content ideas 3 → `tasks/list/:list`

**Dialogs**

- [ ] Add a task
- [ ] Assign people
- [ ] New list or folder
- [ ] Who can open “${TL[k].n}”

**Flows (end-to-end tests)**

- [ ] Capture and finish today's tasks
- [ ] Run a team list
- [ ] Give a task to a teammate
- [ ] Time a task
- [ ] Send a task to a project

**Acceptance:** every item in `IMPLEMENTATION_NOTES.md` › Acceptance

## Drive and editors (P05)

**Pages**

- [ ] Home — `#/drive/home` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Library — `#/drive/mydrive` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Personal — `#/drive/personal` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Docs editor — `#/drive/edit/doc/sop` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Sheets editor — `#/drive/edit/sheet/cal` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Slides editor — `#/drive/edit/slides/deck` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Image editor — `#/drive/edit/image/hero` (desktop, tablet, phone; light/dark; both orgs)
- [ ] PDF editor — `#/drive/edit/pdf/prop` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Delivery My Drive Delivery — `#/drive/f/delivery` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Recent — `#/drive/recent` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Starred — `#/drive/starred` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Shared with me — `#/drive/shared` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Trash — `#/drive/trash` (desktop, tablet, phone; light/dark; both orgs)

**Sidebar menu items**

- [ ] Home → `drive/home`
- [ ] Library → `drive/mydrive`
- [ ] Personal → `drive/personal`
- [ ] Recent → `drive/recent`
- [ ] Starred → `drive/starred`
- [ ] Shared with me 3 → `drive/shared`
- [ ] Trash → `drive/trash`

**Dialogs**

- [ ] Create new
- [ ] Move ${DRV.sel.size} item${DRV.sel.size>1?'s':''} to Trash?
- [ ] Move to ${v}?
- [ ] Reset to original?

**Flows (end-to-end tests)**

- [ ] Find and open a file
- [ ] Move a file between Library and Personal
- [ ] Write a document
- [ ] Edit an image or PDF and undo everything
- [ ] Select several files

**Acceptance:** every item in `IMPLEMENTATION_NOTES.md` › Acceptance

## Planner (P06)

**Pages**

- [ ] Home — `#/planner/home` (desktop, tablet, phone; light/dark; both orgs)
- [ ] My work — `#/planner/mywork` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Plans — `#/planner/plans` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Plan: Planner view — `#/planner/plan/map` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Plan: Timeline — `#/planner/plan/timeline` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Plan: Reviews — `#/planner/plan/reviews` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Plan: Settings — `#/planner/plan/settings` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Alignment — `#/planner/alignment` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Reports — `#/planner/reports` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Strategy map (redesigned) — `#/planner/model/map` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Objective kinds — `#/planner/model/kinds` (desktop, tablet, phone; light/dark; both orgs)
- [ ] KPI types — `#/planner/model/kpi` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Focus areas — `#/planner/model/fa` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Time horizons — `#/planner/model/horizons` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Templates — `#/planner/model/tpl` (desktop, tablet, phone; light/dark; both orgs)
- [ ] First 1000 Followers on Facebook — `#/planner/plan/p1/builder` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Strategy model — `#/planner/model` (desktop, tablet, phone; light/dark; both orgs)

**Sidebar menu items**

- [ ] Home → `planner/home`
- [ ] My work → `planner/mywork`
- [ ] Plans → `planner/plans`
- [ ] Alignment → `planner/alignment`
- [ ] Reports → `planner/reports`
- [ ] Strategy model → `planner/model`

**Dialogs**

- [ ] Add KPI
- [ ] Focus area
- [ ] New objective
- [ ] New strategy
- [ ] Plan
- [ ] Record reading
- [ ] Turn into work

**Flows (end-to-end tests)**

- [ ] Review plan health
- [ ] Add and update an objective
- [ ] Build a strategy
- [ ] Turn a plan into a project
- [ ] Run a review

**Acceptance:** every item in `IMPLEMENTATION_NOTES.md` › Acceptance

## Funnel Mapper (P07)

**Pages**

- [ ] Home — `#/fmp/home` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Clients — `#/fmp/clients` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Client — `#/fmp/client/sc` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Funnels — `#/fmp/funnels` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Editor — `#/fmp/funnel/pt` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Reports — `#/fmp/funnel/pt/reports` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Templates — `#/fmp/templates` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Trash — `#/fmp/trash` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Settings — `#/fmp/settings` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Help & shortcuts — `#/fmp/help` (desktop, tablet, phone; light/dark; both orgs)

**Sidebar menu items**

- [ ] Home → `fmp/home`
- [ ] Clients 4 → `fmp/clients`
- [ ] Funnels 6 → `fmp/funnels`
- [ ] Templates → `fmp/templates`
- [ ] Trash 3 → `fmp/trash`
- [ ] Sam Carter → `fmp/client/:client`
- [ ] Priya Nair → `fmp/client/:client`
- [ ] Marcus Lee → `fmp/client/:client`
- [ ] Settings → `fmp/settings`
- [ ] Help & shortcuts ? → `fmp/help`

**Dialogs**

- [ ] New client
- [ ] New funnel
- [ ] Share funnel

**Flows (end-to-end tests)**

- [ ] Map a funnel for a client
- [ ] Create a client once, everywhere
- [ ] Share a funnel

**Acceptance:** every item in `IMPLEMENTATION_NOTES.md` › Acceptance

## Client Portal (P08)

**Pages**

- [ ] Home — `#/portal/home` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Requests — `#/portal/requests` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Approvals — `#/portal/approvals` (desktop, tablet, phone; light/dark; both orgs)
- [ ] My notes — `#/portal/notes` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Untitled note — `#/portal/note/new` (desktop, tablet, phone; light/dark; both orgs)

**Dialogs**

- [ ] Request changes

**Flows (end-to-end tests)**

- [ ] Client approves a version
- [ ] Client answers a request
- [ ] Team previews the portal

**Acceptance:** every item in `IMPLEMENTATION_NOTES.md` › Acceptance

## Whiteboard (P09)

**Pages**

- [ ] Boards and folders — `#/whiteboard/home` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Folder — `#/whiteboard/folder/f1` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Full-page board — `#/whiteboard/board/b1` (desktop, tablet, phone; light/dark; both orgs)
- [ ] All boards — `#/whiteboard/starred` (desktop, tablet, phone; light/dark; both orgs)
- [ ] All boards — `#/whiteboard/tpl` (desktop, tablet, phone; light/dark; both orgs)

**Sidebar menu items**

- [ ] All boards → `whiteboard/home`
- [ ] Starred → `whiteboard/starred`
- [ ] Templates → `whiteboard/tpl`
- [ ] Harry Kaye PT 2 → `whiteboard/folder/:id`
- [ ] Funnel Challenge 3 → `whiteboard/folder/:id`
- [ ] Team retros 1 → `whiteboard/folder/:id`

**Dialogs**

- [ ] New folder

**Flows (end-to-end tests)**

- [ ] Start a board from a template
- [ ] Organize boards in folders

**Acceptance:** every item in `IMPLEMENTATION_NOTES.md` › Acceptance

## Forms (P10)

**Pages**

- [ ] Forms — `#/forms/list` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Builder — `#/forms/b/quiz` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Responses — `#/forms/subs` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Templates — `#/forms/tpl` (desktop, tablet, phone; light/dark; both orgs)

**Sidebar menu items**

- [ ] Forms → `forms/list`
- [ ] Responses 3 → `forms/subs`
- [ ] Templates → `forms/tpl`

**Dialogs**

- [ ] Leave without saving?
- [ ] Publish form

**Flows (end-to-end tests)**

- [ ] Build and publish a form
- [ ] Read responses

**Acceptance:** every item in `IMPLEMENTATION_NOTES.md` › Acceptance

## Value Ladder (P11)

**Pages**

- [ ] Ladders — `#/ladder/list` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Ladder — `#/ladder/map/hk` (desktop, tablet, phone; light/dark; both orgs)
- [ ] History — `#/ladder/history` (desktop, tablet, phone; light/dark; both orgs)

**Sidebar menu items**

- [ ] Ladders → `ladder/list`
- [ ] History → `ladder/history`

**Dialogs**

- [ ] Leave without saving?
- [ ] Publish form

**Flows (end-to-end tests)**

- [ ] Model a ladder

**Acceptance:** every item in `IMPLEMENTATION_NOTES.md` › Acceptance

## Social Planner (P12)

**Pages**

- [ ] Calendar — `#/social/calendar` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Pipeline — `#/social/board` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Approvals — `#/social/approvals` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Posts — `#/social/posts` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Campaigns — `#/social/campaigns` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Queue — `#/social/queue` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Channels — `#/social/channels` (desktop, tablet, phone; light/dark; both orgs)

**Sidebar menu items**

- [ ] Calendar → `social/calendar`
- [ ] Pipeline → `social/board`
- [ ] Posts → `social/posts`
- [ ] Campaigns → `social/campaigns`
- [ ] Queue → `social/queue`
- [ ] Approvals 1 → `social/approvals`
- [ ] Channels → `social/channels`

**Dialogs**

- [ ] Leave without saving?
- [ ] Publish form

**Flows (end-to-end tests)**

- [ ] Plan and approve a post

**Acceptance:** every item in `IMPLEMENTATION_NOTES.md` › Acceptance

## Layer 2 Agents (P13)

**Pages**

- [ ] Agents — `#/agents/home` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Meeting Intelligence — `#/agents/meeting/new` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Ask — `#/agents/ask` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Meeting Intelligence — `#/agents/meetings` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Access & settings — `#/agents/settings` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Weekly team call — `#/agents/meeting/m1` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Weekly team call — `#/agents/meeting/m1/notes` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Weekly team call — `#/agents/meeting/m1/transcript` (desktop, tablet, phone; light/dark; both orgs)
- [ ] Weekly team call — `#/agents/meeting/m1/actions` (desktop, tablet, phone; light/dark; both orgs)

**Sidebar menu items**

- [ ] Agents → `agents/home`
- [ ] Meeting Intelligence → `agents/meetings`
- [ ] Ask → `agents/ask`
- [ ] Access & settings → `agents/settings`

**Flows (end-to-end tests)**

- [ ] Record a meeting (preview)
- [ ] Ask about my records (preview)

**Acceptance:** every item in `IMPLEMENTATION_NOTES.md` › Acceptance

## Cross-cutting

- [ ] Every navigation element is a real link (Ctrl/middle-click open new tabs)
- [ ] Search returns only permitted items (two users × two orgs test)
- [ ] Notifications badge counts correct per org
- [ ] Org switch keeps the current page; no data crosses orgs
- [ ] Every page: loading, empty, no results, error (≤10 s), permission denied, read-only, archived, offline, conflict
- [ ] No text < 12 px (except initials/badges); right panels per 01 §5
- [ ] No horizontal page scroll at 390, 834, 1366, 1440 px
- [ ] Touch targets ≥44 px on touch devices
- [ ] Light and dark; L2F and Aurj tokens
- [ ] Keyboard: focus visible, all actions reachable, Escape closes overlays
- [ ] No "Funnel Mapper Pro" in any UI string (grep test)
- [ ] No component class shared across apps unless it is a shared component (prevents v7 bugs)
