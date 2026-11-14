# Global shell, Launcher and Profile · pages and navigation

9 pages documented (every page in the v7 route list for this app, plus every page template reached by following links). 9 templates in total. Each entry gives the 11 required fields: name/purpose, access, layout, sections, buttons/actions, inputs/filters, navigation/destinations, data, permissions, states, responsive.

Labels in back-ticks are the exact text or accessible name of the control in the V8 prototype. Controls present on every page (rail, app bar, Prototype button) are documented once in `01_APPLICATIONS/00_SHELL_AND_LAUNCHER/`.

## Page templates and their instances

| Template | Instances reached in the prototype | Documented as |
|---|---|---|
| `launcher` | 1 | Launcher |
| `profile` | 1 | Your profile (global) |
| `auth` | 1 | Sign in screens |
| `states` | 1 | Shared states |
| `system` | 1 | Design system |
| `profile/about` | 1 | Tabish Riaz |
| `profile/account` | 1 | Tabish Riaz |
| `profile/notifications` | 1 | Tabish Riaz |
| `profile/appearance` | 1 | Tabish Riaz |

## Pages

### Launcher

- **Route (prototype):** `#/launcher` — template `launcher`
- **In the v7 route list:** yes — Launcher
- **How the user gets here:** linked from `drive/edit/doc/:file`, `drive/edit/image/:file`, `drive/edit/pdf/:file`, `drive/edit/sheet/:file`, `drive/edit/slides/:file`, `fmp/funnel/:funnel`, `fmp/funnel/:funnel/reports`, `office/avatar-new` …
- **Layout:** Focused layout (no rail/sidebar: full-height tool). Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/00_SHELL_AND_LAUNCHER/001_launcher.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/00_SHELL_AND_LAUNCHER/001_launcher.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/00_SHELL_AND_LAUNCHER/001_launcher.jpg)
- **Purpose and spec (from the app brief):**
  > Repo today: `apps/web/js/views/shell.js` renders a 68 px header (app switcher, app name, search placeholder, bell placeholder, org switcher, avatar) and a sidebar with a profile footer. Replace with the structure below. Prototype: `prototype-source/core5.js` (rail, router, menus, inbox), `core6.js` (search scopes, profile page), routes `#/launcher`, any app page, `#/profile`.
  > - **Phone ≤760**: rail and sidebar hidden; bottom tab bar with the app's first 4 nav items + More sheet; the app bar shows the org mark which opens the "apps and account" sheet (launcher, search, notifications, org switch, profile, app grid).
  > Keep the v4/v5 launcher (time-of-day sky, weather from location, 3D plates, hover tilt, zoom-into-app). v7 changes: **slightly zoomed in**: content max 1240 px, tile min width 176 px, plates **96 px**, app name 16.5 px, description 13.5 px, hero title up to 76 px, search 52 px tall. Groups: Everyday (Office, Projects, Tasks, Clients, Drive, Planner, Client Portal) and Studio (Funnel Mapper, Forms, Value Ladder, Social Planner, Whiteboard, Layer 2 Agents). Header: org button, search, bell, profile. Below the shelf: **Jump back in** (4 recent items across apps). `/` focuses Find an app; Enter opens the first match. Weather can be turned off in the profile.
