# Client Portal, Whiteboard, Forms, Value Ladder, Social Planner, Layer 2 Agents

## Client Portal [R] (locked until security gate G2; owners preview)
Repo `modules/portal.js`. Keep the design (journey road, approve flow, confetti on approval). Tabs: **Home · Requests · Approvals · My notes**. **Removed: Messages and Files** (clients have their own Drive; communication is not in the Portal). Requests: respond with text/files; Approvals: view version, Approve / Ask for changes (comment). My notes: private notes for the client. Header: org/agency logo, "Preview as <client>" banner for team, Exit preview → back to the client in Clients. Everything prepared while locked ("Save as prepared"); never imply it's live.

## Whiteboard [R + N]
Repo `apps/whiteboard` (Excalidraw, MIT) + `modules/whiteboard.js`. Prototype `misc6.js` routes `#/whiteboard/home`, `folder/:id`, `board/:id`.
- Home: sidebar All boards, Starred, Templates, **Folders** list (+ New folder); page: Folders cards, template strip (Blank, Funnel flow, Brainstorm, Mind map, Retro, Kanban), Recent boards grid (thumbnail, name, editors, edited). Right-click board: Open, Rename, **Move to folder…**, Duplicate, Star, Trash.
- **Folders [N]**: create (name + who can open: everyone / only me / choose people), open, multiple boards inside, move boards between folders. `wb_folders(id, workspace_id, name, access)`, `whiteboards.folder_id`.
- **Board = full page [R]**: the Excalidraw canvas fills the whole viewport (no rail, sidebar or header). Floating panels: top-left (back, apps, board name + folder + Saved), top-centre Excalidraw toolbar (lock, hand, select, rectangle, ellipse, arrow, line, draw, text, image, sticky, eraser with number keys), top-right (presence, comments, library, Share), bottom-left (zoom, undo, redo), bottom-right (present, export, help). Use Excalidraw's own UI where possible (configure `UIOptions`, custom top-left) rather than re-implementing tools.

## Forms [E] (renamed from Form Builder)
Keep as built. Additions: nav label "Responses" (summary first: KPIs, charts per question, then the table); "Automations" button shown as Later.

## Value Ladder [E]
Keep. Addition: revenue model strip above the ladder (visitors → step conversion % → revenue per month), editable rates, note that rates can come from Funnel Mapper forecasts later.

## Social Planner [E]
Keep. Additions: **Pipeline** board (Idea, Draft, In review, Approved, Scheduled in GHL, Posted) and **Campaigns** (posted vs planned). Publishing stays in GoHighLevel: "Send approved to GHL" exports CSV [F for API].

## Layer 2 Agents [F] (design only; approved)
Agents home (Meeting Intelligence, Ask, next agent), Meeting Intelligence (sessions list; new session: record/upload/Zoom-later, organization, language Urdu+English, outputs MP3/transcript/notes/action items → Drive folder `Meetings/<date> <name>`; session page with audio waveform, Notes / Transcript (speakers, rename) / Action items → Tasks Inbox), Ask (chat answering from records the user can open, with sources), Access & settings (what each agent reads/writes, who runs it, approval needed: provider, cost cap, retention, consent). Build only the shell pages with "Preview" state until Tabish approves a provider.
