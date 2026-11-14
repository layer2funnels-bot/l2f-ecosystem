# Funnel Mapper · pages and navigation

10 pages documented (every page in the v7 route list for this app, plus every page template reached by following links). 10 templates in total. Each entry gives the 11 required fields: name/purpose, access, layout, sections, buttons/actions, inputs/filters, navigation/destinations, data, permissions, states, responsive.

Labels in back-ticks are the exact text or accessible name of the control in the V8 prototype. Controls present on every page (rail, app bar, Prototype button) are documented once in `01_APPLICATIONS/00_SHELL_AND_LAUNCHER/`.

## Sidebar menu

- **Home** → `fmp/home`
- **Clients 4** → `fmp/clients`
- **Funnels 6** → `fmp/funnels`
- **Templates** → `fmp/templates`
- **Trash 3** → `fmp/trash`
- **Sam Carter** → `fmp/client/:client`
- **Priya Nair** → `fmp/client/:client`
- **Marcus Lee** → `fmp/client/:client`
- **Settings** → `fmp/settings`
- **Help & shortcuts ?** → `fmp/help`

## Page templates and their instances

| Template | Instances reached in the prototype | Documented as |
|---|---|---|
| `fmp/home` | 1 | Home |
| `fmp/clients` | 1 | Clients |
| `fmp/client/:client` | 4 | Client |
| `fmp/funnels` | 1 | Funnels |
| `fmp/funnel/:funnel` | 6 | Editor |
| `fmp/funnel/:funnel/reports` | 6 | Reports |
| `fmp/templates` | 1 | Templates |
| `fmp/trash` | 1 | Trash |
| `fmp/settings` | 1 | Settings |
| `fmp/help` | 1 | Help & shortcuts |

## Pages

### Home

- **Route (prototype):** `#/fmp/home` — template `fmp/home`
- **In the v7 route list:** yes — Home
- **How the user gets here:** sidebar item **Home**; breadcrumb Home; linked from `drive/edit/doc/:file`, `drive/edit/image/:file`, `drive/edit/pdf/:file`, `drive/edit/sheet/:file`, `drive/edit/slides/:file`, `fmp/client/:client`, `fmp/clients`, `fmp/funnel/:funnel` …
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/07_FUNNEL_MAPPER/069_fmp_home.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/07_FUNNEL_MAPPER/069_fmp_home.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/07_FUNNEL_MAPPER/069_fmp_home.jpg)
- **Purpose and spec (from the app brief):**
  > - Visual sizes match prototype `#/fmp/home`, `#/fmp/funnels`, `#/fmp/client/sc`, `#/fmp/funnel/pt`, `#/fmp/funnel/pt/reports`, `#/fmp/settings`.
