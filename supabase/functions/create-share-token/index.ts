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
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';
import { verifyJwt } from '../_shared/auth.ts';

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

  const user = await verifyJwt(supabase, jwt);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  let body: { bucket?: string; confessionId?: string; questionId?: string; wordsIncluded?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const bucket = body.bucket as Bucket;
  if (!BUCKETS.includes(bucket)) return json({ error: 'Invalid bucket.' }, 400);

  /**
   * [F] What is being shared, checked SERVER-side.
   *
   * The client says which confession it is sharing; the server decides
   * whether it may. A caller could otherwise mint a token pointing at any
   * confession id and turn it into a public page — which would be a
   * confession-id-to-page path, the exact thing the token design exists to
   * prevent.
   *
   *   'rtue'  — must be the CALLER'S OWN confession (ownership check).
   *   'read'  — must be a confession the caller could actually see: live or
   *             approved, a real user's, not hidden. That is the same set the
   *             feed would have shown them.
   *   others  — no confession.
   *
   * A failed check does not fail the share: the token is still minted, just
   * without a confession, so the link degrades to the generic landing page.
   * Losing a doorway is a smaller harm than losing someone's share.
   */
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let confessionId: string | null = null;
  let questionId:   string | null = null;
  const wordsIncluded = body.wordsIncluded === true;

  if (bucket === 'question' && typeof body.questionId === 'string' && UUID.test(body.questionId)) {
    const { data: q } = await supabase
      .from('questions').select('id').eq('id', body.questionId)
      .eq('status', 'approved').maybeSingle();
    questionId = q?.id ?? null;
  }

  if ((bucket === 'read' || bucket === 'rtue') &&
      typeof body.confessionId === 'string' && UUID.test(body.confessionId)) {
    const { data: c } = await supabase
      .from('confessions')
      .select('id, account_id, status, source, auto_flagged')
      .eq('id', body.confessionId)
      .maybeSingle();

    const visible = c
      && (c.status === 'live' || c.status === 'approved')
      && c.source === 'user'
      && !c.auto_flagged;

    if (visible) {
      // rtue is the writer's own milestone — it must BE theirs.
      if (bucket === 'rtue') {
        if (c!.account_id === user.id) confessionId = c!.id;
      } else {
        confessionId = c!.id;
      }
    }
  }

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
      .insert({
        token, account_id: user.id, bucket,
        confession_id:  confessionId,
        question_id:    questionId,
        // Captured at share time and never revisited: a sealed share stays
        // sealed, or the page would retroactively publish words the sharer
        // deliberately withheld.
        words_included: wordsIncluded,
      });

    if (!error) return json({ token });
    if (error.code !== '23505') {
      console.error('[create-share-token] insert failed:', error.message);
      return json({ error: 'Could not create token.' }, 500);
    }
  }

  return json({ error: 'Could not create token.' }, 500);
});
