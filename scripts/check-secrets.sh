#!/usr/bin/env bash
# T12: fail if privileged Supabase keys appear anywhere a browser could load them.
# Scans everything except server-only paths (server/, api/, scripts/, test/) and dependencies.
set -euo pipefail
cd "$(dirname "$0")/.."
PATTERN='service_role|SUPABASE_SERVICE_ROLE|sb_secret_|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
hits=$(grep -rInE "$PATTERN" . \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=server --exclude-dir=api \
  --exclude-dir=scripts --exclude-dir=test --exclude-dir=docs --exclude-dir=funnel-mapper || true)
if [ -n "$hits" ]; then
  echo "FAIL T12: privileged key pattern found in client-reachable files:"
  echo "$hits" | cut -d: -f1,2 | sort -u
  exit 1
fi
echo "PASS T12: no privileged key patterns in client-reachable files"

# Funnel Mapper Pro code copy (apps/funnel-mapper, unedited): its own server code legitimately names the service-role key, so it is
# scanned separately. Allowed: the one public local-stack demo anon key in its .env.example. Refused: any other JWT-shaped value
# or any real-looking access token (Supabase sbp_, sb_secret_, GitHub ghp_/github_pat_).
FMP=apps/funnel-mapper
if [ -d "$FMP" ]; then
  known=$(grep -E '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' "$FMP/.env.example" | cut -d= -f2- || true)
  jwts=$(grep -rIhoE 'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' "$FMP" --exclude-dir=node_modules --exclude-dir=.next --exclude=.env.local | sort -u | grep -vxF "$known" || true)
  toks=$(grep -rIlE '(^|[^A-Za-z0-9_])(sbp_[a-f0-9]{40}|sb_secret_[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,})' "$FMP" --exclude-dir=node_modules --exclude-dir=.next --exclude=.env.local || true)
  if [ -n "$jwts$toks" ]; then echo "FAIL T12b: unexpected secret-like value in the Funnel Mapper Pro copy"; echo "$toks"; exit 1; fi
  echo "PASS T12b: Funnel Mapper Pro copy holds only its public local demo key"
fi
