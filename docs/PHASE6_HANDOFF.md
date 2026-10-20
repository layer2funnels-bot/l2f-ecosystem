# Phase 6 (B2–B3: Client Workflows, Forms, Content, Visual Collaboration) handoff

Prerequisites: Phase 4 (passing) and Phase 5 slices 1–3. Gate G2: the Client Portal stays disabled until T1–T9 pass for client accounts.

## Scope
- **Client Portal:** client sees only own client record, projects, files, and (to add) portal messages and client-visible tasks. Behind a feature flag, off by default.
- **Approvals:** the `approvals` table exists (D4). Add subject types (deliverable, Brand Base answer, template version) and a version column.
- **Brand Base:** `brand_base_answers` exists (D6). Add autosave per answer, section completion, and a review step.
- **Pipelines and funnels:** stage gates per pipeline stage; funnel records (past, live, publish later).
- **Forms (builder deferred):** form definitions, submissions. Submissions are workspace-scoped and client-linked where applicable.
- **Content and visual collaboration:** deferred until the blueprint defines it; do not invent scope.

## Security requirements (must pass before release)
- Client policies for every new table, tested with a client membership (T6 pattern).
- Portal messages readable only by the client and staff of the same client's workspace; staff visibility rules match Phase 5.
- Approval decisions are logged to `audit_events` (append-only).
- Submissions from unauthenticated visitors (if any forms are public) need a separate design; default is none.

## Data notes
- Versioning: keep a `version` integer and an immutable history table per versioned subject; never edit a published version in place.
- State transitions (draft, submitted, approved, rejected, published) enforced by a trigger or server function, not only the UI.

## Order
1. Approvals with versions and audit. 2. Brand Base autosave and review. 3. Pipelines with gates. 4. Client portal messages behind flag, then G2 tests. 5. Forms without public submission.

## Out of scope
Phase 7 agents and Phase 8 Aurj workflows. Public form submission. Live cursors or multiplayer (excluded).