- **Sections and headings, in order:** “Good evening, Tabish” · “Pick up where you left off” · “Recent funnels” · “Needs attention” · “Client pipeline”
- **Buttons and actions (10):** `Apps` — action `msheet`; `Search clients, funnels, templates… ⌘K` — action `fsearch`; `New client` — action `fnewclient` (opens: New client); `New funnel` — action `fnewfunnel` (opens: New funnel); `This month`; `Year`; `Fix`; `Open`; `Follow up`; `Set pricing`
- **Links (navigation) (16):** `All funnels` → `fmp/funnels`; `6 blocks PT tripwire funnel Live Sam Carter · edited today · $7,485/mo` → `fmp/funnel/:funnel`; `7 blocks Webinar funnel Live Priya Nair · edited today · £13,182/mo` → `fmp/funnel/:funnel`; `5 blocks Application → call Proposed Marcus Lee · edited today · $3,544/mo` → `fmp/funnel/:funnel`; `View 11` → `fmp/funnels`; `PT tripwire funnel Sam Carter Live Baseline $7,485 $6,825 11.34x 4 to fix just now` → `fmp/funnel/:funnel`; `Webinar funnel Priya Nair Live Baseline £13,182 £11,332 7.3x All clear 9 h ago` → `fmp/funnel/:funnel`; `Application → call Marcus Lee Proposed Best case $3,544 $671 1.48x 1 to fix 9 h ago` → `fmp/funnel/:funnel`; `PT tripwire (copy) Sam Carter Live Baseline $55,765 $51,614 13.43x All clear 9 h ago` → `fmp/funnel/:funnel`; `Subscription + A/B test Ayesha Khan Draft Baseline AED 702 −AED 198 0.78x 2 to fix 9 h ago` → `fmp/funnel/:funnel`; `Clients` → `clients/list`; `Home` → `fmp/home`; `Clients` → `fmp/clients`; `Funnels` → `fmp/funnels`; `Templates` → `fmp/templates`; `Trash` → `fmp/trash`
- **Data shown (prototype sample data — not product data):** Home Search clients, funnels, templates… ⌘K New client New funnel THURSDAY 12 NOVEMBER Good evening, Tabish This month Year Active clients 2 1 proposal · 1 lead Live funnels 4 2 proposed · 11 total Planned revenue / mo $70.7k + £13.2k · live funnels Agency MRR $3,700 retainers + recurring fees Pick up where you left off All funnels 6 blocks PT tripwire funnel Live Sam Carter · edited today · $7,485/mo 7 blocks Webina…
- **Permissions and visibility:** Anyone with access to Funnel Mapper in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Clients

- **Route (prototype):** `#/fmp/clients` — template `fmp/clients`
- **In the v7 route list:** yes — Clients
- **How the user gets here:** sidebar item **Clients 4**; breadcrumb Clients; linked from `fmp/client/:client`, `fmp/funnels`, `fmp/help`, `fmp/home`, `fmp/settings`, `fmp/templates`, `fmp/trash`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/07_FUNNEL_MAPPER/070_fmp_clients.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/07_FUNNEL_MAPPER/070_fmp_clients.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/07_FUNNEL_MAPPER/070_fmp_clients.jpg)
- **Purpose and spec (from the app brief):**
  > 4. **Shared clients [N]** (03 §3): FM reads clients from the ecosystem **Client service**; "New client" in FM creates through the service (dialog: name, business, email, status; duplicate check "Link to existing"); clients created in Clients appear in FM automatically. FM keeps client-specific data (products, notes, pricing model, funnels). Banner on FM Clients page: "Shared with the Clients app…". FM client page links "Open in Clients". Org boundaries: L2F only (Aurj shows "isn’t set up in Aurj" + switch).
  > 1. Read-only: FM lists ecosystem clients next to its own (behind a flag). 2. Matching report (email/name) for Tabish to approve. 3. Write-through creation from FM. 4. Switch FM to the service as source of truth; keep old rows with `migrated_to` until verified. No destructive migration without approval.
- **Sections and headings, in order:** “Clients”
- **Buttons and actions (4):** `Apps` — action `msheet`; `Search clients, funnels, templates… ⌘K` — action `fsearch`; `New client` — action `fnewclient` (opens: New client); `New funnel` — action `fnewfunnel` (opens: New funnel)
- **Links (navigation) (10):** `Open Clients` → `clients/list`; `SC Sam Carter Carter Strength Co. Active 3 funnels · £1,500 / mo` → `fmp/client/:client`; `PN Priya Nair Nair Wellness Proposal 1 funnels · £2,400` → `fmp/client/:client`; `ML Marcus Lee Lee Consulting Lead 1 funnels · —` → `fmp/client/:client`; `AK Ayesha Khan Khan Beauty Paused 1 funnels · AED 3,000` → `fmp/client/:client`; `Home` → `fmp/home`; `Clients` → `fmp/clients`; `Funnels` → `fmp/funnels`; `Templates` → `fmp/templates`; `Trash` → `fmp/trash`
- **Data shown (prototype sample data — not product data):** Clients Search clients, funnels, templates… ⌘K New client New funnel Clients Everyone you map funnels for. Shared with the Clients app. Add a client here or in Clients and it appears in both: one record, no copies. Funnels, products and numbers stay in Funnel Mapper. Open Clients SC Sam Carter Carter Strength Co. Active 3 funnels · £1,500 / mo PN Priya Nair Nair Wellness Proposal 1 funnels · £2,400 ML Marcus Lee Lee …
- **Permissions and visibility:** Anyone with access to Funnel Mapper in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Client

