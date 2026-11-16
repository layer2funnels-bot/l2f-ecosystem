# P04 Drive with editors — progress report (15–16 Nov 2026)

Branch **`claude/kind-shannon-u0bd3t`** (pushed; the same commits are also on `p04-drive`, pushed by mistake early in the session — safe to delete).
**No pull request yet**: the owner's rule is one PR per *complete* application, and Drive is not complete (see §4). Plan: `DRIVE_PLAN.md`.

## 0. Production action taken this session (with the owner's approval)
PR #59 (recovery) had been merged and deployed **without migration 0060**, so live called missing tables (Launcher order, org logos, avatar settings,
Documents links). With the owner's "apply 0060 now": fresh backup schema **`backup_20261115b`** (`app_usage` 10/10 rows — no `reviewed_at` values existed —
plus the replaced function and policy definitions), then 0060 applied. Checklist (`MASTER_HANDOFF.md` §6) passed: 3 tables with RLS forced, `anon` cannot run
`workspace_rename`, 0 Access Review functions, security advisors unchanged. **Not yet verified signed in on live** (no test account in this session).

## 1. Done and tested
| Area | What | Tests |
|---|---|---|
| Sheets saving (OR-34) | Root cause found on production data and reproduced: autosave wrote a full version ~every 1.5 s against a 30 writes/min limit → HTTP 429 → "Not saved, retrying…". New rate class `save` (120/min, defaults merged so test servers keep it), autosave ≥ 3 s apart, 429 waits for the server's Retry-After; same fix in Docs (`lastAuto` was never set there) | Browser: 40 s continuous typing under **production limits**: 0 refusals, status back to Saved (SH9) |
| Version storage (03 §5, D9) | Autosaves thinned on write: one per person per 10 minutes; manual/named/restored versions kept; numbers keep rising (conflict detection intact). Images/PDFs keep original + latest edit only | DB: SV1–SV4; browser SH10 (≤ 4 versions after 24 edits) |
| Formulas (OR-35) | COUNTIFS, SUMIFS, AVERAGEIFS, MAXIFS, MINIFS, IFS, SWITCH, IFNA, ISNA, CHOOSE, XOR, SUMPRODUCT, PRODUCT, LARGE, SMALL, RANK, SIGN, TRUNC, CEILING, FLOOR, PI, TEXTJOIN, REPT, EXACT, SEARCH, WEEKDAY, EDATE, EOMONTH, DAYS, DATEDIF, NETWORKDAYS; `TODAY()` in the person's own time zone (was UTC: yesterday before 05:00 in Pakistan) | `sheetmodel.test` SF1–SF7 |
| Dream 100 (OR-37) | All **675** formulas equal Excel's saved values (TODAY pinned to the save date; on 15 Nov the two follow-up counts differ only because the date moved — the app is right); no `#NAME?` | SF8–SF11; browser SH1–SH12 on a temporary copy (fixture untouched), **Aurj** organization only |
| Excel import (OR-36) | Now keeps fonts (family, size, bold/italic/underline/strike), colours, fills, borders, alignment, wrap, number formats, column widths, row heights, hidden lines, frozen panes, filters, tab colours, dropdowns (fixed or read from a range, e.g. `Lists!$B$2:$B$14`), whole/decimal/date rules with the workbook's own messages, conditional formats (value rules, formula rules shifted per cell, colour scales). Borders drawn once in a soft ink | `sheetxlsx.test` XL1–XL13; browser SH4–SH7 |
| Migration **0061** (local only) | Stars, opens, presence, Move/Copy function, attachments, thinning, Reset to original, asset linking; rollback file | `drive-v8.test` **89/89** (both organizations + isolation) |
| Move / Copy (OR-22, OR-23) | Personal → Library, Library → Personal, Copy to…, folders recursive, structure kept, history moves with a move, copies start unshared with the current version, **stored bytes never move or duplicate**, shares/links removed on the way to Personal **after a warning that names how many people and links**, client/app-owned files and protected SOPs never move, locked folders respected. Menu (Move to…, Copy to…, Move to Library/Personal), selection bar, drag onto the sidebar, server-side "Make a copy" (was download + re-upload) | DB MV/MP/CP/NM; browser MV1–MV4, PM1 |
| Drive pages | Home (Suggested for you = what you opened, Folders as tiles, Recent files table), category pages (templates with real content; only that type; no Suggested; Forms lists the Forms app), Library, Personal (private notice), folders, Recent (opens), Starred (server stars, old browser stars moved once), Shared with me (count in sidebar), Trash. V8 markup + generated scoped CSS (`pages/drive.css`, `drive-side.css`); type chips stay real links; Type and People filters work | Browser DR1–DR4, ST1, TR1–TR2, RS (390/834 no sideways scroll) |
| CSS generator | Drops the prototype's unscoped Funnel Mapper rules exactly as `scope.py` does (V8 bug #1 had come back as a dark `.fcard`); removed 8 unused FM rules from Office/Tasks CSS | `check:pages` |
| Slides (new) | Did not exist. Editor on the V8 frame: thumbnails (drag / Alt+arrows), 16:9 canvas, title/body, text boxes, pictures (attachments), shapes, move/resize, notes, themes, layouts, Present (full screen, arrows, Esc), undo/redo, autosave + history | Browser SL1–SL3 |
| Editor frame | Shell editor mode: **no rail, no app sidebar, no second header**; top bar with Back, Apps switcher, tile, name + location, star, save state, presence (real heartbeat; "Last edited by" when alone — D5), History | Used by Slides (SL1) |
| Docs pictures (OR-28) | Pictures are document attachments: compressed (WebP/JPEG ≤ 2000 px, q 0.85; PNG/GIF keep format), stored once per organization by SHA-256 (server re-hashes the stored bytes), never listed in Drive, linked to every document/version that names them (copies and restores keep pictures; an id from someone's private document links nothing). Existing 47 `image.png` Drive files become app-owned (`docs`) by 0061 — hidden from Drive, still shown in their documents | DB AT1–AT8 (browser not possible: storage is off in the local stack) |
| Image / PDF | **Reset to original** (confirmation, server-side, byte-identical, logged) and **Edited \| Original** view (image); the old in-session reset is kept as "Undo all edits since opening" | DB SV5–SV6 |
| Voice (OR-30/31 part) | Dictation pauses with a message when the document tab or the browser tab changes (text never lands at a stale position) | manual only |

## 2. Test results (local stack, 16 Nov)
`npm test` all suites green after fixes (audit 63/63 and direct-access 19/19 caught two real issues — new private functions executable by PUBLIC, API allow-list — both fixed);
`drive-v8` 89/89 · `sheetmodel` 65/65 · `sheetxlsx` 13/13 · `web` 59/59 · `e2e-drive-v8` **36/36** (production rate limits) · `e2e-local` 71/71 · `e2e-recovery` 42/42 · `e2e-ui`: see `CURRENT_PROJECT_STATUS.md`.

## 3. Production impact when merged (needs the owner's go)
- **Migration 0061** must be applied (fresh backup first) **before or with** the merge. It changes data only by marking the 47 document pictures app-owned (reversible in the rollback).
- Optional, owner's decision: thin the **4,243 existing document versions** retroactively (the new rule applies only to new saves).

## 4. Not done yet (Drive is NOT complete — honest list)
| # | Item | Severity |
|---|---|---|
| 1 | Docs, Sheets, Image and PDF are not yet on the V8 editor frame (they still show the rail + app header + their own bar: the "two stacked bars") | High (V8) |
| 2 | Docs ruler (OR-32: margins, first-line indent, tab stops, vertical ruler) — needs numeric page margins in the document model | High (V8 [N]) |
| 3 | Docs audits not yet done with scripted tests: page dimensions/format after save, reload and restore (OR-24), double-click on every menu/dialog (OR-25; the dialog helper already de-duplicates by title), paste of formatted text/images (OR-26), content protection on back/tab/shortcut/slash (OR-27) | High (owner) |
| 4 | Voice modes: Roman Urdu and mixed Urdu/English (OR-29); conversation in Urdu | Medium |
| 5 | Live cursors and conflict-free merge (OR-33); presence is real but cursors need a realtime channel | Medium |
| 6 | Comments panel for files (comments exist only for project tasks); Share button inside editors | Medium |
| 7 | Sheets: V8 frame, chart Properties panel, `.xlsx` **export** still without formatting | Medium |
| 8 | Trash "30 days": nothing empties the Trash automatically — the page says so truthfully; automatic emptying is a destructive change for the owner to decide | Decision |
| 9 | Browser tests for pictures and Reset need a storage double in the local stack (DB tests cover them) | Low |
| 10 | Bulk-selecting folders (folders are V8 tiles now; their menu still has every action) | Low |
