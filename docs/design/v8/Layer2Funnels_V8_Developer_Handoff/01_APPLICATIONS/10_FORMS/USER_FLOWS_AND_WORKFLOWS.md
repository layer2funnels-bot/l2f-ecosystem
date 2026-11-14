# Forms · user flows and workflows

Each flow names the prototype route or control. "Source" says where the rule is defined. Cross-app flows: `05_STRATEGY_AND_ARCHITECTURE/CROSS_APP_WORKFLOWS.md`.

## 1. Build and publish a form

**Who:** Teammate · **Source:** Prototype studio5.js; brief

1. Forms (#/forms/list) → New form or open (#/forms/b/:form)
2. Add fields from the field list; properties panel edits question, help text, logic
3. Publish form dialog

## 2. Read responses

**Who:** Teammate · **Source:** Brief: Forms

1. Responses (#/forms/subs): summary KPIs and charts per question first, then the table
2. Brand Base answers also appear in Clients › Work › Brand Base

## Navigation graph (generated from the prototype links)

Page → pages it links to (within and outside the app).

- `forms/list` → `forms/b/:form`, `forms/subs`, `forms/tpl`
- `forms/b/:form` → `forms/list`, `forms/subs`, `forms/tpl`
- `forms/subs` → `forms/list`, `forms/tpl`
- `forms/tpl` → `forms/b/:form`, `forms/list`, `forms/subs`
