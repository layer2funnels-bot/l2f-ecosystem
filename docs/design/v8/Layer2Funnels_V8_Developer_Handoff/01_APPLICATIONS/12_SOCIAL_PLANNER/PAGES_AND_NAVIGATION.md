# Social Planner · pages and navigation

7 pages documented (every page in the v7 route list for this app, plus every page template reached by following links). 7 templates in total. Each entry gives the 11 required fields: name/purpose, access, layout, sections, buttons/actions, inputs/filters, navigation/destinations, data, permissions, states, responsive.

Labels in back-ticks are the exact text or accessible name of the control in the V8 prototype. Controls present on every page (rail, app bar, Prototype button) are documented once in `01_APPLICATIONS/00_SHELL_AND_LAUNCHER/`.

## Sidebar menu

- **Calendar** → `social/calendar`
- **Pipeline** → `social/board`
- **Posts** → `social/posts`
- **Campaigns** → `social/campaigns`
- **Queue** → `social/queue`
- **Approvals 1** → `social/approvals`
- **Channels** → `social/channels`

## Page templates and their instances

| Template | Instances reached in the prototype | Documented as |
|---|---|---|
| `social/calendar` | 1 | Calendar |
| `social/board` | 1 | Pipeline |
| `social/approvals` | 1 | Approvals |
| `social/posts` | 1 | Posts |
| `social/campaigns` | 1 | Campaigns |
| `social/queue` | 1 | Queue |
| `social/channels` | 1 | Channels |

## Pages

### Calendar

- **Route (prototype):** `#/social/calendar` — template `social/calendar`
- **In the v7 route list:** yes — Calendar
- **How the user gets here:** sidebar item **Calendar**; breadcrumb Social Planner; linked from `clients/tools`, `drive/edit/doc/:file`, `drive/edit/image/:file`, `drive/edit/pdf/:file`, `drive/edit/sheet/:file`, `drive/edit/slides/:file`, `fmp/funnel/:funnel`, `fmp/funnel/:funnel/reports` …
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/12_SOCIAL_PLANNER/118_social_calendar.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/12_SOCIAL_PLANNER/118_social_calendar.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/12_SOCIAL_PLANNER/118_social_calendar.jpg)
- **Sections and headings, in order:** “Calendar”
- **Buttons and actions (10):** `New post` — action `compose` (opens: drawer); `IG · Behind the scenes` — action `compose:7` (opens: drawer); `in · October offer` — action `compose:8` (opens: drawer); `IG · Quiz is live: find your fitness type` — action `compose:0` (opens: drawer); `in · Case study: 41 booked calls` — action `compose:1` (opens: drawer); `IG · 3 myths about funnels` — action `compose:2` (opens: drawer); `YT · Funnel teardown #4` — action `compose:3` (opens: drawer); `IG · Client win: Sarah` — action `compose:4` (opens: drawer); `in · Why we promise 30 days of fixes` — action `compose:5` (opens: drawer); `f · Webinar reminder` — action `compose:6` (opens: drawer)
- **Links (navigation) (4):** `Calendar` → `social/calendar`; `Pipeline` → `social/board`; `Posts` → `social/posts`; `Campaigns` → `social/campaigns`
- **Data shown (prototype sample data — not product data):** Social Planner Calendar Planned and scheduled posts for Layer2Funnels. New post Publishing stays in GoHighLevel. Plan, write and approve here, then send approved posts to GHL in one step. Analytics come back from GHL later. October 2026 Instagram LinkedIn YouTube Facebook MON TUE WED THU FRI SAT SUN 28 29 30 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 IG · Behind the scenes 17 18 in · October offer 19 20 IG · Quiz is live…
- **Permissions and visibility:** Anyone with access to Social Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Pipeline

- **Route (prototype):** `#/social/board` — template `social/board`
- **In the v7 route list:** yes — Pipeline
- **How the user gets here:** sidebar item **Pipeline**; breadcrumb Social Planner; linked from `social/approvals`, `social/calendar`, `social/campaigns`, `social/channels`, `social/posts`, `social/queue`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/12_SOCIAL_PLANNER/119_social_board.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/12_SOCIAL_PLANNER/119_social_board.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/12_SOCIAL_PLANNER/119_social_board.jpg)
- **Purpose and spec (from the app brief):**
  > Keep. Additions: **Pipeline** board (Idea, Draft, In review, Approved, Scheduled in GHL, Posted) and **Campaigns** (posted vs planned). Publishing stays in GoHighLevel: "Send approved to GHL" exports CSV [F for API].
