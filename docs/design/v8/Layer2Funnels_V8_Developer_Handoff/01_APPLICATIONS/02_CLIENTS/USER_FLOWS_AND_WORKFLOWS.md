# Clients · user flows and workflows

Each flow names the prototype route or control. "Source" says where the rule is defined. Cross-app flows: `05_STRATEGY_AND_ARCHITECTURE/CROSS_APP_WORKFLOWS.md`.

## 1. Add and qualify a client

**Who:** Teammate · **Source:** Brief: All clients

1. All clients (#/clients/list, Table default) → New client
2. Status Lead → Proposal → Active (status select, or Pipeline drag / right-click "Move to…")
3. Moving to Lost asks a reason (Price / Chose another provider or an AI tool / Timing / No reply)

## 2. Deliver through the stages

**Who:** Account lead · **Source:** Brief: Work

1. Client › Overview (#/clients/c/:client/Overview): stage bar, Next action
2. Work › Brand Base (submitted form answers) → Strategy workspace (avatar, offers, brand kits, funnel strategy) → Copy (versions + Send for approval) → Build (progress only) → Marketing
3. Each stage can hold custom sections (Settings › Stages)

## 3. Ask a client to approve copy

**Who:** Teammate · **Source:** Brief: Copy, Request detail

1. Work › Copy → row → Send for approval (creates an Approval request with that version)
2. Requests & Approvals (#/clients/requests) → request detail (#/clients/r/:request)
3. Client replies (Portal) → notification → Mark approved / Create revision / Send reminder / Withdraw / Make a task

## 4. Create an SOP

**Who:** Teammate · **Source:** Brief: SOPs

1. SOPs (#/clients/sops) → New SOP (name, type Process / Stage SOP)
2. Drive doc created in SOPs with an automatic document-icon colour

## 5. Preview what the client sees

**Who:** Owner · **Source:** Brief; 17 Portal

1. Client header → Preview portal
2. Client Portal in preview ribbon (#/portal/home) → Exit preview returns to the client

## Navigation graph (generated from the prototype links)

Page → pages it links to (within and outside the app).

- `clients/list` → `clients/c/:client/Overview`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`
- `clients/c/:client/Overview` → `clients/c/:client/Documents`, `clients/c/:client/Requests & Approvals`, `clients/c/:client/Team Notes`, `clients/c/:client/Work`, `clients/c/:client/Work/0`, `clients/c/:client/Work/1`, `clients/c/:client/Work/2`, `clients/c/:client/Work/3`, `clients/c/:client/Work/4`, `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`, `fmp/funnels`, `portal/home`, `projects/p/:project/overview`
- `clients/c/:client/Work/0` → `clients/c/:client/Documents`, `clients/c/:client/Overview`, `clients/c/:client/Requests & Approvals`, `clients/c/:client/Team Notes`, `clients/c/:client/Work`, `clients/c/:client/Work/1`, `clients/c/:client/Work/2`, `clients/c/:client/Work/3`, `clients/c/:client/Work/4`, `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`, `portal/home`
- `clients/c/:client/Work/1` → `clients/c/:client/Documents`, `clients/c/:client/Overview`, `clients/c/:client/Requests & Approvals`, `clients/c/:client/Team Notes`, `clients/c/:client/Work`, `clients/c/:client/Work/0`, `clients/c/:client/Work/1/avatar`, `clients/c/:client/Work/1/brand`, `clients/c/:client/Work/1/offers`, `clients/c/:client/Work/1/strategy`, `clients/c/:client/Work/2`, `clients/c/:client/Work/3`, `clients/c/:client/Work/4`, `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`, `portal/home`
- `clients/c/:client/Work/1/avatar` → `clients/c/:client/Documents`, `clients/c/:client/Overview`, `clients/c/:client/Requests & Approvals`, `clients/c/:client/Team Notes`, `clients/c/:client/Work`, `clients/c/:client/Work/0`, `clients/c/:client/Work/1`, `clients/c/:client/Work/2`, `clients/c/:client/Work/3`, `clients/c/:client/Work/4`, `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`, `office/avatar-new`, `office/avatar/:avatar`, `portal/home`
- `clients/c/:client/Work/1/offers` → `clients/c/:client/Documents`, `clients/c/:client/Overview`, `clients/c/:client/Requests & Approvals`, `clients/c/:client/Team Notes`, `clients/c/:client/Work`, `clients/c/:client/Work/0`, `clients/c/:client/Work/1`, `clients/c/:client/Work/2`, `clients/c/:client/Work/3`, `clients/c/:client/Work/4`, `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`, `office/offer-new`, `portal/home`
- `clients/c/:client/Work/1/brand` → `clients/c/:client/Documents`, `clients/c/:client/Overview`, `clients/c/:client/Requests & Approvals`, `clients/c/:client/Team Notes`, `clients/c/:client/Work`, `clients/c/:client/Work/0`, `clients/c/:client/Work/1`, `clients/c/:client/Work/2`, `clients/c/:client/Work/3`, `clients/c/:client/Work/4`, `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`, `office/brandkit-new`, `office/brandkit/:kit`, `portal/home`
- `clients/c/:client/Work/2` → `clients/c/:client/Documents`, `clients/c/:client/Overview`, `clients/c/:client/Requests & Approvals`, `clients/c/:client/Team Notes`, `clients/c/:client/Work`, `clients/c/:client/Work/0`, `clients/c/:client/Work/1`, `clients/c/:client/Work/3`, `clients/c/:client/Work/4`, `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`, `drive/edit/doc/:file`, `portal/home`
- `clients/c/:client/Work/3` → `clients/c/:client/Documents`, `clients/c/:client/Overview`, `clients/c/:client/Requests & Approvals`, `clients/c/:client/Team Notes`, `clients/c/:client/Work`, `clients/c/:client/Work/0`, `clients/c/:client/Work/1`, `clients/c/:client/Work/2`, `clients/c/:client/Work/4`, `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`, `portal/home`
- `clients/c/:client/Documents` → `clients/c/:client/Documents/Brand Base`, `clients/c/:client/Documents/Build`, `clients/c/:client/Documents/Contracts`, `clients/c/:client/Documents/Copy`, `clients/c/:client/Documents/Marketing`, `clients/c/:client/Documents/Strategy`, `clients/c/:client/Overview`, `clients/c/:client/Requests & Approvals`, `clients/c/:client/Team Notes`, `clients/c/:client/Work`, `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`, `portal/home`
- `clients/requests` → `clients/list`, `clients/r/:request`, `clients/settings`, `clients/sops`, `clients/tools`
- `clients/r/:request` → `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`
- `clients/sops` → `clients/list`, `clients/requests`, `clients/settings`, `clients/tools`, `drive/edit/doc/:file`
- `clients/settings/stages` → `clients/list`, `clients/requests`, `clients/settings`, `clients/settings/brandbase`, `clients/settings/notify`, `clients/settings/sections`, `clients/settings/statuses`, `clients/sops`, `clients/tools`
- `clients/c/:client/requests` → `clients/c/:client/Documents`, `clients/c/:client/Overview`, `clients/c/:client/Requests & Approvals`, `clients/c/:client/Team Notes`, `clients/c/:client/Work`, `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`, `portal/home`
- `clients/pipeline` → `clients/c/:client/Overview`, `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`
- `clients/tools` → `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `forms/list`, `ladder/list`, `social/calendar`, `whiteboard/home`
- `clients/settings` → `clients/list`, `clients/requests`, `clients/settings/brandbase`, `clients/settings/notify`, `clients/settings/sections`, `clients/settings/stages`, `clients/settings/statuses`, `clients/sops`, `clients/tools`
- `clients/c/:client/Work` → `clients/c/:client/Documents`, `clients/c/:client/Overview`, `clients/c/:client/Requests & Approvals`, `clients/c/:client/Team Notes`, `clients/c/:client/Work/0`, `clients/c/:client/Work/1`, `clients/c/:client/Work/1/avatar`, `clients/c/:client/Work/1/brand`, `clients/c/:client/Work/1/offers`, `clients/c/:client/Work/1/strategy`, `clients/c/:client/Work/2`, `clients/c/:client/Work/3`, `clients/c/:client/Work/4`, `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`, `portal/home`
- `clients/c/:client/Requests & Approvals` → `clients/c/:client/Documents`, `clients/c/:client/Overview`, `clients/c/:client/Team Notes`, `clients/c/:client/Work`, `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`, `portal/home`
- `clients/c/:client/Team Notes` → `clients/c/:client/Documents`, `clients/c/:client/Overview`, `clients/c/:client/Requests & Approvals`, `clients/c/:client/Work`, `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`, `portal/home`
- `clients/c/:client/Work/4` → `clients/c/:client/Documents`, `clients/c/:client/Overview`, `clients/c/:client/Requests & Approvals`, `clients/c/:client/Team Notes`, `clients/c/:client/Work`, `clients/c/:client/Work/0`, `clients/c/:client/Work/1`, `clients/c/:client/Work/2`, `clients/c/:client/Work/3`, `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`, `portal/home`
- `clients/c/:client/Work/1/strategy` → `clients/c/:client/Documents`, `clients/c/:client/Overview`, `clients/c/:client/Requests & Approvals`, `clients/c/:client/Team Notes`, `clients/c/:client/Work`, `clients/c/:client/Work/0`, `clients/c/:client/Work/1`, `clients/c/:client/Work/2`, `clients/c/:client/Work/3`, `clients/c/:client/Work/4`, `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`, `office/strategy/:strategy`, `office/strategy/new`, `portal/home`
- `clients/c/:client/Documents/Brand Base` → `clients/c/:client/Documents`, `clients/c/:client/Documents/Build`, `clients/c/:client/Documents/Contracts`, `clients/c/:client/Documents/Copy`, `clients/c/:client/Documents/Marketing`, `clients/c/:client/Documents/Strategy`, `clients/c/:client/Overview`, `clients/c/:client/Requests & Approvals`, `clients/c/:client/Team Notes`, `clients/c/:client/Work`, `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`, `portal/home`
- `clients/c/:client/Documents/Strategy` → `clients/c/:client/Documents`, `clients/c/:client/Overview`, `clients/c/:client/Requests & Approvals`, `clients/c/:client/Team Notes`, `clients/c/:client/Work`, `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`, `portal/home`
- `clients/c/:client/Documents/Copy` → `clients/c/:client/Documents`, `clients/c/:client/Overview`, `clients/c/:client/Requests & Approvals`, `clients/c/:client/Team Notes`, `clients/c/:client/Work`, `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`, `portal/home`
- `clients/c/:client/Documents/Build` → `clients/c/:client/Documents`, `clients/c/:client/Overview`, `clients/c/:client/Requests & Approvals`, `clients/c/:client/Team Notes`, `clients/c/:client/Work`, `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`, `portal/home`
- `clients/c/:client/Documents/Marketing` → `clients/c/:client/Documents`, `clients/c/:client/Overview`, `clients/c/:client/Requests & Approvals`, `clients/c/:client/Team Notes`, `clients/c/:client/Work`, `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`, `portal/home`
- `clients/c/:client/Documents/Contracts` → `clients/c/:client/Documents`, `clients/c/:client/Overview`, `clients/c/:client/Requests & Approvals`, `clients/c/:client/Team Notes`, `clients/c/:client/Work`, `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`, `portal/home`
- `clients/settings/statuses` → `clients/list`, `clients/requests`, `clients/settings`, `clients/settings/brandbase`, `clients/settings/notify`, `clients/settings/sections`, `clients/settings/stages`, `clients/sops`, `clients/tools`
- `clients/settings/brandbase` → `clients/list`, `clients/requests`, `clients/settings`, `clients/settings/notify`, `clients/settings/sections`, `clients/settings/stages`, `clients/settings/statuses`, `clients/sops`, `clients/tools`, `forms/b/:form`
- `clients/settings/sections` → `clients/list`, `clients/requests`, `clients/settings`, `clients/settings/brandbase`, `clients/settings/notify`, `clients/settings/stages`, `clients/settings/statuses`, `clients/sops`, `clients/tools`
- `clients/settings/notify` → `clients/list`, `clients/requests`, `clients/settings`, `clients/settings/brandbase`, `clients/settings/sections`, `clients/settings/stages`, `clients/settings/statuses`, `clients/sops`, `clients/tools`
- `clients/c/:client/overview` → `clients/c/:client/Documents`, `clients/c/:client/Overview`, `clients/c/:client/Requests & Approvals`, `clients/c/:client/Team Notes`, `clients/c/:client/Work`, `clients/list`, `clients/requests`, `clients/settings`, `clients/sops`, `clients/tools`, `portal/home`
