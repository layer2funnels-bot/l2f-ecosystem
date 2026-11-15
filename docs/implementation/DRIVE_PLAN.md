# P04 Drive with editors — plan (15 Nov 2026)

Spec: `01_APPLICATIONS/05_DRIVE_AND_EDITORS/*` (authoritative brief `FEATURES_AND_FUNCTIONALITY.md` §2), prompt `07_PROMPTS/P05_DRIVE_AND_EDITORS.md`,
`09_FINAL_HANDOFF/reference/EDITORS_DESIGN_BRIEF.md` (every listed editor feature stays), `00_MASTER_DOCUMENTATION/03_PERMISSIONS_DATA_INTEGRATIONS.md` §4–5,
`04_OPEN_DECISIONS.md` D5/D9, `V8_BUG_FIXES.md` #1–4, owner requirements OR-22…OR-37 (`V8_IMPLEMENTATION_TRACKER.md` B6–B8) and the owner's session brief (Part 6).
Prototype: `drive5.js`, `drive6.js`, `v7.js` (+ base→v8 CSS). Branch **`p04-drive`** (from `main` b356b2e). One PR when the whole app is done.
The owner's brief (Part 14) replaces the prompt's "stop and wait for go" step: build starts after this plan.

## 0. Audit findings (evidence, not assumptions)
| # | Finding | Evidence | Fix |
|---|---|---|---|
| A1 | **Sheets never really saved on production**: 5 sheets, 6 versions, largest 140 characters | `file_versions` on production, 15 Nov | A2 + A3 |
| A2 | Autosave writes a **full new version ~every 1.5 s**; the API's `write` limit is **30/min per person** → HTTP 429 → "Not saved, retrying…" with back-off up to 30 s while new edits keep re-triggering. Browser suites never saw it: they raise the limit to 600/min | Reproduced on the local stack with production limits: 40 edits → 36 versions + four 429s | Own rate class `save` (120/min), autosave every 2 s idle / ≥ 3 s apart, 429 retries after the server's `Retry-After`, honest status text |
| A3 | Same cadence on Docs: **4,243 full-copy versions for 30 documents** (≈95 MB) | production | Autosave thinning on write: one autosave per person per 10-minute window (later ones replace it); named and manual versions kept forever (03 §5, D9) |
| A4 | Formula `COUNTIFS` missing → `#NAME?` on the Dream 100 Dashboard (B11, B12); `TODAY()` used the UTC date (yesterday before 05:00 in Pakistan) | Dream 100 import through the app's own engine: 673/675 matched, 2 `#NAME?` | Added COUNTIFS/SUMIFS/AVERAGEIFS/MAXIFS/MINIFS, IFS, SWITCH, IFNA, ISNA, CHOOSE, XOR, SUMPRODUCT, PRODUCT, LARGE, SMALL, RANK, TRUNC, CEILING, FLOOR, TEXTJOIN, REPT, EXACT, SEARCH, WEEKDAY, EDATE, EOMONTH, DAYS, DATEDIF, NETWORKDAYS…; local date. Unsupported names show "XYZ isn't supported yet" |
| A5 | Excel import keeps only values, formulas and number formats: **no fonts, colours, fills, borders, alignment, column widths, frozen panes, filters, dropdowns (13 rules, range-sourced), number/date validation, conditional formats (5)** | `sheets.js` import + bridge; workbook XML | Pure OOXML reader `sheetxlsx.js` (styles, cols, panes, autoFilter, dataValidation, conditionalFormatting incl. expression + colour scale); model gains font family, range-sourced lists, number/date rules, formula and colour-scale formats |
| A6 | Pasted document pictures become **visible Drive files** (`image.png` × 47, 12.8 MB, uncompressed, 4 byte-identical copies) | production `files` | Document attachments: content-addressed (SHA-256 per organization), compressed (WebP/JPEG ≤ 2000 px, q≈0.85), never listed in Drive, referenced from every version that used them, never deleted while referenced; existing 47 files migrated to attachments (hidden, not deleted) |
| A7 | Stars live in the browser's `localStorage`; no Recent from real opens; no Starred page across devices | `drive.js` | `drive_stars`, `drive_opens` tables |
| A8 | No Move/Copy Library ↔ Personal; no category pages; no "Suggested for you" | `drive.js`, routes | §2 |
| A9 | **No Slides editor exists** (V4 text and V8 both list it) | repo search | New editor `slides.js` on the shared frame (A11) |
| A10 | No ruler, no presence line, no Reset to original, no V8 editor frame | repo search | §3 |