- **Sections and headings, in order:** “Organizations” · “Good morning, Tabish.” · “EVERYDAY” · “STUDIO” · “JUMP BACK IN”
- **Buttons and actions (4):** `Layer2Funnels` — action `orgmenu`; `Layer2FunnelsOwner · funnel agency` — action `org:l2f`; `AurjOwner · education` — action `org:aurj`; `Notifications` — action `inbox`
- **Links (navigation) (18):** `Your profile` → `profile`; `Office` → `office/home`; `Projects` → `projects/home`; `Tasks` → `tasks/today`; `Clients` → `clients/list`; `Drive` → `drive/home`; `Planner` → `planner/home`; `Client Portal` → `portal/home`; `Funnel Mapper` → `fmp/home`; `Forms` → `forms/list`; `Value Ladder` → `ladder/list`; `Social Planner` → `social/calendar`; `Whiteboard` → `whiteboard/home`; `Layer 2 Agents` → `agents/home`; `Q4 content calendar Sheet · edited 10 min ago` → `drive/edit/sheet/:file`; `Harry Kaye quiz funnel Project · 3 tasks due` → `projects/p/:project/list`; `John, the One Comma Club chaser Customer avatar` → `office/avatar/:avatar`; `2027 Growth plan Strategy builder` → `planner/plan/:plan/builder`
- **Inputs, filters and selects (1):** `Find an app`
- **Data shown (prototype sample data — not product data):** Layer2Funnels 6 Cloudy · 19° Good morning, Tabish. 3 things need you today. 2 client approvals came back. Find an app / EVERYDAY Office Home, plans, team and admin Projects Client and internal projects, end to end Tasks Lists, folders and mind maps for everyday to-dos Clients Pipeline, strategy and delivery Drive Files, SOPs and templates Planner Your week, in one view Locked Client Portal What your clients see and a…
- **Permissions and visibility:** Anyone with access to Global shell, Launcher and Profile in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). Page-specific state copy present in the prototype: “Preview”.
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Your profile (global)

- **Route (prototype):** `#/profile` — template `profile`
- **In the v7 route list:** yes — Your profile (global)
- **How the user gets here:** linked from `launcher`
- **Layout:** Focused layout (no rail/sidebar: full-height tool). Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/00_SHELL_AND_LAUNCHER/002_profile.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/00_SHELL_AND_LAUNCHER/002_profile.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/00_SHELL_AND_LAUNCHER/002_profile.jpg)
- **Purpose and spec (from the app brief):**
  > # 02 · Global shell: rail, Launcher, search, notifications, profile, branding
  > Repo today: `apps/web/js/views/shell.js` renders a 68 px header (app switcher, app name, search placeholder, bell placeholder, org switcher, avatar) and a sidebar with a profile footer. Replace with the structure below. Prototype: `prototype-source/core5.js` (rail, router, menus, inbox), `core6.js` (search scopes, profile page), routes `#/launcher`, any app page, `#/profile`.
  > - **Rail** (dark `#121317`, same in every app and both themes), top to bottom: org logo button (opens org menu) · apps grid button (opens apps menu) · divider · pinned apps (Office, Projects, Tasks, Clients, Drive, Planner; the current app is added if not pinned; active app has a 4 px light bar on the left) · spacer · search · bell with unread badge · profile photo (opens profile menu).
- **Sections and headings, in order:** “Tabish Riaz” · “YOUR ORGANIZATIONS”
- **Buttons and actions (3):** `Apps` — action `railmenu`; `Change photo` — action `photoedit` (opens: Profile photo); `Save` — prototype stand-in (shows a toast: “Profile saved.”); build the real action from the brief
- **Links (navigation) (20):** `Back` → `launcher`; `LauncherG L` → `launcher`; `Office` → `office/home`; `Projects` → `projects/home`; `Clients` → `clients/list`; `Drive` → `drive/home`; `Planner` → `planner/home`; `Client Portal` → `portal/home`; `Forms` → `forms/list`; `Value Ladder` → `ladder/list`; `Social Planner` → `social/calendar`; `Whiteboard` → `whiteboard/home`; `Funnel Mapper` → `fmp/home`; `Tasks` → `tasks/today`; `Layer 2 Agents` → `agents/home`; `My work in Office` → `office/member/:person`; `Profile` → `profile/about`; `Account & sign-in` → `profile/account`; `Notifications` → `profile/notifications`; `Appearance` → `profile/appearance`
- **Inputs, filters and selects (5):** `Tabish Riaz`; `Tabish`; `Founder`; `Asia/Karachi (PKT)`; `Building funnels for coaches and teaching in Urdu.`
- **Data shown (prototype sample data — not product data):** Your profile Shared across every app and both organizations Tabish Riaz Owner · Layer2Funnels · Owner · Aurj My work in Office Profile Account & sign-in Notifications Appearance Full name Display name Job title Time zone Asia/Karachi (PKT) About Save YOUR ORGANIZATIONS Layer2Funnels Owner · teammate · also client of 0 clients Aurj Owner · teammate One sign-in. Each organization keeps its own data and your role in it.…
- **Permissions and visibility:** Anyone with access to Global shell, Launcher and Profile in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Sign in screens

