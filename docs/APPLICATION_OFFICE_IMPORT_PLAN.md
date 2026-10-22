# application-office: read-only plan to import its 2 real clients and 3 files (22 Oct 2026)

**Nothing was changed there.** Facts come from `docs/INFRASTRUCTURE.md` (metadata read on 21 Oct) and from the project list today. No row, file or auth setting was read for this plan, and the project is not touched.

## What exists (known)
| Item | Fact |
|---|---|
| Project | `przklgyyrfejpqnvuvtw`, Tokyo, PostgreSQL 17; **status today: INACTIVE (paused)** (it was active on 20 and 21 Oct; the free plan pauses projects after idle days, or someone paused it) |
| Data | 38 tables in `public`, RLS on all; 4 client rows of which **2 are real**; 2 profiles; 4 members; largest table 40 rows |
| Files | 3 storage buckets, 3 files (a database dump does not include them) |
| Migrations | 3 recorded for 38 tables, so the schema cannot be rebuilt from code; the dump is the source of truth |
| Front end | Vercel project `application-office` (Hobby), a test build |

## Target in the ecosystem
- **Clients** (`clients`, `client_profiles`, `client_notes`): two rows, plus contact details and free text notes (notes become internal team notes, never client-visible).
- **Files**: Drive client space `<org>/clients/<client>/<name>`, with `files` rows (name, type, size, uploader unknown → the importing owner) and an audit entry.
- **People**: not imported as accounts (auth users cannot be moved without their password hashes and should not be). The 2 profiles and 4 members become **invitations** by e-mail with the role they had.
- Anything else in the 38 tables (tasks, settings, seed config): reviewed in the dump; only data that belongs to the two real clients is carried; the rest is archived in the encrypted export and not imported.

## Steps (all need the owner's approval; none runs now)
1. **Wake it, read-only intent.** The owner un-pauses the project from the Supabase dashboard (free; this is the one state change in the whole plan) so the export can connect. Alternative if un-pausing is refused: restore from the project's own backup into a throw-away local database (slower, same result).
2. **Export** with `scripts/export-project.sh` (prepared and tested on synthetic data): schema, data, auth users, storage files with checksums. Stored encrypted, offline. The project is then paused again.
3. **Inspect offline** from the dump: map the client and file tables and every foreign key reaching them; list what the 38 tables contain and mark each as import, archive, or ignore. Result: a one-page field map, reviewed by the owner.
4. **Rehearse on synthetic data** with the same pattern as `scripts/fmp-dryrun` (an `ao_src` schema shaped like the real one, a transformation script, an id map, checks): row counts, byte-identical file checksums, internal notes stay internal, nothing visible across organizations, a second run changes nothing, rollback by id map.
5. **Real run** into the live ecosystem only after go-live and the owner's one approval: create the two clients, upload the three files (checksums must match the export), send the invitations. Keep the id map.
6. **Verify and keep**: owner reviews both clients in the Clients app (once its approved screens exist) and the files in Drive; the old project stays paused for 30 days, then the owner decides to delete it. The Vercel test project is switched off by the owner.

## Risks
- **Real client data**: handled only inside the encrypted export and the live organization; never in the repository, logs or tests (tests use synthetic data).
- **Files are not in the database dump**: the export script handles Storage separately; verify the count (3) and checksums.
- **Paused project data loss**: Supabase keeps paused free projects for a limited time (check current terms); the export should happen before that window ends. Do the export early.
- **Unknown schema**: the field map in step 3 may reveal data that has no home yet (for example custom task data); those go to the archive, not lost.

## Effort
About 1 day for steps 3 to 4 once the export exists, 0.5 day for the real run and checks.

## Owner decision
Approve step 1 (un-pausing, then pausing again) when convenient. Recommended: do it **before** the free-plan retention window runs out, independent of go-live.
