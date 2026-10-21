#!/usr/bin/env bash
# T12: fail if privileged Supabase keys appear anywhere a browser could load them.
# Scans everything except server-only paths (server/, api/, scripts/, test/) and dependencies.
set -euo pipefail
cd "$(dirname "$0")/.."
PATTERN='service_role|SUPABASE_SERVICE_ROLE|sb_secret_|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
hits=$(grep -rInE "$PATTERN" . \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=server --exclude-dir=api \
  --exclude-dir=scripts --exclude-dir=test --exclude-dir=docs || true)
if [ -n "$hits" ]; then
  echo "FAIL T12: privileged key pattern found in client-reachable files:"
  echo "$hits" | cut -d: -f1,2 | sort -u
  exit 1
fi
echo "PASS T12: no privileged key patterns in client-reachable files"