- **Route (prototype):** `#/fmp/client/sc` — template `fmp/client/:client` (4 instances in the prototype, e.g. `fmp/client/sc`, `fmp/client/pn`, `fmp/client/ml`, `fmp/client/ak`)
- **In the v7 route list:** yes — Client
- **How the user gets here:** sidebar item **Clients 4**; breadcrumb Clients › Sam Carter; linked from `fmp/clients`, `fmp/funnel/:funnel`, `fmp/funnel/:funnel/reports`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/07_FUNNEL_MAPPER/071_fmp_client_sc.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/07_FUNNEL_MAPPER/071_fmp_client_sc.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/07_FUNNEL_MAPPER/071_fmp_client_sc.jpg)
- **Purpose and spec (from the app brief):**
  > 3. **Sizes one step up [R]** (feedback: everything too small): base 13.5 → 14.5 px; sidebar items 14.5 px / 38 px; page titles 30 px; KPI values 30 px; table rows 46 px / 14 px; buttons 34 px (small 30); top bar 52 px; library tiles and product rows +1 px; blocks 170 px wide with 13.5 px titles; inspector title 17 px; KPI bar 13.5 px. Check every page incl. forms (New client sheet, New funnel dialog, template customize, share, settings).
  > 4. **Shared clients [N]** (03 §3): FM reads clients from the ecosystem **Client service**; "New client" in FM creates through the service (dialog: name, business, email, status; duplicate check "Link to existing"); clients created in Clients appear in FM automatically. FM keeps client-specific data (products, notes, pricing model, funnels). Banner on FM Clients page: "Shared with the Clients app…". FM client page links "Open in Clients". Org boundaries: L2F only (Aurj shows "isn’t set up in Aurj" + switch).
  > - Create client in FM → appears in Clients; in Clients → appears in FM; same email → one record.
- **Sections and headings, in order:** “Sam Carter Active” · “Key numbers” · “Tags”
- **Buttons and actions (11):** `Apps` — action `msheet`; `Search clients, funnels, templates… ⌘K` — action `fsearch`; `New client` — action `fnewclient` (opens: New client); `New funnel` — action `fnewfunnel` (opens: New funnel); `Share portfolio` — prototype stand-in (shows a toast: “Share portfolio link.”); build the real action from the brief; `Funnels 3` — action `fctab:funnels`; `Products 3` — action `fctab:products`; `Notes` — action `fctab:notes`; `Details` — action `fctab:details`; `New funnel from a template` — action `fnewfunnel` (opens: New funnel); `+ tag`
- **Links (navigation) (8):** `Clients` → `fmp/clients`; `6 blocks PT tripwire funnel Live Revenue / mo $7,485 Profit / mo $6,825 ROAS 11.34x 3 scen` → `fmp/funnel/:funnel`; `6 blocks PT tripwire (copy) Live Revenue / mo $55,765 Profit / mo $51,614 ROAS 13.43x 3 sc` → `fmp/funnel/:funnel`; `6 blocks Quiz → coaching Draft Revenue / mo $2,140 Profit / mo $1,480 ROAS 3.2x 3 scenario` → `fmp/funnel/:funnel`; `Home` → `fmp/home`; `Funnels` → `fmp/funnels`; `Templates` → `fmp/templates`; `Trash` → `fmp/trash`
- **Data shown (prototype sample data — not product data):** Clients / Sam Carter Search clients, funnels, templates… ⌘K New client New funnel SC Sam Carter Active Carter Strength Co. · Fitness · United Kingdom · sam@carterstrength.co Monthly retainer £1,500 / mo Share portfolio New funnel Funnels 3 Products 3 Notes Details 6 blocks PT tripwire funnel Live Revenue / mo $7,485 Profit / mo $6,825 ROAS 11.34x 3 scenarios · 4 to fix · Reports 6 blocks PT tripwire (copy) Live Reven…
- **Permissions and visibility:** Anyone with access to Funnel Mapper in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Funnels

