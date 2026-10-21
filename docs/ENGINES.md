# Shared services and editor/whiteboard engines (21 Oct 2026)

Rule ER1: each engine is a **shared package** used by every app that needs it; the **data** stays owned by the app (Drive files, Projects docs/boards, Office boards) through `owner_app` + scope columns and the same permission engine.

| Need | Recommended | Licence (evidence) | Fit | Not chosen |
|---|---|---|---|---|
| Whiteboard (Office Whiteboard, Projects boards) | **Excalidraw** | MIT, no licence key in production (comparison checked Sep 2026) | Mature, embeddable React, export PNG/SVG; we store scenes as JSON in our tables | **tldraw**: production needs a commercial licence key (sales-priced) or a hobby licence that is non-commercial only → fails $0 + commercial use |
| Spreadsheets (Drive Sheets) | **Univer open-source core** | Apache-2.0 core; Pro features (real-time collaboration, xlsx import/export, print, charts) are under a commercial licence with watermarks/limits when unlicensed | Good grid + 500+ formulas free; **no xlsx import/export or live co-editing in the free tier** | Handsontable (non-commercial licence); Univer Pro (paid) |
| Documents (Drive Docs, project docs, SOPs, copy drafts) | **TipTap core** (ProseMirror) | MIT core [V at adoption via licence scanner]; avoid paid TipTap Pro extensions | Store JSON; versions in our tables; Yjs-ready | OnlyOffice (AGPL: would force publishing our code unless isolated); Univer Docs (beta) |
| Slides | **Defer** | — | No mature free engine; Univer Slides still under development | Build later or simple viewer + PPTX download |
| Image editing | Filerobot Image Editor [V licence] | reported MIT | crop/rotate/resize/markup; keep original as version | — |
| Live co-editing | Yjs later [V licence MIT] | — | Needs a sync server or Supabase Realtime within free limits [V] | — |

**Phasing:** Phase 5 = Docs (TipTap) + Whiteboard (Excalidraw) single-editor with autosave and version history (no live cursors). Phase 6+ = Sheets (Univer core), image editor, live co-editing after realtime limits are measured. Every engine goes through the CI licence scanner and a Permission Record before adoption; nothing is installed yet.

## Shared services build order (Phase 5)
1 API layer (typed operations + error contract + rate limit + safe logs) · 2 Storage service (files, versions, trash, signed links; files keep `owner_app`) · 3 Activity/comments · 4 Notifications (permission-filtered) · 5 Search (pointers only, re-checked). Approvals, audit and permissions already exist.