- **Route (prototype):** `#/auth` — template `auth`
- **In the v7 route list:** yes — Sign in screens
- **How the user gets here:** direct URL / in-page action
- **Layout:** Focused layout (no rail/sidebar: full-height tool). Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/00_SHELL_AND_LAUNCHER/003_auth.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/00_SHELL_AND_LAUNCHER/003_auth.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/00_SHELL_AND_LAUNCHER/003_auth.jpg)
- **Sections and headings, in order:** “One sign-in. Every app.” · “Sign in”
- **Buttons and actions (13):** `Sign in` — action `auth:signin`; `Sign up` — action `auth:signup`; `Check email` — action `auth:check`; `Reset` — action `auth:reset`; `New password` — action `auth:newpw`; `Invitation` — action `auth:invite`; `No organization` — action `auth:noorg`; `Session ended` — action `auth:expired`; `Continue with Google` — prototype stand-in (shows a toast: “Google sign-in is switched on at go-live.”); build the real action from the brief; `Show password` — action `pw:si-p`; `Forgot password?` — action `auth:reset`; `Sign in` — action `signin`; `Create an account` — action `auth:signup`
- **Inputs, filters and selects (1):** `you@company.com` (email)
- **Data shown (prototype sample data — not product data):** Layer2Funnels + Aurj L2 One sign-in. Every app. Two organizations, kept completely apart. You only ever see what you’ve been invited to. Prototype: pick a screen Sign in Sign up Check email Reset New password Invitation No organization Session ended Sign in Use the email you were invited with. Continue with Google or with email Email Password Forgot password? Sign in New here? Create an account Signing in on its own …
- **Permissions and visibility:** Public (sign-in, invitation acceptance). [Confirmed: 02]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Shared states

- **Route (prototype):** `#/states` — template `states`
- **In the v7 route list:** yes — Shared states
- **How the user gets here:** direct URL / in-page action
- **Layout:** Focused layout (no rail/sidebar: full-height tool). Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/00_SHELL_AND_LAUNCHER/004_states.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/00_SHELL_AND_LAUNCHER/004_states.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/00_SHELL_AND_LAUNCHER/004_states.jpg)
- **Purpose and spec (from the app brief):**
  > ## 9. Shared states (every app)
- **Sections and headings, in order:** “Shared states · every app” · “When things are loading, empty, broken or off limits.” · “No offers yet” · “No matches for “refund”” · “Nothing needs you right now” · “We couldn’t load this” · “We couldn’t find that”
- **Buttons and actions (7):** `Saving…`; `New offer` — action `noop`; `Clear search` — action `noop`; `Try again` — prototype stand-in (shows a toast: “Trying again…”); build the real action from the brief; `Details for support` — prototype stand-in (shows a toast: “Reference L2-7F3A copied for support.”); build the real action from the brief; `Try again` — prototype stand-in (shows a toast: “Saved.”); build the real action from the brief; `Edit offer` — prototype stand-in (shows a toast: “Viewers can read but not edit.”); build the real action from the brief
- **Links (navigation) (1):** `Go to Office Home` → `office/home`
- **Inputs, filters and selects (1):** `Starter coaching pack`
- **Data shown (prototype sample data — not product data):** Shared states · every app When things are loading, empty, broken or off limits. One wording and one layout for each state, so people learn it once. Colour is never the only signal: errors have ✗, success has ✓, warnings have a triangle. LOADING Saving… EMPTY · FIRST USE L2 No offers yet Offers you create for this client show up here. New offer NO RESULTS No matches for “refund” Try fewer words, or check the spelling.…
- **Permissions and visibility:** Anyone with access to Global shell, Launcher and Profile in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). Page-specific state copy present in the prototype: “No offers yet” | “Nothing needs you right now”.
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Design system

