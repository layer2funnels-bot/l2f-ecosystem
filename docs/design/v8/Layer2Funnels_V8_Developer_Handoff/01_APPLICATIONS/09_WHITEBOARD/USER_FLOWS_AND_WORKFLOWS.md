# Whiteboard · user flows and workflows

Each flow names the prototype route or control. "Source" says where the rule is defined. Cross-app flows: `05_STRATEGY_AND_ARCHITECTURE/CROSS_APP_WORKFLOWS.md`.

## 1. Start a board from a template

**Who:** Any user · **Source:** Brief: Whiteboard

1. Whiteboard Home (#/whiteboard/home) → template strip (Blank, Funnel flow, Brainstorm, Mind map, Retro, Kanban)
2. Board opens full page (#/whiteboard/board/:id) with floating Excalidraw tools

## 2. Organize boards in folders

**Who:** Any user · **Source:** Brief: Folders [N]

1. + New folder (name + who can open)
2. Right-click a board → Move to folder…

## Navigation graph (generated from the prototype links)

Page → pages it links to (within and outside the app).

- `whiteboard/home` → `whiteboard/board/:id`, `whiteboard/folder/:id`, `whiteboard/starred`, `whiteboard/tpl`
- `whiteboard/folder/:id` → `whiteboard/board/:id`, `whiteboard/home`, `whiteboard/starred`, `whiteboard/tpl`
- `whiteboard/board/:id` → `agents/home`, `clients/list`, `drive/home`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/home`, `planner/home`, `portal/home`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `whiteboard/starred` → `whiteboard/board/:id`, `whiteboard/folder/:id`, `whiteboard/home`, `whiteboard/tpl`
- `whiteboard/tpl` → `whiteboard/board/:id`, `whiteboard/folder/:id`, `whiteboard/home`, `whiteboard/starred`
