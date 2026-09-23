/**
 * Edge Function: dashboard-api
 *
 * Owner-only aggregate endpoint — gates the Growth & Health dashboard.
 * Returns counts and percentages only. No confession text, no account→confession link.
 *
 * Auth: Authorization: Bearer <DASHBOARD_SECRET>
 * Set DASHBOARD_SECRET in Supabase Edge Function secrets (owner-held, not in client).
 *
 * Query pattern: reads all six v_* views via service role.
 * The soulyap_dashboard Postgres role (SELECT on views only) is the long-term
 * credential for Metabase; this function uses service role for Deno compatibility.
 */

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DASHBOARD_SECRET     = Deno.env.get('DASHBOARD_SECRET') ?? '';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Content-Type':                 'application/json',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (!DASHBOARD_SECRET) {
    console.warn('[dashboard-api] DASHBOARD_SECRET not set — blocking all requests');
    return json({ error: 'not_configured' }, 503);
  }

  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${DASHBOARD_SECRET}`) {
    return json({ error: 'unauthorized' }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const [daily, funnel, liquidity, virality, monetization, safety] = await Promise.all([
    supabase
      .from('v_metrics_daily')
      .select('*')
      .order('day', { ascending: false })
      .limit(90),
    supabase
      .from('v_funnel')
      .select('*')
      .order('signup_week', { ascending: false })
      .limit(16),
    supabase
      .from('v_liquidity')
      .select('*')
      .order('live_count', { ascending: false }),
    supabase
      .from('v_virality')
      .select('*'),
    supabase
      .from('v_monetization')
      .select('*')
      .order('mrr_usd', { ascending: false }),
    supabase
      .from('v_safety')
      .select('*')
      .limit(1)
      .single(),
  ]);

  const errs = [daily, funnel, liquidity, virality, monetization]
    .filter(r => r.error)
    .map(r => r.error!.message);
  if (safety.error) errs.push(safety.error.message);

  if (errs.length) console.error('[dashboard-api] view errors:', errs);

  return json({
    metrics_daily: daily.data        ?? [],
    funnel:        funnel.data       ?? [],
    liquidity:     liquidity.data    ?? [],
    virality:      virality.data     ?? [],
    monetization:  monetization.data ?? [],
    safety:        safety.data       ?? {},
    fetched_at:    new Date().toISOString(),
    ...(errs.length ? { errors: errs } : {}),
  });
});
