# 02 · Global shell (functional spec from v7, visual values from V8): rail, Launcher, search, notifications, profile, branding

Repo today: `apps/web/js/views/shell.js` renders a 68 px header (app switcher, app name, search placeholder, bell placeholder, org switcher, avatar) and a sidebar with a profile footer. Replace with the structure below. Prototype: `08_PROTOTYPE_AND_SOURCE/prototype-source/core5.js` (rail, router, menus, inbox), `core6.js` (search scopes, profile page), routes `#/launcher`, any app page, `#/profile`.

## 1. Layout
```
┌──────┬───────────────┬───────────────────────────────────────┐
│ RAIL │ APP SIDEBAR   │ APP BAR 52px: [collapse] crumbs …  app actions │
│ 64px │ 248px         ├───────────────────────────────────────┤
│      │ (app's own)   │ CONTENT (max 1440, 20–32 px padding)          │
└──────┴───────────────┴───────────────────────────────────────┘
```
- **Rail** (dark `#121317`, same in every app and both themes), top to bottom: org logo button (opens org menu) · apps grid button (opens apps menu) · divider · pinned apps (Office, Projects, Tasks, Clients, Drive, Planner; the current app is added if not pinned; active app has a 4 px light bar on the left) · spacer · search · bell with unread badge · profile photo (opens profile menu).
- **App sidebar**: app plate 30 px + app name, then the app's nav. **No profile footer** (it looked clickable and wasn't). Collapsible with the bar's "Collapse sidebar" button; remembered per device (`localStorage l2f.sidecol`).
- **App bar**: crumbs (real links), app-specific actions on the right (e.g. Projects quick actions, Tasks "Add task"). An app search box here filters only the current page.
- **Focused layout** (editors, Avatar studio, strategy doc, whiteboard, Funnel Mapper editor): no rail, no sidebar; one top bar with Back, apps-grid menu, title, and the tool's own actions.
- **Phone ≤760**: rail and sidebar hidden; bottom tab bar with the app's first 4 nav items + More sheet; the app bar shows the org mark which opens the "apps and account" sheet (launcher, search, notifications, org switch, profile, app grid).

## 2. Menus
- **Org menu**: both organizations with level and type, check on the current one; switching keeps the user on the same page (`setOrg` → re-render, toast "Switched to X. You stayed on the same page."). **No "Open in a new tab" item** (removed). Org data never mixes.
- **Apps menu**: "Launcher (G L)" + grid of all apps with plates; locked/not-set apps dimmed and open an explanation dialog instead of navigating. Links are real `<a href>`.
- **Profile menu**: photo 48, name, email, My profile (`#/profile`), Appearance (Light/Dark), Weather on the Launcher (toggle), Keyboard shortcuts, Sign out.

