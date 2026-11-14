# V8 documentation review

Date: 14 Nov 2026 · Package: `docs/design/v8/Layer2Funnels_V8_Developer_Handoff/` (974 files, byte-identical to the ZIP; list with checksums in `docs/design/v8/INVENTORY.md`).

This report says exactly what was read and how. "Read in full" means every line was read. "Read: brief sections" means the parts that carry requirements were read and the rest (generated navigation graphs, repeated boilerplate) was scanned. "Parsed" means a script extracted the content into the tracker and the full text is read again at the start of that app's build. Nothing below is marked read that was not.

## 1. Master documentation (`00_MASTER_DOCUMENTATION/`, 12 files)

| File | How | Key content captured |
|---|---|---|
| `00_ECOSYSTEM_OVERVIEW.md` | Read in full | 14 areas, 179 pages, launcher groups, cross-app relations, change register per app |
| `01_DESIGN_SYSTEM.md` | Read in full | Tokens (L2F/Aurj, light/dark), Geist only, 12 px floor, right-panel size system, components, anti-patterns |
| `02_GLOBAL_SHELL.md` | Read in full | Rail 64 px, sidebar 248, app bar 52, focused layout, phone bottom bar, org/apps/profile menus, real links, search, notifications, profile, branding, shared states, 10 s rule |
| `03_PERMISSIONS_DATA_INTEGRATIONS.md` | Read in full | Relationships, app access + level + feature switches, client app defaults, owner vs admin, `private.can`, access review, Client service, file references, Library ↔ Personal, version rules, plan → project |
| `04_OPEN_DECISIONS.md` | Read in full | D1–D18 with design assumptions |
| `05_V8_IMPLEMENTATION_MASTER_GUIDE.md` | Read in full | Principles, shared components to build once in P00, quality bar, forbidden things |
| `06_V4_VS_V8_CHANGELOG.md` | Read in full | 22 V4-only templates (all explained), 115 added pages, modified behaviour |
| `07_IMPLEMENTATION_CHECKLIST.md` | Read in full | Basis of the tracker (pages, sidebar items, dialogs, flows, cross-cutting) |
| `08_ASSET_AND_ICON_INDEX.md` | Read: logos, app icons, fonts, start of icon table; icon table checked against `03_ASSETS/icons/` | 145 icons, 26 app icons, 8 logos, 11 fonts |
| `V8_BUG_FIXES.md` | Read in full | 21 v7 defects and their root cause (class leaks) |
| `V8_DESIGN_DECISIONS.md` | Read in full | Ledger decisions and why |
| `V8_RECOMMENDATIONS.md` | Read in full | R1–R7, not to be built without approval |

## 2. Start files and process

| File | How |
|---|---|
| `README.md`, `CLAUDE_CODE_START_HERE.md` | Read in full |
| `09_FINAL_HANDOFF/MANAGER_PROCESS_…docx` | Read in full (text extracted) |
| `09_FINAL_HANDOFF/IMPLEMENTATION_SEQUENCE.md` | Read in full |
| `09_FINAL_HANDOFF/V8_COMPLETENESS_AUDIT.md` | Read in full |
| `09_FINAL_HANDOFF/NEW_DESIGN_CHAT_HANDOFF.md`, `reference/README.md` | Read in full |
| `09_FINAL_HANDOFF/reference/PLANNER_PRODUCT_DESIGN_SPEC.md`, `EDITORS_DESIGN_BRIEF.md`, `DESIGN_BRIEF_Projects.md` | Verified byte-identical to `docs/design/v7/reference/` (already in the repo). Each is read in full again at its phase: Projects P03, Drive P05, Planner P06 |

## 3. Application specifications (`01_APPLICATIONS/`, 14 folders × 7 files = 98 files)

For every app: `APP_OVERVIEW.md`, `FEATURES_AND_FUNCTIONALITY.md` (§1 change register, §2 authoritative brief, §3 V8 visual changes, §4 V4 detail where present), `USER_FLOWS_AND_WORKFLOWS.md` (flows; the generated navigation graph was scanned), `COMPONENTS_AND_INTERACTIONS.md` (dialog table, keyboard/right-click, interaction catalogue scanned), `RESPONSIVE_DESIGN.md` (confirmed/proposed rules; screenshot table scanned), `IMPLEMENTATION_NOTES.md` (decisions, definition of done).

