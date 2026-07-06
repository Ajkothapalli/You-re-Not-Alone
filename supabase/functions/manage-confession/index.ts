/**
 * Edge Function: manage-confession
 *
 * Allows the authenticated user to manage their own confessions.
 * Ownership: account_id === auth.uid() (primary, new rows). Legacy rows
 * (account_id IS NULL) fall back to HMAC author_token comparison.
 *
 * Actions:
 *   retire — removes confession from the match/explore pool immediately
 *            (status → 'retired'). Row is kept for DB integrity.
 *            Intended to precede an edit: client retires the old row,
 *            then submits the new text through the full pipeline.
 *
 * Rate limit: 10 retire actions / account / day.
 *
 * Security:
 *   - Ownership verified server-side before any mutation.
 *   - account_id never returned to client.
 *   - Non-owner → 403 (not 404) to avoid oracle attacks.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AUTHOR_TOKEN_SECRET  = Deno.env.get('AUTHOR_TOKEN_SECRET');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SEC = {
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control':          'no-store',
  'Referrer-Policy':        'same-origin',
};

async function hmacSha256(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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

  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  // ── Auth ──────────────────────────────────────────────────────────────────────
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return json({ error: 'Unauthorized' }, 401);

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  // ── Parse ─────────────────────────────────────────────────────────────────────
  let body: { confessionId?: string; action?: string };
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid request body.' }, 400); }

  const confessionId = body.confessionId?.trim() ?? '';
  const action       = body.action?.trim() ?? '';

  if (!confessionId)         return json({ error: 'confessionId is required.' }, 400);
  if (action !== 'retire')   return json({ error: "Invalid action. Supported: retire" }, 400);

  // ── Rate limit: 10 retire actions / account / day ─────────────────────────────
  try {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('api_call_log')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', user.id)
      .eq('fn', 'manage-confession:retire')
      .gte('called_at', dayAgo);

    if ((count ?? 0) >= 10) {
      return json({ error: 'Daily limit reached. You can retire up to 10 confessions per day.' }, 429);
    }

    supabase.from('api_call_log').insert({
      account_id: user.id,
      fn:         'manage-confession:retire',
      called_at:  new Date().toISOString(),
    }).catch(() => {});
  } catch {
    // Fail open — api_call_log may not exist yet
  }

  // ── Fetch confession ──────────────────────────────────────────────────────────
  const { data: confession, error: fetchErr } = await supabase
    .from('confessions')
    .select('id, status, account_id, author_token')
    .eq('id', confessionId)
    .maybeSingle();

  if (fetchErr) {
    console.error('[manage-confession] fetch error:', fetchErr.message);
    return json({ error: 'Failed to load confession.' }, 500);
  }

  if (!confession) return json({ error: 'Confession not found.' }, 404);

  if (confession.status === 'retired') {
    return json({ ok: true, already: true });
  }

  // ── Ownership check ───────────────────────────────────────────────────────────
  let isOwner = false;

  if (confession.account_id === user.id) {
    isOwner = true;
  } else if (!confession.account_id && AUTHOR_TOKEN_SECRET) {
    const derivedToken = await hmacSha256(user.id, AUTHOR_TOKEN_SECRET);
    isOwner = derivedToken === confession.author_token;
  }

  if (!isOwner) return json({ error: 'Forbidden.' }, 403);

  // ── Retire ────────────────────────────────────────────────────────────────────
  // status → 'retired' removes it from confessions_public, match_confession,
  // and recommend_confessions immediately (all filter on status IN ('live','approved')).
  const { error: updateErr } = await supabase
    .from('confessions')
    .update({ status: 'retired' })
    .eq('id', confessionId);

  if (updateErr) {
    console.error('[manage-confession] update error:', updateErr.message);
    return json({ error: 'Failed to retire confession.' }, 500);
  }

  console.log('[manage-confession] retired confession_id:', confessionId);
  return json({ ok: true });
});
