/**
 * Edge Function: create-share-token
 *
 * Mints ONE invite token for ONE share. Returns { token } and nothing else.
 *
 * ── Why a fresh token every time ────────────────────────────────────────────
 * The obvious design is a per-account referral code. It is also the one thing
 * this app must not have: a durable code travels on every card a person
 * shares, so two shares carrying the same code prove the same person sent
 * both, and a code beside a confession ties that person to that confession.
 * That is the link CLAUDE.md #3 exists to prevent. So the token is random,
 * single-use-by-design, and the mapping back to an account lives only in a
 * table no client can read.
 *
 * The token therefore encodes NOTHING. It is not derived from the account, the
 * confession, or the time — it is 10 random base62 characters, and the only
 * way to learn anything from it is to be the server.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

const BUCKETS = ['match', 'rtue', 'read', 'question', 'invite'] as const;
type Bucket = typeof BUCKETS[number];

/** Tokens per account per day. Generous for a person, useless for a farm. */
const DAILY_CAP = 50;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const TOKEN_LEN = 10;

/**
 * crypto.getRandomValues, not Math.random: a guessable token would let someone
 * mint links that attribute installs to a stranger.
 *
 * Rejection sampling rather than `% 62`, which would bias the first four
 * letters — a small bias, but it costs nothing to not have it.
 */
function randomToken(): string {
  const out: string[] = [];
  const buf = new Uint8Array(TOKEN_LEN * 2);
  while (out.length < TOKEN_LEN) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (out.length >= TOKEN_LEN) break;
      if (b < 248) out.push(ALPHABET[b % 62]);   // 248 = 4 * 62
    }
  }
  return out.join('');
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, ...SEC, 'Content-Type': 'application/json' },
    });

  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return json({ error: 'Unauthorized' }, 401);

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  let body: { bucket?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const bucket = body.bucket as Bucket;
  if (!BUCKETS.includes(bucket)) return json({ error: 'Invalid bucket.' }, 400);

  // ── Daily cap ──────────────────────────────────────────────────────────────
  // Fails CLOSED, unlike most of the soft limits here: the cap is the only
  // thing stopping someone minting thousands of tokens once rewards exist, and
  // a share that fails to get a token still shares (the client falls back to a
  // link without one). Nobody loses anything by this being strict.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countErr } = await supabase
    .from('share_tokens')
    .select('token', { count: 'exact', head: true })
    .eq('account_id', user.id)
    .gte('created_at', since);

  if (countErr) {
    console.error('[create-share-token] cap check failed:', countErr.message);
    return json({ error: 'Could not create token.' }, 500);
  }
  if ((count ?? 0) >= DAILY_CAP) {
    return json({ error: 'Too many shares today.' }, 429);
  }

  // Retry on the vanishingly unlikely PK collision rather than returning an
  // error for it. 62^10 is ~8.4e17, so this loop effectively never runs twice.
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = randomToken();
    const { error } = await supabase
      .from('share_tokens')
      .insert({ token, account_id: user.id, bucket });

    if (!error) return json({ token });
    if (error.code !== '23505') {
      console.error('[create-share-token] insert failed:', error.message);
      return json({ error: 'Could not create token.' }, 500);
    }
  }

  return json({ error: 'Could not create token.' }, 500);
});
