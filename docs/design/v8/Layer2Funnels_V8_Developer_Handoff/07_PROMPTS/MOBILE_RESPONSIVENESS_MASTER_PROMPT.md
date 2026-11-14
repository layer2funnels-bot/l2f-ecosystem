# Mobile responsiveness master prompt (same as 04_RESPONSIVE_DESIGN/MOBILE_FIRST_MASTER_PROMPT.md) · paste into Claude Code (after the app you are working on is built on desktop, or while building it)

You are Claude Code working on the Layer2Funnels + Aurj ecosystem. Make the current app work properly on phones and tablets without removing any function.

Read first: `04_RESPONSIVE_DESIGN/DESKTOP_TABLET_MOBILE_RULES.md`, `NAVIGATION_RESPONSIVE_BEHAVIOR.md`, `APP_SPECIFIC_MOBILE_REQUIREMENTS.md`, the app's `01_APPLICATIONS/<app>/RESPONSIVE_DESIGN.md`, and the phone (390) and tablet (834) screenshots of every page of the app.

Rules:
1. Build everything marked **[Confirmed]**. Do not build **[Proposed]** items unless Tabish approved them (ask in your plan).
2. Do not shrink the desktop layout. Re-flow: one column in reading order; tables scroll inside their container or stack; right panels full screen; dialogs keep labels visible.
3. Every function available on desktop stays available on phone (it may move into ⋯, More or a sheet — list where each moved in your report).
4. Touch targets ≥44 px; text ≥14 px body, ≥12 px labels; no horizontal page scroll at 360, 390, 414, 768, 834 px.
5. Navigation: bottom tab bar (first 4 items + More), apps-and-account sheet, long-press for context menus.
6. Test on real widths in Playwright and on one real phone; attach screenshots next to the prototype's phone screenshots.

Deliverable: `docs/implementation/<APP>_MOBILE_REPORT.md` with a page-by-page table (page, phone OK, tablet OK, functions moved, issues).
