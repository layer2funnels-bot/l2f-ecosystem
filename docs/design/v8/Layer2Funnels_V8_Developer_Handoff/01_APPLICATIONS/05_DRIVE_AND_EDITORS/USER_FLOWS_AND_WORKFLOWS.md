# Drive and editors · user flows and workflows

Each flow names the prototype route or control. "Source" says where the rule is defined. Cross-app flows: `05_STRATEGY_AND_ARCHITECTURE/CROSS_APP_WORKFLOWS.md`.

## 1. Find and open a file

**Who:** Any user · **Source:** Brief: Drive browsing

1. Drive Home (#/drive/home): Suggested for you, Folders, Recent files
2. Type chip (Docs, Sheets, …) → category page with templates and only that type (no Suggested)
3. Open → editor for the type (#/drive/edit/{doc|sheet|slides|image|pdf}/:file)

## 2. Move a file between Library and Personal

**Who:** File owner · **Source:** Brief: Move / Copy [N]

1. Right-click → Move to… / Copy to… / Move to Library / Move to Personal, or drag onto the sidebar item
2. Dialog shows folder trees of both spaces and the ownership/sharing consequence
3. Server moves versions with the file

## 3. Write a document

**Who:** Any user · **Source:** Brief: Docs

1. Docs editor: top bar (name, ★, save state, presence, History, Comments, Share), menu + toolbar row, Tabs panel, ruler, page, status bar
2. Ruler margins, first-line indent and tab stops change the page
3. Voice typing bar (English US/UK, Urdu; Dictation | Conversation)

## 4. Edit an image or PDF and undo everything

**Who:** Any user · **Source:** Brief: Image, PDF

1. Image/PDF editor tools → Save (replaces previous edit) or Save as copy
2. Edited | Original switch; Reset to original → confirmation → original restored byte-identical

## 5. Select several files

**Who:** Any user · **Source:** Prototype drive5.js

1. Tick rows → selection bar (Share, Download, Move, Delete, clear)
2. Delete → "Move n items to Trash?"; Trash shows days left

## Navigation graph (generated from the prototype links)

Page → pages it links to (within and outside the app).

- `drive/home` → `drive/edit/doc/:file`, `drive/edit/image/:file`, `drive/edit/sheet/:file`, `drive/edit/slides/:file`, `drive/f/:folder`, `drive/mydrive`, `drive/personal`, `drive/recent`, `drive/shared`, `drive/starred`, `drive/trash`
- `drive/mydrive` → `drive/edit/doc/:file`, `drive/edit/image/:file`, `drive/edit/sheet/:file`, `drive/edit/slides/:file`, `drive/f/:folder`, `drive/home`, `drive/personal`, `drive/recent`, `drive/shared`, `drive/starred`, `drive/trash`
- `drive/personal` → `drive/edit/doc/:file`, `drive/edit/slides/:file`, `drive/home`, `drive/mydrive`, `drive/recent`, `drive/shared`, `drive/starred`, `drive/trash`
- `drive/edit/doc/:file` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/home`, `planner/home`, `portal/home`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `drive/edit/sheet/:file` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/home`, `planner/home`, `portal/home`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `drive/edit/slides/:file` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/home`, `planner/home`, `portal/home`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `drive/edit/image/:file` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/home`, `planner/home`, `portal/home`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `drive/edit/pdf/:file` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/home`, `planner/home`, `portal/home`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `drive/f/:folder` → `drive/edit/doc/:file`, `drive/edit/sheet/:file`, `drive/home`, `drive/mydrive`, `drive/personal`, `drive/recent`, `drive/shared`, `drive/starred`, `drive/trash`
- `drive/recent` → `drive/edit/doc/:file`, `drive/edit/image/:file`, `drive/edit/sheet/:file`, `drive/edit/slides/:file`, `drive/home`, `drive/mydrive`, `drive/personal`, `drive/shared`, `drive/starred`, `drive/trash`
- `drive/starred` → `drive/edit/doc/:file`, `drive/home`, `drive/mydrive`, `drive/personal`, `drive/recent`, `drive/shared`, `drive/trash`
- `drive/shared` → `drive/edit/doc/:file`, `drive/edit/sheet/:file`, `drive/edit/slides/:file`, `drive/home`, `drive/mydrive`, `drive/personal`, `drive/recent`, `drive/starred`, `drive/trash`
- `drive/trash` → `drive/home`, `drive/mydrive`, `drive/personal`, `drive/recent`, `drive/shared`, `drive/starred`
