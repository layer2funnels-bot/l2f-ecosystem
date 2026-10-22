# Whiteboard spike: Excalidraw with storage in Drive (22 Oct 2026)

**Question:** can the Whiteboard app use Excalidraw (the open-source drawing board) and keep its boards in Drive? **Answer:** yes for storage (proved, no new table needed); the editor itself is a separate front-end piece that fits the web app only through an isolated page. Nothing was added to the repository's dependencies; the package was inspected in a scratch folder.

## Facts about the editor (checked)
| Item | Finding |
|---|---|
| Package | `@excalidraw/excalidraw` 0.18.1, **MIT** licence (also its helper packages) |
| Needs | React 17, 18 or 19 as a peer (our web app is plain JavaScript modules with no React) |
| Size | about 18 MB on disk (including fonts and languages); the production scripts are about **1 MB compressed** in total, loaded only on the board page |
| Our rules it touches | the page policy allows scripts and fonts from our own site only (`script-src 'self'`, `font-src 'self'`): the bundle and its fonts must be **self-hosted** (no CDN); no inline scripts |

## How it would fit (design, not built)
1. **Own page, own bundle.** Build the board as a small separate page (`/whiteboard/`) with its own React bundle (built once, committed or built in CI, served from our site). The rest of the app stays dependency-free. The page opens `#/whiteboard/<file id>` in the same tab, inside the shared header.
2. **Storage in Drive (no new table).** A board is a Drive **document** (`mime_type application/vnd.excalidraw+json`) in the shared or a client space. Save = a new Drive version with the scene JSON; history, restore, sharing links, archive, trash, permissions, audit and break-glass rules all come from Drive unchanged. The Whiteboard app only needs a "boards" list (Drive documents of that mime type) and the editor page.
3. **Images** are not embedded in the scene (that would break the 200,000-character document limit). Pasted images are uploaded as Drive files and the scene keeps a **reference** (file id); the editor loads them through signed links.
4. **Autosave**: debounce 3 seconds after the last change and on leaving; one writer at a time (the last save wins; a "someone else saved a newer version" check uses the version number returned by Drive). No multiplayer (out of scope).
5. **Client privacy**: a board in a client space is visible only to people with that client's Drive rights; nothing is shared with the client unless staff share it through the existing share links.

## What the test proved (`test/whiteboard-spike.test.mjs`, 10 checks)
A realistic scene (frame, 12 boxes, bound arrows, text with unicode and emoji, an image **reference**) is stored through the real Drive API and returns **byte for byte**; a second save is version 2 and version 1 stays intact; a colleague without that client's access cannot find the board, its versions or its content; another organization cannot; a scene one character over 200,000 is refused cleanly and the version count is unchanged; a scene just under the limit round-trips exactly; archive-before-delete and delete rights follow Drive. About 60 boxes with arrows and text is roughly 36 KB, so a board of a few hundred elements fits comfortably.

## Limits and risks
- **Limit**: 200,000 characters per document version. Large boards (thousands of elements) would exceed it; options are raising the limit for this mime type, or storing the scene as a Storage file (the Drive file path already supports that; the prepared storage module covers signed links). Decide when real boards are seen.
- **Offline fonts and the hand-drawn font**: the editor loads its own font files; they must be copied beside the bundle (licences: SIL OFL for the fonts it ships).
- **Security of loading**: a board is data; the editor never executes scene content. Still, links inside boards open in a new tab with no referrer.
- **Maintenance**: a React bundle in a plain-JavaScript repo needs a small build step and an upgrade routine (the project releases often).
- **Not built**: the editor page, the boards list, thumbnails, export to PNG/SVG (the editor offers them), templates. These need an approved design.

## Cost and effort (estimate)
Editor page + boards list + autosave + image references: 4 to 6 working days with tests; no running cost. Recommendation: proceed only after the Whiteboard design is approved and the first real use is clear (workshops with clients, funnel sketches); until then the data path is ready and tested.


## Built (23 Oct 2026)
The editor page became a lazily loaded module inside the app shell (not a separate page), so the header, switcher, breadcrumb and unsaved-work guard apply. See DECISIONS WBD-2 for the build, the licences, the patch that removes the remote fallback and what does not match the prototype. Images in boards and boards above the document limit are still open (a board is refused at 200,000 characters with a clear message).
