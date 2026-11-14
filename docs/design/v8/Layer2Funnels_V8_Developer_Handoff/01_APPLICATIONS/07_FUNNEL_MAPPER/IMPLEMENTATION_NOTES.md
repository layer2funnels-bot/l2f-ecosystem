# Funnel Mapper · implementation notes

**Prompt:** `07_PROMPTS/P07_*.md` · **Depends on:** P02 (Client service) · **Status vs repo:** [R] rename + sizing + [N] shared clients

## Baseline in the repository

Repo: **separate repository** `Funnel-Mapper` (Next.js 16, Supabase, React Flow, Zustand; `PROJECT_STATUS.md`, `reference/ project/*.dc.html` design boards, `docs/MASTER_HANDOFF.md`). In the ecosystem repo there are `apps/funnel-mapper` / `apps/funnel-mapper-pro` placeholders. **Its design and functions are approved; do not redesign or change its maths, maps, editor, reports, sharing, presentation or exports.** Prototype `fmp6.js` (+v7 sizes) mirrors the real app inside the ecosystem: routes `#/fmp/...`.

## Rules for this app

- Preserve every existing feature. Status marks: [E] keep, [R] redesign, [N] build new, [F] future (do not build; show "Later" only where specified).
- Build real data, API, RLS and tests; the prototype's data and toasts are illustrations.
- Permissions are enforced in the database/API (default deny). Layer2Funnels and Aurj data never mix.
- Visual values come from V8 (`01_DESIGN_SYSTEM.md` + `02_DESIGN_SYSTEM/`), not from v7 numbers quoted in older docs.
- **Do not redesign this app's functions from assumptions.** Inspect the real code first; change visuals only (Planner: Strategy builder and plan → project are the agreed exceptions; Funnel Mapper: rename, sizes, shared clients).

## V8 visual requirements for this app

- Keeps its own dark navy + emerald identity (approved).
- All Funnel Mapper styles are confined to the app (prefix .fmpx) so they can no longer leak into other apps (root cause of the Drive bug).
- Clients page: cards are a grid (avatar · name/business · status, then funnels/retainer line); names never break word by word.
- Editor inspector 340 px at ≥1280 px; inspector text 14.5 px, tabs 13.5 px.
- Text floor 12 px for small labels.

## v7 defects that must not come back

See `00_MASTER_DOCUMENTATION/V8_BUG_FIXES.md` items #1, #18, #21. Root cause for most: class names shared between apps. **Scope every app's component classes** (e.g. under `[data-app=…]` or a prefix).

## Acceptance (from the brief)

- No "Pro" in any UI string (grep test). Golden funnel numbers unchanged (89.1 / 6,032.11 / 5,582.11 / 13.40x).
- Create client in FM → appears in Clients; in Clients → appears in FM; same email → one record.
- Visual sizes match prototype `#/fmp/home`, `#/fmp/funnels`, `#/fmp/client/sc`, `#/fmp/funnel/pt`, `#/fmp/funnel/pt/reports`, `#/fmp/settings`.

## Open decisions that touch this app

See `00_MASTER_DOCUMENTATION/04_OPEN_DECISIONS.md`: D1, D2. Use the documented assumption; do not decide silently.

## Definition of done

1. Every page in `PAGES_AND_NAVIGATION.md` exists and matches its screenshot at 1440, 834 and 390 px (light and dark, both organizations).
2. Every control listed for the page works or is marked "Later" where the brief says so.
3. Every flow in `USER_FLOWS_AND_WORKFLOWS.md` passes an end-to-end test.
4. Acceptance items above pass. 5. Report written (see the prompt).
