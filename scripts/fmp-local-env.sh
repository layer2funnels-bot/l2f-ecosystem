#!/usr/bin/env bash
# Nightly FMP job helper: put the LOCAL demo admin key (printed by `supabase status`, valid only on the runner's local stack) and a
# sign-up code into the copy's .env.local so FMP's own browser tests that need them can run. Run inside apps/funnel-mapper or the original checkout.
set -euo pipefail
KEY=$(supabase status -o env | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')
sed -i "s|^SUPABASE_SERVICE_ROLE_KEY=.*|SUPABASE_SERVICE_ROLE_KEY=$KEY|; s|^INDEPENDENT_SIGNUP_CODE=.*|INDEPENDENT_SIGNUP_CODE=local-demo-code|" .env.local
