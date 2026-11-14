# Whiteboard · features and functionality

Status marks: **[E]** existing, keep · **[R]** redesigned (same function, new design) · **[N]** new, build it · **[F]** future, do not build (show "Later" only where stated). Functions are unchanged from v7; V8 changes only the visual design (section 3).

## 1. Change register for this app (what the repo does not have yet)

- [R] Portal: tabs Home, Requests, Approvals, My notes (Messages and Files removed).
- [N] Whiteboard folders; [R] full-page canvas with floating tools.

## 2. Full functional brief (authoritative, carried over from v7 unchanged except the Funnel Mapper rename)

#### Whiteboard [R + N]
Repo `apps/whiteboard` (Excalidraw, MIT) + `modules/whiteboard.js`. Prototype `misc6.js` routes `#/whiteboard/home`, `folder/:id`, `board/:id`.
- Home: sidebar All boards, Starred, Templates, **Folders** list (+ New folder); page: Folders cards, template strip (Blank, Funnel flow, Brainstorm, Mind map, Retro, Kanban), Recent boards grid (thumbnail, name, editors, edited). Right-click board: Open, Rename, **Move to folder…**, Duplicate, Star, Trash.
- **Folders [N]**: create (name + who can open: everyone / only me / choose people), open, multiple boards inside, move boards between folders. `wb_folders(id, workspace_id, name, access)`, `whiteboards.folder_id`.
- **Board = full page [R]**: the Excalidraw canvas fills the whole viewport (no rail, sidebar or header). Floating panels: top-left (back, apps, board name + folder + Saved), top-centre Excalidraw toolbar (lock, hand, select, rectangle, ellipse, arrow, line, draw, text, image, sticky, eraser with number keys), top-right (presence, comments, library, Share), bottom-left (zoom, undo, redo), bottom-right (present, export, help). Use Excalidraw's own UI where possible (configure `UIOptions`, custom top-left) rather than re-implementing tools.



## 3. What V8 changes visually (no functional change)

- Board page unchanged (full-page canvas, floating tools).
- Home: ruled panels, flat cards, shared Ledger rules.

## 4. Existing behaviour as specified in V4 (approved 23 Oct 2026)

For apps marked [E] ("keep as built") this is the detailed description of what exists. It is historical: where it disagrees with §2 or a later decision (e.g. Portal Messages/Files removed, "Form Builder" renamed "Forms"), §2 and `04_OPEN_DECISIONS.md` win. Visual values here are superseded by V8.

#### 9. Whiteboard [whiteboard/*]
Home: templates, recent boards. Board: dotted infinite canvas, pan (drag empty space / wheel), zoom (buttons, Ctrl+wheel), fit, minimap, frames, draggable sticky notes with editable text, shapes, left tool rail (bottom on phones: select, pan, sticky, text, shape, pen, frame, connector), top bar with save state, undo/redo, presence, comments, Present, Share.
#### Other apps: workflow, states, relations, permissions, dependencies
| App | Core workflows | States to cover | Relations | Permissions | Depends on |
|---|---|---|---|---|---|
| Launcher | open app, find app, see why locked/soon | locked, soon, not here, next round, no weather | catalog, grants, weather op | `launcher_catalog()` | app manifests, MET op |
| Office | home, funnels records, strategies, documents, team, apps, admin | first use, no match, no access | Drive org space, Projects module, Admin | office/funnels/admin keys | Drive, Projects |
| Projects | plan, assign, track time, archive, search | empty, archived read-only, no access | Clients (optional), Drive docs, whiteboards | `projects.*` with client/project scope | 0013 |
| Clients | onboard, stages, requests, approvals, notes | first use, archived, client-scoped | Funnels copies, Forms, Drive, Portal | `clients.*` | 0025 |
| Drive | upload, organize, share, version, trash | empty, trash, protected SOP, personal | all apps (documents), storage adapter | `drive.*` | 0014, 0023 |
| Client Portal | see progress, approve, answer | preview-only ribbon (gate G2) | Clients, Approvals | projections only | G2 owner approval |
| Whiteboard | draw, open in context, All boards | empty, saving, newer version exists | Drive documents, Projects, Clients | Drive rights + context | 0024 |
| Planner | placeholder | soon | Projects tasks (later) | none yet | external onboarding, V4-9 |
