# Final ecosystem round: the owner's implementation prompt (replaces the earlier v4 prompt)

Recorded 23 Oct 2026. Authority: owner's latest words, then backend facts and the permission catalog, then v4 design, then older docs. The prototype is not production code: rebuild as components in our stack.

**Part A (Batch 3)** was finished before this round (PR #11, merged 22 Oct): storage adapter and 8 GB cap, backup and rehearsal with Storage files, Postgres 17 in CI, runbook checklists, `application-office` untouched ("delete at go-live with owner approval"), FMP copy P0 fixes.

**Part B** decisions V4-1 to V4-11 are recorded in `docs/DECISIONS.md`. Build order, one app per PR behind existing app grants, CI green, then merge:
app registry from `app.manifest.json` files -> shared tokens, components, shell, app switcher, shared states -> Launcher (sky, weather) -> Docs/Whiteboard shared modules -> Projects (Office mount, Client/internal split) -> Office -> Clients -> Drive (Docs and Sheets editors first) -> Client Portal (locked, preview only) -> Form Builder -> Value Ladder -> Whiteboard "All boards" lens -> Social Planner.

Screens changed by the owner's list (appendix a to g below) are built only after the owner approves the updated design. Everything else in v4 is approved.

## Hard rules
- $0 extra monthly cost; ask before any paid service, key or card.
- Never fake success. Disabled actions stay visible and say why. Client Portal stays locked (gate G2). Client files never in shared Drive. Archived projects only in search. Permanent delete owner-only.
- One permission-checked service layer with audit logs for everything; no AI provider or integration turned on.
- Never modify the original Funnel Mapper Pro repository or its Supabase/Vercel projects, or `application-office`. No live database writes, migrations, deploys, auth/DNS/storage changes without owner approval.
- Fonts self-hosted; no build-time font fetching.
- Every session ends with `npm run test:all` passing and real results reported, labelled built + tested, prepared, planned.

## Execution clarification (owner, via GPT notes)
Protect the ecosystem, finish the work. Protect business rules, Layer2Funnels and Aurj data isolation, permissions, security boundaries, approved architecture and approval gates. Within those, work autonomously: inspect first, skip finished work, reuse existing systems, merge PRs when required CI passes, fix failing checks instead of reporting unverified success, ask only for a genuine business decision, required design approval or approval-gated action, and keep documentation and the session handoff current.

## Appendix: screens the design chat must update (a to g)
(a) Office > Projects shown inside Office. (b) Projects Home/sidebar with two sections: Client projects (grouped by client) and "<Organization> projects" (internal). (c) Whiteboards inside Project and Client plus the Whiteboard app as "All boards". (d) Social Planner campaigns, post states incl. Failed/Cancelled, channel capability table, "Mark as posted manually". (e) Form Builder versions, validation, submission detail, client-linked form. (f) Value Ladder step types, offer-link picker, compare versions, client copy. (g) DESIGN_SYSTEM.md contrast fixes. Each with empty, loading, error and no-access states at 390/768/1366.
