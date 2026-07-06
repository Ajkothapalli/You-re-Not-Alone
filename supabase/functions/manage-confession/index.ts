/**
 * Edge Function: manage-confession
 *
 * Allows the authenticated user to manage their own confessions.
 * Ownership check: account_id === auth.uid() (primary path for confessions
 * submitted after the account-linked migration). Legacy confessions (account_id IS NULL)
 * fall back to HMAC author_token comparison.
 *
 * Actions:
 *   remove — soft-deletes the confession (status → 'removed'). The row is retained
 *            for legal-hold purposes and hard-deleted by the daily purge after
 *            all active reports age out.
 *
 * Security:
 *   - Ownership is verified server-side before any mutation.
 *   - account_id is never returned to the client.
 *   - Non-owner attempts receive 403 (not 404) to avoid oracle attacks.
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

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, ...SEC, 'Content-Type': 'application/json' },
    });

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  // ── Auth ──────────────────────────────────────────────────────────────────────
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return json({ error: 'Unauthorized' }, 401);

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  // ── Parse request ─────────────────────────────────────────────────────────────
  let body: { confessionId?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const confessionId = body.confessionId?.trim() ?? '';
  const action       = body.action?.trim() ?? '';

  if (!confessionId) return json({ error: 'confessionId is required.' }, 400);
  if (action !== 'remove') return json({ error: 'Invalid action. Supported: remove' }, 400);

  // ── Fetch confession (service role — see full row including account_id) ────────
  const { data: confession, error: fetchErr } = await supabase
    .from('confessions')
    .select('id, status, account_id, author_token')
    .eq('id', confessionId)
    .maybeSingle();

  if (fetchErr) {
    console.error('[manage-confession] fetch error:', fetchErr.message);
    return json({ error: 'Failed to load confession.' }, 500);
  }

  if (!confession) {
    return json({ error: 'Confession not found.' }, 404);
  }

  // Already removed
  if (confession.status === 'removed') {
    return json({ ok: true, already: true });
  }

  // ── Ownership check ────────────────────────────────────────────────────────────
  // Primary: account_id match (new confessions)
  // Fallback: HMAC author_token match (legacy confessions where account_id IS NULL)
  let isOwner = false;

  if (confession.account_id === user.id) {
    isOwner = true;
  } else if (!confession.account_id && AUTHOR_TOKEN_SECRET) {
    // Legacy path: derive HMAC and compare
    const derivedToken = await hmacSha256(user.id, AUTHOR_TOKEN_SECRET);
    isOwner = derivedToken === confession.author_token;
  }

  if (!isOwner) {
    return json({ error: 'Forbidden.' }, 403);
  }

  // ── Remove action ─────────────────────────────────────────────────────────────
  // Soft-delete: set status to 'removed'. The confession is immediately hidden
  // from confessions_public, match_confession, and recommend_confessions.
  // Hard-delete happens automatically via the daily purge once reports age out.
  const { error: updateErr } = await supabase
    .from('confessions')
    .update({ status: 'removed' })
    .eq('id', confessionId);

  if (updateErr) {
    console.error('[manage-confession] update error:', updateErr.message);
    return json({ error: 'Failed to remove confession.' }, 500);
  }

  console.log('[manage-confession] removed confession_id:', confessionId);
  return json({ ok: true });
});