- **Route (prototype):** `#/system` — template `system`
- **In the v7 route list:** yes — Design system
- **How the user gets here:** direct URL / in-page action
- **Layout:** Focused layout (no rail/sidebar: full-height tool). Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/00_SHELL_AND_LAUNCHER/005_system.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/00_SHELL_AND_LAUNCHER/005_system.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/00_SHELL_AND_LAUNCHER/005_system.jpg)
- **Sections and headings, in order:** “Layer2Funnels + Aurj · Design language v3” · “Ink stage. Paper desk. One signal.” · “Principles” · “Colour” · “Layer2Funnels” · “Aurj (until brand files arrive)” · “App plates” · “Type” · “Recent updates” · “App icons” · “Interface icons” · “Controls” · “Depth” · “Motion”
- **Buttons and actions (9):** `New client` — prototype stand-in (shows a toast: “Primary”); build the real action from the brief; `Save changes` — action `noop`; `Approve` — action `noop`; `Cancel` — action `noop`; `More options` — action `noop`; `Turn on` — prototype stand-in (shows a toast: “Turned-off buttons stay visible and explain why.”); build the real action from the brief; `Press me` — action `noop`; `Open dialog` — action `demo-dlg`; (icon) — action `demo-spring`
- **Links (navigation) (1):** `Go to Launcher` → `launcher`
- **Inputs, filters and selects (1):** `Harry Kaye PT`
- **Data shown (prototype sample data — not product data):** Layer2Funnels + Aurj · Design language v3 Ink stage. Paper desk. One signal. The Launcher is a dark stage where apps sit as dimensional plates. Inside, work happens on calm paper surfaces. Yellow is the signal: it marks the one thing that matters on a screen. Blue means “do” and “done”. L2 01 Principles a Depth means something 3D is used for things you can open, press or pick up: app icons, the main next step, dragge…
- **Permissions and visibility:** Anyone with access to Global shell, Launcher and Profile in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Tabish Riaz

- **Route (prototype):** `#/profile/about` — template `profile/about`
- **Note:** this route renders the same content as `#/profile` (alias / default sub-page).
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** linked from `profile`, `profile/account`, `profile/appearance`, `profile/notifications`
- **Layout:** Focused layout (no rail/sidebar: full-height tool). Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/00_SHELL_AND_LAUNCHER/124_profile_about.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/00_SHELL_AND_LAUNCHER/124_profile_about.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/00_SHELL_AND_LAUNCHER/124_profile_about.jpg)
- **Purpose and spec (from the app brief):**
  > Own page (not inside Office), focused layout with rail. Header with cover, **circular photo 112 px** (cover-fit, change-photo dialog with zoom slider), name, roles in both orgs, link "My work in Office". Tabs: Profile (name, display name, job title, time zone, about, Save; Your organizations list) · Account & sign-in (email, password change, Google sign-in later, signed-in devices + sign out others) · Notifications (table above) · Appearance (Light/Dark/System, weather sky toggle, reduce motion, compact density).
- **Sections and headings, in order:** “Tabish Riaz” · “YOUR ORGANIZATIONS”
- **Buttons and actions (3):** `Apps` — action `railmenu`; `Change photo` — action `photoedit` (opens: Profile photo); `Save` — prototype stand-in (shows a toast: “Profile saved.”); build the real action from the brief
- **Links (navigation) (20):** `Back` → `launcher`; `LauncherG L` → `launcher`; `Office` → `office/home`; `Projects` → `projects/home`; `Clients` → `clients/list`; `Drive` → `drive/home`; `Planner` → `planner/home`; `Client Portal` → `portal/home`; `Forms` → `forms/list`; `Value Ladder` → `ladder/list`; `Social Planner` → `social/calendar`; `Whiteboard` → `whiteboard/home`; `Funnel Mapper` → `fmp/home`; `Tasks` → `tasks/today`; `Layer 2 Agents` → `agents/home`; `My work in Office` → `office/member/:person`; `Profile` → `profile/about`; `Account & sign-in` → `profile/account`; `Notifications` → `profile/notifications`; `Appearance` → `profile/appearance`
- **Inputs, filters and selects (5):** `Tabish Riaz`; `Tabish`; `Founder`; `Asia/Karachi (PKT)`; `Building funnels for coaches and teaching in Urdu.`
- **Data shown (prototype sample data — not product data):** Your profile Shared across every app and both organizations Tabish Riaz Owner · Layer2Funnels · Owner · Aurj My work in Office Profile Account & sign-in Notifications Appearance Full name Display name Job title Time zone Asia/Karachi (PKT) About Save YOUR ORGANIZATIONS Layer2Funnels Owner · teammate · also client of 0 clients Aurj Owner · teammate One sign-in. Each organization keeps its own data and your role in it.…
- **Permissions and visibility:** Anyone with access to Global shell, Launcher and Profile in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Tabish Riaz