- **Route (prototype):** `#/fmp/funnels` — template `fmp/funnels`
- **In the v7 route list:** yes — Funnels
- **How the user gets here:** sidebar item **Funnels 6**; breadcrumb Funnels; linked from `clients/c/:client/Overview`, `fmp/client/:client`, `fmp/clients`, `fmp/funnel/:funnel`, `fmp/funnel/:funnel/reports`, `fmp/help`, `fmp/home`, `fmp/settings` …
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/07_FUNNEL_MAPPER/072_fmp_funnels.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/07_FUNNEL_MAPPER/072_fmp_funnels.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/07_FUNNEL_MAPPER/072_fmp_funnels.jpg)
- **Purpose and spec (from the app brief):**
  > 4. **Shared clients [N]** (03 §3): FM reads clients from the ecosystem **Client service**; "New client" in FM creates through the service (dialog: name, business, email, status; duplicate check "Link to existing"); clients created in Clients appear in FM automatically. FM keeps client-specific data (products, notes, pricing model, funnels). Banner on FM Clients page: "Shared with the Clients app…". FM client page links "Open in Clients". Org boundaries: L2F only (Aurj shows "isn’t set up in Aurj" + switch).
  > - Visual sizes match prototype `#/fmp/home`, `#/fmp/funnels`, `#/fmp/client/sc`, `#/fmp/funnel/pt`, `#/fmp/funnel/pt/reports`, `#/fmp/settings`.
- **Sections and headings, in order:** “Funnels”
- **Buttons and actions (10):** `Apps` — action `msheet`; `Search clients, funnels, templates… ⌘K` — action `fsearch`; `New client` — action `fnewclient` (opens: New client); `New funnel` — action `fnewfunnel` (opens: New funnel); `All 11` — action `chipt`; `Live 4` — action `chipt`; `Proposed 2` — action `chipt`; `Draft 4` — action `chipt`; `Archived 1` — action `chipt`; `Needs attention` — action `chipt`
- **Links (navigation) (11):** `PT tripwire funnel Sam Carter Live Baseline $7,485 $6,825 11.34x 4 to fix just now` → `fmp/funnel/:funnel`; `Webinar funnel Priya Nair Live Baseline £13,182 £11,332 7.3x All clear 9 h ago` → `fmp/funnel/:funnel`; `Application → call Marcus Lee Proposed Best case $3,544 $671 1.48x 1 to fix 9 h ago` → `fmp/funnel/:funnel`; `PT tripwire (copy) Sam Carter Live Baseline $55,765 $51,614 13.43x All clear 9 h ago` → `fmp/funnel/:funnel`; `Subscription + A/B test Ayesha Khan Draft Baseline AED 702 −AED 198 0.78x 2 to fix 9 h ago` → `fmp/funnel/:funnel`; `Quiz → coaching Sam Carter Draft Baseline $2,140 $1,480 3.2x 1 to fix 9 h ago` → `fmp/funnel/:funnel`; `Home` → `fmp/home`; `Clients` → `fmp/clients`; `Funnels` → `fmp/funnels`; `Templates` → `fmp/templates`; `Trash` → `fmp/trash`
- **Inputs, filters and selects (2):** `Client Sam Carter Priya Nair Marcus Lee Ayesha Khan Internal (Layer2Funnels)`; `Recently updated`
- **Data shown (prototype sample data — not product data):** Funnels Search clients, funnels, templates… ⌘K New client New funnel Funnels Every map across your clients. Numbers are per month for each funnel’s selected scenario. All 11 Live 4 Proposed 2 Draft 4 Archived 1 Client Sam Carter Priya Nair Marcus Lee Ayesha Khan Internal (Layer2Funnels) Needs attention Recently updated FUNNEL CLIENT STATUS SCENARIO REVENUE / MO PROFIT / MO ROAS MODEL CHECKS UPDATED PT tripwire funnel…
- **Permissions and visibility:** Anyone with access to Funnel Mapper in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Editor

