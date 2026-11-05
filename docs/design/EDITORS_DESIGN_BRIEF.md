# Design brief for Claude Design: the four editors (Word, Spreadsheet, Image, PDF)

**Product:** Layer2Funnels + Aurj ecosystem: one sign-in, many apps (Office, Projects, Clients, Drive, Planner, Forms, Value Ladder, Social Planner, Whiteboard, Funnel Mapper Pro).
**Live:** https://office.tabishriaz.com (Drive › New › Document / Spreadsheet; upload an image or a PDF and open it).
**Owner's goal:** editors that feel as complete and comfortable as Google Docs / Sheets or Microsoft Word / Excel, but simpler and cleaner. They should be professional, never basic, and never overloaded. **Do not copy Google or Microsoft visuals, icons or wording.**

## 1. Design system (must keep)
- **Design v4 "Signal"** (`docs/design/v4/`, tokens in `packages/ui/tokens.json`).
  - **Themes:** light and dark.
  - **Organizations:** two, with different brand colours: Layer2Funnels (yellow/blue) and Aurj (rose/teal).
  - **Fonts:** Bricolage Grotesque for display, Geist for UI, Geist Mono, and Noto Nastaliq Urdu for Urdu.
- **Touch and accessibility:**
  - Controls are at least 44px on touch screens.
  - With a mouse, editor toolbars may be compact (36px; decision DOC-2).
  - Visible focus and keyboard access everywhere.
- **Screen sizes:** must work at 1366px (laptop), 768px (tablet) and 390px (phone).
- **Urdu:** right-to-left text must look right.

## 2. Shared editor frame (all four editors, today)
The app sidebar and the phone bottom bar hide while an editor is open (full window). From top to bottom:
1. **App header (68px):** app switcher, app name, search, notifications, organization switcher, avatar.
2. **Editor top bar (about 48px):** back arrow, file-type icon, title editable in place, save state ("Saving… / Saved 10:20 / Unsaved changes"), History, Save, Download (image/PDF).
3. **Menu bar.**
   - Word: File, Edit, View, Insert, Format, Tools.
   - Sheets: adds Data and Help.
   - Image/PDF: File, Edit, View, Insert, Page/Image, Tools.
   - On a phone, the menus collapse into one "☰ Menu" button.
4. **One toolbar row** (overflow into "⋯").
5. **The editing surface.**
6. **A status bar** (word count / Sum-Avg-Count / zoom / page count).

**What the owner dislikes / issues to solve:**
- There is a lot of empty grey space left and right of the Word page.
- Zooming wastes width.
- Two stacked bars (app header plus editor top bar) take vertical room.
- The floating table toolbar used to cover the table.

## 3. Word editor (docs.js), current features
- **Document tabs and sub-tabs** in a collapsible left sidebar: add, rename, emoji, duplicate, delete, reorder by drag, nest 3 levels. The open tab's headings are listed under it.
- **Text formatting:**
  - styles: Normal, Title, Subtitle, H1–H3, Quote, Code;
  - 22 fonts, including Urdu fonts; size;
  - bold, italic, underline, strikethrough, superscript, subscript, inline code;
  - text colour, highlight, clear formatting, change case;
  - alignment; line and paragraph spacing; indent;
  - bulleted, numbered and checklist lists (nested);
  - links, horizontal line, page break, special characters, date.
- **Tables:**
  - grid picker up to 10×10; "/" menu; `| a | b |` plus Enter; convert text to table;
  - floating table toolbar (rows, columns, header row, align, cell colour, borders, delete);
  - Tab moves to the next cell.
- **Pictures:** upload, paste or drop; resize handle; alignment; text wrap (inline/left/right/break); alt text.
- **Page:**
  - A4 or Letter, portrait or landscape, margins;
  - header, footer and page numbers, with a different first page;
  - table of contents and footnotes;
  - zoom, print preview, focus mode, reading mode.
- **Find and replace** (current tab or all tabs), word count, keyboard shortcuts dialog.
- **Right-click menu:** cut, copy, paste, paste as plain text, link, table and picture actions.
- **Voice typing** in English (US/UK) and Urdu. Conversation transcript with speakers; automatic speaker detection (beta) is being added.
- **Files:**
  - Download: .docx, PDF (print), .odt, .rtf, .txt, .html (zip with pictures), .epub, .md.
  - Open: .docx, .md, .txt, .html.
