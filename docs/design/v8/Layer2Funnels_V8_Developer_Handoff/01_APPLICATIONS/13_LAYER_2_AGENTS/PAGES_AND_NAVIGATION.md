# Layer 2 Agents · pages and navigation

9 pages documented (every page in the v7 route list for this app, plus every page template reached by following links). 9 templates in total. Each entry gives the 11 required fields: name/purpose, access, layout, sections, buttons/actions, inputs/filters, navigation/destinations, data, permissions, states, responsive.

Labels in back-ticks are the exact text or accessible name of the control in the V8 prototype. Controls present on every page (rail, app bar, Prototype button) are documented once in `01_APPLICATIONS/00_SHELL_AND_LAUNCHER/`.

## Sidebar menu

- **Agents** → `agents/home`
- **Meeting Intelligence** → `agents/meetings`
- **Ask** → `agents/ask`
- **Access & settings** → `agents/settings`

## Page templates and their instances

| Template | Instances reached in the prototype | Documented as |
|---|---|---|
| `agents/home` | 1 | Agents |
| `agents/meeting/new` | 1 | Meeting Intelligence |
| `agents/ask` | 1 | Ask |
| `agents/meetings` | 1 | Meeting Intelligence |
| `agents/settings` | 1 | Access & settings |
| `agents/meeting/:meeting` | 3 | Weekly team call |
| `agents/meeting/:meeting/notes` | 3 | Weekly team call |
| `agents/meeting/:meeting/transcript` | 3 | Weekly team call |
| `agents/meeting/:meeting/actions` | 3 | Weekly team call |

## Pages

### Agents

- **Route (prototype):** `#/agents/home` — template `agents/home`
- **In the v7 route list:** yes — Agents
- **How the user gets here:** sidebar item **Agents**; breadcrumb Layer 2 Agents; linked from `agents/ask`, `agents/meeting/:meeting`, `agents/meeting/:meeting/actions`, `agents/meeting/:meeting/notes`, `agents/meeting/:meeting/transcript`, `agents/meeting/new`, `agents/meetings`, `agents/settings` …
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/13_LAYER_2_AGENTS/120_agents_home.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/13_LAYER_2_AGENTS/120_agents_home.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/13_LAYER_2_AGENTS/120_agents_home.jpg)
- **Purpose and spec (from the app brief):**
  > Agents home (Meeting Intelligence, Ask, next agent), Meeting Intelligence (sessions list; new session: record/upload/Zoom-later, organization, language Urdu+English, outputs MP3/transcript/notes/action items → Drive folder `Meetings/<date> <name>`; session page with audio waveform, Notes / Transcript (speakers, rename) / Action items → Tasks Inbox), Ask (chat answering from records the user can open, with sources), Access & settings (what each agent reads/writes, who runs it, approval needed: provider, cost cap, retention, consent). Build only the shell pages with "Preview" state until Tabish approves a provider.
- **Sections and headings, in order:** “Layer 2 Agents” · “Meeting Intelligence” · “Ask” · “Your next agent”
- **Links (navigation) (7):** `Meeting Intelligence Listens to meetings, calls, podcasts or lectures. Saves the audio, tr` → `agents/meetings`; `Ask Answers questions from your own work: “What are my tasks today?” Designed` → `agents/ask`; `Your next agent Content drafts, client follow-ups and more, one at a time. Later` → `agents/home`; `Agents` → `agents/home`; `Meetings` → `agents/meetings`; `Ask` → `agents/ask`; `Settings` → `agents/settings`
- **Data shown (prototype sample data — not product data):** Layer 2 Agents Layer 2 Agents Helpers that work inside your apps, only with what you can already see. Meeting Intelligence Listens to meetings, calls, podcasts or lectures. Saves the audio, transcript and notes to Drive. Designed Ask Answers questions from your own work: “What are my tasks today?” Designed Your next agent Content drafts, client follow-ups and more, one at a time. Later Layer 2 Agents Helpers that wor…
- **Permissions and visibility:** Anyone with access to Layer 2 Agents in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Meeting Intelligence

