# 05 · V8 implementation master guide

## 1. What you are building
The complete Layer2Funnels + Aurj ecosystem as designed in V8: 14 documentation areas (shell + 13 apps), 179 documented pages. **V8 is the primary reference. V4 is history** (`06_V4_VS_V8_CHANGELOG.md`). The manager's process document (`09_FINAL_HANDOFF/MANAGER_PROCESS_Layer2Funnels_Claude_Code_Design_to_Implementation_Handoff.docx`) tells you **how** to work; this package tells you **what** to build.

## 2. Principles
1. **Preserve everything.** Every page, menu, tab, section, button, workflow, route and permission in V8 must exist in the product. Never merge, simplify or drop to save work.
2. **Do not invent.** If something is not specified, use the documented assumption in `04_OPEN_DECISIONS.md`; if there is none, stop and ask. Recommendations R1–R7 are not requirements.
3. **Real product, not the prototype.** The prototype's sample data, toasts ("prototype stand-in") and fake actions illustrate intent; build real data, API, RLS, tests.
4. **Server-side permissions,** default deny; Layer2Funnels and Aurj data never mix.
5. **Repo first.** Use the existing stack and patterns (`apps/web` vanilla modules, Projects V2 and Planner in React, Funnel Mapper in its own Next.js repo). For Projects, Planner and Funnel Mapper: inspect the real code; change visuals only, plus the agreed additions.
6. **Shared foundation first** (P00), then one app at a time, each with plan → approval → build → test → report.
7. **Scope CSS per app.** Use tokens; no hex in component CSS; no class names shared across apps unless they are true shared components.
8. **Every visible control works or says "Later"** (only where the brief says).
9. **Real links everywhere** (Ctrl/middle-click work).
10. **States on every page:** loading, empty, no results, error (10 s max), permission denied, read-only, archived, offline, conflict.

## 3. Shared components to build once (P00)
Tokens and type; rail; app sidebar; app bar; focused layout; phone bottom bar + apps-and-account sheet; Launcher; global search + search endpoint; notifications service + drawer; profile page; branding storage; context menu; dialog; drawer (right-panel size system); toast; table; tabs; segmented switch; status (word + dot); KPI band; empty/skeleton/error states; shared timer service (used by Projects and Tasks); Client service (built in P02, used by Projects and Funnel Mapper).

## 4. Order and dependencies
`09_FINAL_HANDOFF/IMPLEMENTATION_SEQUENCE.md`.

## 5. Per app
Start at `01_APPLICATIONS/<app>/APP_OVERVIEW.md`, then `FEATURES_AND_FUNCTIONALITY.md` (the authoritative brief with [E]/[R]/[N]/[F] marks), `PAGES_AND_NAVIGATION.md` (page by page), `USER_FLOWS_AND_WORKFLOWS.md`, `COMPONENTS_AND_INTERACTIONS.md`, `RESPONSIVE_DESIGN.md`, `IMPLEMENTATION_NOTES.md` (acceptance + definition of done). The ready-to-paste prompt is in `07_PROMPTS/`.

## 6. Quality bar
- Visual match to the V8 screenshot of every page at 1440, 834 and 390 px; light and dark; both organizations.
- No text under 12 px except avatar initials and file-type badges; right panels per `01_DESIGN_SYSTEM.md` §5.
- No horizontal page scroll at any width; touch targets ≥44 px on touch devices.
- Accessibility: visible focus, labels on icon buttons, contrast ≥4.5:1, keyboard paths (`07_PROMPTS/ACCESSIBILITY_AND_USABILITY_REVIEW_PROMPT.md`).
- Each app phase ends with a report and a completeness check against its `PAGES_AND_NAVIGATION.md` (every control listed is present).

## 7. Things that must not happen (owner rules)
Removing or hiding features to look cleaner · merging pages or menus · renaming navigation without approval · simplified versions of workflows · placeholder screens or dead buttons · fake presence or fake data in production · any reintroduction of the v7 visual anti-patterns (`01_DESIGN_SYSTEM.md` §9).
