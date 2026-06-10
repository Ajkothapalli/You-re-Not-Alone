/**
 * Edge Function: delete-account
 *
 * Executes a verified DSAR (Data Subject Access Request) account deletion.
 * Re-derives the author_token via HMAC (same derivation as submit-confession)
 * and calls dsar_delete_author_data() to remove all attributable data.
 *
 * EXCEPTIONS — data not deleted by this function:
 *   - crisis_events: stored without account linkage and are therefore
 *     unattributable. Cannot be found or deleted per DSAR.
 *   - Authored confessions with active reports: set to 'removed' (legal hold).
 *     Hidden immediately; purge_expired_data() hard-deletes them once the
 *     reports age out (365-day retention period).
 *   - CSAM reports filed with NCMEC: retained under legal obligation. Never deleted.
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
  let body: { confirm?: string };
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

  try {
    // ── Derive author_token ────────────────────────────────────────────────────
    if (!AUTHOR_TOKEN_SECRET) throw new Error('AUTHOR_TOKEN_SECRET not set');
    const authorToken = await hmacSha256(user.id, AUTHOR_TOKEN_SECRET);

    // ── Execute DSAR deletion ──────────────────────────────────────────────────
    const { data: rows, error: rpcError } = await supabase.rpc('dsar_delete_author_data', {
      target_token:   authorToken,
      target_account: user.id,
    });

    if (rpcError) throw rpcError;

    // rpc() with RETURNS TABLE returns an array; our function returns one row.
    const counts = Array.isArray(rows) ? rows[0] : rows;

    // ── Delete from Supabase Auth ──────────────────────────────────────────────
    // The accounts row is already gone (deleted inside dsar_delete_author_data).
    // If this fails, the data deletion succeeded but the auth identity remains.
    // Manual cleanup is required — see the console.error log below.
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(user.id);
    if (authDeleteError) {
      console.error(
        '[delete-account] Auth user deletion failed after data deletion was completed.',
        'Manual cleanup required: auth.users id =', user.id,
        '| Error:', authDeleteError.message,
      );
    }

    return json({
      ok:                  true,
      deleted_confessions: counts?.deleted_confessions ?? 0,
      held_confessions:    counts?.held_confessions    ?? 0,
      deleted_matches:     counts?.deleted_matches     ?? 0,
      deleted_devices:     counts?.deleted_devices     ?? 0,
    });

  } catch (err) {
    console.error('[delete-account] unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
