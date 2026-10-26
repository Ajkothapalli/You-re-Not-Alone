/**
 * Edge Function: manage-confession
 *
 * Allows the authenticated user to manage their own confessions.
 * Ownership: account_id === auth.uid() (primary, new rows). Legacy rows
 * (account_id IS NULL) fall back to HMAC author_token comparison.
 *
 * Actions:
 *   retire         — removes confession from the match/explore pool immediately
 *                    (status → 'retired'). Row is kept for DB integrity.
 *                    Intended to precede an edit: client retires the old row,
 *                    then submits the new text through the full pipeline.
 *   remove_headline — [H1] clears confessions.headline. The headline is a
 *                    quote from the writer, chosen by a model; removing it is
 *                    the writer's veto over which of their own words get set
 *                    in bold above the rest. Under the SAME sealing rule as
 *                    an edit (real_felt_count = 0): once a real person has
 *                    felt a confession, what they felt stops changing.
 *
 * Rate limits: 10 retire / account / day; 30 remove_headline / account / day.
 * Separate counters — a writer tidying several headlines must not use up the
 * retires that take a confession out of the pool.
 *
 * Security:
 *   - Ownership verified server-side before any mutation.
 *   - account_id never returned to client.
 *   - Non-owner → 403 (not 404) to avoid oracle attacks.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';
import { verifyJwt } from '../_shared/auth.ts';

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

  const user = await verifyJwt(supabase, jwt);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  // ── Parse ─────────────────────────────────────────────────────────────────────
  let body: { confessionId?: string; action?: string };
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid request body.' }, 400); }

  const confessionId = body.confessionId?.trim() ?? '';
  const action       = body.action?.trim() ?? '';

  const ACTIONS = ['retire', 'remove_headline'] as const;
  type Action = typeof ACTIONS[number];

  if (!confessionId) return json({ error: 'confessionId is required.' }, 400);
  if (!ACTIONS.includes(action as Action)) {
    return json({ error: `Invalid action. Supported: ${ACTIONS.join(', ')}` }, 400);
  }

  // ── Rate limit, counted per action ────────────────────────────────────────────
  // Separate keys on purpose: removing headlines and retiring confessions are
  // different acts with very different consequences, and sharing one counter
  // would let a writer tidying headlines run out of the ability to take a
  // confession out of the pool.
  const LIMITS: Record<Action, { max: number; message: string }> = {
    retire: {
      max: 10,
      message: 'Daily limit reached. You can retire up to 10 confessions per day.',
    },
    remove_headline: {
      max: 30,
      message: 'Daily limit reached. You can remove up to 30 headlines per day.',
    },
  };
  const limit = LIMITS[action as Action];

  try {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('api_call_log')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', user.id)
      .eq('fn', `manage-confession:${action}`)
      .gte('called_at', dayAgo);

    if ((count ?? 0) >= limit.max) {
      return json({ error: limit.message }, 429);
    }

    supabase.from('api_call_log').insert({
      account_id: user.id,
      fn:         `manage-confession:${action}`,
      called_at:  new Date().toISOString(),
    }).catch(() => {});
  } catch {
    // Fail open — api_call_log may not exist yet
  }

  // ── Fetch confession ──────────────────────────────────────────────────────────
  const { data: confession, error: fetchErr } = await supabase
    .from('confessions')
    // real_felt_count is read ONLY to compute the sealing rule and is never
    // returned — same discipline as account_id (CLAUDE.md invariant 3).
    .select('id, status, account_id, author_token, real_felt_count')
    .eq('id', confessionId)
    .maybeSingle();

  if (fetchErr) {
    console.error('[manage-confession] fetch error:', fetchErr.message);
    return json({ error: 'Failed to load confession.' }, 500);
  }

  if (!confession) return json({ error: 'Confession not found.' }, 404);

  // ── Ownership check ───────────────────────────────────────────────────────────
  //
  // Moved ABOVE the already-retired short-circuit, which used to sit here and
  // answered `{ ok: true, already: true }` to anybody who asked about a
  // retired id — the oracle this file's own header says it avoids. Ownership
  // is now the first thing decided, for every action.
  let isOwner = false;

  if (confession.account_id === user.id) {
    isOwner = true;
  } else if (!confession.account_id && AUTHOR_TOKEN_SECRET) {
    const derivedToken = await hmacSha256(user.id, AUTHOR_TOKEN_SECRET);
    isOwner = derivedToken === confession.author_token;
  }

  if (!isOwner) return json({ error: 'Forbidden.' }, 403);

  // ── [H1] Remove headline ──────────────────────────────────────────────────────
  //
  // The writer's veto over which of their own words appear in bold above the
  // rest. Idempotent: clearing an already-null headline is a success, because
  // from the writer's side the outcome they asked for is the outcome they got.
  if (action === 'remove_headline') {
    /**
     * The sealing rule, and why it is the same one as editing.
     *
     * A headline is part of what a reader read. Once a real person has felt a
     * confession, the thing they felt stops changing — that is what
     * real_felt_count = 0 guards for edits, and a headline is no different:
     * removing it after the fact would quietly rewrite what somebody already
     * responded to.
     *
     * Enforced in the WHERE clause, not just in this check, so a felt landing
     * between the two is a no-op rather than a race.
     */
    if ((confession.real_felt_count ?? 0) > 0) {
      return json({ sealed: true }, 409);
    }

    const { data: cleared, error: clearErr } = await supabase
      .from('confessions')
      .update({ headline: null })
      .eq('id', confessionId)
      .eq('real_felt_count', 0)
      .select('id')
      .maybeSingle();

    if (clearErr) {
      console.error('[manage-confession] headline clear error:', clearErr.message);
      return json({ error: 'Failed to remove headline.' }, 500);
    }
    // 0 rows = a real felt arrived between the check above and this write.
    if (!cleared) return json({ sealed: true }, 409);

    // The id only. Never the headline, never the text.
    console.log('[manage-confession] headline removed confession_id:', confessionId);
    return json({ ok: true });
  }

  // ── Retire ────────────────────────────────────────────────────────────────────
  // The already-retired short-circuit lives here now rather than above the
  // ownership check, so it answers only the owner.
  if (confession.status === 'retired') {
    return json({ ok: true, already: true });
  }

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

  // ── Erase the recording ───────────────────────────────────────────────────────
  // "Retire" is what the DELETE button in the You tab calls. Whatever it is
  // named internally, the user pressed Delete — and a raw voice recording that
  // survives that is the promise in CLAUDE.md invariant 3 broken in the most
  // literal way available. A retired row is also unplayable forever
  // (get-audio-url signs only for live/approved), so the object is both a
  // retained voice and dead weight.
  //
  // EXCEPT under an active report: that recording is the evidence a human
  // reviewer needs, and audio-only harm is exactly what the text gate cannot
  // see. Same carve-out as the legal hold in dsar_delete_author_data, and the
  // row is already out of the pool either way.
  const { count: reportCount } = await supabase
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('confession_id', confessionId);

  let audioDeleted = false;

  if ((reportCount ?? 0) === 0) {
    const { data: key, error: keyErr } = await supabase.rpc('take_confession_audio_key', {
      p_confession_id: confessionId,
      p_account_id:    user.id,
    });

    if (keyErr) {
      console.error('[manage-confession] could not take audio key:', keyErr.message);
    } else if (typeof key === 'string' && key.length > 0) {
      const { error: rmErr } = await supabase.storage.from('confession-audio').remove([key]);
      if (rmErr) {
        // Loud, and names the key: the row no longer references it, so this is
        // now an orphan and orphaned_confession_audio is how it gets found.
        console.error(
          '[manage-confession] AUDIO ERASURE FAILED — recording remains after delete. Key:',
          key, '| Error:', rmErr.message,
        );
      } else {
        audioDeleted = true;
      }
    }
  } else {
    console.log(
      '[manage-confession] audio retained under active report, confession_id:', confessionId,
    );
  }

  console.log('[manage-confession] retired confession_id:', confessionId);
  return json({ ok: true, audio_deleted: audioDeleted });
});