`PAGES_AND_NAVIGATION.md` (179 page entries, about 70,000 words): **parsed** by a script into the tracker (every page, route, number of buttons/links/inputs: 4,244 listed controls). The Shell file was also read page by page for the first seven pages. Each app's file is read in full at the start of that app's build, because the prompts require a control-by-control report against it.

| Area | Overview | Brief | Flows | Components | Responsive | Notes | Pages |
|---|---|---|---|---|---|---|---|
| 00 Shell and Launcher | Read | Read in full | Read | Read in full | Read | Read in full | Partly read + parsed |
| 01 Office | Read | Read in full | Read | Dialogs read | Read | Decisions read | Parsed |
| 02 Clients | Read | Read in full | Read | Dialogs read | Read | Decisions read | Parsed |
| 03 Projects | Read | Read in full | Read | Dialogs + keyboard read | Read | Decisions read | Parsed |
| 04 Tasks | Read | Read in full | Read | Dialogs read | Read | Decisions read | Parsed |
| 05 Drive and editors | Read | Read in full | Read | Dialogs read | Read | Decisions read | Parsed |
| 06 Planner | Read | Read in full | Read | Dialogs read | Read | Decisions read | Parsed |
| 07 Funnel Mapper | Read | Read in full | Read | Dialogs read | Read | Decisions read | Parsed |
| 08 Client Portal | Read | Read in full | Read | Dialogs + catalogue read | Read | Decisions read | Parsed |
| 09 Whiteboard | Read | Read in full | Read | Dialogs + catalogue read | Read | Decisions read | Parsed |
| 10 Forms | Read | Read in full incl. §4 V4 detail | Read | Dialogs read | Read | Read in full | Parsed + publish-related lines read |
| 11 Value Ladder | Read | Read in full incl. §4 | Read | Dialogs read | Read | Decisions read | Parsed |
| 12 Social Planner | Read | Read in full incl. §4 | Read | Dialogs read | Read | Decisions read | Parsed |
| 13 Layer 2 Agents | Read | Read in full | Read | Dialogs read | Read | Decisions read | Parsed |

## 4. Prompts (`07_PROMPTS/`, 20 files) — all read

