# Office · user flows and workflows

Each flow names the prototype route or control. "Source" says where the rule is defined. Cross-app flows: `05_STRATEGY_AND_ARCHITECTURE/CROSS_APP_WORKFLOWS.md`.

## 1. Work through my day

**Who:** Teammate · **Source:** Brief: Home

1. Office Home (#/office/home) → My day (Today / This week / Everything)
2. Tick a row → completes the item in its source app (Projects, Tasks, Planner)
3. Waiting on you → Open → request/approval/doc in its app

## 2. Create a customer avatar from a document

**Who:** Owner/teammate · **Source:** Brief: New avatar

1. Customer Avatars (#/office/avatars) → New avatar (#/office/avatar-new)
2. 1 Start: Import Word/PDF or Start blank → 2 Read the file → 3 Check the sections (map to chapters, confidence) → 4 Choose one of 10 3D looks → 5 Name it → Create (confetti)
3. Lands on Avatar profile (#/office/avatar/:avatar); original file kept as evidence

## 3. Edit an avatar chapter

**Who:** Owner/teammate · **Source:** Brief: Edit mode

1. Avatar profile → Edit, or Full profile chapter pencil
2. Edit mode (#/office/avatar/:avatar/edit/:chapter): chapter list, body editor by type, "Show a summary on the profile"
3. Save → Full profile and short profile both update (one data model)

## 4. Create an offer / story / brand kit

**Who:** Owner/teammate · **Source:** Brief

1. Offers & Products → New offer (#/office/offer-new): 5 numbered sections + live preview → Create offer
2. Stories → New story (#/office/story-new)
3. Brand Kits → New brand kit (#/office/brandkit-new); many kits allowed, one "Main"

## 5. Change the default strategy template

**Who:** Owner/admin · **Source:** Brief

1. Funnel Strategies → Default template (#/office/strategy-template)
2. Reorder/add/remove sections, preview, versions
3. Applies to new strategy documents only

## 6. Give a teammate access to an app feature

**Who:** Owner/admin · **Source:** Brief: Admin; 03 §2

1. Admin › People (#/office/admin/people) → person (#/office/admin/person/:person)
2. App and feature access accordion: app on/off, level, "N features" switches → Save access (or Reset to role)
3. Check access panel confirms; server enforces default deny

## 7. Set which apps clients can use

**Who:** Owner only · **Source:** 03 §2

1. Admin › Client access (#/office/admin/clients)
2. Matrix clients × client apps; Edit defaults
3. Admins see a read-only notice

## Navigation graph (generated from the prototype links)

Page → pages it links to (within and outside the app).

- `office/home` → `clients/c/:client/requests`, `clients/pipeline`, `drive/edit/doc/:file`, `office/admin`, `office/admin/people`, `office/admin/storage`, `office/apps`, `office/documents`, `office/funnels`, `office/member/:person`, `office/projects`, `office/team`, `planner/home`, `planner/plan/:plan/builder`, `projects/p/:project/board`, `projects/p/:project/list`, `projects/p/:project/overview`, `projects/portfolio`, `social/approvals`, `tasks/list/:list`
- `office/funnels` → `fmp/home`, `office/admin`, `office/apps`, `office/avatar/:avatar`, `office/avatars`, `office/brandkit`, `office/brandkits`, `office/documents`, `office/home`, `office/offer/:offer`, `office/offers`, `office/projects`, `office/stories`, `office/strategies`, `office/strategy/:strategy`, `office/strategy/new`, `office/team`
- `office/avatars` → `office/admin`, `office/apps`, `office/avatar-new`, `office/avatar/:avatar`, `office/brandkits`, `office/documents`, `office/funnels`, `office/home`, `office/offers`, `office/projects`, `office/stories`, `office/strategies`, `office/team`
- `office/avatar-new` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/avatars`, `office/home`, `planner/home`, `portal/home`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `office/avatar/:avatar` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/avatar/:avatar/deep`, `office/avatar/:avatar/edit`, `office/avatar/:avatar/evidence`, `office/avatar/:avatar/profile`, `office/avatar/:avatar/use`, `office/avatars`, `office/home`, `planner/home`, `portal/home`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `office/avatar/:avatar/deep` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/avatar/:avatar/edit`, `office/avatar/:avatar/evidence`, `office/avatar/:avatar/profile`, `office/avatar/:avatar/use`, `office/avatars`, `office/home`, `planner/home`, `portal/home`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `office/avatar/:avatar/edit` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/avatar/:avatar`, `office/avatar/:avatar/edit/:chapter`, `office/home`, `planner/home`, `portal/home`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `office/avatar/:avatar/use` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/avatar/:avatar/deep`, `office/avatar/:avatar/edit`, `office/avatar/:avatar/evidence`, `office/avatar/:avatar/profile`, `office/avatars`, `office/home`, `planner/home`, `portal/home`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `office/avatar/:avatar/evidence` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/avatar/:avatar/deep`, `office/avatar/:avatar/edit`, `office/avatar/:avatar/profile`, `office/avatar/:avatar/use`, `office/avatars`, `office/home`, `planner/home`, `portal/home`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `office/offers` → `office/admin`, `office/apps`, `office/avatars`, `office/brandkits`, `office/documents`, `office/funnels`, `office/home`, `office/offer-new`, `office/offer/:offer`, `office/projects`, `office/stories`, `office/strategies`, `office/team`
- `office/offer-new` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/home`, `office/offers`, `planner/home`, `portal/home`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `office/stories` → `office/admin`, `office/apps`, `office/avatars`, `office/brandkits`, `office/documents`, `office/funnels`, `office/home`, `office/offers`, `office/projects`, `office/story-new`, `office/strategies`, `office/team`
- `office/story-new` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/home`, `office/stories`, `planner/home`, `portal/home`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `office/brandkits` → `office/admin`, `office/apps`, `office/avatars`, `office/brandkit-new`, `office/brandkit/:kit`, `office/documents`, `office/funnels`, `office/home`, `office/offers`, `office/projects`, `office/stories`, `office/strategies`, `office/team`
- `office/brandkit-new` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/brandkits`, `office/home`, `planner/home`, `portal/home`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `office/brandkit/:kit` → `office/admin`, `office/apps`, `office/avatars`, `office/brandkit-new`, `office/brandkits`, `office/documents`, `office/funnels`, `office/home`, `office/offers`, `office/projects`, `office/stories`, `office/strategies`, `office/team`
- `office/strategies` → `office/admin`, `office/apps`, `office/avatars`, `office/brandkits`, `office/documents`, `office/funnels`, `office/home`, `office/offers`, `office/projects`, `office/stories`, `office/strategy/:strategy`, `office/strategy/new`, `office/team`
- `office/strategy-template` → `office/admin`, `office/apps`, `office/avatars`, `office/brandkits`, `office/documents`, `office/funnels`, `office/home`, `office/offers`, `office/projects`, `office/stories`, `office/strategies`, `office/team`
- `office/strategy/:strategy` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/home`, `office/strategies`, `planner/home`, `portal/home`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `office/documents` → `drive/edit/doc/:file`, `drive/home`, `office/admin`, `office/apps`, `office/funnels`, `office/home`, `office/projects`, `office/team`
- `office/team` → `office/admin`, `office/admin/people`, `office/apps`, `office/documents`, `office/funnels`, `office/home`, `office/member/:person`, `office/projects`
- `office/member/:person` → `office/admin`, `office/admin/person/:person`, `office/apps`, `office/documents`, `office/funnels`, `office/home`, `office/projects`, `office/team`, `projects/p/:project/list`, `projects/p/:project/overview`
- `office/apps` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `office/admin`, `office/documents`, `office/funnels`, `office/home`, `office/projects`, `office/team`, `planner/home`, `portal/home`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `office/admin/people` → `office/admin`, `office/admin/audit`, `office/admin/branding`, `office/admin/clients`, `office/admin/person/:person`, `office/admin/review`, `office/admin/roles`, `office/admin/storage`, `office/admin/teammates`, `office/apps`, `office/documents`, `office/funnels`, `office/home`, `office/projects`, `office/team`
- `office/admin/person/:person` → `office/admin`, `office/admin/clients`, `office/admin/people`, `office/apps`, `office/documents`, `office/funnels`, `office/home`, `office/projects`, `office/team`
- `office/admin/teammates` → `office/admin`, `office/admin/audit`, `office/admin/branding`, `office/admin/clients`, `office/admin/people`, `office/admin/review`, `office/admin/roles`, `office/admin/storage`, `office/apps`, `office/documents`, `office/funnels`, `office/home`, `office/projects`, `office/team`
- `office/admin/clients` → `office/admin`, `office/admin/audit`, `office/admin/branding`, `office/admin/people`, `office/admin/review`, `office/admin/roles`, `office/admin/storage`, `office/admin/teammates`, `office/apps`, `office/documents`, `office/funnels`, `office/home`, `office/projects`, `office/team`
- `office/admin/roles` → `office/admin`, `office/admin/audit`, `office/admin/branding`, `office/admin/clients`, `office/admin/people`, `office/admin/review`, `office/admin/storage`, `office/admin/teammates`, `office/apps`, `office/documents`, `office/funnels`, `office/home`, `office/projects`, `office/team`
- `office/admin/review` → `office/admin`, `office/admin/audit`, `office/admin/branding`, `office/admin/clients`, `office/admin/people`, `office/admin/roles`, `office/admin/storage`, `office/admin/teammates`, `office/apps`, `office/documents`, `office/funnels`, `office/home`, `office/projects`, `office/team`
- `office/admin/storage` → `office/admin`, `office/admin/audit`, `office/admin/branding`, `office/admin/clients`, `office/admin/people`, `office/admin/review`, `office/admin/roles`, `office/admin/teammates`, `office/apps`, `office/documents`, `office/funnels`, `office/home`, `office/projects`, `office/team`
- `office/admin/branding` → `office/admin`, `office/admin/audit`, `office/admin/clients`, `office/admin/people`, `office/admin/review`, `office/admin/roles`, `office/admin/storage`, `office/admin/teammates`, `office/apps`, `office/documents`, `office/funnels`, `office/home`, `office/projects`, `office/team`
- `office/admin/audit` → `office/admin`, `office/admin/branding`, `office/admin/clients`, `office/admin/people`, `office/admin/review`, `office/admin/roles`, `office/admin/storage`, `office/admin/teammates`, `office/apps`, `office/documents`, `office/funnels`, `office/home`, `office/projects`, `office/team`
- `office/projects` → `office/admin`, `office/apps`, `office/documents`, `office/funnels`, `office/home`, `office/team`, `projects/home`, `projects/p/:project/overview`
- `office/admin` → `office/admin/audit`, `office/admin/branding`, `office/admin/clients`, `office/admin/people`, `office/admin/person/:person`, `office/admin/review`, `office/admin/roles`, `office/admin/storage`, `office/admin/teammates`, `office/apps`, `office/documents`, `office/funnels`, `office/home`, `office/projects`, `office/team`
- `office/strategy/new` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/home`, `office/strategies`, `planner/home`, `portal/home`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `office/brandkit` → `office/admin`, `office/apps`, `office/avatars`, `office/brandkit-new`, `office/brandkits`, `office/documents`, `office/funnels`, `office/home`, `office/offers`, `office/projects`, `office/stories`, `office/strategies`, `office/team`
- `office/offer/:offer` → `ladder/map/:ladder`, `office/admin`, `office/apps`, `office/avatar/:avatar`, `office/avatars`, `office/brandkits`, `office/documents`, `office/funnels`, `office/home`, `office/offers`, `office/projects`, `office/stories`, `office/strategies`, `office/team`
- `office/avatar/:avatar/profile` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/avatar/:avatar/deep`, `office/avatar/:avatar/edit`, `office/avatar/:avatar/evidence`, `office/avatar/:avatar/use`, `office/avatars`, `office/home`, `planner/home`, `portal/home`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `office/avatar/:avatar/edit/:chapter` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/avatar/:avatar`, `office/home`, `planner/home`, `portal/home`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