- **Route (prototype):** `#/agents/meeting/new` — template `agents/meeting/new`
- **In the v7 route list:** yes — Meeting Intelligence
- **How the user gets here:** sidebar item **Meeting Intelligence**; breadcrumb Layer 2 Agents › New session; linked from `agents/meetings`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/13_LAYER_2_AGENTS/121_agents_meeting_new.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/13_LAYER_2_AGENTS/121_agents_meeting_new.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/13_LAYER_2_AGENTS/121_agents_meeting_new.jpg)
- **Sections and headings, in order:** “Ready to listen” · “THIS SESSION” · “SAVE TO DRIVE”
- **Buttons and actions (7):** `Start recording` — action `recstart`; `Upload a recording`; `Join a Zoom call` — prototype stand-in (shows a toast: “Joining Zoom calls needs an approved integration.”); build the real action from the brief; `Audio (MP3)` — action `tgl`; `Transcript` — action `tgl`; `Meeting notes` — action `tgl`; `Action items to Tasks` — action `tgl`
- **Links (navigation) (5):** `Sessions` → `agents/meetings`; `Agents` → `agents/home`; `Meetings` → `agents/meetings`; `Ask` → `agents/ask`; `Settings` → `agents/settings`
- **Inputs, filters and selects (3):** `Weekly team call`; `Layer2Funnels Aurj`; `Urdu + English (mixed) English Urdu`
- **Data shown (prototype sample data — not product data):** Layer 2 Agents / New session Sessions Ready to listen Uses this device’s microphone. Everyone in the room should know you’re recording. Upload a recording Join a Zoom call THIS SESSION Name Organization Layer2Funnels Aurj Language Urdu + English (mixed) English Urdu SAVE TO DRIVE Audio (MP3) Transcript Meeting notes Action items to Tasks Folder: Drive › Meetings › 2026-11-12 Weekly team call Sessions Ready to listen …
- **Permissions and visibility:** Anyone with access to Layer 2 Agents in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Ask

- **Route (prototype):** `#/agents/ask` — template `agents/ask`
- **In the v7 route list:** yes — Ask
- **How the user gets here:** sidebar item **Ask**; breadcrumb Layer 2 Agents › Ask; linked from `agents/home`, `agents/meeting/:meeting`, `agents/meeting/:meeting/actions`, `agents/meeting/:meeting/notes`, `agents/meeting/:meeting/transcript`, `agents/meeting/new`, `agents/meetings`, `agents/settings`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/13_LAYER_2_AGENTS/122_agents_ask.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/13_LAYER_2_AGENTS/122_agents_ask.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/13_LAYER_2_AGENTS/122_agents_ask.jpg)
- **Buttons and actions (1):** (icon) — prototype stand-in (shows a toast: “Preview”); build the real action from the brief
- **Links (navigation) (5):** `Open My day` → `office/home`; `Agents` → `agents/home`; `Meetings` → `agents/meetings`; `Ask` → `agents/ask`; `Settings` → `agents/settings`
- **Inputs, filters and selects (1):** `Ask`
- **Data shown (prototype sample data — not product data):** Layer 2 Agents / Ask What are my tasks today? You have 4 things today in Layer2Funnels: Write results page copy · Projects · Harry Kaye quiz funnel Check GHL calendar sync · Tasks · Build team Post update on “40 booked calls” · Planner Approve email sequence v2 · overdue Sources: Projects, Tasks, Planner. Only items you can open. Open My day Preview. Answers come only from records you can open, and every answer shows…
- **Permissions and visibility:** Anyone with access to Layer 2 Agents in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). Page-specific state copy present in the prototype: “Preview. Answers come only from records you can open, and every answer shows its sources.”.
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Meeting Intelligence

