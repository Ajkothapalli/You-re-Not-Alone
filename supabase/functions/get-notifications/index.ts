/**
 * Edge Function: get-notifications
 *
 * Returns the authenticated user's in-app notifications, newest-first.
 * Also returns an unread count (rows where read_at IS NULL).
 *
 * Identity invariants (CLAUDE.md §2/#3):
 *   - account_id used server-side only; never returned to client.
 *   - Notification data never reveals another user's identity.
 *   - No reply surface, no feeler identity, no author linkage.
 *
 * Returns at most LIMIT notifications. Service-role bypasses RLS;
 * we still filter by account_id derived from the verified JWT.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const SEC = {
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control':          'no-store',
  'Referrer-Policy':        'same-origin',
};

const LIMIT = 50;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, ...SEC, 'Content-Type': 'application/json' },
    });

  if (req.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);

  // Auth
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return json({ error: 'Unauthorized' }, 401);

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  try {
    const { data: rows, error: queryErr } = await supabase
      .from('notifications')
      .select('id, type, confession_id, data, read_at, created_at')
      .eq('account_id', user.id)   // server-side filter; account_id not returned
      .order('created_at', { ascending: false })
      .limit(LIMIT);

    if (queryErr) {
      console.error('[get-notifications] query error:', queryErr.message);
      return json({ error: 'Failed to load notifications.' }, 500);
    }

    const notifications = rows ?? [];
    const unreadCount   = notifications.filter((n: { read_at: string | null }) => !n.read_at).length;

    return json({ notifications, unreadCount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[get-notifications] error:', msg);
    return json({ error: msg }, 500);
  }
});
