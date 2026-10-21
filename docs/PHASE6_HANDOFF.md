# Phase 6 (B2–B3: Client Workflows & Content) handoff — v0.2

Prerequisites: Phase 5 slices 0–3 live. **Gate G2** before any client login: T1–T10 + F5 pass for client accounts on staging, independent manual review recorded, restore drill run on real backup. Only then may the owner switch `portal` on (owner-only, audited).

## Scope (already supported in DB)
- Approvals: state machine, decider, audit exist (F7). Add subject types and an immutable version history table.
- Brand Base: autosave per answer, section completion, review step.
- Client Portal: own record + `client_visible` projects/files; add portal messages and client-visible tasks with the same pattern.
- GoHighLevel: one row in `integration_connections` (admin), token as a server secret named in `secret_ref`; webhooks into `webhook_inbox` (server only, verified signature, dedup by delivery id); outbound via `outbox_events` with idempotency keys. Test with mocks first; V5 account test before real use.
- Forms without public submission.

## Product decisions needed first
Which project/file fields clients see; portal messages rules; approval subject types; content calendar scope (blueprint keeps publishing in GoHighLevel).

## Out of scope
Agents (Phase 7), Aurj workflows (Phase 8), public forms, multiplayer.

## Funnel records in the Portal (FMP-1)
If a client may see an avatar, offer or brand kit, it is an Office → Funnels record with `client_visible` set and is read through a Portal projection (ER5). Funnel Mapper Pro data is never exposed through the Portal without an approved Stage 2 design (FMP-2).
