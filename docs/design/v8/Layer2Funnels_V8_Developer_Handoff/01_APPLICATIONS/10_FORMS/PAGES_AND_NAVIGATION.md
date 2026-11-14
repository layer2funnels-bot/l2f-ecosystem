# Forms · pages and navigation

4 pages documented (every page in the v7 route list for this app, plus every page template reached by following links). 4 templates in total. Each entry gives the 11 required fields: name/purpose, access, layout, sections, buttons/actions, inputs/filters, navigation/destinations, data, permissions, states, responsive.

Labels in back-ticks are the exact text or accessible name of the control in the V8 prototype. Controls present on every page (rail, app bar, Prototype button) are documented once in `01_APPLICATIONS/00_SHELL_AND_LAUNCHER/`.

## Sidebar menu

- **Forms** → `forms/list`
- **Responses 3** → `forms/subs`
- **Templates** → `forms/tpl`

## Page templates and their instances

| Template | Instances reached in the prototype | Documented as |
|---|---|---|
| `forms/list` | 1 | Forms |
| `forms/b/:form` | 4 | Builder |
| `forms/subs` | 1 | Responses |
| `forms/tpl` | 1 | Templates |

## Pages

### Forms

- **Route (prototype):** `#/forms/list` — template `forms/list`
- **In the v7 route list:** yes — Forms
- **How the user gets here:** sidebar item **Forms**; breadcrumb Forms; linked from `clients/tools`, `drive/edit/doc/:file`, `drive/edit/image/:file`, `drive/edit/pdf/:file`, `drive/edit/sheet/:file`, `drive/edit/slides/:file`, `fmp/funnel/:funnel`, `fmp/funnel/:funnel/reports` …
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/10_FORMS/113_forms_list.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/10_FORMS/113_forms_list.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/10_FORMS/113_forms_list.jpg)
- **Sections and headings, in order:** “Forms”
- **Links (navigation) (8):** `New form` → `forms/b/:form`; `Brand Base form` → `forms/b/:form`; `Fitness quiz` → `forms/b/:form`; `Coaching application` → `forms/b/:form`; `Client feedback` → `forms/b/:form`; `Forms` → `forms/list`; `Responses` → `forms/subs`; `Templates` → `forms/tpl`
- **Data shown (prototype sample data — not product data):** Forms Forms Forms, quizzes and intake. Built once, reused anywhere. New form Form Status Responses Used in Brand Base form Published 12 Clients · Brand Base Fitness quiz Draft 0 Harry Kaye quiz funnel Coaching application Published 41 Website Client feedback Draft 0 — Forms Forms, quizzes and intake. Built once, reused anywhere. New form Form Status Responses Used in Brand Base form Published 12 Clients · Brand Base …
- **Permissions and visibility:** Anyone with access to Forms in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Builder

- **Route (prototype):** `#/forms/b/quiz` — template `forms/b/:form` (4 instances in the prototype, e.g. `forms/b/quiz`, `forms/b/bb`, `forms/b/apply`, `forms/b/fb`)
- **In the v7 route list:** yes — Builder
- **How the user gets here:** sidebar item **Forms**; breadcrumb Forms › Fitness quiz; linked from `clients/settings/brandbase`, `forms/list`, `forms/tpl`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/10_FORMS/114_forms_b_quiz.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/10_FORMS/114_forms_b_quiz.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/10_FORMS/114_forms_b_quiz.jpg)
- **Sections and headings, in order:** “Fitness quiz” · “Add a field” · “Tell us about your business” · “SECTION HEADING” · “LOGIC”
- **Buttons and actions (51):** `Build` — action `fmode:build`; `Preview` — action `fmode:preview`; `Publish` — action `fpub` (opens: Publish form); `Short text` — action `fadd:short`; `Long text` — action `fadd:long`; `Email` — action `fadd:email`; `Phone` — action `fadd:phone`; `Multiple choice` — action `fadd:choice`; `Checkboxes` — action `fadd:check`; `Dropdown` — action `fadd:drop`; `Date` — action `fadd:date`; `File upload` — action `fadd:file`; `Rating` — action `fadd:rate`; `Section heading` — action `fadd:head`; `Tell us about your business` — action `fsel:0`; `Move up` — action `fmv:0|-1`; `Move down` — action `fmv:0|1`; `Duplicate` — action `fdup:0`; `Delete` — action `fdel:0`; `Business name *` — action `fsel:1`; `Move up` — action `fmv:1|-1`; `Move down` — action `fmv:1|1`; `Duplicate` — action `fdup:1`; `Delete` — action `fdel:1`; `What do you sell? * In one or two sentences` — action `fsel:2`; `Move up` — action `fmv:2|-1`; `Move down` — action `fmv:2|1`; `Duplicate` — action `fdup:2`; `Delete` — action `fdel:2`; `Who is your best client? * Busy professionals Parents Students` — action `fsel:3`; `Move up` — action `fmv:3|-1`; `Move down` — action `fmv:3|1`; `Duplicate` — action `fdup:3`; `Delete` — action `fdel:3`; `Best email for updates *` — action `fsel:4`; `Move up` — action `fmv:4|-1`; `Move down` — action `fmv:4|1`; `Duplicate` — action `fdup:4`; `Delete` — action `fdel:4`; `Upload your logo PNG or SVG Drop a file or browse` — action `fsel:5`; `Move up` — action `fmv:5|-1`; `Move down` — action `fmv:5|1`; `Duplicate` — action `fdup:5`; `Delete` — action `fdel:5`; `How clear is your brand today?` — action `fsel:6`; `Move up` — action `fmv:6|-1`; `Move down` — action `fmv:6|1`; `Duplicate` — action `fdup:6`; `Delete` — action `fdel:6`; `Add question` — action `fadd:short`; `Show if…` — prototype stand-in (shows a toast: “Show this question only when an earlier answer matches.”); build the real action from the brief
- **Links (navigation) (3):** `Forms` → `forms/list`; `Responses` → `forms/subs`; `Templates` → `forms/tpl`
- **Inputs, filters and selects (2):** `Tell us about your business`; `Optional`
- **Data shown (prototype sample data — not product data):** Forms / Fitness quiz Fitness quiz Draft Build Preview Publish Add a field Short text Long text Email Phone Multiple choice Checkboxes Dropdown Date File upload Rating Section heading Tell us about your business Business name * What do you sell? * In one or two sentences Who is your best client? * Busy professionals Parents Students Best email for updates * Upload your logo PNG or SVG Drop a file or browse How clear i…
- **Permissions and visibility:** Anyone with access to Forms in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). Page-specific state copy present in the prototype: “Preview”.
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Responses

