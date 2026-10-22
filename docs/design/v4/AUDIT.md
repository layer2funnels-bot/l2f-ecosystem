# Self-audit v4 (22–23 Oct 2026)

## Checked (headless Chromium)
- 95 screens at 390px and 1366px: no sideways scrolling, no script errors.
- Flows: Launcher zoom-open, app switcher, organization switch (keeps page; Aurj Clients shows first-use empty state), Ctrl+K smart search incl. typos and `is:archived`, archive/restore project, add task, board drag-and-drop, task timer, client views and pipeline, in-Clients form builder with unsaved guard, request dialogs, Portal approve + confetti, Drive new folder/upload/select/details/versions, sheet formulas (=SUM recalculates), slide switching, image rotate/adjust/crop, whiteboard drag/pan/zoom, dark mode, all Launcher times and weathers.
- Fixed during audit: nested buttons in the form builder, menu stacking under page content, Portal phone nav, rain class clash, zero counts showing.
- Not checked: real screen readers, Safari/Firefox, landscape phones, 320px phones.

## Prototype-only (needs backend)
Search results, notifications, uploads, sharing, invitations, reminders, exports, publishing, AI, integrations, weather API, real-time presence and collaboration, version restore, permanent delete. Each is labelled in the UI.

## Gaps I filled (please confirm)
- Launcher groups "Everyday" and "Studio"; frosted shelf for contrast on bright skies.
- Projects workspace merges "Tasks" and "Views" into tabs (List, Board, Calendar, Timeline), like ClickUp.
- Portal "My notes" are private to the client by default, with optional "Share with team" (read only).
- Portal journey uses coral (done) and violet (current) instead of blue.
- Social Planner designed in a light version because item 7 asked for it; Planner skipped as requested.

## Needs your decision (recommendation first)
1. Strategy data in Clients: client-specific copy started from Office › Funnels, never synced (recommended) vs live reference.
2. Copy-stage requirements: still not found. Please send them; Copy shows only the agreed basics.
3. Weather source: MET Norway (free, commercial use allowed with attribution) recommended.
4. Real logo files and Aurj brand colours (current marks and Aurj palette are placeholders).
5. Permission catalog: Admin › Access screens show samples until Claude Code pastes the real one.