- **Route (prototype):** `#/agents/meetings` — template `agents/meetings`
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** sidebar item **Meeting Intelligence**; breadcrumb Layer 2 Agents › Meeting Intelligence; linked from `agents/ask`, `agents/home`, `agents/meeting/:meeting`, `agents/meeting/:meeting/actions`, `agents/meeting/:meeting/notes`, `agents/meeting/:meeting/transcript`, `agents/meeting/new`, `agents/settings`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/13_LAYER_2_AGENTS/174_agents_meetings.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/13_LAYER_2_AGENTS/174_agents_meetings.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/13_LAYER_2_AGENTS/174_agents_meetings.jpg)
- **Sections and headings, in order:** “Meeting Intelligence”
- **Links (navigation) (8):** `New session` → `agents/meeting/new`; `Weekly team call` → `agents/meeting/:meeting`; `Kick-off with Harry Kaye` → `agents/meeting/:meeting`; `Funnel Challenge podcast ep. 3` → `agents/meeting/:meeting`; `Agents` → `agents/home`; `Meetings` → `agents/meetings`; `Ask` → `agents/ask`; `Settings` → `agents/settings`
- **Data shown (prototype sample data — not product data):** Layer 2 Agents / Meeting Intelligence Meeting Intelligence Record or upload a conversation. Get the audio, a transcript with speakers, and clear notes, filed in Drive. New session Session When Length Type Action items Weekly team call Today, 10:00 42 min Team · Urdu + English 4 Kick-off with Harry Kaye Mon, 15:00 58 min Client · English 6 Funnel Challenge podcast ep. 3 Last week 31 min Podcast 2 Meeting Intelligence …
- **Permissions and visibility:** Anyone with access to Layer 2 Agents in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Access & settings

- **Route (prototype):** `#/agents/settings` — template `agents/settings`
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** sidebar item **Access & settings**; breadcrumb Layer 2 Agents › Access & settings; linked from `agents/ask`, `agents/home`, `agents/meeting/:meeting`, `agents/meeting/:meeting/actions`, `agents/meeting/:meeting/notes`, `agents/meeting/:meeting/transcript`, `agents/meeting/new`, `agents/meetings`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/13_LAYER_2_AGENTS/175_agents_settings.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/13_LAYER_2_AGENTS/175_agents_settings.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/13_LAYER_2_AGENTS/175_agents_settings.jpg)
- **Purpose and spec (from the app brief):**
  > Agents home (Meeting Intelligence, Ask, next agent), Meeting Intelligence (sessions list; new session: record/upload/Zoom-later, organization, language Urdu+English, outputs MP3/transcript/notes/action items → Drive folder `Meetings/<date> <name>`; session page with audio waveform, Notes / Transcript (speakers, rename) / Action items → Tasks Inbox), Ask (chat answering from records the user can open, with sources), Access & settings (what each agent reads/writes, who runs it, approval needed: provider, cost cap, retention, consent). Build only the shell pages with "Preview" state until Tabish approves a provider.
- **Sections and headings, in order:** “Access & settings”
- **Links (navigation) (4):** `Agents` → `agents/home`; `Meetings` → `agents/meetings`; `Ask` → `agents/ask`; `Settings` → `agents/settings`
- **Data shown (prototype sample data — not product data):** Layer 2 Agents / Access & settings Access & settings What each agent may read, where it saves, and who may run it. Agent Can read Can write Who can run it Organizations Meeting Intelligence Microphone or uploaded audio only Drive › Meetings, Tasks (if on) Owners, Admins Layer2Funnels, Aurj (separately) Ask What the asking person can open Nothing Everyone The current one Needs your approval before go-live: the speech …
- **Permissions and visibility:** Anyone with access to Layer 2 Agents in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). Page-specific state copy present in the prototype: “Ask	What the asking person can open	Nothing	Everyone	The current one”.
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Weekly team call