- **Saving:** autosave, version history with named versions, conflict dialog when someone else saved.

## 4. Spreadsheet editor (sheets.js), current features
- **Grid and navigation:**
  - virtualised grid of 1,000 rows × 52 columns;
  - formula bar with a name box;
  - function autocomplete and signature hint;
  - freeze panes, hide rows/columns, resize and auto-fit, zoom 50–200%.
- **Formatting:**
  - bold, italic, underline, strikethrough, size, colours;
  - alignment, wrap, borders, merge, paint format;
  - number formats: currency, percent, date, time, text; decimals.
- **Data:**
  - sort and filter, find and replace;
  - dropdown lists, conditional formatting, notes, links;
  - protect sheet.
- **Charts:** column, bar, line and pie, drawn in SVG; movable and resizable.
- **Sheets:** add, rename, duplicate, colour, reorder, delete.
- **Status bar:** Sum, Average and Count of the selection.
- **Files:**
  - Import: CSV and XLSX.
  - Download: XLSX, ODS, CSV, TSV, HTML, PDF (print).
- **Saving:** autosave, history.

## 5. Image editor (imageeditor.js), current features
- **Shape the picture:** crop (free, 1:1, 4:3, 16:9, 9:16), rotate, flip, resize, add space/canvas colour.
- **Adjust:** brightness, contrast, saturation, exposure, warmth, blur, sharpen; filters.
- **Draw and annotate:** pen, highlighter and eraser; text; shapes (rectangle, ellipse, arrow, line).
- **Hide sensitive details:** black box, blur area, pixelate.
- **Finishing:** border, rounded corners, watermark; colour picker.
- **Objects** stay editable until saved: move, resize, layer order.
- **Review:** undo and redo, before/after compare.
- **Saving:** autosave as a new version, Save as copy, Download (PNG/JPEG/WebP with quality and size estimate), history.

## 6. PDF editor (pdfeditor.js), current features
- **Viewing:** page thumbnails sidebar, continuous scroll, zoom/fit, search with highlights, bookmarks, print.
- **Annotating:**
  - add text, highlight, rectangle, freehand, signature (drawn or typed), picture;
  - fill form fields.
- **Pages:** delete, reorder, rotate, blank page, merge another PDF, extract pages.
- **Page decorations:** page numbers, watermark, redaction (the page is turned into a picture).
- **Saving:** file-size tidy-up; autosave as a new version, Save as copy, Download, history.

## 7. What we ask Claude Design for
1. **One editor frame** used by all four editors:
   - a single compact top area (merge the app header and the editor bar where possible);
   - a clean menu bar plus toolbar;
   - a contextual right-side panel pattern for properties (table, picture, chart, adjustments, page settings);
   - a status bar.
   - Light/dark and both organizations, at 1366 / 768 / 390.
2. **Word:**
   - page canvas that uses the width well (fit-width default, modest gutters);
   - zoom behaviour;
   - quick font size − / +;
   - a compact table toolbar that never covers the table;
   - tabs sidebar;
   - the voice / transcript panel (live text, automatic speakers, rename speakers);
   - the slash menu;
   - picture handles;
   - header and footer editing;
   - print preview.
3. **Sheets:** grid, formula bar, sheet tabs, chart editing panel, conditional formatting and dropdown dialogs, filter popup.
4. **Image:** tool rail, adjustment sliders, crop overlay, object handles, export dialog.
5. **PDF:** thumbnails, annotation tools, signature dialog, page operations, form-filling state.
6. **States** for every editor: empty, loading, saving, saved, offline/retrying, conflict, read-only (viewer / shared link), error.
7. **Public share page:** a read-only viewer for anyone with a link, branded lightly, phone first.

## 8. Constraints for implementation
- **Plain HTML/CSS/JS modules:** no frameworks in the app shell.
- **Colours** come only from tokens: no hex colours in the CSS (design test DV20).
- **Third-party UI kits:** none, and no assets from Google or Microsoft.
- **Icons:** line icons in the existing set (`apps/web/js/icons-v4.js`); new glyphs must follow the same 24px, 1.6px-stroke style.
