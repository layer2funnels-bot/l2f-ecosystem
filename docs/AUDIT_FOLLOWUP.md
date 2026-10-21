# Audit Follow-up & Remediation Report (21 Oct 2026)

Deliverables A and E. Previous report: `AUDIT_REPORT.md` (20 Oct).

## A1. Status of previous findings (re-verified today by running the suites)
| ID | Finding | Status 21 Oct |
|---|---|---|
| F1–F9 | identity format, cross-org refs, audit, private helpers, client allowlist, app access, approvals, invitations, workspace kinds | All still fixed; audit suite 63/63 on PostgreSQL 17 and real PostgreSQL |
| F10 | idempotent role, dual-engine tests | Still fixed |
| Auth not live, no API layer, no storage, CI not on GitHub, backups not enabled | **Still open** (owner access needed for the first steps) |

## A2. New findings from the new rules and specs
| ID | Finding | Rule | Severity | Outcome |
|---|---|---|---|---|
| N1 | No shared authorization foundation (catalog, owner-defined levels, groups, restrictions, scopes, effective-access review) | Owner-Controlled Authorization | High | **Fixed + verified** (0004, AZ1–AZ14) |
| N2 | Every editor saw every client in the org | WCIGA: one client never grants another | High | **Fixed + verified** (AZ5, AZ6). Default is now "assigned clients only" |
| N3 | Deleting a client cascaded into projects, files, Brand Base | App Foundation: no silent loss | High | **Fixed + verified**: archive columns, refuse delete with work, hard delete owner-only (AZ16, D2b changed) |
| N4 | Audit couldn't tell user from integration | AI & Integration rule | Medium | **Fixed + verified** (AZ17); agent actor refused |
| N5 | App registry missing 5 apps and any lifecycle | App Foundation, Agents = coming soon | Medium | **Fixed + verified** (AZ18) |
| N6 | Disabling an app could be mistaken for deleting data | App Foundation | Low | **Verified** safe (AZ15) |
| N7 | Files tied to a client were visible without access to that client | WCIGA attachments | Medium | **Fixed + verified** (AZ5b) |
| N8 | Specs duplicate approvals, brand kit, avatars, offers, documents, integrations, admin | SDOR | Medium (design) | Recommendations in `APP_STRUCTURE_REVIEW.md` |
| N9 | Portal "owns auth" conflicts with one identity | Architecture | Medium (design) | Rec ER12 |
| N10 | Drive editors and Miro-level Whiteboard are far beyond $0 build capacity if built from scratch | $0, scope | High (plan) | Rec: adopt licensed open-source engines, phase |

## A3. Changed files today
`migrations/0004_authorization_foundation.sql` (new) · `test/authz.test.mjs` (new, 25 checks) · `test/isolation.test.mjs`, `test/audit.test.mjs` (fixtures grant access levels; D2b expectation changed by the owner's no-silent-loss rule; F4c now expects 4 RPCs) · `test/run.mjs`, `scripts/mutation-check.mjs` (new suite, 2 new negative controls) · docs: `ARCHITECTURE.md`, `APP_STRUCTURE_REVIEW.md`, `UIUX_HANDOFF.md`, this file, `DECISIONS.md`, `DEVELOPER_HANDOVER.md`.

## A4. Tests actually run (21 Oct 2026)
Command: `npm run test:all && npm run check:secrets && npm run check:licences && npm run check:tokens`
| Suite | PostgreSQL 17 (PGlite) | Real PostgreSQL 16 server |
|---|---|---|
| isolation | 47/47 | 47/47 |
| audit | 63/63 | 63/63 |
| authz (new) | 25/25 | 25/25 |
| API errors | 9/9 | — |
| Restore drill | — | 3/3 |
| Negative control (9 re-introduced defects) | 9/9 caught | |
| Secrets, licences, tokens | pass | |

## A5. Remaining gaps
Security/infra: no live auth test · API layer (typed operations, rate limit, safe logs) · storage service · search/notifications · realtime · backups not enabled · free-tier pause risk · no leaked-password check at $0 · bot-owned accounts.
Product: Funnel data ownership with FMP · editor/whiteboard engines · public forms design · Portal projections.

## A6. Critical blockers needing you
1. Move GitHub, Supabase, Cloudflare and domain to your own account with 2FA (accounts are under a bot user).
2. ~~Pause application-office~~ — withdrawn 21 Oct: not needed until go-live; see INFRASTRUCTURE.md.
3. Region: London recommended pending a 5-minute latency test (INFRASTRUCTURE.md §5).
4. FMP: allow read-only code review so its data ownership and shared sign-in can be planned.

## E. Prioritised next steps
| Order | Work | Who | Ready? |
|---|---|---|---|
| 1 | Blockers A6.1–A6.3 | You | Needs your action ($0) |
| 2 | UI/UX session: slice 0 screens + Office Admin → Access | Design chat | Ready (`UIUX_HANDOFF.md`) |
| 3 | Apply 0001–0004 to the new project; run suites against it; Brevo SMTP; Google sign-in | Claude Code | After 1 |
| 4 | API layer + auth shell + Launcher + Admin → Access screens | Claude Code | After 2–3 |
| 5 | Clients workflow (stages, requests, versions) → Portal projections → G2 | Claude Code | After 4 + your review of `APP_STRUCTURE_REVIEW.md` §3 |
| 6 | Projects, Drive storage, Planner | Claude Code | After 4 |
| 7 | FMP Stage 2, Social Planner via GHL, Whiteboard/editor engines | Later | Needs decisions |

## Addendum 21 Oct (later): status after re-verification
- Re-ran everything: isolation 47/47, audit 63/63, authz 25/25 on PostgreSQL 17 and real PostgreSQL; API errors 9/9; restore drill 3/3; restore-from-export path RD pass (synthetic); 9/9 negative controls caught.
- These are **database-level** proofs. Live sign-in, email delivery, hosting and production readiness are **not** verified.
- New: `docs/INFRASTRUCTURE.md` (region, slot, application-office dependencies and safe export), `docs/ENGINES.md` (engine licences and choices), `scripts/export-project.sh` (prepared, not run), `restore-drill.mjs` DUMP_FILE mode (tested).