`ECOSYSTEM_IMPLEMENTATION_MASTER_PROMPT.md`, `P00`–`P13` (the shared rules block was verified identical across prompts with `diff`; each prompt's work plan, scope, V8 visual requirements and defect list were read), `P14_FULL_REGRESSION_CHECK.md` (in full), `ACCESSIBILITY_AND_USABILITY_REVIEW_PROMPT.md`, `DESIGN_QUALITY_ASSURANCE_PROMPT.md`, `FUNCTIONAL_TESTING_MASTER_PROMPT.md`, `MOBILE_RESPONSIVENESS_MASTER_PROMPT.md` (all in full; the last differs from `04_RESPONSIVE_DESIGN/MOBILE_FIRST_MASTER_PROMPT.md` only in its title line).

## 5. Responsive, strategy, design system, assets

| Folder | How |
|---|---|
| `04_RESPONSIVE_DESIGN/` (4) | All read in full |
| `05_STRATEGY_AND_ARCHITECTURE/` (10 derived) | All read in full (README, ecosystem map, app relationships, navigation map, page hierarchy, journeys, data flow, integrations, permission architecture, cross-app workflows) |
| `05_…/original/` (4) | `repo_ARCHITECTURE.md`, `repo_DECISIONS.md`, `repo_CLAUDE_DESIGN_APP_MAP.md` verified byte-identical to the repo's own `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/handoff/CLAUDE_DESIGN_APP_MAP.md`. `Final_Blueprint_Visuals_2026-10-19_v1.0.html` noted as historical (D18) |
| `02_DESIGN_SYSTEM/` (4) | README read; `tokens.css`/`tokens.json`/`v8-ledger-visual-layer.css` inspected and merged in P00 |
| `03_ASSETS/` (192) | Inventoried: 145 icons (sprite, JSON, single SVGs), 26 app icons, 8 logos, 11 fonts |
| `06_SCREENSHOTS_AND_REFERENCES/` (578) | Counted: 179 desktop + 179 tablet + 179 phone + 29 overlays + 10 annotated owner screenshots + owner feedback (read in full). Launcher and Office Home viewed now; every app's screenshots are viewed at its phase (the QA prompts require side-by-side comparison) |
| `08_PROTOTYPE_AND_SOURCE/` (42) | README read; source file list inspected (base → v4 → v5 → v6 → v7 → v8 layers, `scope.py`, `build8.py`); per-app source files are read at each phase |

## 6. Missing or inaccessible

- Two original strategy canvases are links to claude.ai, not files (D17). Not accessible from here; the derived diagrams are used.
- Three overlays were not captured by the package (profile menu, invite dialog, new-avatar dialog); their routes are listed, so they are rebuilt from the prototype.
- **The owner's Aurj Dream 100 Tracker workbook** (spreadsheet test case) is only in screenshots. The real file (.xlsx or a Google Sheets export) is needed to test formulas faithfully.

## 7. Conflicts and ambiguities found

| # | Conflict | Sources | Proposed handling |
|---|---|---|---|
| C1 | Client Portal Messages and Files tabs: V8 removes them (locked decision); the owner's additive-only rule says never remove existing functions. Both tabs exist in the live app (preview only, Portal locked) | `08_CLIENT_PORTAL` brief vs owner directive §1 | **Owner decided (14 Nov): remove as V8 says.** |
| C2 | Forms public link: V4/V8 say public publish stays off until a security review and owner approval; the owner now asks for public links | Forms §4 vs owner requirement 12 | Treat the owner's instruction as the approval. Build with rate limiting, a hidden spam trap, size limits and a privacy line. A CAPTCHA (Cloudflare Turnstile, free) needs a site key the owner creates. |
| C3 | Editor presence: V8 assumption D5 says show only "Last edited by" until a realtime channel exists; the owner asks for live presence, cursors and conflict-free sync | 04 D5 vs owner requirement 7.10 | Owner requirement wins; choose a $0 realtime channel in P05 (plan says which) and document it. |
| C4 | Search scope "Docs & files" includes files; the owner says client documents and files must never appear in search | 02 §5 vs owner requirement 2.1 | Owner wins: client-scoped files and documents are excluded from search; the client record itself is searchable. |
| C5 | Client access is managed in Office › Admin › Client access (V8); the owner also wants it inside the client record | 03 §2 vs owner requirement 3.3 | Additive: same data shown and editable in both places. |
| C6 | Admins: V8 read-only for client access; owner adds "unless the owner grants an extra permission" | 03 §2.4 vs owner 3.4 | Add an owner-only grantable feature "Manage client access" for admins. |
| C7 | Planner Alignment: V8 says keep the original behaviour and restyle; the owner says the V8 alignment design is not good enough and wants a better layout | Planner brief vs owner directive §3.1 | Keep every original behaviour; redesign the layout with a written reason; show the owner before shipping. |
| C8 | Funnel Mapper brief says it lives in a separate repo and needs a 4-step client migration; the repo already moved it in (decision FM-6) with shared clients and a fresh start (FM-8, FM-9) | FM brief vs `docs/DECISIONS.md` | Repo decisions win (they are later, owner-made). The 4-step migration is already resolved by the fresh start; verify only. |
| C9 | Tasks list sheet: brief says radius 18, shadow, gradient; V8 visual layer says radius 8, no shadow, no wash | Tasks brief §3 vs P04 V8 requirements | V8 visual wins (stated in the package). |
| C10 | "Pro notification" in the owner's list is not a V8 term | Owner requirement 1.1 | **Owner confirmed (14 Nov): the notification inbox (bell).** |
| C11 | Voice typing: V8 lists English US/UK and Urdu; the owner adds mixed Urdu-English and Roman Urdu | Drive brief vs owner 7.6 | Additional requirement. Browser speech recognition handles one language per session; mixed and Roman Urdu need extra work (see plan). |
| C12 | Weather: V8 uses the user's location; the owner wants Khushab, Pakistan as the default and no snow | 02 §4 vs owner directive §5 | Khushab is the default location; an effect set without snow; the user's own location only if they allow it. |

## 8. Owner answers (14 Nov 2026)

1. Client Portal Messages and Files (C1): **remove as V8 says.**
2. Dream 100 workbook: **the owner will upload the .xlsx**; only the spreadsheet acceptance test (OR-37) waits for it.
3. "Pro notification" (C10): **the notification inbox (bell).**
4. D6 (client's own Office content) and D9 (version thinning 30/90 days): the documented assumptions are used unless the owner says otherwise.
