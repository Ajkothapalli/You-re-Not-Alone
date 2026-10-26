#!/usr/bin/env bash
# deploy-growth.sh — wire the Growth & Health dashboard to the live Supabase project
#
# Run once after the "wore everything" session. Safe to re-run.
#
# Prerequisites:
#   brew install supabase/tap/supabase    (or npm i -g supabase)
#   supabase login
#   supabase link --project-ref <your-ref>   (find ref in Supabase dashboard URL)

set -euo pipefail
cd "$(dirname "$0")/.."

echo ""
echo "=== soulyap · Growth & Health wiring ==="
echo ""

# ── 0. Preflight ─────────────────────────────────────────────────────────────
if ! command -v supabase &>/dev/null; then
  echo "ERROR: Supabase CLI not found."
  echo "       brew install supabase/tap/supabase   OR   npm i -g supabase"
  exit 1
fi

echo "CLI version: $(supabase --version)"
echo ""

# ── 1. Apply growth dashboard migration ───────────────────────────────────────
echo "──> Applying migration 20260828000001_growth_dashboard.sql ..."
supabase db push

echo ""
echo "──> Migration applied."
echo ""

# ── 2. Deploy Edge Functions ──────────────────────────────────────────────────
echo "──> Deploying: track"
supabase functions deploy track --no-verify-jwt

echo "──> Deploying: dashboard-api"
supabase functions deploy dashboard-api --no-verify-jwt

echo "──> Deploying: revenuecat-webhook"
supabase functions deploy revenuecat-webhook --no-verify-jwt

echo ""
echo "──> Functions deployed."
echo ""

# ── 3. Remind about secrets ───────────────────────────────────────────────────
cat <<'SECRETS'
─────────────────────────────────────────────────────────────────────────────
MANUAL STEP — set these Supabase secrets if not already set:

  supabase secrets set DASHBOARD_SECRET="<choose a strong random value>"
  supabase secrets set RC_WEBHOOK_SECRET="<from RevenueCat dashboard>"

  # Already set from prior deploy (verify if deploying fresh project):
  # supabase secrets set MODERATION_API_KEY="..."
  # supabase secrets set EMBEDDING_API_KEY="..."
  # supabase secrets set AUTHOR_TOKEN_SECRET="..."

  supabase secrets list   # confirm all are set

─────────────────────────────────────────────────────────────────────────────
SECRETS

# ── 4. Remind about Vercel (yana-website) ─────────────────────────────────────
cat <<'VERCEL'
─────────────────────────────────────────────────────────────────────────────
MANUAL STEP — set Vercel env var for the share landing page proxy:

  In Vercel dashboard → yana-website project → Settings → Environment Variables:
    SUPABASE_FUNCTIONS_URL = https://<your-project-ref>.supabase.co/functions/v1

  Then redeploy the yana-website (or push to trigger CI).

─────────────────────────────────────────────────────────────────────────────
VERCEL

# ── 5. Done ───────────────────────────────────────────────────────────────────
echo ""
echo "=== Done ==="
echo ""
echo "Dashboard: open the artifact URL, enter your Functions URL + DASHBOARD_SECRET."
echo "Data flow:"
echo "  app share (match/explore/rtue) → read_events.signal='share' → v_virality.in_app_shares"
echo "  web landing click              → /api/track → growth_events  → v_virality.share_clicks"
echo "  install_attributed             → track fn   → growth_events  → v_virality.installs_attributed"
echo "  RevenueCat webhook             → revenue_events              → v_monetization.mrr_usd"
echo ""