- **Route (prototype):** `#/agents/meeting/m1` — template `agents/meeting/:meeting` (3 instances in the prototype, e.g. `agents/meeting/m1`, `agents/meeting/m2`, `agents/meeting/m3`)
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** sidebar item **Meeting Intelligence**; breadcrumb Layer 2 Agents › Meeting Intelligence › Weekly team call; linked from `agents/meetings`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/13_LAYER_2_AGENTS/176_agents_meeting_m1.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/13_LAYER_2_AGENTS/176_agents_meeting_m1.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/13_LAYER_2_AGENTS/176_agents_meeting_m1.jpg)
- **Sections and headings, in order:** “Weekly team call” · “Summary” · “Decisions” · “Risks”
- **Links (navigation) (10):** `Meeting Intelligence` → `agents/meetings`; `Sessions` → `agents/meetings`; `Open folder` → `drive/home`; `Notes` → `agents/meeting/:meeting/notes`; `Transcript` → `agents/meeting/:meeting/transcript`; `Action items 4` → `agents/meeting/:meeting/actions`; `Agents` → `agents/home`; `Meetings` → `agents/meetings`; `Ask` → `agents/ask`; `Settings` → `agents/settings`
- **Data shown (prototype sample data — not product data):** Layer 2 Agents / Meeting Intelligence / Weekly team call Sessions Weekly team call Today, 10:00 · 42 min · Team · Urdu + English Open folder 12:04 / 42 min Notes Transcript Action items 4 Summary The team agreed to launch the Harry Kaye quiz funnel on 28 Nov. Copy is one day behind; design will catch up by Friday. Decisions Keep “get fit” language from Harry’s interview. Funnel Challenge moves to January. Risks GHL c…
- **Permissions and visibility:** Anyone with access to Layer 2 Agents in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Weekly team call

- **Route (prototype):** `#/agents/meeting/m1/notes` — template `agents/meeting/:meeting/notes` (3 instances in the prototype, e.g. `agents/meeting/m1/notes`, `agents/meeting/m2/notes`, `agents/meeting/m3/notes`)
- **Note:** this route renders the same content as `#/agents/meeting/m1` (alias / default sub-page).
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** sidebar item **Meeting Intelligence**; breadcrumb Layer 2 Agents › Meeting Intelligence › Weekly team call; linked from `agents/meeting/:meeting`, `agents/meeting/:meeting/actions`, `agents/meeting/:meeting/transcript`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/13_LAYER_2_AGENTS/177_agents_meeting_m1_notes.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/13_LAYER_2_AGENTS/177_agents_meeting_m1_notes.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/13_LAYER_2_AGENTS/177_agents_meeting_m1_notes.jpg)
- **Sections and headings, in order:** “Weekly team call” · “Summary” · “Decisions” · “Risks”
- **Links (navigation) (10):** `Meeting Intelligence` → `agents/meetings`; `Sessions` → `agents/meetings`; `Open folder` → `drive/home`; `Notes` → `agents/meeting/:meeting/notes`; `Transcript` → `agents/meeting/:meeting/transcript`; `Action items 4` → `agents/meeting/:meeting/actions`; `Agents` → `agents/home`; `Meetings` → `agents/meetings`; `Ask` → `agents/ask`; `Settings` → `agents/settings`
- **Data shown (prototype sample data — not product data):** Layer 2 Agents / Meeting Intelligence / Weekly team call Sessions Weekly team call Today, 10:00 · 42 min · Team · Urdu + English Open folder 12:04 / 42 min Notes Transcript Action items 4 Summary The team agreed to launch the Harry Kaye quiz funnel on 28 Nov. Copy is one day behind; design will catch up by Friday. Decisions Keep “get fit” language from Harry’s interview. Funnel Challenge moves to January. Risks GHL c…
- **Permissions and visibility:** Anyone with access to Layer 2 Agents in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Weekly team call

