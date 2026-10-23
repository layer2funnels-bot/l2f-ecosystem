#!/usr/bin/env bash
# Applies migrations/0001..NNNN in order to ONE Postgres database (the new ecosystem project), each file in its own transaction, and records them in
# public.schema_migrations so a second run skips what is done. SAFE BY DEFAULT: without --apply it only lists what it would do. Never point it at
# funnel-mapper-demo, funnel-mapper-pro or application-office. Needs psql 17 (npm run check:pg17) and the session-pooler connection string.
#   SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres' scripts/golive-apply-migrations.sh [--apply]
set -euo pipefail
: "${SUPABASE_DB_URL:?set SUPABASE_DB_URL to the NEW project session pooler string}"
ref_ok=1; for bad in arwedmqmxrxllytzriat przklgyyrfejpqnvuvtw kyhlhacbmlbkiibvpsel; do [[ "$SUPABASE_DB_URL" == *"$bad"* ]] && ref_ok=0; done
[[ $ref_ok == 1 ]] || { echo "refusing: that is one of the existing projects (not the new ecosystem project)" >&2; exit 2; }
APPLY=0; [[ "${1:-}" == "--apply" ]] && APPLY=1
dir="$(cd "$(dirname "$0")/.." && pwd)/migrations"
psql() { command psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -X -q "$@"; }
if (( APPLY )); then psql -c "create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now()); alter table public.schema_migrations enable row level security; alter table public.schema_migrations force row level security; revoke all on public.schema_migrations from anon, authenticated;"; fi
done_list=""; (( APPLY )) && done_list="$(psql -At -c 'select name from public.schema_migrations')" || true
n=0
for f in "$dir"/[0-9][0-9][0-9][0-9]_*.sql; do
  name="$(basename "$f")"
  if grep -qx "$name" <<<"$done_list"; then echo "skip    $name"; continue; fi
  if (( APPLY )); then
    { echo "begin;"; cat "$f"; echo; echo "insert into public.schema_migrations (name) values ('$name');"; echo "commit;"; } | psql -f -
    echo "applied $name"
  else echo "would apply $name"; fi
  n=$((n+1))
done
echo "$n migration(s) $([[ $APPLY == 1 ]] && echo applied || echo pending)."
