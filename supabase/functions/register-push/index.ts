/**
 * Edge Function: register-push
 *
 * [N1] Records a device that has just been granted notification permission,
 * and refreshes last_seen_at on later launches.
 *
 * ── account_id comes from the JWT, never from the body ──────────────────────
 * The one rule this function exists to hold. A client-supplied account_id
 * would let anybody register their own device against somebody else's
 * account and receive that person's felt notifications — which is both a
 * notification leak and, because a felt push is about a confession they
 * wrote, an authorship leak (CLAUDE.md #3).
 *
 * ── Actions ─────────────────────────────────────────────────────────────────
 *   register — upsert a token for this account
 *   seen     — refresh last_seen_at. Requests NOTHING; the app calls it at
 *              launch only when permission is already granted.
 *   remove   — sign-out. Drops this device's token, not the account's others.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';
import { requireUser } from '../_shared/auth.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** Expo's own token shapes. A malformed one would sit in the table forever. */
const TOKEN_RE = /^(ExponentPushToken\[[^\]]{1,64}\]|ExpoPushToken\[[^\]]{1,64}\])$/;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ error: 'Method not allowed.' }, 405);

  const user = await requireUser(supabase, req);
  if (!user) return json({ error: 'Unauthorized.' }, 401);

  let body: { token?: string; platform?: string; tz?: string; action?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid body.' }, 400); }

  const action = body.action ?? 'register';
  const token  = String(body.token ?? '').trim();

  if (!TOKEN_RE.test(token)) return json({ error: 'Invalid token.' }, 400);

  if (action === 'remove') {
    // Scoped to the account as well as the token: without the account_id
    // clause, knowing somebody's token would be enough to unsubscribe them.
    await supabase.from('push_devices')
      .delete().eq('expo_token', token).eq('account_id', user.id);
    return json({ ok: true });
  }

  if (action === 'seen') {
    await supabase.from('push_devices')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('expo_token', token).eq('account_id', user.id);
    return json({ ok: true });
  }

  const platform = body.platform === 'ios' ? 'ios' : 'android';
  // IANA-shaped only. A junk string here breaks quiet hours for that device,
  // and the failure would be invisible until somebody is woken at 3am.
  const rawTz = String(body.tz ?? '').trim();
  const tz    = /^[A-Za-z_]+\/[A-Za-z0-9_+\-\/]+$|^UTC$/.test(rawTz) ? rawTz : 'UTC';

  const { error } = await supabase.from('push_devices').upsert({
    account_id:   user.id,
    expo_token:   token,
    platform,
    tz,
    last_seen_at: new Date().toISOString(),
    // A re-register after a reinstall revives a token disabled by a
    // DeviceNotRegistered receipt.
    disabled_at:  null,
  }, { onConflict: 'expo_token' });

  if (error) {
    console.error('[register-push] upsert failed:', error.message);
    return json({ error: 'Could not register.' }, 500);
  }

  // Counts only — never the token, never the account.
  console.log(`[register-push] registered platform=${platform}`);
  return json({ ok: true });
});