- **Route (prototype):** `#/forms/subs` — template `forms/subs`
- **In the v7 route list:** yes — Responses
- **How the user gets here:** sidebar item **Responses 3**; breadcrumb Forms; linked from `forms/b/:form`, `forms/list`, `forms/tpl`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/10_FORMS/115_forms_subs.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/10_FORMS/115_forms_subs.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/10_FORMS/115_forms_subs.jpg)
- **Sections and headings, in order:** “Responses” · “WHO IS YOUR BEST CLIENT?” · “HOW CLEAR IS YOUR BRAND TODAY?” · “All answers”
- **Buttons and actions (2):** `Export` — prototype stand-in (shows a toast: “Export needs the backend and permission.”); build the real action from the brief; `View` — prototype stand-in (shows a toast: “Opens the full response.”); build the real action from the brief
- **Links (navigation) (3):** `Forms` → `forms/list`; `Responses` → `forms/subs`; `Templates` → `forms/tpl`
- **Inputs, filters and selects (1):** `Brand Base form Coaching application`
- **Data shown (prototype sample data — not product data):** Forms Responses Brand Base form · 12 responses. Summary first, then each answer. Brand Base form Coaching application 12 Responses 83% Completion 4 min Median time 3 New this week WHO IS YOUR BEST CLIENT? Busy professionals 58% Parents 25% Students 17% HOW CLEAR IS YOUR BRAND TODAY? 1 to 5 stars · average 2.8 All answers Personal data stays here unless you export it. Export Person Form Submitted Harry Kaye Brand Base…
- **Permissions and visibility:** Anyone with access to Forms in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.

### Templates

- **Route (prototype):** `#/forms/tpl` — template `forms/tpl`
- **In the v7 route list:** no — reached by following links in the prototype
- **How the user gets here:** sidebar item **Templates**; breadcrumb Forms; linked from `forms/b/:form`, `forms/list`, `forms/subs`
- **Layout:** Shell layout: rail · app sidebar · app bar · content. Screenshots: [desktop 1440](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/10_FORMS/168_forms_tpl.jpg) · [tablet 834](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/10_FORMS/168_forms_tpl.jpg) · [phone 390](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/10_FORMS/168_forms_tpl.jpg)
- **Sections and headings, in order:** “Templates” · “Brand Base” · “Fitness quiz” · “Application” · “Feedback” · “Event sign-up”
- **Links (navigation) (8):** `Brand Base Ready to edit.` → `forms/b/:form`; `Fitness quiz Ready to edit.` → `forms/b/:form`; `Application Ready to edit.` → `forms/b/:form`; `Feedback Ready to edit.` → `forms/b/:form`; `Event sign-up Ready to edit.` → `forms/b/:form`; `Forms` → `forms/list`; `Responses` → `forms/subs`; `Templates` → `forms/tpl`
- **Data shown (prototype sample data — not product data):** Forms Templates Start from a proven form. Brand Base Ready to edit. Fitness quiz Ready to edit. Application Ready to edit. Feedback Ready to edit. Event sign-up Ready to edit. Templates Start from a proven form. Brand Base Ready to edit. Fitness quiz Ready to edit. Application Ready to edit. Feedback Ready to edit. Event sign-up Ready to edit.…
- **Permissions and visibility:** Anyone with access to Forms in the current organization (Office › Admin › Teammate access: app on + level; client contacts per Client access). Server enforces default deny (03 §2). No page-specific rule in the source material. [Confirmed app-level rule]
- **States:** shared states from 02 §9 apply (loading skeleton, empty with one action, no results + Clear filters, error + Retry + reference, permission denied, read-only, archived, offline/retrying, conflict; nothing spins longer than 10 s). No page-specific state copy is designed (see D13).
- **Desktop / tablet / mobile:** see screenshots above and `RESPONSIVE_DESIGN.md` in this folder. Prototype checks: horizontal overflow at 390 px = none; JS errors = 0; “undefined” text = 0.
