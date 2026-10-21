# Funnel Mapper Pro: inventory (read-only review, 21 Oct 2026)

Source: `layer2funnels-bot/Funnel-Mapper`, `main` at `13a1e86` (PR #39), read with read-only access. Nothing in that repository, its Supabase projects or its Vercel project was changed. Decisions FMP-1 and FMP-2 still apply: this document only describes; it proposes nothing to build.

## 1. What it is
A private, team-only tool for mapping client sales funnels: a visual canvas editor with a live maths engine (traffic, conversion, revenue, profit, ROAS, CPA, MRR, LTV), scenarios, a 1–60 month forecast, goal seek, planned vs actual, presentation mode, exports (PDF/PNG/SVG/CSV/JSON) and client share links (read-only or editable, optional "hide numbers", comments, expiry). Production is live (Vercel + its own Supabase project; domain `mapper.layer2funnels.com`).

## 2. Stack and size
| Item | FMP | Ecosystem (for contrast) |
|---|---|---|
| Framework | Next.js 16.3 (App Router, server components and actions), React 19.2, TypeScript, Tailwind 4 | Plain ES modules in the browser, no framework, no build step; one API function |
| State / canvas | zustand + immer, `@xyflow/react`, `elkjs` (layout), `html-to-image`, `jspdf`, `recharts`, `sharp` (server images), `zod` | none yet |
| Data access | `@supabase/supabase-js` + `@supabase/ssr`: the signed-in user queries tables directly through PostgREST under RLS; a few RPCs | Our own API layer over Postgres (`set local role`, `x-org-id`) |
| Hosting | Vercel (`vercel.json`: region `lhr1`, London); deploy script targets Supabase `eu-west-2` | Cloudflare Pages (decided, not deployed) |
| Code | about 31,000 lines of TS/TSX/SQL/scripts: app 4.2k, components 15.7k, lib 9.1k, tests 7.9k, scripts 0.8k, 17 migrations 1.9k | about 9,000 lines (core, web, SQL, tests) |
| Files | 710 tracked files, 30 MB: 232 `.webp` block images, 86 `.html` design reference boards, 38 `.md` | |
| Tests | 32 unit files (maths, layout, editor state, exports, templates), 5 DB integration files (RLS, roles, workspaces, assets, trash), 25 Playwright specs (including accessibility, touch targets, responsive, privacy), 1 live-site spec | 11 suites, 16 mutation controls, browser run |
| CI | GitHub Actions: file integrity, lint, unit tests, build, typecheck (Node 24); separate preview smoke test | CI on Postgres 17 |
| Node | 20+ (CI uses 24) | 20+ (22) |

## 3. Auth
- Supabase Auth (its own project, so its own `auth.users`), cookies via `@supabase/ssr` refreshed in `proxy.ts` (Next middleware). Email + password and magic links. **Invite-only**: sign-ups off, magic links never create accounts, the sign-in form answers the same for known and unknown emails.
- Invites through Settings → Team using the service-role key **on the server only**. Optional private sign-up URL `/join/<code>` for "independent" users (env `INDEPENDENT_SIGNUP_CODE`).
- Share links `/s/<token>` and `/api/share/<token>` need no sign-in and go through the `get_shared_funnel()` RPC, which strips internal notes, screenshots and (optionally) every number inside the database.
- Different from the ecosystem: cookie session vs our bearer token, a separate user store, and invitations created by admin email vs our email-bound invitation tokens.

## 4. Database (17 migrations, additive)
Tables: `clients`, `products`, `funnels`, `funnel_versions`, `funnel_actuals`, `share_links`, `share_comments`, `templates`, `workspaces`, `workspace_members`, `profiles`, `workspace_assets`, `workspace_signups` (+ legacy single-row `workspace`).

| Table | Key columns |
|---|---|
| `clients` | name, business_name, niche, email, phone, website, country, currency, logo_url, status (`lead/proposal/active/paused/past`), monthly_retainer, pricing_model (`retainer/fixed/one_time/hourly/commission/other`), notes, tags, archived_at, deleted_at/by (trash) |
| `products` | client_id (optional: agency-wide), name, type, params (pricing details), notes |
| `funnels` | client_id, name, description, status (`draft/proposed/live/archived`), `graph` (canvas JSON), settings, summary, thumbnail_url, deleted_at/by |
| `funnel_versions` / `funnel_actuals` | saved versions (auto every 10 min); planned vs actual numbers per node and period, with source |
| `share_links` / `share_comments` | token, can_edit, hide_numbers, allow_comments, expires_at; client comments |
| `templates` | built-in (migration-seeded) and team templates |
| `workspaces`, `workspace_members`, `profiles` | kind `team`/`personal`; roles owner/admin/editor/viewer; active flag; "current workspace" per person with `switch_workspace` |
| `workspace_assets` | saved block styles and custom blocks (`kind` style/block) |

Isolation: every row carries `workspace_id`; policies use `current_workspace_id()`, `can_write()`, `is_team_admin()`; child rows inherit the parent's workspace by trigger; at least one active admin enforced; owner handover through `transfer_ownership`. Storage buckets `logos` (public, for share pages), `thumbnails` and `screenshots` (private, signed URLs), files under `<uid>/…`. RPCs: `get_shared_funnel`, `save_shared_funnel`, `add_share_comment`, `create_workspace`, `switch_workspace`, `transfer_ownership`.
**No audit trail** exists (no audit table or triggers). Deletion is soft (a Trash page with restore), not "archive before delete".

## 5. Screens and routes
Sign-in, reset/update password, accept invite, removed-member notice, `/join/<code>`; dashboard; clients (list, new, record with logo, notes, products); funnels (list, editor `/funnels/[id]`); templates; trash; settings (team, workspace branding, independent accounts); public share view `/s/<token>`; `/api/version`, `/api/image`, `/api/capture` (page screenshots, needs an optional external service), share and comment endpoints. Its visual design comes from "V2" reference boards (`reference/`), light/dark theme, not the ecosystem tokens.

## 6. How it differs from the ecosystem
| Area | FMP today | Ecosystem |
|---|---|---|
| Identity | own Supabase Auth project; cookie session | one shared Auth project (planned); bearer token |
| Tenant | "workspace": one team workspace + private personal workspaces; a person has one active workspace | "organization": Layer2Funnels and Aurj; the browser sends `x-org-id` on every request; one person can belong to both |
| Roles | four fixed roles | permission catalog, access levels, groups, scoped grants, deny overrides |
| Audit | none | tamper-evident, automatic |
| Delete | soft delete to Trash | archive before delete; hard delete owner-only |
| Client visibility | share links with a token (no login) | `client_visible` flag + Client Portal gate |
| Data access | direct from the browser/server through PostgREST | only through typed API operations |
| UI | Tailwind, own look, theme toggle | design tokens; designs pending |
| Hosting | Vercel + London | Cloudflare Pages; region undecided |

## 7. Overlap with Clients and Office → Funnels
| FMP | Ecosystem home (FMP-1) | Overlap | Note |
|---|---|---|---|
| `clients` (contact, status, retainer, pricing model, notes, tags, logo) | **Clients** app (the data layer built in this stretch holds the same kind of record) | **High** | Two client lists in two databases is the main risk. FMP's `funnels.client_id` points at its own client rows |
| `products` (per client or agency-wide offers with pricing params) | **Office → Funnels → Offers & products** | **High** | Same idea; FMP's `params` is pricing-model detail the Funnels table does not hold yet |
| `workspace_assets` (block styles, custom blocks) | none | None | Editor assets; stay with FMP |
| `templates`, `funnels`, `funnel_versions`, `funnel_actuals`, share links and comments | stay in FMP | None | The mapping product itself |
| `workspaces`, `workspace_members`, roles | Organizations, memberships, permissions | Concept overlap | Two models of who may do what; FMP's roles map onto our four roles but not the engine |
| `logo_url`, agency branding | Brand kits (Office → Funnels) | Partial | FMP stores one logo per client/agency, no voice, colours or fonts |
| Avatars, story bank, brand kits | Office → Funnels | **None in FMP** | Confirms FMP-1: these records do not exist in FMP, so nothing needs to move out of it |

## 8. Things that matter for any later reshaping (not proposals to build now)
1. The overlap is **clients and products**, not the funnel maps. Any connection must name which side owns a client or offer record and how the other side refers to it (by ID), or the two lists will drift.
2. Separate user stores mean the same person has two identities. Shared sign-in is the hard part, not the screens; FMP's cookie sessions and RLS assume `auth.uid()` from its own project.
3. FMP queries tables directly under RLS; the ecosystem rule is "only through typed API operations". Reshaping FMP's data access is a large change, not a reskin.
4. FMP's security features worth keeping: share-link stripping inside the database, invite-only sign-in answers, private buckets.
5. Hosting differs (Vercel vs Cloudflare Pages); Next.js on Cloudflare needs an adapter; keeping FMP where it is until the design stage avoids this.

## 9. Constraints for the copy placed in this repository
The code copy lives in `apps/funnel-mapper/` for study and later reshaping. It is not wired to anything: no environment files, no database, no deploy, and it is excluded from the ecosystem's secret scan because FMP's own `.env.example` carries the public local-stack demo key. See `docs/FMP_COPY_REPORT.md` for what was copied and the test comparison.
