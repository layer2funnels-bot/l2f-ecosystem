# V8 critical requirements QA

Every test for the owner's critical requirements (tracker Part B). A row changes only when the test has actually run; failures and open issues are written here, not hidden.

| Area | Req. | Test | Phase | Status | Result | Open issue |
|---|---|---|---|---|---|---|
| Data persistence | OR-24, OR-27, OR-34 | Save → reload → compare content and formatting; repeat for history restore | P05 | Not started | — | — |
| Cross-app permissions | OR-12…OR-17 | Matrix: owner, admin (with/without "Manage client access"), editor, viewer, freelancer, client contact, teammate+client × L2F/Aurj × every app, direct API calls | P01, P14 | Not started | — | — |
| Search privacy | OR-09, OR-10 | Client-scoped file/document never returned; user without access gets nothing; other org never | P00 | Not started | — | — |
| Notification delivery | OR-11 | Event → one row per recipient; same event twice → still one; bell count per org; open marks read | P00 + apps | Not started | — | — |
| Spreadsheet formulas and saving | OR-34…OR-37 | Function suite; save status honest; Dream 100 workbook values equal Excel/Sheets | P05 | Not started | — | Workbook in `test/fixtures/`; COUNTIFS missing in the formula engine (found 14 Nov) |
| Document editing and history | OR-24…OR-27 | Refresh, back button, tab switch, shortcuts, slash command, view switch: content hash unchanged | P05 | Not started | — | — |
| File storage and duplicates | OR-22, OR-23, OR-28 | Move/copy Library ↔ Personal (files + folders); 10 saves → one image stored; storage counter | P05 | Not started | — | — |
| Voice typing | OR-29…OR-31 | Insert at cursor; tab switch; modes English / Urdu / Mixed / Roman Urdu; owner's spoken test | P05 | Not started | — | Speech engine limits documented |
| Strategy → project | OR-42 | Saved strategy → project with sections/tasks; link both ways | P06 | Not started | — | — |
| Plan → project | OR-43 | Field mapping; double submit → one project | P03/P06 | Not started | — | — |
| Public form submissions | OR-49…OR-52 | Logged-out browser: open link, submit, validation errors, stored, owner sees it; rate limit | P10 | Not started | — | — |
| Navigation and performance | OR-06, OR-07 | Route timings cold/warm, duplicate-request counter, animation only while loading | P00 + all | Not started | — | — |
| Planner opening and scrolling | OR-40, OR-45 | 50× open/switch/refresh; expired token; long objective drawer scrolls at 1440/834/390 | P06 | Not started | — | — |
| Launcher weather | OR-53…OR-55 | Weather → effect map (no snow); service down; reduced motion; switch off | P00 | Not started | — | — |
