# V4 feature preservation matrix

Rule (owner, 14 Nov 2026): **live V4 functions + V8 additions + fixes; never subtraction.** Before an app is changed, its live functions are audited and listed here with their place in V8. A row is "Preserved" only after a test shows the function still works in the new build.

Statuses: Audit pending · Mapped (place in V8 decided) · Preserved (tested) · Removed by owner decision.

## 1. Already known: V4 pages that are not separate pages in V8 (from `06_V4_VS_V8_CHANGELOG.md` §3)

| V4 page/function | Where it lives in V8 | Function kept? | Status |
|---|---|---|---|
| Office › Planner | Planner is its own app (rail, Launcher) | Yes | Mapped |
| Projects list (`projects/list`) | Projects › All projects + project tabs | Yes | Mapped |
| Projects docs (`projects/docs`) | Project › Docs & links tab + Projects › Files | Yes | Mapped |
| Project boards tab | Project Board view; whiteboards in Docs & links | Yes | Mapped |
| Project activity tab | "+ View" → Activity | Yes | Mapped |
| Drive "Shared drives" | Library (organization space) next to Personal | Yes | Mapped |
| Client notes tab | Client › Team Notes | Yes | Mapped |
| Client work stage routes (brand, strategy, copy, build, marketing, strategy sub-pages) | `Work/<stage>` and `Work/1/<avatar/offers/brand/strategy>` | Yes | Mapped |
| Office › Admin › Members | Admin › People + person page | Yes | Mapped |
| Office › Admin › Access | Admin › Teammate access + Client access | Yes | Mapped |
| Office › Admin › Effective access | Check access panel (person page) + Access review | Yes | Mapped |
| Office › Admin › History | Admin › Audit log | Yes | Mapped |
| Clients › Pipeline menu | Pipeline is a view of All clients (Table default) | Yes | Mapped |
| Shell "Open organization in a new tab" | Real links: Ctrl/middle-click/right-click open any page in a new tab | Yes (as a browser action) | Mapped |
| Profile inside Office | Global `#/profile` page | Yes | Mapped |
| Client Portal › Files | — | No | **Removed by owner decision (14 Nov 2026)** |
| Client Portal › Messages | — | No | **Removed by owner decision (14 Nov 2026)** |

## 2. Per-app audit of the live build (filled at the start of each phase)

| Phase | App | Live functions audited | Mapped | Preserved (tested) | Status |
|---|---|---|---|---|---|
| P00 | Shell, Launcher, Profile | — | — | — | Audit pending |
| P01 | Office | — | — | — | Audit pending |
| P02 | Clients | — | — | — | Audit pending |
| P03 | Projects | — | — | — | Audit pending |
| P04 | Tasks | (new app, nothing live) | — | — | — |
| P05 | Drive and editors | — | — | — | Audit pending |
| P06 | Planner | — | — | — | Audit pending |
| P07 | Funnel Mapper | — | — | — | Audit pending |
| P08 | Client Portal | — | — | — | Audit pending |
| P09 | Whiteboard | — | — | — | Audit pending |
| P10 | Forms | — | — | — | Audit pending |
| P11 | Value Ladder | — | — | — | Audit pending |
| P12 | Social Planner | — | — | — | Audit pending |
| P13 | Layer 2 Agents | (placeholder only) | — | — | — |
