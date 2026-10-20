# Ecosystem Audit Report — Phases 1–4, readiness for 5–6

Date: 20 Oct 2026 · Author: Claude (Opus 5.5) · Labels: **[E]** verified evidence · **[R]** recommendation · **[O]** owner decision · **[V]** still to verify
Scope: Master Blueprint v1.2 + Decision Register (Phase 1), Phase 2 Closure Report, Phase 3 close-out + 60-board canvas + design tokens, Phase 4 code and docs, Phase 4 chat history, read-only Supabase account metadata. Funnel Mapper Pro (FMP) internals were **not** inspected.

## 1. Status of Phases 1–4 (evidence-based)

| Phase | Documented | Actually found | Verdict |
|---|---|---|---|
| 1 Blueprint | v1.2 authoritative, R20–R30 awaiting approval | `02_FINAL_Master_Blueprint.md` and `_old.md` are **byte-identical** (no old version supplied). Body text still says paid plans, `application-office` as base and FMP link; overrides OV1–OV11 supersede it | Usable; read body through the overrides table |
| 2 Verification | "Ready to close with conditions" | Conditions (client-row check, repo access, Digital Mustafa docs, FMP scope) still open. Recommended **Mumbai** region and **R2** storage, contradicting blueprint (London, Supabase Storage) | Closed in practice; conflicts resolved in §6 |
| 3 UI/UX | 60 boards verified in headless browser, axe 0 violations | Boards and tokens read [E]. Token copies in canvas and design system are **identical** [E]. All documented text pairs pass WCAG AA (recomputed) [E]. **No auth screens** exist (§8) | Sound; gaps listed |
| 4 Foundation | 47/47 checks, RLS on 8 tables | Reproduced 47/47 [E]. Ran only on PostgreSQL 16; **live Supabase runs PostgreSQL 17** [E]. 9 defects found (§2). No auth flow, API, storage, backups, Launcher | Foundation real but not deployable as delivered; now corrected |

