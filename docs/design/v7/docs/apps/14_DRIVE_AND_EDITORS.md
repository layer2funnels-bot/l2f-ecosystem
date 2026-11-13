# Drive and editors · implementation brief

Repo: `modules/drive.js`, editors `docs.js` (Word), `sheets.js`, `imageeditor.js`, `pdfeditor.js`, slides (in docs/drive), CSS `drive.css docs.css sheets.css imageeditor.css pdfeditor.css`; feature lists in `docs/design/EDITORS_DESIGN_BRIEF.md` (**all those features stay**). Prototype `drive5.js` + `drive6.js` + `v7.js`, routes `#/drive/...`, `#/drive/edit/{doc|sheet|slides|image|pdf}/...`.

## Drive browsing [R]
- Sidebar (v7 15 px): **New** (primary, opens New menu) · Home · Library · Personal · Recent · Starred · Shared with me (count) · Trash; storage meter (links to Admin › Storage); hint "Drag a file onto Library or Personal to move it". Library and Personal are drop targets (highlight on drag over).
- **Type chips** at the top of the content: All · Docs · Sheets · Slides · PDFs · Images · Forms (coloured type tiles).
  - **All** = Home as approved (Suggested for you, Folders, Recent files table/grid, toolbar Type, People, list/grid, New folder, Upload).
  - **A type [N] = its own category page**, not Home: header (big type tile, "Docs", "N docs you can open…", primary New document / Upload for PDFs & Images / Open Forms), "Start a new …" template strip (Blank + templates for Docs, Sheets, Slides), toolbar (Anywhere/Library/Personal/Shared with me, sort), and **only files of that type**. No "Suggested for you" on category pages. Forms category lists forms from the Forms app (links there).
- **Move / Copy between Library and Personal [N]**: right-click a file/folder → Move to…, Copy to…, Move to Library, Move to Personal; dialog with folder tree of both spaces and a consequence note (Library: org owns, everyone in org can find; Personal: private, existing shares removed after warning; copy starts unshared); drag onto sidebar items asks the same confirm. Server-side, versions move with Move. Works for folders recursively.
- Keep: selection bar, share dialog, details panel, trash with days left, drop-to-upload overlay.

## Editor frame (all five editors) [R]
```
TOP 52px  ← | apps | [type tile] File name (editable) / location | ★ | Saved 10:43 | presence avatars "Ahmad is viewing" | History | Comments | (image/pdf: Save as copy, Download, Save) | Share
ROW 46px  File Edit View Insert Format Tools (Data Help for Sheets; Slide Arrange; Image; Page) | toolbar buttons 34px, icons 18px
BODY      [left panel: Tabs (Docs) / thumbnails (Slides, PDF) / tool rail (Image)] canvas [right panel: History / Comments / Properties, 280px]
STATUS 32 words · page size · zoom − 110% + · Fit width
```
- No rail, no app sidebar, no second header (fixes "two stacked bars" and wasted space). Menus open dropdowns with the real menu items (see EDITORS_DESIGN_BRIEF). Overflow toolbar items move into "⋯" at narrow widths; phone: menus collapse into one Menu button.
- Save state text: Saving… / Saved hh:mm / Unsaved changes / Offline – retrying; conflict dialog kept.
- Presence [N]: avatars of people with the file open (green ring), text "X is viewing" / "X is editing" (needs a presence channel; until realtime exists show "Last edited by X" — don't fake presence).
- Right panel tabs: Version history (All / Named; rows with time, person, name; Name this version; Restore = restore as a new version), Comments (threads, resolve), Properties (contextual: table, chart, picture, page setup).

## Docs (Word) [R + N]
Keep every feature in EDITORS_DESIGN_BRIEF §3 (tabs and sub-tabs sidebar, styles, 22 fonts incl. Urdu, lists, tables, pictures, header/footer, TOC, footnotes, find/replace, voice typing incl. Urdu + Conversation mode, import/export formats, autosave, versions). Design:
- Left **Tabs** panel 220 px (toggle "Tabs" in toolbar), tab rows with ⋯ and nested headings.
- **Ruler [N]**: horizontal ruler above the page (sticky), inches/cm by locale, ticks every 1/8, numbers each inch, grey margin zones, **draggable left/right margin markers (blue triangles), first-line indent marker, tab stops** (click to add, drag off to remove). Vertical ruler on the left showing top/bottom margins (hidden < 1000 px). Rulers reflect the page setup (A4/Letter, margins) and the current paragraph's indents. View › Show ruler toggles it.
- Page: fit-width by default with modest gutters (max 816 px at 100 %), white page even in dark UI (option).
- Table toolbar appears **above** the table (never covering it): Row above, Row below, Column, Header, Colour, Delete.
- Voice typing bar at the bottom: Stop, language (English US/UK, Urdu), Dictation | Conversation, live waveform, "Hearing: …", close.
- Toolbar order: undo, redo | style, font, size − n + | B I U, text colour, highlight | bullets, numbers, checklist | link, picture, table | align & spacing, more (strike, sup, sub, code, clear, page break) … | voice, tabs.

## Sheets [R]
Keep all features (EDITORS §4). Formula bar row: name box (cell ref), fx, input. Grid as today; sheet tabs bar; status bar Sum · Average · Count of selection + zoom. Properties panel for charts (type, range, title, legend) and conditional formatting/dropdown dialogs.

## Slides [R]
Left thumbnails 180 px with numbers + "Slide"; canvas 16:9 centred; speaker notes under; toolbar text box, picture, shape, table, theme, layout, **Present** (full-screen, arrows).

## Image [R + N]
Left tool rail 52 px: Crop, Rotate & flip, Resize & canvas, Adjust, Draw, Text, Shapes, Hide details (blur/pixelate/box), Border & watermark, Colour picker. Right panel 260 px: sliders (Brightness, Contrast, Saturation, Exposure, Warmth, Blur, Sharpen), filters, Before/after. Toolbar: undo/redo, **Edited | Original** switch, **Reset to original** (confirm dialog → restores the uploaded original, discards edits). Explicit **Save** (replaces the previous edit), Save as copy, Download (PNG/JPEG/WebP with quality + size). Status: dimensions, type, size, "Original kept · latest edit saved".

## PDF [R + N]
Left thumbnails (reorder by drag, + Page). Tools: Select, Add text, Highlight, Draw, Shape, Sign (drawn/typed dialog), Picture, Fill form, Redact | Rotate page, Blank page, Merge a PDF, Extract pages, Delete page | Search. **Reset to original** like Image. Save explicit.

## Acceptance
- Choosing "Docs" shows only docs + templates; no Suggested widget.
- Move from Personal to Library works without download; owner changes; shares removed on the reverse move after warning.
- Docs ruler margins change the page margins; tab stop affects Tab key; ruler hides in phone width.
- Reset to original restores byte-identical original (hash check).
- Editors keep every feature from EDITORS_DESIGN_BRIEF (checklist pass).
