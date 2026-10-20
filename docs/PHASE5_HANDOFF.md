# Phase 5 (B1: First Working Ecosystem) handoff — v0.2

Prerequisites: `npm run test:all` green; runbook steps 1–3 in the manual done. Do not start Phases 7–8.

## Entry criteria (evidence required)
1. New Supabase project with 0001–0003 applied; suites pass against a staging copy.
2. Real sign-in tested end to end: email confirm, password reset, Google, invitation accept, sign-out, deactivation.
3. Auth screens designed and approved (below). 4. Git remote + CI green.

## Slice order
0. **Auth shell + Launcher** — sign-in, sign-up, verify email, reset password, accept invitation, "no workspace yet", session expired; Launcher from `launcher_apps()`; workspace switcher writes `profiles.active_workspace_id`.
1. Clients list/record. 2. Projects + tasks (add `tasks`, composite FKs, `client_visible`). 3. Drive: Supabase Storage, path `workspace_id/...`, signed URLs, share links with expiry (T5, T14). 4. Planner objectives/measures; actions = task ids. 5. Office Team + Settings: invitations, app grants, roles. 6. My work: one query per workspace, two groups.

## UX requirements to approve first (proposed defaults)
- Auth screens use the shell theme (neutral), not a business palette, because the workspace is unknown before sign-in.
- Invitation email → link → sign in or create account with the **same** email → joined. Mismatch: one plain line, no detail.
- Signed in, no membership: "You don't have access to a workspace yet. Ask your admin for an invitation." No other data.
- Account/profile, notifications centre, app-access editing in Team, global search: design before their slice.
- FMP tile copy: "Funnel Mapper Pro · Opens in a new tab · own sign-in for now".

## Acceptance
All existing checks pass; every new table has allow + deny tests per role and a client test; six states per screen; errors only through `toPublicError`; tokens from `packages/ui/tokens.css`.

## Out of scope
Agents, Social Planner, Whiteboard, builders, automations, dashboards, Personal workspace, FMP Stage 2, external customer onboarding.
