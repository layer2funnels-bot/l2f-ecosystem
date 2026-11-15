# P01 Office · plan

Sources (read once): `07_PROMPTS/P01_OFFICE.md`, `01_APPLICATIONS/01_OFFICE/FEATURES_AND_FUNCTIONALITY.md` §2 (authoritative), `PAGES_AND_NAVIGATION.md`
(39 pages), `USER_FLOWS_AND_WORKFLOWS.md`, `IMPLEMENTATION_NOTES.md`, `03_PERMISSIONS_DATA_INTEGRATIONS.md`. Prototype: `office5.js`, `office6.js`, `avatar5.js`, `funnels5.js`.

## How every page is built (same for all 39)
- Markup and class names from the prototype source; the page's CSS generated from the prototype layers by `scripts/build-page-css.mjs`
  (scoped to the page and to the real ancestor chain; CI `check:pages`). Real data only; prototype toasts and sample data are not product behaviour.
- Typography: Geist variable font (fixed 14 Nov: static files rounded V8's 550/620/650 up to 600/700).
- States on every page: skeleton, empty with one action, error with Try again (10 s rule), no access (same as not found), read-only.
- Checked with `scripts/v8-compare.mjs` at 1440 / 834 / 390 against the prototype (same fonts both sides), light and dark, both organizations.

## Delivery: the whole Office app in one continuous effort, ONE Office pull request when it is complete and tested (owner, 15 Nov)
The three groups below are only the order of work (internal commits), not stages or separate PRs.

| Group | Pages | Exists today | New work | Migration |
|---|---|---|---|---|
| **1 · Office core** | Home ✔ (rebuilt), Projects, Funnels overview, Offers list + detail, **New offer**, Stories, **New story**, **Brand Kits (many)** list/detail/new, Funnel Strategies + strategy doc, **Default strategy template**, Documents + **custom sections**, Team, Member, Apps, Notification settings | all list pages, offer/story/brand kit records (`funnel_*`, 0006/0028), strategies, documents, team (0026), apps | V8 markup for all; New offer/story forms; many brand kits; template editor with versions (`template_version` on docs); document sections (folders + metadata); Member page (work visible to the viewer only, private as a count) | **0056**: offer/story fields, brand kit `is_main` + logos/colours/fonts/voice, `strategy_templates`, `doc_sections` (reversible, additive) |
| **2 · Avatar studio** | Avatars list (cards), **New avatar wizard** (import DOCX/PDF → read → map → 10 looks → name), Profile, Full profile (11 chapters), **Edit mode**, Use it, Evidence | avatar records (`funnel_avatars`), DOCX reader (docs-io) | one chapter model feeding short + full profile; import parser (headings, tables, lists; keyword → chapter); 10 3D looks from the prototype `AVPICK`; Use it → "Add to strategy"; Evidence: interviews, versions + Compare | **0057**: `avatar_chapters`, `avatar_sources`, look/version/status/completeness on avatars |
| **3 · Admin and access** | Admin People, Person (relationships + app/feature access + Check access), Teammate access, Client access matrix (**owners and admins**, owner decision 15 Nov; others no access unless granted), Roles, Access review (`last_used_at`), Storage & version rules, **Branding** (logos, 02 §8), Audit log | members, invitations, access levels/assignments/effective/history (0012, 0032), storage cap (0023) | feature switches per app ("From role / Off by role"), owner vs admin difference from the real role, review with last use, storage rules per file type, organization logos everywhere (OR-02) | **0058**: feature permissions, `last_used_at`, storage rules, workspace logo columns |

Menu (V8): Home · Projects · Funnels (Overview, Customer Avatars, Offers & Products, Stories, Brand Kits, Funnel Strategies) · Documents · Team · Apps · Admin.
Planner leaves the Office menu (it is its own app, reachable from the rail and apps menu; old `#/office/planner` keeps redirecting).

## Permissions (server-enforced, default deny)
Every new table: row-level security with the organization scope (`private.org_in_scope`), app grant checks, client-owned rows only for the client's
own people where V8 says so; revokes for `anon`/`authenticated`; RPC names added to audit F4c. Client access: owners and admins may view and manage (owner decision 15 Nov, overrides V8's owner-only note); every other role is
refused by the API unless granted (direct API tests). Layer2Funnels and Aurj never mix (tests with both organizations).

## Tests per stage
DB/API suites for each migration (isolation, owner vs admin, client rows), reversibility (rollback scripts like 0054/0055), browser checks for each
flow in `USER_FLOWS_AND_WORKFLOWS.md`, the real-DOCX import, gallery and responsive checks; full suite once per stage.

## Known items and decisions
- Projects' own list queries are slow (0.5–9 s on small data, row check per subquery): fixed in P03; Office uses light queries meanwhile.
- Migrations 0054–0058 stay local until the owner approves production (owner, 14 Nov).
- Import of PDF uses text extraction only (no OCR) — scanned PDFs are reported as "no text found" (assumption per 04_OPEN_DECISIONS).
