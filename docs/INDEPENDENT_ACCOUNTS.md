# Independent accounts: what it takes (plan only, nothing implemented) (22 Oct 2026)

An **independent account** is a person or company that is not part of Layer2Funnels, has its own separate workspace and data, and can never see Layer2Funnels clients, funnels, files, templates, team or other independent users (master handoff §4; Funnel Mapper Pro today calls these "private workspaces").

## Correction first
An earlier note (and the first migration plan) said a database rule on `workspaces.slug` blocks them. **That is wrong for the real database:** migration `0002` removed the two-name check and replaced it with a general format rule (`^[a-z][a-z0-9-]{1,40}$`), and added `workspaces.kind` (`internal` or `external`). Checked on the local stack: constraints are `workspaces_slug_format` and `workspaces_kind_check`. Nothing in the database rejects an external organization. The corrections are made in `docs/FMP_MIGRATION_PLAN.md`.

## What already protects them
Every business table carries the organization, with a restrictive organization-scope rule and composite foreign keys; the permission engine checks membership of that organization; the Data API is closed; the API runs as `app_user` and takes the organization from a header that must match a membership. So an external organization is isolated in the same way the two internal ones already are (tested between `layer2funnels` and `aurj`).

## The rule/policy changes that would be needed
| # | Change | Kind |
|---|---|---|
| 1 | **Creation path.** One database function, callable only by a platform owner of an internal organization (new permission `platform.org.create_external`, owner-only, sensitive), that creates a `kind = 'external'` organization, its first owner by e-mail invitation, and enables a fixed set of apps. No self-service sign-up creates organizations (a new sign-up without an invitation still lands on "No workspace"). | new migration + API operation + tests |
| 2 | **Two-way isolation tests**: an internal owner/admin, including break-glass, can see **nothing** in an external organization, and the reverse; platform owners get no cross-organization read at all. Break-glass today applies to personal Drive spaces inside one organization only; keep it that way. | tests + mutation controls |
| 3 | **Internal-only catalogue**: apps and permissions that exist only for staff (Admin screens for Layer2Funnels staff, Client Portal gate G2) must not be enabled for external organizations; enforce in `workspace_apps` (a check that external organizations may enable only listed app keys). | migration |
| 4 | **Shared lookups audited**: `apps`, `permissions`, built-in templates and the people table must not leak names across organizations (the existing audit test F4 lists public functions; add a check that profile and invitation reads are scoped to shared organizations only). | tests |
| 5 | **Limits per organization** (storage MB, number of funnels/files, API rate class), because the free database is shared by everyone. | migration + API |
| 6 | **Brand/theme**: the web app picks a theme from the slug (`aurj` or default); external organizations get the neutral theme unless configured. | small web change |
| 7 | **Delete / export an organization** (privacy requests): a documented server-side procedure (the handover already notes workspace deletion must disable audit and archive guards deliberately); rehearse on a copy. | runbook + script |
| 8 | **Sign-up policy decision**: private/unlisted sign-up URL (as the master handoff allows) versus owner-created accounts only. Recommended: owner-created, by invitation. | owner decision |
| 9 | **Funnel Mapper Pro private workspaces** map one-to-one to external organizations on migration (docs/FMP_MIGRATION_PLAN.md); this is the only bulk path. | migration step |

## Risks
1. **Data leak between tenants** is the one that matters: any new shared table, function or view that is not organization-scoped. Mitigation: the audit test that fails on any table without the scope rule, plus the two-way tests above, run in CI.
2. **Staff access creep**: support people seeing customer data "to help". Mitigation: no cross-organization role exists; support is by screen-share or a time-limited, logged invitation as a member of that organization.
3. **Shared capacity** (free database 500 MB, API rate limits): one heavy tenant slows everyone. Mitigation: item 5; move to a paid plan before taking outside customers.
4. **Legal and trust**: holding third parties' business data needs terms, a privacy notice, a data-processing agreement, a backup/retention promise and an incident process. This is a business decision, not an engineering one.
5. **Support and billing load**: independent users generate questions, password resets and invoices. Nothing in the ecosystem handles billing.
6. **Free-tier terms** may not allow serving paying third parties from the same project (check the current Supabase terms before go-live).

## Recommendation
Do items 1 to 4 and 7 only when the owner decides to serve outside customers; they are about 4 to 6 working days with tests. Until then keep independent accounts out of the ecosystem and on the existing Funnel Mapper Pro project (or retire them).