Live account [E, 20 Oct]: org `layer2funnels-bot's Org` (bot-owned account, Phase 2 action #2 still open); projects `application-office` (Tokyo, active), `funnel-mapper-demo` (London, active), `funnel-mapper-pro` (London, paused). **The 2-project free limit is already used.**

## 2. Defects (all reproduced before fixing)

| ID | Defect | Severity | Outcome |
|---|---|---|---|
| F1 | `current_user_id()` read only the legacy claim; current Supabase sends `request.jwt.claims` → every user would be denied | High | Fixed + verified (F1a–c) |
| F2 | Foreign keys ignored workspace: L2F rows could reference Aurj clients; FK error leaked existence | High | Fixed (composite FKs) + verified (F2a–e) |
| F3 | Audit log forgeable by staff; permission changes and approvals never auto-logged | Medium | Fixed (system triggers, `origin`) + verified |
| F4 | Policy helpers in `public`, executable by PUBLIC (blueprint R19, E6) | Medium | Fixed (`private` schema) + verified (F4a–d) |
| F5 | Clients saw every project/file tied to them, incl. internal; blueprint requires allowlist | Medium, blocks G2 | Fixed (`client_visible`) + verified |
| F6 | No per-app access; FMP entitlement and Portal gate existed only on paper | Medium | Fixed (`apps`, `workspace_apps`, `app_grants`, `launcher_apps`) + verified (T9a–d, T10a–e) |
| F7 | Editors could insert pre-approved requests; decisions editable | Medium | Fixed + verified (F7a–e) |
| F8 | No profiles, no invitations: no safe onboarding path | Medium | Fixed (invitation-only membership, email-bound) + verified (INV1–11) |
| F9 | Slug hard-coded to two names (blocks external tenants); dead delete policy | Low | Fixed + verified (F9a–c) |
| F10 | `create role` not idempotent; tests single-engine | Low | Fixed; tests run on PG 17 + real PG server |

Not defects: workspace deletion was already blocked by the last-owner guard; `#8C93A1` off-token grey is a decorative avatar border (3.09:1).

## 3. Corrections implemented and tests run

Files: `migrations/0002_hardening.sql`, `migrations/0003_integration_foundation.sql` (additive, reversible), `packages/core/errors.mjs`, `packages/ui/tokens.{json,css}`, `scripts/*`, `test/*`, `.github/workflows/ci.yml`, `seed/bootstrap.sql`.

| Run (20 Oct 2026) | Result |
|---|---|
| Original suite, PostgreSQL 17 (PGlite 0.3.10) and real PostgreSQL 16 server | 47/47 and 47/47 |
| Audit suite (F1–F9, T9, T10, invitations, integration layer), both engines | 63/63 and 63/63 |
| API error mapping (T4 at API boundary) | 9/9 |
| Restore drill: pg_dump → pg_restore → compare (T17, local) | 3/3 |
| Negative control: 7 defects re-introduced | 7/7 caught |
| Secret scan (T12), licence scan (V13), token contrast (22 pairs) | pass |

Not run: anything against live Supabase; real sign-in; CI on GitHub (no remote).

## 4. Architecture readiness

| Need | State now |
|---|---|
| Workspace isolation, roles, client isolation, deactivation, audit | Built + tested in DB |
| Per-app access, Launcher registry, Portal kill switch | Built + tested |
| Connections, secret references, webhook inbox (replay-safe), external IDs, outbox with idempotency (blueprint §20.8) | Schema built + tested (0003). No provider connected. Drop 0003 if R28 rejected |
| Typed operations / API layer, rate limiting (T16), log hygiene (T15) | Not built. `errors.mjs` defines the error contract |
| Background jobs | Prepared only (backup workflow). At $0 use on-demand syncs first |
| Agents | Not built (correct). Foundations they need exist: audit, approvals, idempotency, scoped identity |
| Capability manifest | `apps` table is the runtime registry; full manifest per module is a Phase 5 code convention |

**Verdict:** ready to start Phase 5 engineering once the owner actions in §9 are done.

## 5. Internal vs external ecosystem; reuse and standalone apps [R]

- **One identity, many products.** One Supabase Auth project is the identity for staff, clients and future external users. No app gets its own user table.
- **Separation by workspace kind, not by database.** `workspaces.kind = internal | external`. Internal access only by invitation; a public sign-up gets an identity with **zero** memberships (tested INV1–2). Future external customers get their own `external` workspaces via a separate, not-yet-approved onboarding flow.
- **Entitlement per app** (`workspace_apps` + `app_grants`) is the switch that lets an app run inside the Launcher or as a standalone product: a standalone front end (own domain, own sign-in page) uses the same identity and checks the same entitlement. `apps.standalone_capable` marks candidates (Projects, Planner, FMP).
- **Shared:** identity, profiles, workspaces, entitlements, audit, files, design tokens. **Configurable:** enabled apps, grants, branding theme. **Isolated:** all business rows, client data, connections, secrets.

## 6. Conflicts between documents and how they are resolved

| Conflict | Resolution |
|---|---|
| FMP "separate, never integrate" (OV3/OV10, Phase 3) vs directive "part of the ecosystem" | Directive wins on direction; protection stays on implementation. Stage 1 below |
| Region: London (blueprint) vs Mumbai (Phase 2) | [R] **Mumbai (ap-south-1)** for daily team latency; London if a UK client contract requires it. [O] decide at project creation |
| Storage: Supabase Storage vs R2 | [R] Supabase Storage first (no new vendor/account); R2 only when 1 GB is near |
| Personal scope (blueprint 4.1) vs "not approved" (Phase 3) | Not built |
| Blueprint body: paid plans, `application-office` base | Superseded by OV1/OV2 |
| Phase 4 DECISIONS "blueprint not present" | Reconciled in `DECISIONS.md` |

## 7. Funnel Mapper Pro: safest incorporation [R]

1. **Stage 1 (built):** Launcher entry in Layer2Funnels only, shown to granted users (`funnel_mapper_pro` app). FMP keeps its own login, data and clients. Zero FMP change.
2. **Stage 2 (needs approval + FMP repo access):** shared sign-in. Supabase now offers an OAuth 2.1/OIDC server (public beta) so the ecosystem can be the identity provider, but a Supabase project cannot natively consume another as its login, so FMP needs a small sign-in adapter. Users matched by verified email; FMP data untouched.
3. **Clients:** no merge, no sync. Link by ID through `external_refs` only after approval. Ecosystem `clients` is the agency CRM record; FMP keeps funnel-model clients.
4. **Before any of this:** confirm which FMP project is production (O8). The demo occupies an active free slot.

## 8. UI/UX audit

| Finding | Class | Status |
|---|---|---|
| No sign-in, sign-up, password reset, email verification, invitation acceptance, "no access yet" or "session expired" screens | Missing UX requirement (blocks Phase 5 auth) | Proposed: design these first (spec in PHASE5_HANDOFF) |
| FMP tile text "not part of the apps above" conflicts with new direction | Copy defect | Proposed text: "Opens in a new tab · own sign-in for now". Canvas not edited |
| Token copies could drift (canvas copy vs design system) | Design-system risk | Fixed: `packages/ui/tokens.json` is the single source; CI rebuilds and checks |
| No tokens for focus ring, 44px target, motion, layers; `--font-display` not theme-mapped; no reduced-motion | Design-system gap | Fixed in generated `tokens.css` |
| `warn`/`accent` fills are below 3:1 on light surfaces | Non-text contrast | Acceptable only with icon + word (existing rule); keep enforced |
| Account/profile, notifications, app-access editing in Team, global search | Known gaps (Phase 3) | Design before Phase 5 build |
| UI can evolve without backend rewrites | Architecture | Yes: all rules live in the database; screens read through RLS and one error contract |

## 9. $0 authentication and hosting (verified 20 Oct 2026)

| Item | Finding | Cost |
|---|---|---|
| Supabase Free | 50k MAU, 2 active projects, pause after 1 week idle, no managed backups | $0; pause is an outage risk |
| Default auth email | Only delivers to org team members, very low rate limit, not for production | Must use custom SMTP |
| Custom SMTP | Brevo free: 300 emails/day, no card | $0; needs a sending domain you own (layer2funnels.com DNS records) |
| Leaked-password protection | Pro plan only | Unavailable at $0. Substitute: min 12 chars + Google sign-in for staff |
| Google sign-in | Supported on free | $0; Google Cloud OAuth client is free |
| Hosting | Vercel Hobby non-commercial (excluded). Cloudflare Pages free: 500 builds/month; commercial use per secondary sources | $0 [V: owner reads Cloudflare terms once] |
| Backups | GitHub Actions free quota for private repos; prepared workflow | $0 within quota |
| Mandatory charges | **None** for the current internal stage | — |
| Possible future costs | Supabase Pro (no pause, backups, leaked-password check), more email volume, AI models | Revenue-gated |

**Auth is not declared ready:** no live sign-in has been tested. Required settings: custom SMTP on, "Confirm email" on, public sign-ups may stay on (they grant nothing) or off for staff-only, redirect URLs limited to our domains, min password length 12.

## 10. Work that can proceed vs product decisions

**Engineering, can proceed now:** create GitHub remote and push; create the new Supabase project and apply 0001–0003; configure SMTP/Google; deploy a sign-in shell to Cloudflare Pages; enable CI and backups; build the API layer (typed operations, rate limits, logging).
**Product decisions (you + ChatGPT):** auth screen designs; account/profile, notifications, app-access editing, search; default apps for new members (currently Office, Projects, Planner, Drive, Clients); what clients may see in the Portal; Aurj workflows; FMP Stage 2; external-ecosystem onboarding.
