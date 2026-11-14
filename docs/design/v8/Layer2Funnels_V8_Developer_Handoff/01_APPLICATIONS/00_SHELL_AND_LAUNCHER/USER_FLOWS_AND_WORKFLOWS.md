# Global shell, Launcher and Profile · user flows and workflows

Each flow names the prototype route or control. "Source" says where the rule is defined. Cross-app flows: `05_STRATEGY_AND_ARCHITECTURE/CROSS_APP_WORKFLOWS.md`.

## 1. Start the day

**Who:** Owner/teammate · **Source:** 02 §4

1. Sign in (#/auth) → Launcher (#/launcher)
2. Launcher shows time-of-day sky, weather, app tiles grouped Everyday / Studio, "Jump back in"
3. "/" focuses Find an app; Enter opens the first match; tile click zooms into the app home

## 2. Switch organization without losing place

**Who:** Member of both orgs · **Source:** 02 §2

1. Rail org logo → org menu
2. Pick the other organization
3. Same page re-renders with the other org's data; toast "Switched to X. You stayed on the same page."

## 3. Find anything

**Who:** Any user · **Source:** 02 §5

1. Ctrl K or rail search → global search dialog
2. Scope row (Everything, Projects & tasks, Tasks, Clients, Docs & files, Office, Planner, Funnels); Tab cycles scope; in:/@me/overdue/is:archived filters
3. ↑↓ then Enter opens; Ctrl Enter opens in a new tab; only items the user may open are returned

## 4. Act on a notification

**Who:** Any user · **Source:** 02 §6

1. Rail bell (unread badge) → inbox drawer
2. Filter by kind (Mentions, Assigned, Approvals, Updates) or app
3. Click item → destination opens (real link) and item is marked read; "Mark all read"

## 5. Edit my profile

**Who:** Any user · **Source:** 02 §7

1. Rail photo → profile menu → My profile (#/profile)
2. Tabs Profile · Account & sign-in · Notifications · Appearance
3. Change photo dialog with zoom; Save

## Navigation graph (generated from the prototype links)

Page → pages it links to (within and outside the app).

- `launcher` → `agents/home`, `clients/list`, `drive/edit/sheet/:file`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `office/avatar/:avatar`, `office/home`, `planner/home`, `planner/plan/:plan/builder`, `portal/home`, `profile`, `projects/home`, `projects/p/:project/list`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `profile` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/home`, `office/member/:person`, `planner/home`, `portal/home`, `profile/about`, `profile/account`, `profile/appearance`, `profile/notifications`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `states` → `office/home`
- `system` → `launcher`
- `profile/about` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/home`, `office/member/:person`, `planner/home`, `portal/home`, `profile/account`, `profile/appearance`, `profile/notifications`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `profile/account` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/home`, `office/member/:person`, `planner/home`, `portal/home`, `profile/about`, `profile/appearance`, `profile/notifications`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `profile/notifications` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/home`, `office/member/:person`, `planner/home`, `portal/home`, `profile/about`, `profile/account`, `profile/appearance`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `profile/appearance` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/home`, `office/member/:person`, `planner/home`, `portal/home`, `profile/about`, `profile/account`, `profile/notifications`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
