# Client Portal · pages and navigation

5 pages documented (every page in the v7 route list for this app, plus every page template reached by following links). 5 templates in total. Each entry gives the 11 required fields: name/purpose, access, layout, sections, buttons/actions, inputs/filters, navigation/destinations, data, permissions, states, responsive.

Labels in back-ticks are the exact text or accessible name of the control in the V8 prototype. Controls present on every page (rail, app bar, Prototype button) are documented once in `01_APPLICATIONS/00_SHELL_AND_LAUNCHER/`.

## Page templates and their instances

| Template | Instances reached in the prototype | Documented as |
|---|---|---|
| `portal/home` | 1 | Home |
| `portal/requests` | 1 | Requests |
| `portal/approvals` | 1 | Approvals |
| `portal/notes` | 1 | My notes |
| `portal/note/:note` | 4 | Untitled note |

## Pages

### Home

- **Route (prototype):** `#/portal/home` — template `portal/home`
- **In the v7 route list:** yes — Home
- **How the user gets here:** linked from `clients/c/:client/Documents`, `clients/c/:client/Documents/Brand Base`, `clients/c/:client/Documents/Build`, `clients/c/:client/Documents/Contracts`, `clients/c/:client/Documents/Copy`, `clients/c/:client/Documents/Marketing`, `clients/c/:client/Documents/Strategy`, `clients/c/:client/Overview` …
- **Layout:** Focused layout (no rail/sidebar: full-height tool). Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/08_CLIENT_PORTAL/106_portal_home.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/08_CLIENT_PORTAL/106_portal_home.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/08_CLIENT_PORTAL/106_portal_home.jpg)
- **Sections and headings, in order:** “Your quiz funnel” · “Hi Harry. One thing needs you this week.” · “Your next step · due Friday” · “Approve your strategy (v2)” · “Your wins so far” · “Waiting on you” · “Updates from your team” · “Your team”
- **Buttons and actions (3):** `Approve strategy` — action `papprove`; `Open v2` — prototype stand-in (shows a toast: “Opens version 2 exactly as the team shared it.”); build the real action from the brief; `High five` — action `hi5`
- **Links (navigation) (8):** `Home` → `portal/home`; `Requests 2` → `portal/requests`; `Approvals 1` → `portal/approvals`; `My notes` → `portal/notes`; `Exit preview` → `clients/c/:client/overview`; `Ask for changes` → `portal/requests`; `Upload your logo files PNG or SVG` → `portal/requests`; `3 quick questions about pricing About 4 minutes` → `portal/requests`
- **Data shown (prototype sample data — not product data):** Upload your logo files PNG or SVG 3 quick questions about pricing About 4 minutes…
- **Permissions and visibility:** Client contacts of that client only; team owners via preview. Locked until security gate G2 (D10). [Confirmed]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Requests

- **Route (prototype):** `#/portal/requests` — template `portal/requests`
- **In the v7 route list:** yes — Requests
- **How the user gets here:** linked from `portal/approvals`, `portal/home`, `portal/note/:note`, `portal/notes`
- **Layout:** Focused layout (no rail/sidebar: full-height tool). Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/08_CLIENT_PORTAL/107_portal_requests.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/08_CLIENT_PORTAL/107_portal_requests.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/08_CLIENT_PORTAL/107_portal_requests.jpg)
- **Sections and headings, in order:** “Requests” · “Approve your strategy (v2)” · “Upload your logo files” · “3 quick questions about pricing”
- **Buttons and actions (4):** `Approve v2` — action `papprove`; `Request changes` — action `pchg` (opens: Request changes); `choose files` — prototype stand-in (shows a toast: “Preview only. Nothing is uploaded.”); build the real action from the brief; (icon) — prototype stand-in (shows a toast: “Preview only. Nothing was sent.”); build the real action from the brief
- **Links (navigation) (5):** `Home` → `portal/home`; `Requests 2` → `portal/requests`; `Approvals 1` → `portal/approvals`; `My notes` → `portal/notes`; `Exit preview` → `clients/c/:client/overview`
- **Inputs, filters and selects (1):** `Answer`
- **Data shown (prototype sample data — not product data):** Preview of what Harry will see. Clients can’t sign in until the security tests pass. HK Harry Kaye PT with Layer2Funnels Home Requests 2 Approvals 1 My notes Exit preview Requests Things your team needs from you. Reply right here. Approval Due Friday Strategy Approve your strategy (v2) Version 2, shared by Tabish on 22 Oct. Approve it or tell us what to change. PDF Strategy v2.pdf v2 Approve v2 Request changes Inform…
- **Permissions and visibility:** Client contacts of that client only; team owners via preview. Locked until security gate G2 (D10). [Confirmed]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). Page-specific state copy present in the prototype: “Preview of what Harry will see. Clients can’t sign in until the security tests pass.” | “Drop files here or answer below. We’ll get a notification.” | “Drop files here, or choose files”.
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Approvals