- **Route (prototype):** `#/profile/account` — template `profile/account`
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** linked from `profile`, `profile/about`, `profile/appearance`, `profile/notifications`
- **Layout:** Focused layout (no rail/sidebar: full-height tool). Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/00_SHELL_AND_LAUNCHER/125_profile_account.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/00_SHELL_AND_LAUNCHER/125_profile_account.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/00_SHELL_AND_LAUNCHER/125_profile_account.jpg)
- **Sections and headings, in order:** “Tabish Riaz”
- **Buttons and actions (4):** `Apps` — action `railmenu`; `Change photo` — action `photoedit` (opens: Profile photo); `Change` — prototype stand-in (shows a toast: “Change password opens.”); build the real action from the brief; `Sign out others` — prototype stand-in (shows a toast: “Signed out of other devices.”); build the real action from the brief
- **Links (navigation) (20):** `Back` → `launcher`; `LauncherG L` → `launcher`; `Office` → `office/home`; `Projects` → `projects/home`; `Clients` → `clients/list`; `Drive` → `drive/home`; `Planner` → `planner/home`; `Client Portal` → `portal/home`; `Forms` → `forms/list`; `Value Ladder` → `ladder/list`; `Social Planner` → `social/calendar`; `Whiteboard` → `whiteboard/home`; `Funnel Mapper` → `fmp/home`; `Tasks` → `tasks/today`; `Layer 2 Agents` → `agents/home`; `My work in Office` → `office/member/:person`; `Profile` → `profile/about`; `Account & sign-in` → `profile/account`; `Notifications` → `profile/notifications`; `Appearance` → `profile/appearance`
- **Inputs, filters and selects (1):** `tabish@layer2funnels.com`
- **Data shown (prototype sample data — not product data):** Your profile Shared across every app and both organizations Tabish Riaz Owner · Layer2Funnels · Owner · Aurj My work in Office Profile Account & sign-in Notifications Appearance Email Password Changed 3 months ago Change Google sign-in Turns on at go-live Later Signed-in devices This Chrome on Windows · now Sign out others Password Changed 3 months ago Google sign-in Turns on at go-live Signed-in devices This Chrome …
- **Permissions and visibility:** Anyone with access to Global shell, Launcher and Profile in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Tabish Riaz

- **Route (prototype):** `#/profile/notifications` — template `profile/notifications`
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** linked from `profile`, `profile/about`, `profile/account`, `profile/appearance`
- **Layout:** Focused layout (no rail/sidebar: full-height tool). Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/00_SHELL_AND_LAUNCHER/126_profile_notifications.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/00_SHELL_AND_LAUNCHER/126_profile_notifications.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/00_SHELL_AND_LAUNCHER/126_profile_notifications.jpg)
- **Purpose and spec (from the app brief):**
  > # 02 · Global shell: rail, Launcher, search, notifications, profile, branding
  > - **Phone ≤760**: rail and sidebar hidden; bottom tab bar with the app's first 4 nav items + More sheet; the app bar shows the org mark which opens the "apps and account" sheet (launcher, search, notifications, org switch, profile, app grid).
  > - Repo: `0034` added shared notifications for Projects (`private.collab_scope`). Generalize: `notifications(id, workspace_id, user_id, app, kind, actor_id, title, href, read_at, created_at)`; each app writes through one service. Badge = unread count in the current org.
