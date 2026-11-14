# Page hierarchy (every page template in V8)

Generated from the automated crawl of `ecosystem-v8.html`. `:param` = one page template shown for many records; the number is how many instances the prototype contains.

## Global shell, Launcher and Profile

- `launcher`
- `profile`
- `auth`
- `states`
- `system`
  - `profile/about`
  - `profile/account`
  - `profile/notifications`
  - `profile/appearance`

## Office

  - `office/home`
  - `office/funnels`
  - `office/avatars`
  - `office/avatar-new`
    - `office/avatar/:avatar` (3)
      - `office/avatar/:avatar/deep` (6)
      - `office/avatar/:avatar/edit` (3)
      - `office/avatar/:avatar/use` (3)
      - `office/avatar/:avatar/evidence` (3)
  - `office/offers`
  - `office/offer-new`
  - `office/stories`
  - `office/story-new`
  - `office/brandkits`
  - `office/brandkit-new`
    - `office/brandkit/:kit` (3)
  - `office/strategies`
  - `office/strategy-template`
    - `office/strategy/:strategy` (3)
  - `office/documents`
  - `office/team`
    - `office/member/:person` (6)
  - `office/apps`
    - `office/admin/people`
      - `office/admin/person/:person` (6)
    - `office/admin/teammates`
    - `office/admin/clients`
    - `office/admin/roles`
    - `office/admin/review`
    - `office/admin/storage`
    - `office/admin/branding`
    - `office/admin/audit`
  - `office/projects`
  - `office/admin`
    - `office/strategy/new`
  - `office/brandkit`
    - `office/offer/:offer` (3)
      - `office/avatar/:avatar/profile` (3)
        - `office/avatar/:avatar/edit/:chapter` (33)

## Clients

  - `clients/list`
      - `clients/c/:client/Overview` (7)
        - `clients/c/:client/Work/0` (7)
        - `clients/c/:client/Work/1` (7)
          - `clients/c/:client/Work/1/avatar` (7)
          - `clients/c/:client/Work/1/offers` (7)
          - `clients/c/:client/Work/1/brand` (7)
        - `clients/c/:client/Work/2` (7)
        - `clients/c/:client/Work/3` (7)
      - `clients/c/:client/Documents` (7)
  - `clients/requests`
    - `clients/r/:request` (5)
  - `clients/sops`
    - `clients/settings/stages`
      - `clients/c/:client/requests`
  - `clients/pipeline`
  - `clients/tools`
  - `clients/settings`
      - `clients/c/:client/Work` (7)
      - `clients/c/:client/Requests & Approvals` (7)
      - `clients/c/:client/Team Notes` (7)
        - `clients/c/:client/Work/4` (7)
          - `clients/c/:client/Work/1/strategy` (7)
        - `clients/c/:client/Documents/Brand Base` (7)
        - `clients/c/:client/Documents/Strategy` (7)
        - `clients/c/:client/Documents/Copy` (7)
        - `clients/c/:client/Documents/Build` (7)
        - `clients/c/:client/Documents/Marketing` (7)
        - `clients/c/:client/Documents/Contracts` (7)
    - `clients/settings/statuses`
    - `clients/settings/brandbase`
    - `clients/settings/sections`
    - `clients/settings/notify`
      - `clients/c/:client/overview`

## Projects

  - `projects/home`
  - `projects/mywork`
  - `projects/workload`
  - `projects/portfolio`
  - `projects/files`
  - `projects/all`
  - `projects/trash`
      - `projects/p/:project/overview` (6)
      - `projects/p/:project/list` (6)
      - `projects/p/:project/board` (6)
      - `projects/p/:project/calendar` (6)
      - `projects/p/:project/timeline` (6)
      - `projects/p/:project/report` (6)
      - `projects/p/:project/docs` (6)
      - `projects/p/:project/collection` (6)
      - `projects/p/:project/files`

## Tasks

  - `tasks/today`
  - `tasks/upcoming`
  - `tasks/inbox`
  - `tasks/teammates`
    - `tasks/list/:list` (4)
    - `tasks/teammates/:person` (5)

## Drive and editors

  - `drive/home`
  - `drive/mydrive`
  - `drive/personal`
      - `drive/edit/doc/:file` (3)
      - `drive/edit/sheet/:file`
      - `drive/edit/slides/:file`
      - `drive/edit/image/:file`
      - `drive/edit/pdf/:file`
    - `drive/f/:folder` (6)
  - `drive/recent`
  - `drive/starred`
  - `drive/shared`
  - `drive/trash`

## Planner

  - `planner/home`
  - `planner/mywork`
  - `planner/plans`
    - `planner/plan/map`
    - `planner/plan/timeline`
    - `planner/plan/reviews`
    - `planner/plan/settings`
  - `planner/alignment`
  - `planner/reports`
    - `planner/model/map`
    - `planner/model/kinds`
    - `planner/model/kpi`
    - `planner/model/fa`
    - `planner/model/horizons`
    - `planner/model/tpl`
      - `planner/plan/:plan/builder`
  - `planner/model`

## Funnel Mapper

  - `fmp/home`
  - `fmp/clients`
    - `fmp/client/:client` (4)
  - `fmp/funnels`
    - `fmp/funnel/:funnel` (6)
      - `fmp/funnel/:funnel/reports` (6)
  - `fmp/templates`
  - `fmp/trash`
  - `fmp/settings`
  - `fmp/help`

## Client Portal

  - `portal/home`
  - `portal/requests`
  - `portal/approvals`
  - `portal/notes`
    - `portal/note/:note` (4)

## Whiteboard

  - `whiteboard/home`
    - `whiteboard/folder/:id` (3)
    - `whiteboard/board/:id` (2)
  - `whiteboard/starred`
  - `whiteboard/tpl`

## Forms

  - `forms/list`
    - `forms/b/:form` (4)
  - `forms/subs`
  - `forms/tpl`

## Value Ladder

  - `ladder/list`
    - `ladder/map/:ladder` (2)
  - `ladder/history`

## Social Planner

  - `social/calendar`
  - `social/board`
  - `social/approvals`
  - `social/posts`
  - `social/campaigns`
  - `social/queue`
  - `social/channels`

## Layer 2 Agents

  - `agents/home`
    - `agents/meeting/new`
  - `agents/ask`
  - `agents/meetings`
  - `agents/settings`
    - `agents/meeting/:meeting` (3)
      - `agents/meeting/:meeting/notes` (3)
      - `agents/meeting/:meeting/transcript` (3)
      - `agents/meeting/:meeting/actions` (3)