- **Route (prototype):** `#/fmp/funnel/pt` — template `fmp/funnel/:funnel` (6 instances in the prototype, e.g. `fmp/funnel/pt`, `fmp/funnel/wb`, `fmp/funnel/ac`, `fmp/funnel/ptc`)
- **In the v7 route list:** yes — Editor
- **How the user gets here:** breadcrumb Sam Carter › PT tripwire funnel; linked from `fmp/client/:client`, `fmp/funnel/:funnel/reports`, `fmp/funnels`, `fmp/home`
- **Layout:** Focused layout (no rail/sidebar: full-height tool). Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/07_FUNNEL_MAPPER/073_fmp_funnel_pt.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/07_FUNNEL_MAPPER/073_fmp_funnel_pt.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/07_FUNNEL_MAPPER/073_fmp_funnel_pt.jpg)
- **Purpose and spec (from the app brief):**
  > 3. **Sizes one step up [R]** (feedback: everything too small): base 13.5 → 14.5 px; sidebar items 14.5 px / 38 px; page titles 30 px; KPI values 30 px; table rows 46 px / 14 px; buttons 34 px (small 30); top bar 52 px; library tiles and product rows +1 px; blocks 170 px wide with 13.5 px titles; inspector title 17 px; KPI bar 13.5 px. Check every page incl. forms (New client sheet, New funnel dialog, template customize, share, settings).
  > - No "Pro" in any UI string (grep test). Golden funnel numbers unchanged (89.1 / 6,032.11 / 5,582.11 / 13.40x).
  > - Visual sizes match prototype `#/fmp/home`, `#/fmp/funnels`, `#/fmp/client/sc`, `#/fmp/funnel/pt`, `#/fmp/funnel/pt/reports`, `#/fmp/settings`.
- **Sections and headings, in order:** “PT tripwire funnel”
- **Buttons and actions (43):** `Apps` — action `railmenu`; `Scenario: Baseline`; `Undo`; `Redo`; `Tidy up` — prototype stand-in (shows a toast: “Tidy up”); build the real action from the brief; `Comments`; `History`; `Present` — prototype stand-in (shows a toast: “Present”); build the real action from the brief; `Share` — action `fshare` (opens: Share funnel); `layers`; `search`; `copy`; `note`; `imgI`; `Instagram Ads`; `Facebook Ads`; `Quiz page`; `Checkout`; `WhatsApp`; `Condition`; `Facebook`; `Instagram`; `Google Ads`; `YouTube`; `TikTok`; `LinkedIn`; `Show all 169`; `Clean` — action `fview:clean`; `Performance` — action `fview:perf`; `Layers` — prototype stand-in (shows a toast: “Layers”); build the real action from the brief; `−`; `+`; `Model` — action `fins:model`; `Simulate` — action `fins:simulate`; `Track` — action `fins:track`; `Overview`; `Steps`; `Sources`; `Costs`; `First payment`; `Lifetime value`; `Checks · 4 to fix`; `+7`
- **Links (navigation) (20):** `Back` → `fmp/funnels`; `LauncherG L` → `launcher`; `Office` → `office/home`; `Projects` → `projects/home`; `Clients` → `clients/list`; `Drive` → `drive/home`; `Planner` → `planner/home`; `Client Portal` → `portal/home`; `Forms` → `forms/list`; `Value Ladder` → `ladder/list`; `Social Planner` → `social/calendar`; `Whiteboard` → `whiteboard/home`; `Funnel Mapper` → `fmp/home`; `Tasks` → `tasks/today`; `Layer 2 Agents` → `agents/home`; `Sam Carter` → `fmp/client/:client`; `Map` → `fmp/funnel/:funnel`; `Reports` → `fmp/funnel/:funnel/reports`; `Fix in order`; `Locate`
- **Inputs, filters and selects (1):** `Search blocks`
- **Data shown (prototype sample data — not product data):** Sam Carter / PT tripwire funnel Scenario: Baseline Saved Map Reports Tidy up Share Blocks RECENT Instagram Ads Facebook Ads Quiz page Checkout WhatsApp Condition SAM CARTER’S PRODUCTS 6-Week Kickstart · £27 Monthly coaching · £197 Kickstart (£27) ALL BLOCKS · TRAFFIC SOURCES 19 Facebook Instagram Google Ads YouTube TikTok LinkedIn Show all 169 Clean Performance Layers Instagram ads Traffic Sam Carter 6W Traffic Fitne…
- **Permissions and visibility:** Anyone with access to Funnel Mapper in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). Page-specific state copy present in the prototype: “Nothing selected · click a block to edit it”.
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Reports