- **Sections and headings, in order:** “Pipeline”
- **Buttons and actions (8):** `Instagram Quiz is live: find your fitness type Tue 20 Oct` — action `compose:0` (opens: drawer); `LinkedIn Case study: 41 booked calls Today` — action `compose:1` (opens: drawer); `Instagram 3 myths about funnels Today` — action `compose:2` (opens: drawer); `YouTube Funnel teardown #4 Sun 25 Oct` — action `compose:3` (opens: drawer); `Send approved to GHL` — prototype stand-in (shows a toast: “Exports approved posts as a CSV that GoHighLevel’s Social Planner impo”); build the real action from the brief; `Instagram Client win: Sarah Tue 27 Oct` — action `compose:4` (opens: drawer); `LinkedIn Why we promise 30 days of fixes Thu 29 Oct` — action `compose:5` (opens: drawer); `Facebook Webinar reminder Mon 2 Nov` — action `compose:6` (opens: drawer)
- **Links (navigation) (4):** `Calendar` → `social/calendar`; `Pipeline` → `social/board`; `Posts` → `social/posts`; `Campaigns` → `social/campaigns`
- **Data shown (prototype sample data — not product data):** Social Planner Pipeline Every post from idea to posted. Publishing happens in GoHighLevel; this is where you plan, write and approve. Idea 3 Instagram Quiz is live: find your fitness type Tue 20 Oct LinkedIn Case study: 41 booked calls Today Draft 2 LinkedIn Case study: 41 booked calls Today Instagram 3 myths about funnels Today In review 1 Instagram 3 myths about funnels Today Approved 1 YouTube Funnel teardown #4 S…
- **Permissions and visibility:** Anyone with access to Social Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Approvals

- **Route (prototype):** `#/social/approvals` — template `social/approvals`
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** sidebar item **Approvals 1**; breadcrumb Social Planner; linked from `office/home`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/12_SOCIAL_PLANNER/129_social_approvals.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/12_SOCIAL_PLANNER/129_social_approvals.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/12_SOCIAL_PLANNER/129_social_approvals.jpg)
- **Sections and headings, in order:** “Approvals”
- **Buttons and actions (2):** `New post` — action `compose` (opens: drawer); `Case study: 41 booked calls` — action `compose:1` (opens: drawer)
- **Links (navigation) (4):** `Calendar` → `social/calendar`; `Pipeline` → `social/board`; `Posts` → `social/posts`; `Campaigns` → `social/campaigns`
- **Data shown (prototype sample data — not product data):** Social Planner Approvals Posts waiting for a reviewer. New post Post Channel Date Status Case study: 41 booked calls LinkedIn Today In review Approvals Posts waiting for a reviewer. New post Post Channel Date Status Case study: 41 booked calls LinkedIn Today In review…
- **Permissions and visibility:** Anyone with access to Social Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Posts

- **Route (prototype):** `#/social/posts` — template `social/posts`
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** sidebar item **Posts**; breadcrumb Social Planner; linked from `social/approvals`, `social/board`, `social/calendar`, `social/campaigns`, `social/channels`, `social/queue`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/12_SOCIAL_PLANNER/170_social_posts.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/12_SOCIAL_PLANNER/170_social_posts.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/12_SOCIAL_PLANNER/170_social_posts.jpg)
- **Sections and headings, in order:** “Posts”
- **Buttons and actions (10):** `New post` — action `compose` (opens: drawer); `Quiz is live: find your fitness type` — action `compose:0` (opens: drawer); `Case study: 41 booked calls` — action `compose:1` (opens: drawer); `3 myths about funnels` — action `compose:2` (opens: drawer); `Funnel teardown #4` — action `compose:3` (opens: drawer); `Client win: Sarah` — action `compose:4` (opens: drawer); `Why we promise 30 days of fixes` — action `compose:5` (opens: drawer); `Webinar reminder` — action `compose:6` (opens: drawer); `Behind the scenes` — action `compose:7` (opens: drawer); `October offer` — action `compose:8` (opens: drawer)
- **Links (navigation) (4):** `Calendar` → `social/calendar`; `Pipeline` → `social/board`; `Posts` → `social/posts`; `Campaigns` → `social/campaigns`
- **Data shown (prototype sample data — not product data):** Social Planner Posts Drafts and versions for every channel. New post Post Channel Date Status Quiz is live: find your fitness type Instagram Tue 20 Oct Scheduled Case study: 41 booked calls LinkedIn Today In review 3 myths about funnels Instagram Today Draft Funnel teardown #4 YouTube Sun 25 Oct Scheduled Client win: Sarah Instagram Tue 27 Oct Approved Why we promise 30 days of fixes LinkedIn Thu 29 Oct Draft Webinar…
- **Permissions and visibility:** Anyone with access to Social Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Campaigns

