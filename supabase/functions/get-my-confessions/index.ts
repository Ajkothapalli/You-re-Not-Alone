/**
 * Edge Function: get-my-confessions
 *
 * Returns the authenticated user's own confessions, ordered newest-first.
 * Matches both new rows (account_id = user.id) and legacy rows (author_token
 * = HMAC(user.id, AUTHOR_TOKEN_SECRET)) so pre-account-linking confessions
 * appear in the owner's history.
 *
 * Identity invariant: this function returns only the caller's own confessions.
 * account_id is used server-side and never returned to the client.
 * Response: id, text, felt_count, status, created_at, updated_at, can_edit only.
 *   can_edit = (real_felt_count = 0) — computed server-side; real_felt_count never sent.
 *   updated_at — NULL until the first edit; displayed as "· edited" in the owner view.
 *
 * Rate limit: 30 requests / account / hour (checked against a lightweight
 * counter stored in the DB; fail open on DB error so the user still gets data).
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AUTHOR_TOKEN_SECRET  = Deno.env.get('AUTHOR_TOKEN_SECRET');

async function hmacSha256(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

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
  can_edit:   boolean;     // server-computed: real_felt_count = 0
  updated_at: string | null; // null until first edit
  status:     string;
  created_at: string;
  /** Null for a typed confession. Present = there is a recording to play. */
  audio_duration_ms: number | null;
  /** Loudness envelope, 0..100 peaks. Null for a typed confession. */
  audio_waveform: number[] | null;
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

  // ── Query confessions by account_id AND/OR legacy author_token ───────────────
  // Two separate queries to avoid .or() filter parsing ambiguity with UUID values.
  // New rows: account_id = user.id
  // Legacy rows (pre-account-linking, 2026-07-05): account_id = NULL, matched by author_token.
  // account_id and real_felt_count are NEVER returned to the client.
  const legacyToken = AUTHOR_TOKEN_SECRET
    ? await hmacSha256(user.id, AUTHOR_TOKEN_SECRET)
    : null;

  const STATUSES = ['live', 'approved', 'under_review', 'removed', 'retired'];
  // audio_duration_ms, never audio_key — the key is REVOKEd from clients for
  // the same reason account_id is (invariant 3), and playback goes through
  // get-audio-url's signed, short-lived URL. Without the duration the owner
  // view cannot tell a voice confession from a typed one, which is how voice
  // confessions shipped showing only their transcript here.
  const SELECT =
    'id, text, felt_count, status, created_at, updated_at, real_felt_count, '
    + 'audio_duration_ms, audio_waveform';

  const [newResult, legacyResult] = await Promise.all([
    supabase
      .from('confessions')
      .select(SELECT)
      .eq('account_id', user.id)
      .in('status', STATUSES)
      .order('created_at', { ascending: false })
      .limit(100),
    legacyToken
      ? supabase
          .from('confessions')
          .select(SELECT)
          .eq('author_token', legacyToken)
          .in('status', STATUSES)
          .order('created_at', { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (newResult.error) {
    console.error('[get-my-confessions] query error (new):', newResult.error.message);
    return json({ error: 'Failed to load confessions.' }, 500);
  }
  if (legacyResult.error) {
    console.error('[get-my-confessions] query error (legacy):', legacyResult.error.message);
    return json({ error: 'Failed to load confessions.' }, 500);
  }

  // Merge, deduplicate by id, sort newest-first, cap at 100.
  const seen = new Set<string>();
  const merged = [...(newResult.data ?? []), ...(legacyResult.data ?? [])]
    .filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 100);

  // Strip real_felt_count; expose only the computed boolean can_edit.
  const confessions: OwnConfession[] = merged.map(
    ({ real_felt_count, ...rest }) => ({
      ...rest,
      can_edit: real_felt_count === 0,
    }),
  );

  console.log(`[get-my-confessions] returning ${confessions.length} confessions (${newResult.data?.length ?? 0} new, ${legacyResult.data?.length ?? 0} legacy)`);
  return json({ confessions });
});