- **Route (prototype):** `#/fmp/funnel/pt/reports` — template `fmp/funnel/:funnel/reports` (6 instances in the prototype, e.g. `fmp/funnel/pt/reports`, `fmp/funnel/wb/reports`, `fmp/funnel/ac/reports`, `fmp/funnel/ptc/reports`)
- **In the v7 route list:** yes — Reports
- **How the user gets here:** breadcrumb Sam Carter › PT tripwire funnel; linked from `fmp/funnel/:funnel`
- **Layout:** Focused layout (no rail/sidebar: full-height tool). Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/07_FUNNEL_MAPPER/074_fmp_funnel_pt_reports.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/07_FUNNEL_MAPPER/074_fmp_funnel_pt_reports.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/07_FUNNEL_MAPPER/074_fmp_funnel_pt_reports.jpg)
- **Sections and headings, in order:** “Overview” · “Revenue and profit, 12 months” · “People lost per step”
- **Buttons and actions (25):** `Apps` — action `railmenu`; `Scenario: Baseline`; `Undo`; `Redo`; `Tidy up` — prototype stand-in (shows a toast: “Tidy up”); build the real action from the brief; `Comments`; `History`; `Present` — prototype stand-in (shows a toast: “Present”); build the real action from the brief; `Share` — action `fshare` (opens: Share funnel); `Overview`; `Funnel data`; `Published status`; `Traffic sources`; `Offers & products`; `Expenses`; `Scenario comparison`; `Revenue & profit forecast`; `Goals & required numbers`; `MRR forecast`; `Month-to-month`; `Traffic reinvestment`; `Month`; `Year`; `Export PDF`; `Show on map`
- **Links (navigation) (18):** `Back` → `fmp/funnels`; `LauncherG L` → `launcher`; `Office` → `office/home`; `Projects` → `projects/home`; `Clients` → `clients/list`; `Drive` → `drive/home`; `Planner` → `planner/home`; `Client Portal` → `portal/home`; `Forms` → `forms/list`; `Value Ladder` → `ladder/list`; `Social Planner` → `social/calendar`; `Whiteboard` → `whiteboard/home`; `Funnel Mapper` → `fmp/home`; `Tasks` → `tasks/today`; `Layer 2 Agents` → `agents/home`; `Sam Carter` → `fmp/client/:client`; `Map` → `fmp/funnel/:funnel`; `Reports` → `fmp/funnel/:funnel/reports`
- **Data shown (prototype sample data — not product data):** Sam Carter / PT tripwire funnel Scenario: Baseline Saved Map Reports Tidy up Share SUMMARY Overview Funnel data Published status MONEY Traffic sources Offers & products Expenses PLANNING Scenario comparison Revenue & profit forecast Goals & required numbers MRR forecast Month-to-month Traffic reinvestment REPORT · BASELINE SCENARIO · PLAN · PER MONTH Overview Month Year Export PDF Traffic 2,800 Leads 1,035 Customers …
- **Permissions and visibility:** Anyone with access to Funnel Mapper in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Templates