- **Route (prototype):** `#/social/campaigns` — template `social/campaigns`
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** sidebar item **Campaigns**; breadcrumb Social Planner; linked from `social/approvals`, `social/board`, `social/calendar`, `social/channels`, `social/posts`, `social/queue`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/12_SOCIAL_PLANNER/171_social_campaigns.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/12_SOCIAL_PLANNER/171_social_campaigns.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/12_SOCIAL_PLANNER/171_social_campaigns.jpg)
- **Sections and headings, in order:** “Campaigns” · “Funnel Challenge launch” · “Case study month”
- **Links (navigation) (4):** `Calendar` → `social/calendar`; `Pipeline` → `social/board`; `Posts` → `social/posts`; `Campaigns` → `social/campaigns`
- **Data shown (prototype sample data — not product data):** Social Planner Campaigns Group posts around a launch or theme and track posted vs planned. Active Funnel Challenge launch 12 of 20 posted Planned Case study month 0 of 8 posted Campaigns Group posts around a launch or theme and track posted vs planned. Active Funnel Challenge launch 12 of 20 posted Planned Case study month 0 of 8 posted…
- **Permissions and visibility:** Anyone with access to Social Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Queue

- **Route (prototype):** `#/social/queue` — template `social/queue`
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** sidebar item **Queue**; breadcrumb Social Planner; direct URL / in-page action
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/12_SOCIAL_PLANNER/172_social_queue.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/12_SOCIAL_PLANNER/172_social_queue.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/12_SOCIAL_PLANNER/172_social_queue.jpg)
- **Sections and headings, in order:** “Queue”
- **Buttons and actions (4):** `New post` — action `compose` (opens: drawer); `Quiz is live: find your fitness type` — action `compose:0` (opens: drawer); `Funnel teardown #4` — action `compose:3` (opens: drawer); `Webinar reminder` — action `compose:6` (opens: drawer)
- **Links (navigation) (4):** `Calendar` → `social/calendar`; `Pipeline` → `social/board`; `Posts` → `social/posts`; `Campaigns` → `social/campaigns`
- **Data shown (prototype sample data — not product data):** Social Planner Queue What will publish, in order. Nothing publishes without approval. New post Post Channel Date Status Quiz is live: find your fitness type Instagram Tue 20 Oct Scheduled Funnel teardown #4 YouTube Sun 25 Oct Scheduled Webinar reminder Facebook Mon 2 Nov Scheduled Queue What will publish, in order. Nothing publishes without approval. New post Post Channel Date Status Quiz is live: find your fitness t…
- **Permissions and visibility:** Anyone with access to Social Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). Page-specific state copy present in the prototype: “What will publish, in order. Nothing publishes without approval.”.
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Channels

- **Route (prototype):** `#/social/channels` — template `social/channels`
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** sidebar item **Channels**; breadcrumb Social Planner; direct URL / in-page action
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/12_SOCIAL_PLANNER/173_social_channels.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/12_SOCIAL_PLANNER/173_social_channels.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/12_SOCIAL_PLANNER/173_social_channels.jpg)
- **Sections and headings, in order:** “Channels” · “Instagram” · “LinkedIn” · “YouTube” · “Facebook”
- **Buttons and actions (1):** `Connect` — prototype stand-in (shows a toast: “Connecting needs the provider review and the backend.”); build the real action from the brief
- **Links (navigation) (4):** `Calendar` → `social/calendar`; `Pipeline` → `social/board`; `Posts` → `social/posts`; `Campaigns` → `social/campaigns`
- **Data shown (prototype sample data — not product data):** Social Planner Channels Connected accounts. Managed by admins and channel owners. IG Instagram Not connected Connect in LinkedIn Not connected Connect YT YouTube Not connected Connect f Facebook Not connected Connect Channels Connected accounts. Managed by admins and channel owners. IG Instagram Not connected Connect in LinkedIn Not connected Connect YT YouTube Not connected Connect f Facebook Not connected Connect…
- **Permissions and visibility:** Anyone with access to Social Planner in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.
