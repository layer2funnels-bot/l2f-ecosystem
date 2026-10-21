#!/usr/bin/env bash
# $0 nightly backup for a Supabase FREE project (no managed backups on that plan).
# PREPARED, NOT RUN: needs the owner's approval and two GitHub Actions secrets:
#   SUPABASE_DB_URL  session-pooler connection string (never commit it)
#   AGE_RECIPIENT    the owner's `age` PUBLIC key; the private key stays offline with the owner
# Output: one encrypted file. Drive/Storage files are NOT in a database dump (see manual §8).
set -euo pipefail
: "${SUPABASE_DB_URL:?missing}" "${AGE_RECIPIENT:?missing}"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
pg_dump -Fc --no-owner --schema=public --schema=private -f "$work/app.dump" "$SUPABASE_DB_URL"
pg_dump -Fc --no-owner --data-only --table=auth.users --table=auth.identities -f "$work/auth.dump" "$SUPABASE_DB_URL"
tar -C "$work" -cf - app.dump auth.dump | age -r "$AGE_RECIPIENT" > "l2f-backup-$stamp.tar.age"
echo "wrote l2f-backup-$stamp.tar.age"