## 3. Links, new tabs, right-click
- Every navigation element is an `<a href="#/…">` (or the app's real URL). Ctrl/Cmd-click, Shift-click, middle-click and the browser's "Open link in new tab" must work. Buttons that navigate programmatically must also honour Ctrl/middle-click (prototype: `auxclick` handler + `nav` action check).
- Custom right-click menus (`.ctx`) on: tasks, projects, sections, view tabs, files, task list items, lists, clients, strategy boxes, whiteboard boards. Escape closes; arrow keys move; long-press opens on touch.

## 4. Launcher [R]
Keep the v4/v5 launcher (time-of-day sky, weather from location, 3D plates, hover tilt, zoom-into-app). v7 changes: **slightly zoomed in**: content max 1240 px, tile min width 176 px, plates **96 px**, app name 16.5 px, description 13.5 px, hero title up to 76 px, search 52 px tall. Groups: Everyday (Office, Projects, Tasks, Clients, Drive, Planner, Client Portal) and Studio (Funnel Mapper, Forms, Value Ladder, Social Planner, Whiteboard, Layer 2 Agents). Header: org button, search, bell, profile. Below the shelf: **Jump back in** (4 recent items across apps). `/` focuses Find an app; Enter opens the first match. Weather can be turned off in the profile.

## 5. Global search [N] (Ctrl K anywhere, rail search button, phone sheet)
- Dialog 680 px. Input; **scope row** "Search in": Everything · Projects & tasks · Tasks · Clients · Docs & files · Office · Planner · Funnels. Default scope = the current app if it is searchable, else Everything. `Tab`/`Shift Tab` in the input cycles scope; typing `in:clients`, `in:projects`, `in:drive|files|docs`, `in:planner`, `in:funnels` switches scope and removes the token.
- Filters: `@me` (assigned to me), `overdue`, `is:archived` (archived projects appear **only** with this or with ≥3 typed characters).
- Empty query shows Quick actions (New task, New document, New project, New client, Start meeting notes) and Jump back in.
- Results grouped by app (max 4 per app in Everything, 12 in a scope), app plate on each row, highlighted match, "Archived" pill. ↑↓ move, Enter opens, Ctrl Enter opens in new tab. Footer: key hints + "How search works" (dialog text in prototype).
- Last row: "Ask the assistant…" disabled with "Later, with approval".
- **Backend [N]**: a search endpoint that queries each app's provider **as the current user** (RLS applies) within the current organization, returns `{app, type, title, subtitle, href, archived}`, fuzzy-ish (prefix + trigram). Apps without a provider are simply absent. Never return items the user cannot open.

## 6. Notifications [N] (bell in the rail; one inbox for every app)
- Drawer 520 px: title, "Mark all read", close. Kind filter: All · Mentions · Assigned · Approvals · Updates. App filter chips (All apps + each app that has items). Item: avatar, "**Name** did X", app plate + app name + time, unread dot; click opens the destination (real link) and marks it read. Footer link: Notification settings.
- Types and destinations: mention in a comment (task/objective/doc → open it at the comment) · assigned to me (task, Tasks item, objective) · client replied / approved / asked for changes (request page) · approval waiting (social post, document review) · followed item changed · update due (Planner objective) · file shared with me · invitation.
- Repo: `0034` added shared notifications for Projects (`private.collab_scope`). Generalize: `notifications(id, workspace_id, user_id, app, kind, actor_id, title, href, read_at, created_at)`; each app writes through one service. Badge = unread count in the current org.
- Settings (profile › Notifications and Office › Settings): per app In-app on/off, Email digest (Daily/Never/Instantly; needs an approved email provider [F]), Mentions and Approvals always on.

## 7. Profile page [N] `#/profile/{about|account|notifications|appearance}`
Own page (not inside Office), focused layout with rail. Header with cover, **circular photo 112 px** (cover-fit, change-photo dialog with zoom slider), name, roles in both orgs, link "My work in Office". Tabs: Profile (name, display name, job title, time zone, about, Save; Your organizations list) · Account & sign-in (email, password change, Google sign-in later, signed-in devices + sign out others) · Notifications (table above) · Appearance (Light/Dark/System, weather sky toggle, reduce motion, compact density).

## 8. Organization branding [N] (Office › Admin › Branding; owners only, admins see it read-only)
Per organization: preview tiles on light and dark (icon + wordmark), buttons Replace icon (square SVG/PNG ≥512), Replace wordmark (wide, light + dark variants), Favicon (32 and 180 px). Stored in org storage; shell reads `workspaces.logo_icon_url / logo_wordmark_url / logo_wordmark_dark_url / favicon_url` (add columns). Rendering rule: icon inside a fixed tile with `object-fit:contain`, never stretched. Audit log entry on every change.

## 9. Shared states (every app)
Loading skeletons; empty (illustration + one action); no results (Clear filters); error (plain words + Retry + reference); permission denied ("You don’t have access to this. Ask an owner."); read-only banner; archived banner; offline/retrying; conflict ("Changed elsewhere — Reload"). A page must never spin forever: after 10 s show the error state (Planner fix, see Planner brief).

## 10. V8 visual changes to the shell (these override any visual value above)
- Rail: same structure, order and behaviour; app marks are **flat** colour tiles (`03_ASSETS/app-icons/*-flat-mark.svg`), no gloss, no extruded edge. Active app: 3 px light bar on the left (unchanged).
- App sidebar: structure and text sizes unchanged (approved). Active item = `--sunk` tint + 2 px bar in `--app`; no floating white pill, no shadow. The sidebar never scrolls horizontally (names ellipsize).
- App bar: solid `--bg` with a 1 px bottom rule (v7 used blur glass). Height 52 px.
- Launcher: keeps the time-of-day sky, weather, **3D plates**, hover tilt, zoom-into-app and Bricolage hero (brand moment). Grid min tile width **150 px** (v7 176) so no app sits alone on a row.
- Typography: Geist everywhere else (`01_DESIGN_SYSTEM.md` §3).
- Phone (≤760): bottom tab bar `.bbar` with the app's first 4 nav items + **More**; the app bar shows the org mark that opens the **apps-and-account sheet** (screenshot `06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/00_SHELL_AND_LAUNCHER__phone-apps-and-account-sheet.jpg`).
- Captured states: notifications drawer, global search, apps menu, org switcher (`06_…/v8/overlays-1440/00_SHELL_AND_LAUNCHER__*.jpg`).
