# External App Onboarding Kit

Put at `docs/EXTERNAL_APP_ONBOARDING.md`. Use it whenever the owner says "bring this application into our ecosystem" (e.g. Planner or any future app). Worked example: Funnel Mapper Pro (`docs/FMP_MIGRATION_PLAN.md`, `FMP_CHANGES.md`).

## 0. Source Application

- The owner identifies the external application and provides its source files, repository, or reference.
- Inspect the application and determine how to integrate its useful features into the existing ecosystem.
- Preserve useful functionality while adapting the interface to the ecosystem's Design v4 system.
- Work only within the Layer2Funnels + Aurj ecosystem repository. Never modify the original application's repository or infrastructure.
- Record the source application, integration approach, and relevant changes in project documentation.

## 1. Intake

The owner provides, or Claude Code derives and clearly marks as an assumption: source link/ZIP, purpose in one sentence, which organization(s) will use it, who may open it (roles), what data it holds, what it must connect to (Clients, Projects, Drive, Funnels), screenshots or prototype if any, and anything not wanted.

## 2. Inventory and Plan

Write `docs/<APP>_INVENTORY.md` and `docs/<APP>_MIGRATION_PLAN.md`, covering stack, size, routes, tables, authentication, storage, third-party services, cost (must stay $0), dependencies, tests, risks, and effort estimate. Provide the owner with a one-screen plain-English plan and wait for "go" before starting a separate future external-app onboarding task.

## 3. Conversion Checklist

Every item must be completed or explicitly waived in writing.

1. **Look:** Replace styling with v4 tokens and shared components (`DESIGN_SYSTEM.md`). Fonts must be self-hosted. If no design exists, prepare screens in v4 style; obtain owner approval before building those new screens.
2. **Shell:** Mount inside the ecosystem shell: header, organization switcher, app switcher, shared states, and unsaved-change guard. Use routes under `/<app>/*`.
3. **Identity:** Remove the app's separate sign-in, users, and roles. Use ecosystem sign-in and Admin → Members and Access.
4. **Organization isolation:** Every table must carry the organization ID (`workspaces` row); every request must carry `x-org-id`; every query must be scoped in the database using row-level security, not only in the UI. Client-linked data must also carry the client ID and follow client-scoped permissions.
5. **Data:** Use its own schema or prefixed tables via a numbered migration. Reuse existing records (clients, offers/products, projects, files, people) by reference; never create a second source of truth. Migrations require owner approval before they run in any live environment.
6. **Permissions:** Add the app's actions to the permission catalog; add an app grant; make the Launcher tile follow the catalog. Permanent delete is owner-only, and sensitive actions require audit logging.
7. **Service layer:** Route every action through the shared permission-checked service layer so the future Layer 2 agent and integrations can call the same functions with audit logs. Keep AI and integrations disabled.
8. **Storage:** Use the storage adapter (Supabase now, R2 later, 8 GB cap). Whiteboards, docs, and sheets are Drive documents with a context link. Client files must never appear in shared Drive.
9. **Cross-app links:** Declare in the manifest which apps are embedded or opened in context (e.g. a board inside a project or client). Preserve context, breadcrumbs, and permissions.
10. **Search and notifications:** Register searchable item types with shared search. Keep notifications disabled until the backend supports them.
11. **Cost:** Keep additional monthly costs at $0. No new paid service, key, or card without owner approval.
12. **Tests:** Test allowed and denied organization/client isolation, permission catalog, mutation controls, audit logging, unsaved-change guard, responsive layouts at 390/768/1366 px, light/dark themes, both organizations, reduced motion, and keyboard access. `npm run test:all` must pass.
13. **Docs:** Update `ARCHITECTURE`, `DECISIONS`, `DESIGN_STATUS`, `DESIGN_INDEX`, `SESSION_HANDOFF`, the app manifest, and the go-live runbook as applicable.
14. **Labels:** Report each part as **built + tested**, **prepared**, or **planned**. Passing tests does not mean the app is live-ready. Do not deploy or use live data without approval.

## 4. App Manifest

Use one file per app at `apps/<app>/app.manifest.json`. Example:

```json
{
  "id": "planner",
  "name": "Planner",
  "group": "Everyday",
  "plate": {"icon": "...", "color": "..."},
  "routes": "/planner/*",
  "orgs": ["layer2funnels", "aurj"],
  "permissions": ["planner.read", "planner.write", "planner.delete"],
  "grantRequired": true,
  "status": "building | soon | locked | live",
  "embeds": ["projects", "clients"],
  "reuses": ["clients", "projects", "drive"],
  "searchTypes": ["task"],
  "storage": "drive-documents",
  "ai": false,
  "integrations": []
}
```

The Launcher, app switcher, Office → Apps, permission screens, and tests should read this file so a new app does not require edits scattered across the codebase.

## 5. Definition of Done

- The integration approach is documented.
- The inventory and migration plan are complete.
- All 14 checklist items are completed or explicitly waived in writing.
- Any newly designed screens have owner approval before implementation.
- Tests pass in CI.
- The handoff is updated.
- The app tile remains **Soon** until the owner switches it on.
