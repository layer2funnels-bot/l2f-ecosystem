# Client Portal · user flows and workflows

Each flow names the prototype route or control. "Source" says where the rule is defined. Cross-app flows: `05_STRATEGY_AND_ARCHITECTURE/CROSS_APP_WORKFLOWS.md`.

## 1. Client approves a version

**Who:** Client contact · **Source:** Brief: Portal

1. Portal Home (#/portal/home): journey road, next step
2. Approvals (#/portal/approvals) → view version → Approve (confetti) or Ask for changes (comment)
3. Team sees the reply in Clients › Requests & Approvals

## 2. Client answers a request

**Who:** Client contact · **Source:** Brief: Portal

1. Requests (#/portal/requests) → respond with text and files

## 3. Team previews the portal

**Who:** Owner · **Source:** Brief: Portal

1. Clients › client → Preview portal → preview ribbon "Preview of what <client> will see" → Exit preview

## Navigation graph (generated from the prototype links)

Page → pages it links to (within and outside the app).

- `portal/home` → `clients/c/:client/overview`, `portal/approvals`, `portal/notes`, `portal/requests`
- `portal/requests` → `clients/c/:client/overview`, `portal/approvals`, `portal/home`, `portal/notes`
- `portal/approvals` → `clients/c/:client/overview`, `portal/home`, `portal/notes`, `portal/requests`
- `portal/notes` → `clients/c/:client/overview`, `portal/approvals`, `portal/home`, `portal/note/:note`, `portal/requests`
- `portal/note/:note` → `clients/c/:client/overview`, `portal/approvals`, `portal/home`, `portal/notes`, `portal/requests`
