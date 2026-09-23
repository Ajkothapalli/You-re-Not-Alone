/**
 * Edge Function: get-audio-url
 *
 * Returns a short-lived signed URL for one confession's audio.
 *
 * ── Why playback needs a round trip ─────────────────────────────────────────
 * The obvious design — put the object key in confessions_public and let the
 * client build a URL — is the one CLAUDE.md invariant 3 forbids. `audio_key` is
 * revoked at column level and absent from the view precisely so that no client
 * ever holds a durable handle on someone's voice. A permanent URL would be
 * shareable outside the app, indefinitely, by anyone who once saw one card.
 *
 * So the key stays server-side and the client asks each time. The cost is one
 * request before playback; what it buys is that every link to a recording
 * expires, and nothing in the client can be scraped for a list of them.
 *
 * ── What this deliberately does NOT check ───────────────────────────────────
 * Ownership. Any signed-in adult may play any live confession — that is what
 * the feed IS. The read allowance (lib/readAllowance.ts) governs how much
 * someone may consume, and it is enforced client-side by design; a voice
 * confession costs exactly one read, the same as a typed one, and that is
 * counted when the card is opened, not here.
 *
 * What IS checked: the confession is live. Removed, retired and under-review
 * rows return nothing, so audio pulled out of the feed by a report stops being
 * playable immediately rather than lingering behind a URL someone already has.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BUCKET = 'confession-audio';

/**
 * 10 minutes. Long enough to play a 3-minute recording, pause, and resume;
 * short enough that a URL captured from the network is dead before it is
 * useful to anyone. Not "long enough to be convenient" — this is a person's
 * voice, and the expiry is the only thing limiting how far a leaked link
 * travels.
 */
const PLAYBACK_TTL_SECS = 600;

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

    // Banned accounts do not get to keep listening.
    const { data: account } = await supabase
      .from('accounts')
      .select('banned')
      .eq('id', user.id)
      .maybeSingle();
    if (account?.banned) return json({ error: 'Forbidden' }, 403);

    let body: { confessionId?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid request body.' }, 400);
    }

    const confessionId = body.confessionId ?? '';
    if (!confessionId) return json({ error: 'Missing confessionId.' }, 400);

    const { data: row, error: rowErr } = await supabase
      .from('confessions')
      .select('id, audio_key, status')
      .eq('id', confessionId)
      .maybeSingle();

    if (rowErr) return json({ error: 'Lookup failed.' }, 500);

    // One response shape for "no such confession", "not live" and "no audio".
    // A caller should not be able to distinguish them: the differences would
    // let someone map which confessions carry a recording and which ids exist.
    if (!row || !row.audio_key || (row.status !== 'live' && row.status !== 'approved')) {
      return json({ error: 'No audio available.' }, 404);
    }

    const { data: signed, error: signErr } = await supabase
      .storage
      .from(BUCKET)
      .createSignedUrl(row.audio_key, PLAYBACK_TTL_SECS);

    if (signErr || !signed?.signedUrl) {
      console.error('[get-audio-url] signing failed:', signErr?.message);
      return json({ error: 'No audio available.' }, 404);
    }

    // The KEY is never returned — only the time-limited URL built from it.
    return json({ url: signed.signedUrl, expiresIn: PLAYBACK_TTL_SECS });
  } catch (err) {
    console.error('[get-audio-url] unhandled:', err);
    return json({ error: 'Unexpected error.' }, 500);
  }
});
