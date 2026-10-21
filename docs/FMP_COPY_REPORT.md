# Funnel Mapper Pro code copy: what was copied, and proof it behaves like the original (21 Oct 2026)

Approval: owner, 21 Oct 2026 (decision FMP-4). Limits honoured: the original repository and its live Supabase and Vercel projects were only **read**; no data was copied; nothing connected to any live project; nothing deployed; **no edit** was made to the copy.

## What was copied
- Source: `layer2funnels-bot/Funnel-Mapper`, `main`, commit `13a1e864…` (PR #39), shallow read-only clone.
- Destination: `apps/funnel-mapper/`, **654 files**, taken from the commit with `git archive` (so no local build output, no `node_modules`, no `.env`, no git history).
- Left out on purpose (not code): `.github/` (its CI cannot run from a sub-folder; the ecosystem CI has an equivalent `fmp-copy` job), `.claude/` and `CLAUDE.md` / `AGENTS.md` (agent instructions), `docs/`, `PROJECT_STATUS.md` and the `.docx` hand-off (documents; they stay in the original repository).
- Kept although it looks like data: `supabase/seed.sql` (synthetic demo accounts for local testing, not production data), the `reference/` design boards and prototype (two of the unit tests and the fixture generator read them), `public/` block images.
- Provenance and proof of "no edits": `docs/fmp-copy-manifest.json` holds the SHA-256 of every copied file and the source commit. `npm run check:fmp-copy` (also in CI) fails if any file differs, goes missing, is added, or is silently ignored by git. Result: **654 files, 0 changed, 0 missing, 0 extra**.
- Safety checks added to the ecosystem tooling: the secret scan treats the copy separately and allows only FMP's one public local-demo key (T12b); the licence check lists the copy's dependency licences as information.

## Same results as the original
Both ran the same commands, original in a clean clone and copy in `apps/funnel-mapper/`, on the same machine (Node 22, Chromium 1194 from the sandbox, FMP's own local Supabase stack in Docker; no live project).

| Check | Original | Copy |
|---|---|---|
| File integrity (`check:files`) | pass, 330 files | pass, 330 files |
| Lint | 0 errors, 24 warnings | 0 errors, 24 warnings (identical) |
| Unit tests | 279 / 279 | 279 / 279 |
| Production build | pass | pass |
| Typecheck (after build, as in FMP's CI) | pass | pass |
| Database tests (RLS, roles, workspaces, assets, trash) on a freshly reset local stack | 55 / 55 | 55 / 55 |
| Browser tests, **subset**: `privacy`, `team`, `workspaces`, `calm`, `canvas`, `editor`, `exports` (66 specs) | 51 pass, 15 fail | 50 pass, 16 fail |

**Browser subset in detail.** 65 of 66 specs have the identical result on both sides. By file: privacy 12/12 and team 6/6 pass on both (these are the access and sharing-privacy suites); editor 13/14, calm 12/16, workspaces 8/10 (original) vs 7/10 (copy); canvas 0/5 and exports 0/3 fail on **both**. The single difference (`workspaces.spec.ts:210`) is a flaky test, not a code difference: re-run twice on each side it failed on the first run and passed on the second, on the original and on the copy alike.
The failures present on both sides are identical in both trees, so they are not caused by the copy. Their cause was **not investigated** (investigating means changing nothing, only reading, and was outside this task). What was observed: most are timeouts waiting for a UI element (calm, canvas, editor, exports); the private sign-up test needs a sign-up code environment variable (`INDEPENDENT_SIGNUP_CODE`) that was not set for these runs; two invite-link tests fail on a URL expectation. They are reported, not fixed: fixing them would mean editing the code.

**What was not run.** FMP's full browser suite is 195 tests (about three hours per side here). Only the subset above was compared; the remaining 13 spec files (a11y, responsive, v1/v2, widgets, …) were not run on the copy. `a11y-surfaces`, `a11y`, `features` (partly) ran on the original only, before the run was time-boxed. A full side-by-side run belongs in an overnight job. Its live-site spec (`tests/live`) and `npm run deploy` / `live-check` were **never** run: they target the live site and projects.

## Handling rules while the copy sits in this repository
1. It is **not wired** to anything and has no environment file. The ecosystem root scripts, tests and lint do not touch it.
2. CI job `fmp-copy` (build, lint, unit tests, typecheck, file integrity) keeps proving it still works; the manifest check keeps proving it is unedited. Any future reshaping must change the manifest deliberately in the same change.
3. Its Vercel configuration (`vercel.json`, deploy scripts) stays inert: nothing here deploys.
4. Reshaping (header, switcher, design tokens, sign-in, data access through the ecosystem API) has **not** started and waits for approved designs. Anything touching FMP data, its database or workflows needs explicit approval (FMP-2).

## Licence notes for the copy's dependencies (information, before any reshaping or deploy)
Outside the ecosystem allowlist: `MPL-2.0` (build and test tools: lightningcss, axe-core), `LGPL-3.0-or-later` (the `sharp` image library's native libvips binaries), `EPL-2.0 OR GPL-3.0-or-later` (elkjs, the auto-layout engine; EPL-2.0 is the usable side), `CC-BY-4.0` (caniuse-lite data), and combined permissive licences (pako, victory-vendor). FMP already ships these today. They need a review entry in `docs/DECISIONS.md` before the copy joins the ecosystem build.
