#!/usr/bin/env bash
# Recoverable export of an existing Supabase project BEFORE any pause/archive decision. Read-only on the source.
# PREPARED, NOT RUN. Run by the owner on his own computer (needs postgresql-client 17 and the Supabase CLI):
#   SRC_DB_URL='postgresql://...session pooler...' PROJECT_REF=przklgyyrfejpqnvuvtw bash scripts/export-project.sh
# Produces ./export-<ref>-<stamp>/ with: schema.sql, data.dump (public + storage metadata + auth users),
# storage/ (every file in every bucket), MANIFEST.txt (row counts + file list + sha256). Contains real client data:
# keep it offline and encrypted; never commit it.
set -euo pipefail
: "${SRC_DB_URL:?missing}" "${PROJECT_REF:?missing}"
out="export-${PROJECT_REF}-$(date -u +%Y%m%dT%H%M%SZ)"; mkdir -p "$out/storage"
pg_dump --schema-only --no-owner --schema=public --schema=storage -f "$out/schema.sql" "$SRC_DB_URL"
pg_dump -Fc --no-owner --schema=public -f "$out/public.dump" "$SRC_DB_URL"
pg_dump -Fc --no-owner --data-only --table=auth.users --table=auth.identities --table=storage.buckets --table=storage.objects -f "$out/auth_storage_meta.dump" "$SRC_DB_URL"
psql "$SRC_DB_URL" -At -c "select schemaname||'.'||relname||' '||n_live_tup from pg_stat_user_tables where schemaname in ('public','storage') order by 1" > "$out/rowcounts.txt"
# Storage FILES are not in any database dump: download them bucket by bucket.
for b in $(psql "$SRC_DB_URL" -At -c "select id from storage.buckets"); do
  supabase storage cp -r "ss:///$b" "$out/storage/$b" --experimental --project-ref "$PROJECT_REF" || echo "WARN: bucket $b needs manual download"
done
( cd "$out" && find . -type f ! -name MANIFEST.txt -exec sha256sum {} \; > MANIFEST.txt )
echo "Export written to $out. Next: DUMP_FILE=$out/public.dump npm run drill:restore"