- **Route (prototype):** `#/portal/approvals` — template `portal/approvals`
- **In the v7 route list:** yes — Approvals
- **How the user gets here:** linked from `portal/home`, `portal/note/:note`, `portal/notes`, `portal/requests`
- **Layout:** Focused layout (no rail/sidebar: full-height tool). Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/08_CLIENT_PORTAL/108_portal_approvals.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/08_CLIENT_PORTAL/108_portal_approvals.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/08_CLIENT_PORTAL/108_portal_approvals.jpg)
- **Sections and headings, in order:** “Approvals” · “Approve your strategy (v2)” · “Upload your logo files” · “3 quick questions about pricing”
- **Buttons and actions (4):** `Approve v2` — action `papprove`; `Request changes` — action `pchg` (opens: Request changes); `choose files` — prototype stand-in (shows a toast: “Preview only. Nothing is uploaded.”); build the real action from the brief; (icon) — prototype stand-in (shows a toast: “Preview only. Nothing was sent.”); build the real action from the brief
- **Links (navigation) (5):** `Home` → `portal/home`; `Requests 2` → `portal/requests`; `Approvals 1` → `portal/approvals`; `My notes` → `portal/notes`; `Exit preview` → `clients/c/:client/overview`
- **Inputs, filters and selects (1):** `Answer`
- **Data shown (prototype sample data — not product data):** Preview of what Harry will see. Clients can’t sign in until the security tests pass. HK Harry Kaye PT with Layer2Funnels Home Requests 2 Approvals 1 My notes Exit preview Approvals Things your team needs from you. Reply right here. Approval Due Friday Strategy Approve your strategy (v2) Version 2, shared by Tabish on 22 Oct. Approve it or tell us what to change. PDF Strategy v2.pdf v2 Approve v2 Request changes Infor…
- **Permissions and visibility:** Client contacts of that client only; team owners via preview. Locked until security gate G2 (D10). [Confirmed]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). Page-specific state copy present in the prototype: “Preview of what Harry will see. Clients can’t sign in until the security tests pass.” | “Drop files here or answer below. We’ll get a notification.” | “Drop files here, or choose files”.
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### My notes

- **Route (prototype):** `#/portal/notes` — template `portal/notes`
- **In the v7 route list:** yes — My notes
- **How the user gets here:** linked from `portal/approvals`, `portal/home`, `portal/note/:note`, `portal/requests`
- **Layout:** Focused layout (no rail/sidebar: full-height tool). Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/08_CLIENT_PORTAL/109_portal_notes.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/08_CLIENT_PORTAL/109_portal_notes.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/08_CLIENT_PORTAL/109_portal_notes.jpg)
- **Purpose and spec (from the app brief):**
  > Repo `modules/portal.js`. Keep the design (journey road, approve flow, confetti on approval). Tabs: **Home · Requests · Approvals · My notes**. **Removed: Messages and Files** (clients have their own Drive; communication is not in the Portal). Requests: respond with text/files; Approvals: view version, Approve / Ask for changes (comment). My notes: private notes for the client. Header: org/agency logo, "Preview as <client>" banner for team, Exit preview → back to the client in Clients. Everything prepared while locked ("Save as prepared"); never imply it's live.
- **Sections and headings, in order:** “My notes” · “My morning routine ideas” · “Questions for the next call” · “Client wins to share”
- **Links (navigation) (9):** `Home` → `portal/home`; `Requests 2` → `portal/requests`; `Approvals 1` → `portal/approvals`; `My notes` → `portal/notes`; `Exit preview` → `clients/c/:client/overview`; `New note` → `portal/note/:note`; `My morning routine ideas Wake 6:00, 20 min walk, protein breakfast… Private · Today` → `portal/note/:note`; `Questions for the next call 1. Can the quiz have photos? 2. When do emails start? Private ` → `portal/note/:note`; `Client wins to share Sarah lost 6kg and kept it off. Private · 3 days ago` → `portal/note/:note`
- **Data shown (prototype sample data — not product data):** Preview of what Harry will see. Clients can’t sign in until the security tests pass. HK Harry Kaye PT with Layer2Funnels Home Requests 2 Approvals 1 My notes Exit preview My notes Your own space for ideas, plans and practice. Only you can see these. New note My morning routine ideas Wake 6:00, 20 min walk, protein breakfast… Private · Today Questions for the next call 1. Can the quiz have photos? 2. When do emails st…
- **Permissions and visibility:** Client contacts of that client only; team owners via preview. Locked until security gate G2 (D10). [Confirmed]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). Page-specific state copy present in the prototype: “Preview of what Harry will see. Clients can’t sign in until the security tests pass.”.
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Untitled note

- **Route (prototype):** `#/portal/note/new` — template `portal/note/:note` (4 instances in the prototype, e.g. `portal/note/new`, `portal/note/n1`, `portal/note/n2`, `portal/note/n3`)
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** linked from `portal/notes`
- **Layout:** Focused layout (no rail/sidebar: full-height tool). Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/08_CLIENT_PORTAL/165_portal_note_new.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/08_CLIENT_PORTAL/165_portal_note_new.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/08_CLIENT_PORTAL/165_portal_note_new.jpg)
- **Sections and headings, in order:** “Untitled note”
- **Buttons and actions (2):** `Share with team` — prototype stand-in (shows a toast: “Shared with your team. They can read it, not edit.”); build the real action from the brief; `Save` — prototype stand-in (shows a toast: “Saved.”); build the real action from the brief
- **Links (navigation) (6):** `Home` → `portal/home`; `Requests 2` → `portal/requests`; `Approvals 1` → `portal/approvals`; `My notes` → `portal/notes`; `Exit preview` → `clients/c/:client/overview`; `My notes` → `portal/notes`
- **Editable regions (1):** `Untitled note Start writing…`
- **Data shown (prototype sample data — not product data):** Preview of what Harry will see. Clients can’t sign in until the security tests pass. HK Harry Kaye PT with Layer2Funnels Home Requests 2 Approvals 1 My notes Exit preview My notes Only you Share with team Save Untitled note Start writing……
- **Permissions and visibility:** Client contacts of that client only; team owners via preview. Locked until security gate G2 (D10). [Confirmed]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). Page-specific state copy present in the prototype: “Preview of what Harry will see. Clients can’t sign in until the security tests pass.”.
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.