- **Sections and headings, in order:** “Tabish Riaz”
- **Buttons and actions (3):** `Apps` — action `railmenu`; `Change photo` — action `photoedit` (opens: Profile photo); `In app` — action `tgl`
- **Links (navigation) (20):** `Back` → `launcher`; `LauncherG L` → `launcher`; `Office` → `office/home`; `Projects` → `projects/home`; `Clients` → `clients/list`; `Drive` → `drive/home`; `Planner` → `planner/home`; `Client Portal` → `portal/home`; `Forms` → `forms/list`; `Value Ladder` → `ladder/list`; `Social Planner` → `social/calendar`; `Whiteboard` → `whiteboard/home`; `Funnel Mapper` → `fmp/home`; `Tasks` → `tasks/today`; `Layer 2 Agents` → `agents/home`; `My work in Office` → `office/member/:person`; `Profile` → `profile/about`; `Account & sign-in` → `profile/account`; `Notifications` → `profile/notifications`; `Appearance` → `profile/appearance`
- **Inputs, filters and selects (1):** `Daily Never Instantly`
- **Data shown (prototype sample data — not product data):** Your profile Shared across every app and both organizations Tabish Riaz Owner · Layer2Funnels · Owner · Aurj My work in Office Profile Account & sign-in Notifications Appearance Notifications from every app arrive in one inbox, the bell on the left. Choose what reaches you. App In-app inbox Email digest Mentions Approvals Projects Daily Never Instantly Always Always Tasks Daily Never Instantly Always Always Clients D…
- **Permissions and visibility:** Anyone with access to Global shell, Launcher and Profile in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Tabish Riaz

- **Route (prototype):** `#/profile/appearance` — template `profile/appearance`
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** linked from `profile`, `profile/about`, `profile/account`, `profile/notifications`
- **Layout:** Focused layout (no rail/sidebar: full-height tool). Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/00_SHELL_AND_LAUNCHER/127_profile_appearance.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/00_SHELL_AND_LAUNCHER/127_profile_appearance.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/00_SHELL_AND_LAUNCHER/127_profile_appearance.jpg)
- **Sections and headings, in order:** “Tabish Riaz” · “THEME”
- **Buttons and actions (8):** `Apps` — action `railmenu`; `Change photo` — action `photoedit` (opens: Profile photo); `Light` — action `demo:theme=light`; `Dark` — action `demo:theme=dark`; `System` — prototype stand-in (shows a toast: “Follows your device.”); build the real action from the brief; `Weather` — action `wxtoggle`; `Reduce motion` — action `tgl`; `Compact` — action `tgl`
- **Links (navigation) (20):** `Back` → `launcher`; `LauncherG L` → `launcher`; `Office` → `office/home`; `Projects` → `projects/home`; `Clients` → `clients/list`; `Drive` → `drive/home`; `Planner` → `planner/home`; `Client Portal` → `portal/home`; `Forms` → `forms/list`; `Value Ladder` → `ladder/list`; `Social Planner` → `social/calendar`; `Whiteboard` → `whiteboard/home`; `Funnel Mapper` → `fmp/home`; `Tasks` → `tasks/today`; `Layer 2 Agents` → `agents/home`; `My work in Office` → `office/member/:person`; `Profile` → `profile/about`; `Account & sign-in` → `profile/account`; `Notifications` → `profile/notifications`; `Appearance` → `profile/appearance`
- **Data shown (prototype sample data — not product data):** Your profile Shared across every app and both organizations Tabish Riaz Owner · Layer2Funnels · Owner · Aurj My work in Office Profile Account & sign-in Notifications Appearance THEME Light Dark System Weather and time sky on the Launcher Reduce motion Compact density…
- **Permissions and visibility:** Anyone with access to Global shell, Launcher and Profile in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

## Controls present on every page (documented once)

- button: `Apps and account`
- button: `Collapse sidebar`
- button: `More`
- button: `Search everything`
