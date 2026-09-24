/**
 * Edge Function: create-audio-upload
 *
 * Issues a short-lived SIGNED UPLOAD url for a voice confession's audio, and
 * records the object key on the row.
 *
 * ── Why this exists as a separate step ──────────────────────────────────────
 * CLAUDE.md invariant 1: the safety gate runs on every submission BEFORE
 * anything is stored. Audio obeys that too, which means the order is fixed and
 * this function is the enforcement point:
 *
 *   1. text (+ raw transcript) → submit-confession → moderation + crisis
 *   2. row exists, status live                     → confession id returned
 *   3. ONLY THEN → this function → signed upload url
 *   4. client PUTs the MP3
 *
 * There is no path that uploads first. A caller with no confession id has
 * nothing to attach audio to, and a caller whose text was blocked never
 * received one. Crisis submissions return no id either, so crisis audio cannot
 * be uploaded even by a client that tried — and the client deletes the local
 * file on that path (CLAUDE.md invariant 6: nothing on the crisis path is
 * stored, ever).
 *
 * ── The object key ──────────────────────────────────────────────────────────
 * Random UUID. NOT derived from account_id, author_token, or the confession id.
 * A key that encoded any of those would let anyone holding one URL enumerate or
 * correlate recordings, and for raw voice that is an identity leak, not a
 * metadata leak (invariant 3).
 *
 * The bucket is private with no permissive RLS policy, so the signed URL is the
 * only way in and it expires. There is no permanent URL for anyone's voice.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BUCKET          = 'confession-audio';
/** Long enough for a slow upload on a poor connection, short enough to be useless if leaked. */
const UPLOAD_TTL_SECS = 300;
const MAX_DURATION_MS = 180_000;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: { user }, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

    let body: { confessionId?: string; durationMs?: number; waveform?: unknown[] };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid request body.' }, 400);
    }

    const confessionId = body.confessionId ?? '';
    const durationMs   = Number(body.durationMs ?? 0);
    const rawWaveform  = body.waveform;

    if (!confessionId) return json({ error: 'Missing confessionId.' }, 400);
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_DURATION_MS) {
      return json({ error: 'Invalid duration.' }, 400);
    }

    // ── Ownership + state check ───────────────────────────────────────────────
    // Service role bypasses RLS, so ownership is verified explicitly here. This
    // is the check that stops one account attaching audio to another's
    // confession — which for raw voice would mean putting someone's recording
    // under a stranger's words.
    const { data: row, error: rowErr } = await supabase
      .from('confessions')
      .select('id, account_id, status, audio_key')
      .eq('id', confessionId)
      .maybeSingle();

    if (rowErr)  return json({ error: 'Lookup failed.' }, 500);
    if (!row)    return json({ error: 'No such confession.' }, 404);

    if (row.account_id !== user.id) {
      // Deliberately the same shape as "not found": a caller probing ids should
      // not learn which ones exist.
      return json({ error: 'No such confession.' }, 404);
    }

    // The row must already have passed the gate. 'live'/'approved' is what
    // submit-confession writes after moderation and the crisis check; anything
    // else means the text did not clear, and audio must not be attached to it.
    if (row.status !== 'live' && row.status !== 'approved') {
      return json({ error: 'This confession is not accepting audio.' }, 409);
    }

    // One recording per confession. A second upload would orphan the first —
    // the old object would stay in the bucket with nothing pointing at it.
    if (row.audio_key) {
      return json({ error: 'Audio already attached.' }, 409);
    }

    // ── Random object key ─────────────────────────────────────────────────────
    const key = `voice/${crypto.randomUUID()}.mp3`;

    const { data: signed, error: signErr } = await supabase
      .storage
      .from(BUCKET)
      .createSignedUploadUrl(key, { upsert: false });

    if (signErr || !signed) {
      console.error('[create-audio-upload] signing failed:', signErr?.message);
      return json({ error: 'Could not prepare upload.' }, 500);
    }

    // Recorded BEFORE the client uploads, on purpose. If the write succeeded and
    // the upload then failed, the row points at an object that does not exist —
    // playback degrades to "audio unavailable", which is recoverable and
    // visible. The reverse (upload succeeds, row write fails) leaves a
    // recording in the bucket that nothing references and nothing will ever
    // delete: a voice that outlives its confession. orphaned_confession_audio
    // exists to catch that; this ordering is what makes it rare.
    // Sanitised here, not trusted from the client: the column is bounded by a
    // CHECK, and a bad array would fail the whole attach and cost the writer
    // their recording. Clamp to 0..100 ints, cap the length, drop anything that
    // is not a finite number.
    const waveform = Array.isArray(rawWaveform)
      ? rawWaveform
          .slice(0, 64)
          .map((n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n)))))
          .filter((n: number) => Number.isFinite(n))
      : [];

    const { error: updateErr } = await supabase
      .from('confessions')
      .update({
        audio_key:         key,
        audio_duration_ms: Math.round(durationMs),
        ...(waveform.length > 0 ? { audio_waveform: waveform } : {}),
      })
      .eq('id', confessionId)
      .eq('account_id', user.id);

    if (updateErr) {
      console.error('[create-audio-upload] row update failed:', updateErr.message);
      return json({ error: 'Could not prepare upload.' }, 500);
    }

    // `token` is what the client passes to uploadToSignedUrl. The KEY is
    // returned only so the client can address that call — it is scoped to this
    // upload and useless afterwards, since reads need a separate signed URL.
    return json({
      path:      signed.path,
      token:     signed.token,
      expiresIn: UPLOAD_TTL_SECS,
    });
  } catch (err) {
    console.error('[create-audio-upload] unhandled:', err);
    return json({ error: 'Unexpected error.' }, 500);
  }
});
