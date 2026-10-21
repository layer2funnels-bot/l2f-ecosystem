# Infrastructure decisions: region, project slot, application-office (21 Oct 2026)

Supersedes my earlier "Mumbai recommended" and "pause application-office" lines (AUDIT_FOLLOWUP v1, HANDOVER v0.3).

## 1. Do we need a Supabase slot now? **No.** [Decision]
All Phase 5 engineering can run at $0 without a new live project: tests on PostgreSQL 17 (PGlite) and a real Postgres server (CI service container), and the Supabase CLI local stack on any Docker computer for auth screens. A live project is needed only at **go-live**. So no pause, no migration and no slot decision is required today.

## 2. application-office: dependencies (read-only metadata, 21 Oct) [Evidence]
| Item | Found |
|---|---|
| Project | `przklgyyrfejpqnvuvtw`, Tokyo (ap-northeast-1), active, PostgreSQL 17 |
| Tables | 38 in `public`, RLS on all; largest 40 rows; 4 clients (2 real per owner), 2 profiles, 4 members |
| Migrations recorded | 3 (`001_core`, `002_tasks`, `003_seed_config`) for 38 tables → not rebuildable from code |
| Storage | **3 buckets, 3 files**: a database dump alone would lose them |
| Front end | Vercel project `application-office` (Hobby) points at it (E8) |
| Funnel Mapper Pro | No link found; separate projects |
Not inspected: row contents (privacy), auth settings, edge functions.

**Impact of pausing it later:** the Vercel test app stops working; data is kept by Supabase while paused but is not reachable; un-pausing is possible from the dashboard. Real risk = the 2 real clients' records and 3 files.

## 3. Before ANY pause (only at go-live, only with your approval)
1. Run `scripts/export-project.sh` (schema, data, auth users, storage files, checksums). Prepared, not run.
2. Verify: `DUMP_FILE=<export>/public.dump npm run drill:restore` + compare `rowcounts.txt`. The verify path is tested on synthetic data (RD pass).
3. Store the export encrypted, offline. 4. Then decide: pause it, or keep it and pause nothing (see 4).

## 4. Alternatives to freeing a slot (evaluated)
| Option | Verdict |
|---|---|
| Develop locally until go-live | **Use now** ($0, no risk) |
| Pause `application-office` at go-live after verified export | Acceptable; it is a test build (OV1) |
| Pause `funnel-mapper-demo` | No: Funnel Mapper Pro is protected and its role (demo vs production) is unconfirmed (O8) |
| Put the new foundation inside `application-office` | No: shares auth users and a schema with an un-versioned test build; Tokyo region |
| Second Supabase organization for another free slot | Free-project limits may count per owner, not per org [V]; also splits billing/ownership. Not recommended |
| Paid plan | Outside $0; revisit at the revenue gate |

## 5. Region [Recommendation: London eu-west-2, confirm with a 5-minute test]
| Factor | Mumbai ap-south-1 | Singapore ap-southeast-1 | Frankfurt eu-central-1 | London eu-west-2 |
|---|---|---|---|---|
| Team in Pakistan (heaviest daily use) | Close on a map, but Pakistani ISPs (esp. PTCL) often route India traffic via Singapore or Europe; reported 100–150 ms | Often on the actual route | Good routes via submarine cables to Europe | Similar to Frankfurt |
| Clients (UK, US, Europe) | Far | Far | Close | **Closest for UK** |
| Funnel Mapper Pro (London) | Far | Far | Near | **Same region**: cheapest future shared login and data links |
| Data handling for UK/EU clients | Outside UK/EU | Outside UK/EU | EU | UK |
Sources for Pakistan routing are gaming-network articles (secondary), so **measure before creating the project**: on each team member's normal internet (PTCL, mobile, fibre), open cloudping.info (it times AWS regions; Supabase runs on the same AWS regions) 3 times and note Mumbai, Singapore, Frankfurt, London.
**Decision rule:** choose London unless Mumbai or Singapore is faster by more than 60 ms on most team connections. 60 ms is invisible in normal office apps; co-location with Funnel Mapper Pro and client proximity are permanent benefits. The region cannot be changed later without a migration, so this is the only test worth doing before go-live.

## 6. Free-tier risks that remain at go-live
Pause after 7 idle days (daily backup job connects daily; whether that counts is [V15]) · 1 GB file storage · no leaked-password check · default email limited to team members (custom SMTP needed).