- **Route (prototype):** `#/fmp/templates` — template `fmp/templates`
- **In the v7 route list:** yes — Templates
- **How the user gets here:** sidebar item **Templates**; breadcrumb Templates; linked from `fmp/client/:client`, `fmp/clients`, `fmp/funnels`, `fmp/help`, `fmp/home`, `fmp/settings`, `fmp/trash`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/07_FUNNEL_MAPPER/075_fmp_templates.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/07_FUNNEL_MAPPER/075_fmp_templates.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/07_FUNNEL_MAPPER/075_fmp_templates.jpg)
- **Sections and headings, in order:** “Templates”
- **Buttons and actions (10):** `Apps` — action `msheet`; `Search clients, funnels, templates… ⌘K` — action `fsearch`; `New client` — action `fnewclient` (opens: New client); `New funnel` — action `fnewfunnel` (opens: New funnel); `Tripwire funnel 5–8 blocks · sample numbers` — action `fnewfunnel` (opens: New funnel); `Webinar funnel 5–8 blocks · sample numbers` — action `fnewfunnel` (opens: New funnel); `Application funnel 5–8 blocks · sample numbers` — action `fnewfunnel` (opens: New funnel); `Quiz funnel 5–8 blocks · sample numbers` — action `fnewfunnel` (opens: New funnel); `Challenge funnel 5–8 blocks · sample numbers` — action `fnewfunnel` (opens: New funnel); `Subscription funnel 5–8 blocks · sample numbers` — action `fnewfunnel` (opens: New funnel)
- **Links (navigation) (5):** `Home` → `fmp/home`; `Clients` → `fmp/clients`; `Funnels` → `fmp/funnels`; `Templates` → `fmp/templates`; `Trash` → `fmp/trash`
- **Data shown (prototype sample data — not product data):** Templates Search clients, funnels, templates… ⌘K New client New funnel Templates Start from a proven funnel. Customise names and numbers before it opens. Tripwire funnel 5–8 blocks · sample numbers Webinar funnel 5–8 blocks · sample numbers Application funnel 5–8 blocks · sample numbers Quiz funnel 5–8 blocks · sample numbers Challenge funnel 5–8 blocks · sample numbers Subscription funnel 5–8 blocks · sample numbers…
- **Permissions and visibility:** Anyone with access to Funnel Mapper in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Trash

- **Route (prototype):** `#/fmp/trash` — template `fmp/trash`
- **In the v7 route list:** yes — Trash
- **How the user gets here:** sidebar item **Trash 3**; breadcrumb Trash; linked from `fmp/client/:client`, `fmp/clients`, `fmp/funnels`, `fmp/help`, `fmp/home`, `fmp/settings`, `fmp/templates`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/07_FUNNEL_MAPPER/076_fmp_trash.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/07_FUNNEL_MAPPER/076_fmp_trash.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/07_FUNNEL_MAPPER/076_fmp_trash.jpg)
- **Sections and headings, in order:** “Trash”
- **Buttons and actions (6):** `Apps` — action `msheet`; `Search clients, funnels, templates… ⌘K` — action `fsearch`; `New client` — action `fnewclient` (opens: New client); `New funnel` — action `fnewfunnel` (opens: New funnel); `Restore` — prototype stand-in (shows a toast: “Restored.”); build the real action from the brief; `Delete forever` — prototype stand-in (shows a toast: “Deleted forever.”); build the real action from the brief
- **Links (navigation) (5):** `Home` → `fmp/home`; `Clients` → `fmp/clients`; `Funnels` → `fmp/funnels`; `Templates` → `fmp/templates`; `Trash` → `fmp/trash`
- **Data shown (prototype sample data — not product data):** Trash Search clients, funnels, templates… ⌘K New client New funnel Trash Old webinar test Deleted 4 days ago · 26 days left Restore Delete forever Quiz v0 Deleted 4 days ago · 26 days left Restore Delete forever Lead magnet funnel Deleted 4 days ago · 26 days left Restore Delete forever…
- **Permissions and visibility:** Anyone with access to Funnel Mapper in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Settings

