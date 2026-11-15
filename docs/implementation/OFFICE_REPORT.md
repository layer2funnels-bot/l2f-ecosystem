# P01 Office — report

One continuous build of the whole Office application to the V8 prototype (`office5.js`, `office6.js`, `avatar5.js`, `funnels5.js`), on branch `p01-office`.
Not merged, not deployed. Migrations 0056–0058 are **local only**; production is untouched (still at 0053).

## What was built

| Area | Pages | Notes |
|---|---|---|
| Office Home | Home with My day, Waiting on you, What's happening, Plans and goals, Projects, Owner view | Panels load one by one (Projects ops are slow) |
| Funnels | Overview map, Customer Avatars, Offers & Products, Stories, Brand Kits, Funnel Strategies | V8 markup and class names; styles generated from the prototype (`pages/office.css`) |
| Customer Avatar Studio | List, 5-step New avatar (Word/PDF import read in the browser, 10 looks), Profile (3D stage), Full profile (11 chapters + custom), Use it, Evidence (interviews, versions, compare, restore), Edit mode, Export (print/PDF) | Migration 0057 |
| Offers / Stories / Brand Kits | Card lists, detail pages, New/Edit full-page forms with live preview; logos, consent and assets uploaded to Drive | Migration 0056 |
| Strategies | List with Default template, versioned template editor; new strategies start from the saved template | 0056 |
| Documents | Sections (Drive folders) with who-can-see and owner-protected; New document / Upload / drag-and-drop per section; Other documents; library search | 0056 |
| Team | Cards with "Working on", member page (working on now, pending work, this week, recent activity, projects) | Only what the viewer may see (row rules) |
| Apps, Notification settings | V8 cards; per-app in-app inbox switch | Email digest shows "Later" (no approved provider) |
| Admin & Access | People, person page, Teammate access (app and feature switches, Check access), **Client Access Matrix (owners and admins)**, Roles, Access review (last used), Storage & versions, Branding (owners only), Audit log | Migration 0058; V4 dialogs and access levels/assignments/effective/history kept under Roles |

## Permissions (enforced in the database, not only the browser)
- Client Access Matrix: owners **and** admins (`clients.apps.manage`, default admin); others only if explicitly granted.
- Teammate apps and features: owners/admins; never on yourself or an owner; an admin cannot switch on an owner-floor permission.
- Branding: owners only. Documents sections: managed by owners/admins; admins-only sections hidden from others.
- Layer2Funnels and Aurj never mix (tests on every new table and operation).

## Tests (local stack)
- Unit/API: full suite green (66 suites); `test/office.test.mjs` 33/33; `test/web.test.mjs` 56/56; audit, rollback (0056–0058 reversible), authz green.
- Browser: `e2e-ui` 265/265 (moved to the V8 pages; desktop, tablet and phone layouts, touch sizes, no script errors); onboarding 22/22; `e2e-local` 71/71.
- V8 side-by-side: `scripts/v8-compare.mjs of-` — 22 Office pages at 1440/834/390; shell measurements match, page content follows the prototype.

## Known differences / not built (honest list)
- Per-app level select on a teammate's access (V8 shows Viewer/Editor/Admin per app): our model gives access per app plus per-feature switches; levels per app stay in Roles › Access levels.
- Storage "keep named versions / thin autosaves" switches: not shown, because nothing would act on them yet (no fake controls).
- Avatar "→ Task" and "Add to strategy" buttons: not shown until those links exist; Copy works.
- Client Access Matrix is saved and logged; clients see its effect when the Client Portal opens (Portal is still locked).
- Email digest needs an approved email provider.

## Needs the owner's decision
- Applying migrations 0054–0058 to production (not authorized; nothing applied).
- Merging PR #56 (P00), then this Office PR.
