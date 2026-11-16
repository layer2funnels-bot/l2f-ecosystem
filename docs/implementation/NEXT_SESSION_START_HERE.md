# Next session — start here (written 16 Nov 2026, end of the first Drive session)

**Project:** Layer2Funnels ecosystem (`layer2funnels-bot/l2f-ecosystem`), V8 "Ledger" rebuild app by app. Two organizations (Layer2Funnels, Aurj) never mix.
Live: `office.tabishriaz.com` (Cloudflare Pages `l2f-ecosystem`, deploys `main`). Database: Supabase `dfitnxilkezepkhdmzuh`.

## 1. State
- **Drive (P04) is in progress** on branch `claude/kind-shannon-u0bd3t` (pushed; also duplicated on `p04-drive` — delete that one). No PR yet: the owner wants
  one PR for the *complete* app. Read `DRIVE_REPORT.md` (done / tested / not done) and `DRIVE_PLAN.md`.
- Production: migrations up to **0060** applied (0060 applied 16 Nov with approval). **0061 is local only.**
- Projects (P02) is deferred by the owner; after Drive comes Projects, then Planner (owner's brief, 15 Nov).

## 2. Finish Drive (in this order)
1. Move Docs, Sheets, Image and PDF onto the V8 editor frame (`edframe.js` + shell `__editor`, as Slides does): no rail, no second header.
2. Docs audits with scripted browser tests: OR-24 (dimensions/format after save, reload, restore), OR-25 (double clicks), OR-26 (paste), OR-27 (content protection).
3. Docs ruler (OR-32): numeric page margins in `docmodel.js`, horizontal + vertical ruler, first-line indent, tab stops → Tab key.
4. Share button inside editors; Comments for files (extend `private.collab_scope` with a `drive_file` type — new migration **0062**).
5. Voice modes (Roman Urdu, mixed) — needs the owner to test by speaking.
6. Then: full regression (`npm test`, all e2e suites with `WEB_ROOT=dist/web`), report, **one PR**, owner review, 0061 on production with a backup.
Owner decisions to ask once: automatic Trash emptying after 30 days; thinning the 4,243 existing document versions.

## 3. How to run things
- Local stack: `dockerd &` then `npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,realtime,storage-api,mailpit,supavisor` and `npm run stack:migrate`
  (the npm script calls a global `supabase`, which this container lacks). Seed: run `node scripts/e2e-local.mjs` once (creates both organizations).
- `npm ci --prefix apps/{sheetjs,whiteboard,media,docs-io}` then `node scripts/build-web.mjs` before `WEB_ROOT=dist/web` suites (e2e-ui needs the whiteboard bundle).
- Drive browser suite: `node scripts/e2e-drive-v8.mjs` (uses **production** rate limits on purpose). Local storage is off: picture/Reset flows are covered by `test/drive-v8.test.mjs`.

## 4. Never
Never merge, deploy, or change production data/schema without the owner's explicit go for that step; back up first. Never ask for credentials in chat. $0/month.
Never add fake buttons; never drop V4 functions. Permissions in the database. Client Access Matrix = owners AND admins. Don't claim live works without testing it signed in.
