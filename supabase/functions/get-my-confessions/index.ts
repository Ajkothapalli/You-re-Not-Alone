/**
 * Edge Function: get-my-confessions
 *
 * Returns the authenticated user's own confessions, ordered newest-first.
 * Uses account_id (not author_token) for the lookup — cross-device ownership.
 *
 * Identity invariant: this function returns only the caller's own confessions.
 * account_id is used server-side and never returned to the client.
 * Response: id, text, felt_count, status, created_at only.
 *
 * Rate limit: 30 requests / account / hour (checked against a lightweight
 * counter stored in the DB; fail open on DB error so the user still gets data).
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const SEC = {
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control':          'no-store',
  'Referrer-Policy':        'same-origin',
};

export interface OwnConfession {
  id:         string;
  text:       string;
  felt_count: number;
  status:     string;
  created_at: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, ...SEC, 'Content-Type': 'application/json' },
    });

  if (req.method !== 'GET') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  // ── Auth ──────────────────────────────────────────────────────────────────────
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return json({ error: 'Unauthorized' }, 401);

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  // ── Rate limit: 30 requests / account / hour ──────────────────────────────────
  // Lightweight check — fail open so the user still gets their confessions
  // if the rate_limit_calls table is unavailable.
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('api_call_log')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', user.id)
      .eq('fn', 'get-my-confessions')
      .gte('called_at', oneHourAgo);

    if ((count ?? 0) >= 30) {
      return json({ error: 'Too many requests. Please try again later.' }, 429);
    }

    // Log this call (non-blocking — don't fail the request if logging fails)
    supabase.from('api_call_log').insert({
      account_id: user.id,
      fn:         'get-my-confessions',
      called_at:  new Date().toISOString(),
    }).catch(() => {});
  } catch {
    // Fail open — rate limit table may not exist yet; let the request through.
  }

  // ── Query confessions by account_id ───────────────────────────────────────────
  // Service role bypasses RLS; we still filter by account_id explicitly.
  // account_id is never returned in the response — only ownership-safe fields.
  const { data: rows, error: queryErr } = await supabase
    .from('confessions')
    .select('id, text, felt_count, status, created_at')
    .eq('account_id', user.id)
    .in('status', ['live', 'approved', 'under_review', 'removed', 'retired'])
    .order('created_at', { ascending: false })
    .limit(100);

  if (queryErr) {
    console.error('[get-my-confessions] query error:', queryErr.message);
    return json({ error: 'Failed to load confessions.' }, 500);
  }

  return json({ confessions: (rows ?? []) as OwnConfession[] });
});
