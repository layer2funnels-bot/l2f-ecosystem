# Current project status — 15 Nov 2026 (end of the quality-recovery session)

Sequence (owner): P00 Shell ✔ · P01 Office ✔ (repaired) · **P02 Projects — NOT rebuilt to V8, deferred** · P03 Tasks ✔ (built as “p02-tasks”, repaired) ·
**P04 Drive — next session (owner's explicit instruction, sequence exception)** · P05 Planner … P14.

## Merged and live (before this session)
PR #56 (P00), #57 (P01), #58 (Tasks) merged to `main` and deployed; migrations 0054–0059 applied on production (backup schema `backup_20261115`).

## This session: quality recovery — branch `claude/epic-bohr-nc9jar` (restarted from `main`), pushed, **not merged, not deployed**
Everything is described in `recovery/AUDIT_TRACKER.md` (30 rows: defect → fix → test) and `recovery/PERFORMANCE_REPORT.md`. Headlines:
- Live defects found from production data/logs/screenshots and fixed: teammate switches failing after 5 changes/min; tasks created 2–4 times on a
  slow connection (production has 18 tasks with 5 distinct titles — **left as they are**, not modified); Tasks list stuck/overlapping and hidden on
  tablets; folder drawn as a card with no way to add a list; New list dialog broken; avatar import putting content in the wrong places; avatar page
  “We couldn’t load this” on a bad address; Client Access Matrix crash (introduced and fixed in this session).
- Features: flexible Avatar Studio (any number of sections, review before import, block editor, profile cards, settings), Organization settings
  (name, logo everywhere, default strategy template), Documents linked from Drive, client access to Office (matrix + projection), Launcher arrange +
  V8 bell, Access Review removed, Stories/Brand Kits/Offers return to the list, typed fonts with a render check.
- Performance: lazy apps, esbuild production bundle, immutable caching of hashed assets, Urdu font only for Arabic text. Sign-in page 66 → 14 requests,
  ready 2.6 s → 1.5 s; reload on Tasks 4.1 s → 2.5 s (150 ms / 10 Mbit/s). API latency (new DB connection per request) remains — Hyperdrive needs the owner.

## Database
- **0060_recovery.sql: written, tested locally (up, down, up), NOT applied to production.** The recovery code needs it: apply 0060 (after a fresh
  backup) **before or with** merging this branch. Checklist: `MASTER_HANDOFF.md` §6.
- Next free migration number: **0061**.

## Tests (local Supabase stack, bundled build `WEB_ROOT=dist/web` unless noted)
| Suite | Result |
|---|---|
| Unit (`npm test`, all suites) | all green (audit 63/63, office 37/37, portal 57/57, funnels 38/38, web 59/59, tasks) |
| e2e-ui | **265/265** |
| e2e-local | **71/71** |
| e2e-recovery (new: avatars incl. large saves and editor layout, stories, brand kits, launcher, teammate switches, org, documents, Tasks slow network, folders) | **45/45** |
| Screenshot sweep (`scripts/shot-sweep.mjs`, 27 screens, desktop + phone) | reviewed; fixes after the owner's 16 Nov screenshots: avatar editor layout, large avatar saves, Client Access Matrix grid |
| e2e-tasks | **35/35** (after fixing a 15 px sideways scroll of task rows on phones) |
| e2e-onboarding | **22/22** |

## Not verified
- **Nothing of this session is verified on live** (not deployed; no safe live test account was provided). After merge: sign in on live with a
  test account and run through the audit tracker's rows; re-measure the sign-in page (`scripts/perf-measure.mjs` method).
- Visual fidelity was checked by screenshots for the changed screens only (avatar profile, Launcher, New list dialog), not a full V8 comparison.

## Remaining issues (honest list)
- M: API latency ≈0.27 s median per request until Hyperdrive is added (owner: create the Hyperdrive config with the Supabase session-pooler string,
  bind it as `HYPERDRIVE` to the Pages project; the code already uses it).
- M: the bundled stylesheet is one 420 KB file (≈60 KB gzipped); per-app CSS splitting would help first paint.
- M: duplicate tasks already on production (owner may delete them in Tasks).
- L: avatar import of PDFs uses font-size heuristics for heading levels (Word files are exact).
- L: Launcher drag-and-drop is mouse-only (touch uses the arrows, by design).
- L: e2e drag test was flaky once (fixed with real mouse movement; arrows are the reliable path).

## Git
- `main` = P00 + P01 + Tasks (merged 15 Nov). `claude/epic-bohr-nc9jar` = recovery (this session), pushed; **draft PR to be opened/merged only with the owner's go**.
- Uncommitted work: none after the final commit of this session.
