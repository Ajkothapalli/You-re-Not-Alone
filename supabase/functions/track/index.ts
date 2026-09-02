/**
 * Edge Function: track
 *
 * Receives anonymous funnel telemetry fired by the share landing page
 * (navigator.sendBeacon) and the app's install_attributed callback.
 *
 * Writes ONE row to growth_events per valid event.
 * No auth required — this is a write-only, no-PII endpoint.
 * Rate limiting: 1 000 rows/minute from a single IP via Supabase's built-in
 * edge function rate limiting; source validation is the only content gate.
 *
 * Payload shape:
 *   { event: 'share_click' | 'install_attributed', source: 'match' | 'rtue' | 'read' }
 *
 * Privacy invariants:
 *   - No account_id, no confession_id, no user IP stored.
 *   - source is validated against the allowlist — arbitrary strings are dropped.
 *   - If the payload is malformed, we return 200 (beacon doesn't retry).
 */

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase             = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const VALID_TYPES   = new Set(['share_click', 'install_attributed']);
const VALID_SOURCES = new Set(['match', 'rtue', 'read', 'unknown']);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'content-type',
};

serve(async (req) => {
  // Preflight (browsers send OPTIONS before the actual beacon POST)
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    // sendBeacon may send as text/plain; attempt URL-encoded too
    try {
      const text = await req.text();
      body = Object.fromEntries(new URLSearchParams(text));
    } catch {
      return new Response('OK', { status: 200, headers: CORS });
    }
  }

  const type   = typeof body?.event  === 'string' ? body.event   : null;
  const source = typeof body?.source === 'string' ? body.source  : 'unknown';

  // Drop unknown types silently — don't error (beacon is fire-and-forget)
  if (!type || !VALID_TYPES.has(type)) {
    return new Response('OK', { status: 200, headers: CORS });
  }

  const safeSource = VALID_SOURCES.has(source) ? source : 'unknown';

  const { error } = await supabase
    .from('growth_events')
    .insert({ type, source: safeSource });

  if (error) {
    console.error('[track] insert failed:', error.message);
    // Still return 200 — beacon doesn't care
  }

  return new Response('OK', { status: 200, headers: CORS });
});
