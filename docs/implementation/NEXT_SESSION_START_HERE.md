# Next session — start here

**Project:** Layer2Funnels ecosystem (`layer2funnels-bot/l2f-ecosystem`): one shell (rail, Launcher, search, notifications, profile) and many apps,
rebuilt app by app to the V8 "Ledger" design. Two organizations share it: Layer2Funnels and Aurj — their data never mixes.

## 1. First, inspect the real state (do not trust this file blindly)
```bash
git fetch origin && git branch -a && git status && git log --oneline -5 origin/p01-office
```
Then read, in this order: `CURRENT_PROJECT_STATUS.md` → `MASTER_HANDOFF.md` → `OFFICE_REPORT.md`.

## 2. What is done
- **P00 Foundation and Global Shell** — branch `claude/epic-bohr-nc9jar`, PR #56 (draft, CI green). Not merged.
- **P01 Office** — branch `p01-office`, PR #57 (draft, stacked on #56). Not merged.
- **P02 Tasks** — branch `p02-tasks`, draft PR stacked on #57 (`TASKS_REPORT.md`). Not merged. Migration 0059 local only.
- Migrations 0054–0058 written and tested locally; **not applied to production** (blocked: no verified backup possible from the cloud session).

## 3. Your first task
**Unblock and apply the P00 + P01 migrations — only after a verified backup:**
1. Ask the owner to run the backup on their machine (never paste secrets in chat):
   `SUPABASE_DB_URL=… AGE_RECIPIENT=… bash scripts/backup-supabase.sh` and confirm the `l2f-backup-<stamp>.tar.age` file exists and is non-empty
   (or approve enabling `.github/workflows/backup.yml.disabled` with those two repository secrets and confirm a successful run + artifact).
2. Confirm the target: Supabase project `l2f-ecosystem` (ref `dfitnxilkezepkhdmzuh`); `list_migrations` must end at 0053.
3. Apply in order, each with Supabase `apply_migration` using the file's exact SQL: 0054, 0055, 0056, 0057, 0058 (`p01-office`), then 0059 (`p02-tasks`) once Tasks is approved.
4. Verify (see `MASTER_HANDOFF.md` §7): `list_migrations`, tables/columns/policies, `get_advisors` (security), functions not executable by anon/authenticated,
   Client Access Matrix policy uses `clients.apps.manage` (owner + admin), the preview's bell, Profile details and Office pages load.
5. Update `CURRENT_PROJECT_STATUS.md`.

**P02 Tasks is built; the next application is P03 Drive with editors.** Approved order (owner, 15 Nov 2026): P00 Foundation and Global Shell → P01 Office → **P02 Tasks** → P03 Drive with editors → P04 Projects → P05 Planner → P06 Clients → P07 Funnel Mapper → P08 Portal → P09 Whiteboard → P10 Forms → P11 Value Ladder → P12 Social Planner → P13 Agents → P14 Final Ecosystem Verification.
Do not start a new app until the owner says so; do not start Tasks before the migrations question is settled or explicitly deferred by the owner.

## 4. Never
- Never merge, deploy, or touch production data/schema without the owner's explicit approval for that step.
- Never mix P01 or later work into PR #56; one branch + one consolidated PR per complete application.
- Never ask for credentials in chat. $0/month (free plans only).
- Never re-do the V8 documentation review, the P00 shell or the Office pages; never re-apply migrations already in `list_migrations`.
- Never add fake buttons; never drop V4 functionality unless V8 removes it or the owner approves.
- Never enforce permissions only in the UI — the database (row rules / security-definer checks) decides.
