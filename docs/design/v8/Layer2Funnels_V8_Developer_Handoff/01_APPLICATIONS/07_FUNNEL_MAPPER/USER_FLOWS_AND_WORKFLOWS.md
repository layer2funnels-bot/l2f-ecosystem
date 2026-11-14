# Funnel Mapper · user flows and workflows

Each flow names the prototype route or control. "Source" says where the rule is defined. Cross-app flows: `05_STRATEGY_AND_ARCHITECTURE/CROSS_APP_WORKFLOWS.md`.

## 1. Map a funnel for a client

**Who:** Teammate · **Source:** Brief; real app

1. Funnels (#/fmp/funnels) → New funnel (dialog) or from a template
2. Editor (#/fmp/funnel/:funnel): block library, canvas, connections, inspector, KPI bar
3. Reports (#/fmp/funnel/:funnel/reports): leaks, forecasts

## 2. Create a client once, everywhere

**Who:** Teammate · **Source:** Brief §4; 03 §3

1. FM Clients (#/fmp/clients) → New client → created through the ecosystem Client service
2. Duplicate check by email offers "Link to existing"
3. Client appears in Clients app; FM keeps products, notes, pricing, funnels

## 3. Share a funnel

**Who:** Teammate · **Source:** Prototype fmp6.js

1. Editor → Share funnel dialog (Hide numbers, Let comments, Let edit)

## Navigation graph (generated from the prototype links)

Page → pages it links to (within and outside the app).

- `fmp/home` → `clients/list`, `fmp/client/:client`, `fmp/clients`, `fmp/funnel/:funnel`, `fmp/funnels`, `fmp/help`, `fmp/settings`, `fmp/templates`, `fmp/trash`
- `fmp/clients` → `clients/list`, `fmp/client/:client`, `fmp/funnels`, `fmp/help`, `fmp/home`, `fmp/settings`, `fmp/templates`, `fmp/trash`
- `fmp/client/:client` → `fmp/clients`, `fmp/funnel/:funnel`, `fmp/funnels`, `fmp/help`, `fmp/home`, `fmp/settings`, `fmp/templates`, `fmp/trash`
- `fmp/funnels` → `fmp/client/:client`, `fmp/clients`, `fmp/funnel/:funnel`, `fmp/help`, `fmp/home`, `fmp/settings`, `fmp/templates`, `fmp/trash`
- `fmp/funnel/:funnel` → `agents/home`, `clients/list`, `drive/home`, `fmp/client/:client`, `fmp/funnel/:funnel/reports`, `fmp/funnels`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/home`, `planner/home`, `portal/home`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `fmp/funnel/:funnel/reports` → `agents/home`, `clients/list`, `drive/home`, `fmp/client/:client`, `fmp/funnel/:funnel`, `fmp/funnels`, `fmp/home`, `forms/list`, `ladder/list`, `launcher`, `office/home`, `planner/home`, `portal/home`, `projects/home`, `social/calendar`, `tasks/today`, `whiteboard/home`
- `fmp/templates` → `fmp/client/:client`, `fmp/clients`, `fmp/funnels`, `fmp/help`, `fmp/home`, `fmp/settings`, `fmp/trash`
- `fmp/trash` → `fmp/client/:client`, `fmp/clients`, `fmp/funnels`, `fmp/help`, `fmp/home`, `fmp/settings`, `fmp/templates`
- `fmp/settings` → `fmp/client/:client`, `fmp/clients`, `fmp/funnels`, `fmp/help`, `fmp/home`, `fmp/templates`, `fmp/trash`, `office/admin/people`
- `fmp/help` → `fmp/client/:client`, `fmp/clients`, `fmp/funnels`, `fmp/home`, `fmp/settings`, `fmp/templates`, `fmp/trash`