- **Route (prototype):** `#/agents/meeting/m1/transcript` — template `agents/meeting/:meeting/transcript` (3 instances in the prototype, e.g. `agents/meeting/m1/transcript`, `agents/meeting/m2/transcript`, `agents/meeting/m3/transcript`)
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** sidebar item **Meeting Intelligence**; breadcrumb Layer 2 Agents › Meeting Intelligence › Weekly team call; linked from `agents/meeting/:meeting`, `agents/meeting/:meeting/actions`, `agents/meeting/:meeting/notes`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/13_LAYER_2_AGENTS/178_agents_meeting_m1_transcript.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/13_LAYER_2_AGENTS/178_agents_meeting_m1_transcript.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/13_LAYER_2_AGENTS/178_agents_meeting_m1_transcript.jpg)
- **Sections and headings, in order:** “Weekly team call”
- **Buttons and actions (1):** `Rename speaker` — prototype stand-in (shows a toast: “Rename this speaker everywhere.”); build the real action from the brief
- **Links (navigation) (10):** `Meeting Intelligence` → `agents/meetings`; `Sessions` → `agents/meetings`; `Open folder` → `drive/home`; `Notes` → `agents/meeting/:meeting/notes`; `Transcript` → `agents/meeting/:meeting/transcript`; `Action items 4` → `agents/meeting/:meeting/actions`; `Agents` → `agents/home`; `Meetings` → `agents/meetings`; `Ask` → `agents/ask`; `Settings` → `agents/settings`
- **Data shown (prototype sample data — not product data):** Layer 2 Agents / Meeting Intelligence / Weekly team call Sessions Weekly team call Today, 10:00 · 42 min · Team · Urdu + English Open folder 12:04 / 42 min Notes Transcript Action items 4 TR Tabish 00:12 Chalo, quiz funnel ka status batao. SN Sana 00:20 Questions v2 almost done, Friday tak Harry ko bhej dungi. BK Bilal 00:41 The GHL calendar sync still needs a test. Sessions Weekly team call Today, 10:00 · 42 min · T…
- **Permissions and visibility:** Anyone with access to Layer 2 Agents in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Weekly team call

- **Route (prototype):** `#/agents/meeting/m1/actions` — template `agents/meeting/:meeting/actions` (3 instances in the prototype, e.g. `agents/meeting/m1/actions`, `agents/meeting/m2/actions`, `agents/meeting/m3/actions`)
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** sidebar item **Meeting Intelligence**; breadcrumb Layer 2 Agents › Meeting Intelligence › Weekly team call; linked from `agents/meeting/:meeting`, `agents/meeting/:meeting/notes`, `agents/meeting/:meeting/transcript`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/13_LAYER_2_AGENTS/179_agents_meeting_m1_actions.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/13_LAYER_2_AGENTS/179_agents_meeting_m1_actions.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/13_LAYER_2_AGENTS/179_agents_meeting_m1_actions.jpg)
- **Sections and headings, in order:** “Weekly team call”
- **Buttons and actions (2):** (icon) — action `sub`; `→ Task` — prototype stand-in (shows a toast: “Created in Tasks with a link back to this meeting.”); build the real action from the brief
- **Links (navigation) (10):** `Meeting Intelligence` → `agents/meetings`; `Sessions` → `agents/meetings`; `Open folder` → `drive/home`; `Notes` → `agents/meeting/:meeting/notes`; `Transcript` → `agents/meeting/:meeting/transcript`; `Action items 4` → `agents/meeting/:meeting/actions`; `Agents` → `agents/home`; `Meetings` → `agents/meetings`; `Ask` → `agents/ask`; `Settings` → `agents/settings`
- **Data shown (prototype sample data — not product data):** Layer 2 Agents / Meeting Intelligence / Weekly team call Sessions Weekly team call Today, 10:00 · 42 min · Team · Urdu + English Open folder 12:04 / 42 min Notes Transcript Action items 4 Send quiz questions v2 to Harry · Sana · Fri → Task Test GHL calendar sync · Bilal · Wed → Task Move Challenge launch to January · Tabish → Task Sessions Weekly team call Today, 10:00 · 42 min · Team · Urdu + English Open folder 12:…
- **Permissions and visibility:** Anyone with access to Layer 2 Agents in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.
