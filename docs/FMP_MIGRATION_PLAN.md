# Plan: move Funnel Mapper Pro onto the ecosystem sign-in and database (21 Oct 2026)

Status: **plan and dry run only.** No real data was read or moved; nothing was connected or deployed (rules FMP-2). The dry run (`npm run dryrun:fmp`) uses synthetic data in a throw-away local database.

## Goal
One sign-in, one organization switcher, one permission engine, one database for the whole ecosystem; Funnel Mapper Pro (FMP) keeps its canvas, maths, reports and exports unchanged. FMP's tables live in their own schema (`fmp`) inside the ecosystem database; data is reached through the ecosystem API, never straight from the browser.

## What exists today (measured)
- FMP: 17 migrations (1,851 lines), its own Supabase project, its own sign-in, "workspaces" (a team one plus a private one per independent account) with roles owner/admin/editor/viewer.
- Code touching data: about **112 `.from()` calls, 7 `rpc` calls and 8 storage calls in 41 files**. Row security is FMP's own (55 database tests).
- Ecosystem: organizations (`workspaces` rows), shared permission engine with client/project scope, API with allow-listed operations, Data API closed to browsers (migration 0010).

## Target shape (proved in the dry run)
- Schema `fmp`: `funnels`, `funnel_versions`, `funnel_actuals`, `products`, `share_links` (token stored only as a SHA-256 hash), `share_comments`, `templates`, `client_commercial` (retainer, pricing model, logo path) and `id_map` (old id → new id, kept for rollback and for redirecting old links).
- Clients: FMP clients become **ecosystem clients** (profile, status, contact, tags, notes) so Funnel Mapper, Projects and Drive share one client list; FMP-only fields stay in `fmp.client_commercial`.
- Same safety rules as every other table: one organization per row, a restrictive organization-scope rule, composite foreign keys (a funnel cannot point at another organization's client), select rules through `private.has_permission('fmp.funnel.view', client)`.
- Permissions (new catalogue rows, app `funnel_mapper_pro`): `fmp.funnel.view/create/edit` (viewer/editor floors), `fmp.funnel.share` (editor floor, admin default, sensitive), `fmp.funnel.delete` (owner default, sensitive). Roles map one to one (owner/admin/editor/viewer); client-scoped editors work with no extra code.
- The app must be switched on per organization (`workspace_apps`) and its catalogue row `active`; otherwise the engine answers "app not available" (the dry run found this).

## Phases
| # | Phase | Result | Approval needed |
|---|---|---|---|
| 0 | Prerequisites: Next.js ≥ 16.4.1 only if Cloudflare is chosen; `workspaces.slug` check relaxed (see risks); `fmp.*` permission rows and `fmp` schema as a real migration `00NN_fmp.sql` with tests (allow and deny per role, cross-organization, mutation controls) | schema in the ecosystem repo, tested | none (local only) |
| 1 | Identity bridge: FMP signs in through the ecosystem (same Supabase Auth project). Browser session cookie shared on the parent domain, or FMP redirects to the ecosystem sign-in and back; FMP server code reads the ecosystem session and organization header. Replaces FMP's own `proxy.ts` session refresh, sign-in, reset, invite and private sign-up pages | one login | yes (auth change) |
| 2 | Data access: a new operation family `fmp.*` in the ecosystem API (list/get/create/update/archive/restore/delete funnels, versions, actuals, products, templates, share links, comments, client commercial); FMP's 112 calls become calls to a small client module, file by file, in this order: reads, writes, share, storage. Canvas/maths/export code does not change (it receives the same objects) | FMP runs on the API | no (local) |
| 3 | Storage: logos, thumbnails and workspace assets move to the ecosystem Drive paths (`<org>/clients/<client>/…`, `<org>/shared/…`), served by signed links (`packages/core/storage.mjs`, already tested with a fake) | files under ecosystem rules | yes (live storage) |
| 4 | Public share links: an unauthenticated endpoint `GET /api/share/<token>` that hashes the token, finds the link, checks expiry and the hide-numbers/can-edit flags and returns only what the link permits (today's `/s/…` pages and `/api/share/…` route keep their URLs) | old links keep working | none locally; yes at go-live |
| 5 | Data migration (rehearsed, then once): see below | FMP data in the ecosystem | **yes, owner approval, in one step** |
| 6 | Switch: FMP menu entry points at the new build, old FMP project kept read-only for the agreed period | cut-over | **yes** |

## Data migration (dry run result)
Scripts: `scripts/fmp-dryrun/` (`source.sql` an FMP-shaped source, `target.sql` the `fmp` schema with its rules, `migrate.sql` the transformation, `run.mjs` data generator + checks). Synthetic size: 60 clients, 150 products, 250 funnels with 30 blocks each, 1,500 versions, 1,000 actuals, 120 share links, 200 comments, 12 templates, 8 team members, plus 25 independent accounts (not migrated, see below). Whole run about 5 seconds; the transformation itself **about 0.12 s** (0.05 s when run again). The database was 17 MB.

All **12 checks passed**: every table's row count matches; the old-to-new id map is complete and one to one; every funnel and version graph is **byte-identical** (compared row by row); trashed funnels and clients arrive **archived, not lost**; client details land in the ecosystem profile, and free-text notes become internal team notes; share tokens are stored only hashed and a link already in circulation still resolves by hashing the token it is given; nothing points across organizations; running it twice changes nothing (no duplicates); **another organization sees none of it** (tested as the ecosystem's own database role); and a rollback removes exactly what was added.
Deliberate transformations (to review with the owner): (1) a website value that is not a web address is dropped because the ecosystem Clients table checks addresses; (2) team members are created as ecosystem staff memberships with the same role, inactive ones deactivated, by e-mail address, so **each person needs a real ecosystem account invitation** (the dry run mints placeholder ids); (3) FMP's "trash" becomes the ecosystem "archive".
**Not migrated: independent (private) workspaces** (25 accounts, 50 funnels in the test). They are separate organizations in FMP; moving them needs the slug rule changed and a decision on who owns them (see risks).

Rollback: delete by `fmp.id_map` (proved in the dry run); FMP's old project stays untouched and read-only until the owner signs off. Rehearse on a copy of a production backup before the real run; the real run takes minutes, the people-invitation step takes days.

## Risks and decisions
1. **Independent accounts.** The ecosystem's `workspaces.slug` only allows `layer2funnels` and `aurj`; a private account for an independent user needs its own organization, so that rule must change (small migration) and the signup path ("owner creates an independent account") must exist in the ecosystem. Owner decision: migrate them, keep them on the old project, or retire them.
2. **Sign-in change is the riskiest step**: everyone's session changes at once. Mitigation: staging first, old sign-in kept for one week behind a switch.
3. **Share links in circulation**: tokens are hashed on migration; verified by the dry run. The public endpoint must have rate limits and the "can edit" links must stay scoped to one funnel.
4. **Row-security regression**: FMP's 55 database tests describe today's rules; they must be re-written against the `fmp.*` operations (about 2 days) so no rule is lost.
5. **Performance**: whole-funnel documents are JSON up to a few hundred KB; version history can be large (1,500 versions in the test were small). Keep the "autosave every N seconds, version every M minutes" behaviour; add pagination to the versions list.
6. **Cloudflare** (separate spike) is a hosting choice, independent of this plan; do not change both at once.
7. Exports (PNG/PDF) are client-side and untouched; the capture service URL for thumbnails stays configuration.

## Cost and time (estimate)
| Phase | Effort |
|---|---|
| 0 migration + tests | 2–3 days |
| 1 identity bridge | 3–4 days |
| 2 data access (41 files, `fmp.*` operations, tests) | 6–8 days |
| 3 storage | 2 days |
| 4 share endpoint | 1–2 days |
| 5 rehearsal + migration + checks | 2 days |
| 6 switch, watch, fix | 2–3 days |
Total about **18–24 working days** of build and test, plus owner time for invitations and approvals. Running cost: no new service (same database); the Cloudflare Workers paid plan only if that hosting is chosen.

## Recommended order
Phase 0 and 2 first (they are local and reversible and make FMP ready), then 1 and 4, then 3, then a full rehearsal, then 5 and 6 behind the owner's one-step approval. Do the hosting change last, if at all.
