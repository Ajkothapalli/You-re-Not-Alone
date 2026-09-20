#!/usr/bin/env bash
# Publish the JS-only fixes to the production channel.
#
# The Supabase values are set INLINE and deliberately not sourced from .env:
# .env holds the dev project (tmpqadweifuwbmktbmzg), while the live Play build
# points at the production one. EXPO_PUBLIC_* are inlined into the bundle at
# publish time, so sourcing .env here would repoint every updated install at
# the wrong database.
#
# They must match eas.json -> build.production.env exactly.
set -euo pipefail
cd "$(dirname "$0")/.."

export EXPO_PUBLIC_SUPABASE_URL="https://sjywjerlqxwfniwqjojs.supabase.co"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_qHe9n5MLT_MxQHZsDizUEQ_gCdgYfvM"

npx eas-cli update \
  --branch production \
  --message "${1:-Dark theme fixes, light default, 4-beat FTUE, copy corrections}"

echo
echo "── published. verifying ──"
npx eas-cli update:list --branch production --limit 3