## 1. Pages → code
| V8 page | Route (repo) | File | Status |
|---|---|---|---|
| Home (All) | `#/drive` = `#/drive/home` | `modules/drive.js` (rewritten views on prototype markup), `pages/drive.css` (generated, root `.v8p-drive`) | [R] |
| Category (Docs/Sheets/Slides/PDFs/Images/Forms) | `#/drive/type/:t` | same | [N] |
| Library | `#/drive/mydrive` (+ existing `#/drive`) | same | [R] |
| Personal | `#/drive/personal` | same | [R] |
| Folder | `#/drive/f/:id`, `#/drive/personal/f/:id` | same | [R] |
| Recent / Starred / Shared with me / Trash | `#/drive/recent|starred|shared|trash` | same | [R]/[N] starred |
| Docs editor | `#/doc/:id` (+ alias `#/drive/edit/doc/:id`) | `docs.js`, `docedit.js`, `docdom.js`, `edchrome.js` (V8 frame) | [R]+[N] ruler, presence line |
| Sheets editor | `#/sheet/:id` (+ alias) | `sheets.js`, `sheetformula.js`, `sheetmodel.js`, new `sheetxlsx.js` | [R]+fixes |
| Slides editor | `#/slides/:id` (+ alias) | new `slides.js`, `slidemodel.js` | [N] |
| Image editor | `#/image/:id` (+ alias) | `imageeditor.js` | [R]+[N] Reset |
| PDF editor | `#/pdf/:id` (+ alias) | `pdfeditor.js` | [R]+[N] Reset |
Dialogs: Create new, Move n items to Trash?, Move to…/Copy to… (folder tree of both spaces + consequence note), Move to Library/Personal? (drag on sidebar),
Reset to original?, file details drawer (Details / Manage access / Versions, kept), share dialog (kept), selection bar (kept). Every open/act guarded against double clicks.

## 2. Data — migration `0061_drive_v8.sql` (local first; production only with the owner's go and a fresh backup)
- `drive_stars (workspace_id, user_id, file_id | folder_id)` — personal, RLS owner only; the old `localStorage` stars are imported once by the client.
- `drive_opens (workspace_id, user_id, file_id, opened_at)` — one row per person and file (upsert); feeds Recent and "You opened …".
- **Move/Copy** as security-definer functions with the rules of 03 §4: `drive_move(items, to_space, to_folder)` — Personal→Library: only your own
  items, needs `drive.file.upload`; owner becomes the organization, shares kept. Library→Personal: the uploader or an admin; client and app-owned
  files never move; shares to others removed (the dialog warns first); versions and links move with the item; folders recursive. `drive_copy(...)` — new
  rows, **same stored bytes** (no second copy in storage; delete-forever only removes stored bytes nobody else references), no sharing, history not copied.
- **Attachments**: `doc_assets (workspace_id, sha256, storage_path, mime, size_bytes, width, height)` unique per organization + `doc_asset_refs (file_id, asset_id)`;
  readable by anyone who can read a file that references the asset (security definer). Migration of the 47 existing `image.png` document pictures: kept,
  marked app-owned (`managed_by = 'docs'`) so they stop cluttering Drive; documents keep opening them.
- **Versions**: `file_versions` autosave thinning (A3) in `drive.files.versions.add`; Image/PDF "original + latest edit only" (`original_version` on `files`),
  `drive.files.resetOriginal` (logged, byte-identical: points at the original's stored object).
- Rate class `save` for `drive.files.versions.add`.
Rollback: `migrations/rollback/0061_drive_v8.down.sql`.

## 3. Editors (shared V8 frame: 52 px top bar, 46 px menu + toolbar row, side panel 280 px, 32 px status bar; no rail/sidebar)
- Docs: keep every EDITORS_DESIGN_BRIEF §3 feature. Fix OR-24 (page frame/dimensions, formatting kept after save/reload/restore), OR-25 (one dialog/panel per
  action: shared `once()` guard), OR-26 (paste HTML/plain/images; context-menu paste via Clipboard API where allowed), OR-27 (never lose content: save before
  any navigation, tab switch, view switch; `beforeunload`; slash-command and shortcut deletion tests), OR-28 (A6), OR-29–31 (voice at the cursor, mode switch
  English · Urdu · Roman Urdu · Mixed, mic state across tabs), OR-32 ruler (horizontal + vertical, margins, first-line indent, tab stops → Tab key), OR-33
  presence: D5 assumption "Last edited by X" + "X is viewing" via a $0 polling heartbeat (`drive_presence`, 20 s) — no fake presence; live cursors listed as
  a remaining item unless time allows a realtime channel.
- Sheets: A2–A5; Properties panel for charts; readable defaults (column width/fonts); the Dream 100 acceptance (OR-37).
- Slides: new; thumbnails 180 px, 16:9 canvas, text boxes, picture, shape, table, theme, layout, speaker notes, Present (full screen, arrows), autosave.
- Image/PDF: Edited | Original switch, Reset to original, explicit Save (replaces the previous edit), Save as copy, Download.

## 4. Tests
`test/sheetmodel.test.mjs` (+ every new function; Dream 100 snapshot `test/fixtures/dream100.cells.json`: all 675 formulas equal Excel's saved values at
its save date), `test/sheetxlsx.test.mjs` (styles/DV/CF mapping), `test/drive-v8.test.mjs` (move/copy both ways, folders recursive, version counts,
shares removed, storage not duplicated, isolation L2F/Aurj, client files never move, stars/opens private, attachments dedupe + access, thinning, reset
byte-identical), browser `scripts/e2e-drive-v8.mjs` (pages at 1440/834/390, flows 1–5, Dream 100 import → edit → reload, slow network, double clicks,
**production rate limits**).

## 5. Risks / open points
- Live cursors and conflict-free merging (OR-33) need a realtime channel; the free option (Supabase Realtime broadcast) is not in this stack yet. Plan: presence
  by heartbeat now; cursors only if time allows; reported honestly otherwise.
- Mixed English/Urdu and Roman Urdu dictation: browser engines recognise one language at a time; Roman Urdu = Urdu recognition + transliteration (rule table),
  Mixed = English engine with Urdu fallback per phrase. Needs the owner's manual test.
- Size: this is the largest app so far. Work is committed and pushed to `p04-drive` as it goes (backup); the PR opens only when Drive is complete.
