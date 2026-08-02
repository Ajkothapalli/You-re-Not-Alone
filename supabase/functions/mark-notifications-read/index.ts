/**
 * Edge Function: mark-notifications-read
 *
 * Marks the caller's notifications as read.
 *
 * Body:
 *   { ids: string[] }  — mark specific IDs read
 *   { ids: [] }        — mark ALL unread as read
 *
 * Only marks rows belonging to the authenticated user (enforced
 * server-side via account_id — never trusts client-supplied account_id).
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

  // Auth
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return json({ error: 'Unauthorized' }, 401);

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  let body: { ids?: string[] } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  const ids = Array.isArray(body.ids) ? body.ids : [];
  const now = new Date().toISOString();

  try {
    if (ids.length === 0) {
      // Mark all unread as read for this account
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('account_id', user.id)
        .is('read_at', null);

      if (error) throw error;
    } else {
      // Mark specific IDs as read, scoped to this account
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('account_id', user.id)
        .in('id', ids);

      if (error) throw error;
    }

    return json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[mark-notifications-read] error:', msg);
    return json({ error: msg }, 500);
  }
});
