# Quality recovery — audit tracker (15 Nov 2026)

Severity: **C** critical · **H** high · **M** medium · **L** low. Verification: test id (unit `test/*.test.mjs`, browser `scripts/e2e-*.mjs`).
“Live” = found from the production database, logs or the owner's screenshots.

| # | Area / page | Expected | Actual (before) | Sev | Fix | Verified |
|---|---|---|---|---|---|---|
| 1 | Teammate access switches | Every switch saves; state = database | 6th change within a minute failed: switches ran in the `sensitive` rate class (5/min) — production counter hit 5 at 15:39 | H (live) | `access.app.set`, `access.feature.set`, `clients.apps.set`, `clients.apps.defaults.set`, `tasks.access.set` → `write` class (30/min) | e2e TA1 (8 quick toggles, no 429, UI = DB) |
| 2 | Teammate access, switching people | Only the chosen person's switches show | A slower answer for the previous person could paint over the current one | H | Request sequence guard | code review + TA1 |
| 3 | Teammate access, feature switch | Switch shows what is saved; back to role = no exception | Not re-read after saving; switching back stored a second override | M | Re-read effective access after every change; an existing exception is removed (reset) instead | e2e TA2, unit OF31 |
| 4 | Client Access Matrix cell | One save per click | Double click sent two writes | L | Disabled while saving | e2e F19 |
| 5 | Access Review | Removed (owner) | Tab, `access.review.*`, functions, `reviewed_at` | — | Removed (UI, ops, migration 0060); People “Last active” kept | unit OF32, F4c |
| 6 | Avatar import | Document's own sections, nothing dropped | Fixed 11 chapters; every heading a section; “drives” content dumped into Wants; table headers became data; level lost | C (live) | New model `avatarmodel.js`: sections = top headings, parts = sub-headings, review step with per-part moves and preview, nothing dropped | e2e AV1–AV7, web W-AV1/2 |
| 7 | Avatar editor | Add/rename/retype/reorder/delete any section; edit any content | “Add chapter” only made an empty custom text box | H | Block editor (sub-heading, paragraph, list item, table), section nav with move up/down, delete, preview | e2e AV11, AV12 |
| 8 | Avatar Profile vs Full profile | Profile = chosen cards; removing a card keeps content | Fixed cards per chapter; floating facts covered the face | H (live) | Cards (section / sub-heading / table) chosen per avatar; at most 3 short facts; card expands in place (owner: no per-card link) | e2e AV8, AV9, AV13, AV14 |
| 9 | Avatar defaults | Settings for new avatars only | None | — | Avatar settings page + `avatar_settings` (0060), admins only | e2e AV17–AV20, unit OF37 |
| 10 | Avatar wrong address | “Not found” | “We couldn’t load this” (live screenshot) | M | 4xx → not-found screen | e2e AV16, e2e-ui U16 |
| 11 | Old (fixed-chapter) avatars | Still open | — | — | Converted on read, saved in the new shape on next save | e2e AV15, web W-AV3 |
| 12 | Stories save | Saves, returns to list | Stayed on the record; double click could create two | H | Return to list, one save at a time, stays on form on error | e2e ST1–ST4 |
| 13 | Brand kit save + fonts | Returns to list; any font name | 6 fixed fonts; stayed on record | M | Typed font + live preview + real render check; return to list | e2e BK1, BK2 |
| 14 | Offers save | Returns to list | Stayed on the record | L | Return to list | e2e-ui |
| 15 | Organization settings | Admin renames org, uploads logo, seen everywhere | Branding owners only; no rename; logo not shown in the shell | M | Organization tab (name, logo shrunk to 128 px, preview), logo on rail/menus, owners and admins | unit OF33–OF35, e2e OR1 |
| 16 | Default strategy template | Admin chooses default | Edit-only | L | “Make this the default” for any saved version (copied as newest) | manual + `office.template.use` |
| 17 | Documents from Drive | Add without download/upload | Missing | — | “Add from Drive” links the file (no copy, no move), labelled “Linked from Drive”, removable link | e2e DO1 |
| 18 | Documents load | — | One SOP request per protected section | L | One SOP request per page | code |
| 19 | Client access to Office | Only what's granted and shared; no internal notes | Shared records reachable regardless of the matrix; no client projection | H | Row rule now also requires Office on for that client; `portal.office.list` named columns only | unit G50–G54, FN13/15 |
| 20 | Launcher bell | V8 white on the sky | Dark app-bar style | L | V8 states (default, hover, open, unread) | e2e LA1 |
| 21 | Launcher order | Admin drag, saved per org | Missing | — | Arrange apps (drag + arrows), `workspace_app_order` (0060) | e2e LA2–LA5, unit OF36 |
| 22 | Tasks duplicates | One task per Enter/click | Production: 18 tasks, 5 distinct titles — repeated Enter/click while a slow save was on its way | C (live) | One create at a time per place; capture box empties at once | e2e TK1, TK2 (900 ms latency) |
| 23 | Tasks Show completed | Always at list bottom (V8) | Hidden when nothing completed | M | Always shown with count | e2e TK3 |
| 24 | Tasks New list or folder | V8 chips; People only for team | Huge checkboxes; People shown for personal (CSS beat `hidden`) | H (live) | V8 chip picker with per-person Can edit/Can view, Everyone; `[hidden]` always hides | e2e-tasks T8b, T8c, T9 |
| 25 | Tasks folders | Folder in tree; add a list into it | Sidebar folder used the prototype's `.fold` card style; no way to add a list into it | H (live) | Tree row with “+ new list here”, ⋯ menu, empty-state, “Move to folder…” on lists | e2e TF1–TF4 |
| 26 | Tasks list on tablets | Visible | `ul.outline` collided with the prototype's sticky outline: list stuck while scrolling (overlapped “Add task”) and hidden below 1180 px | C (live) | Override: static, always visible | e2e TF5 |
| 27 | `timer.running` | Empty when no timer | 404 on every page → console noise | L | Empty answer | e2e |
| 28 | Sign-in page weight | Only what sign-in needs | 73 scripts + 24 stylesheets + 154 KB Urdu font | H | Apps load on first open (lazy); Urdu font only for Arabic script; build bundles + caches | perf report |
| 29 | Production bundle | Minified, cached | Unbundled, `no-cache` on everything | H | `scripts/bundle-web.mjs` (esbuild), `/assets/*` immutable | e2e-recovery on `WEB_ROOT=dist/web` |
| 30 | API latency | Fast | New database connection per request (Workers runtime); ~0.27 s median, 0.6 s p90 per call | H | Not changed in code (see report: Hyperdrive needs the owner) | Cloudflare analytics |
| 31 | Avatar editor layout (owner screenshot) | Section list stays in its column | Up/down arrows of the list spilled over the editor and covered the Kind menu; phone list squeezed to numbers | H | Move up/down moved into the section toolbar; list ellipsis + own scroll; phone: scrollable named chips; readable Delete button; padded inputs | e2e AV10b, screenshot sweep |
| 32 | Profile picker save (owner screenshot) | Saves | “That request could not be read”: avatar saves capped at 16 KB per request | C | `funnels.avatars.create/update` allowed large bodies (content still capped at 400 KB) | e2e AV14b |
| 33 | Client Access Matrix (owner screenshot) | One column per app, visible cells | Grid hard-coded to 10 columns (12 apps) and off cells had no outline | H | Columns from the app count; outlined cells | screenshot sweep, e2e-ui F19 |
| 34 | Organization page | Organization mark when no logo | Empty space | L | Shows the organization's mark | screenshot sweep |

Every changed screen is captured by `node scripts/shot-sweep.mjs` (desktop + phone) for visual review.

Remaining / not verified: see `PERFORMANCE_REPORT.md` and the final report in `CURRENT_PROJECT_STATUS.md`.