- **Route (prototype):** `#/fmp/settings` — template `fmp/settings`
- **In the v7 route list:** yes — Settings
- **How the user gets here:** sidebar item **Settings**; breadcrumb Settings; direct URL / in-page action
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/07_FUNNEL_MAPPER/077_fmp_settings.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/07_FUNNEL_MAPPER/077_fmp_settings.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/07_FUNNEL_MAPPER/077_fmp_settings.jpg)
- **Purpose and spec (from the app brief):**
  > 3. **Sizes one step up [R]** (feedback: everything too small): base 13.5 → 14.5 px; sidebar items 14.5 px / 38 px; page titles 30 px; KPI values 30 px; table rows 46 px / 14 px; buttons 34 px (small 30); top bar 52 px; library tiles and product rows +1 px; blocks 170 px wide with 13.5 px titles; inspector title 17 px; KPI bar 13.5 px. Check every page incl. forms (New client sheet, New funnel dialog, template customize, share, settings).
  > - Visual sizes match prototype `#/fmp/home`, `#/fmp/funnels`, `#/fmp/client/sc`, `#/fmp/funnel/pt`, `#/fmp/funnel/pt/reports`, `#/fmp/settings`.
- **Sections and headings, in order:** “Settings” · “Team”
- **Buttons and actions (11):** `Apps` — action `msheet`; `Search clients, funnels, templates… ⌘K` — action `fsearch`; `New client` — action `fnewclient` (opens: New client); `New funnel` — action `fnewfunnel` (opens: New funnel); `Profile` — action `fstab:profile`; `Workspace & branding` — action `fstab:workspace`; `Team` — action `fstab:team`; `Independent accounts` — action `fstab:independent`; `Appearance` — action `fstab:appearance`; `Account` — action `fstab:account`; `Send invite`
- **Links (navigation) (6):** `Office › Admin` → `office/admin/people`; `Home` → `fmp/home`; `Clients` → `fmp/clients`; `Funnels` → `fmp/funnels`; `Templates` → `fmp/templates`; `Trash` → `fmp/trash`
- **Inputs, filters and selects (2):** `name@agency.com`; `Editor`
- **Data shown (prototype sample data — not product data):** Settings Search clients, funnels, templates… ⌘K New client New funnel Settings Profile Workspace & branding Team Independent accounts Appearance Account In the ecosystem, team, workspace and branding are managed once in Office › Admin. These pages stay until Funnel Mapper’s data is migrated. Team People here share Layer2Funnels’ clients, funnels and templates. Invite only. Editor Send invite T Teammate Admin Active D…
- **Permissions and visibility:** Anyone with access to Funnel Mapper in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Help & shortcuts

- **Route (prototype):** `#/fmp/help` — template `fmp/help`
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** sidebar item **Home**; breadcrumb Help; direct URL / in-page action
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/07_FUNNEL_MAPPER/140_fmp_help.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/07_FUNNEL_MAPPER/140_fmp_help.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/07_FUNNEL_MAPPER/140_fmp_help.jpg)
- **Sections and headings, in order:** “Help & shortcuts”
- **Buttons and actions (4):** `Apps` — action `msheet`; `Search clients, funnels, templates… ⌘K` — action `fsearch`; `New client` — action `fnewclient` (opens: New client); `New funnel` — action `fnewfunnel` (opens: New funnel)
- **Links (navigation) (5):** `Home` → `fmp/home`; `Clients` → `fmp/clients`; `Funnels` → `fmp/funnels`; `Templates` → `fmp/templates`; `Trash` → `fmp/trash`
- **Data shown (prototype sample data — not product data):** Help Search clients, funnels, templates… ⌘K New client New funnel Help & shortcuts V Select H Pan / Quick add a block Ctrl Shift L Tidy up Ctrl Z Undo Delete Remove selection…
- **Permissions and visibility:** Anyone with access to Funnel Mapper in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.
