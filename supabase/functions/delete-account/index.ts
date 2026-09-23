/**
 * Edge Function: delete-account
 *
 * Executes a verified DSAR (Data Subject Access Request) account deletion.
 * Two modes (sent as `mode` in request body):
 *
 *   "erase" (default) — confessions without active reports are hard-deleted.
 *     Confessions with reports are anonymized (account_id = NULL, text = '[deleted]',
 *     status = 'removed', then aged out by purge_expired_data). The accounts row
 *     and all device/reader data are deleted. Auth identity is deleted.
 *
 *   "anonymize" — all confessions stay live in the pool but account_id is NULLed
 *     on every row, severing the identity link permanently. Reader data, devices,
 *     and the accounts row are deleted. Confessions live on as truly anonymous posts.
 *
 * Either path leaves no account link on any confession row. The user's public
 * writing lives on (anonymize) or disappears (erase).
 *
 * EXCEPTIONS — data never deleted:
 *   - crisis_events: stored without account linkage; unattributable per DSAR.
 *   - CSAM reports filed with NCMEC: retained under legal obligation.
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
};

async function hmacSha256(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Erase the actual recordings.
 *
 * The DSAR SQL functions clear the rows and hand back the keys; they cannot
 * touch storage. CLAUDE.md invariant 3 promises erasure, and for raw voice an
 * orphaned object is not a stale file — it is the person's voice, still on
 * disk, after they asked for it to be gone.
 *
 * Failures are logged LOUDLY with the individual keys rather than swallowed:
 * orphaned_confession_audio exists to surface exactly this, and somebody has to
 * be able to find them. Account deletion still proceeds — refusing to delete an
 * account because a file delete failed would trap the user the other way.
 */
async function eraseAudioObjects(keys: unknown): Promise<{ deleted: number; failed: string[] }> {
  const list = Array.isArray(keys)
    ? keys.filter((k): k is string => typeof k === 'string' && k.length > 0)
    : [];
  if (list.length === 0) return { deleted: 0, failed: [] };

  const { data, error } = await supabase.storage.from('confession-audio').remove(list);

  if (error) {
    console.error(
      '[delete-account] AUDIO ERASURE FAILED — recordings remain in the bucket after an ' +
      'erasure request. Keys:', list.join(', '), '| Error:', error.message,
    );
    return { deleted: 0, failed: list };
  }

  const removed = Array.isArray(data) ? data.map((d: { name: string }) => d.name) : [];
  const missed  = list.filter((k) => !removed.includes(k));
  if (missed.length > 0) {
    console.error(
      '[delete-account] AUDIO ERASURE INCOMPLETE — storage did not confirm removal of:',
      missed.join(', '),
    );
  }
  return { deleted: removed.length, failed: missed };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status:  405,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  // ── Auth ──────────────────────────────────────────────────────────────────────
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return json({ error: 'Unauthorized' }, 401);

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  // ── Explicit confirmation required ────────────────────────────────────────────
  let body: { confirm?: string; mode?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  if (body.confirm !== 'DELETE') {
    return json(
      { error: 'confirmation_required', message: 'Send {"confirm":"DELETE"} to proceed.' },
      400,
    );
  }

  // mode defaults to "erase" if omitted or invalid
  const mode: 'erase' | 'anonymize' =
    body.mode === 'anonymize' ? 'anonymize' : 'erase';

  try {
    if (!AUTHOR_TOKEN_SECRET) throw new Error('AUTHOR_TOKEN_SECRET not set');
    const authorToken = await hmacSha256(user.id, AUTHOR_TOKEN_SECRET);

    if (mode === 'anonymize') {
      // ── Anonymize path ──────────────────────────────────────────────────────
      // Confessions stay live; account_id is NULLed on every authored row.
      const { data: rows, error: rpcError } = await supabase.rpc('dsar_anonymize_author', {
        target_token:   authorToken,
        target_account: user.id,
      });

      if (rpcError) throw rpcError;

      const counts = Array.isArray(rows) ? rows[0] : rows;

      // Delete Supabase Auth identity
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(user.id);
      if (authDeleteError) {
        console.error(
          '[delete-account] Auth user deletion failed (anonymize path) after data was anonymized.',
          'Manual cleanup required: auth.users id =', user.id,
          '| Error:', authDeleteError.message,
        );
      }

      // Anonymize STRIPS the audio (migration 20260923000002): a raw voice
      // cannot be anonymised, so keeping it would give the user none of the
      // protection they chose this option for.
      const anonAudio = await eraseAudioObjects(counts?.deleted_audio_keys);

      return json({
        ok:                     true,
        mode:                   'anonymize',
        anonymized_confessions: counts?.anonymized_confessions ?? 0,
        deleted_devices:        counts?.deleted_devices        ?? 0,
        deleted_audio:          anonAudio.deleted,
      });

    } else {
      // ── Erase path (default) ────────────────────────────────────────────────
      // Hard-deletes confessions where possible; NULLs account_id + marks removed
      // on legal-hold rows.
      const { data: rows, error: rpcError } = await supabase.rpc('dsar_delete_author_data', {
        target_token:   authorToken,
        target_account: user.id,
      });

      if (rpcError) throw rpcError;

      const counts = Array.isArray(rows) ? rows[0] : rows;

      // Delete Supabase Auth identity
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(user.id);
      if (authDeleteError) {
        console.error(
          '[delete-account] Auth user deletion failed (erase path) after data deletion was completed.',
          'Manual cleanup required: auth.users id =', user.id,
          '| Error:', authDeleteError.message,
        );
      }

      // Erasure is not complete until the recordings are gone, not just the rows.
      const eraseAudio = await eraseAudioObjects(counts?.deleted_audio_keys);

      return json({
        ok:                  true,
        mode:                'erase',
        deleted_audio:       eraseAudio.deleted,
        deleted_confessions: counts?.deleted_confessions ?? 0,
        held_confessions:    counts?.held_confessions    ?? 0,
        deleted_matches:     counts?.deleted_matches     ?? 0,
        deleted_devices:     counts?.deleted_devices     ?? 0,
      });
    }

  } catch (err) {
    console.error('[delete-account] unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
