/**
 * Edge Function: update-push-prefs
 *
 * [N1] The Settings toggles: master on/off, Felt, Weekly question, Quiet
 * hours, Discreet.
 *
 * Every write is scoped to the caller's own account_id, taken from the JWT.
 * The master switch is not a column — turning it off deletes this account's
 * tokens, so the server stops having anywhere to send. A boolean would
 * leave a live token on a device belonging to somebody who has said no, and
 * one bug away from using it.
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

/** Only these, and only booleans. Nothing else may be written from a client. */
const TOGGLES = ['felt_on', 'question_on', 'quiet_hours', 'discreet'] as const;
type Toggle = typeof TOGGLES[number];

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ error: 'Method not allowed.' }, 405);

  const user = await requireUser(supabase, req);
  if (!user) return json({ error: 'Unauthorized.' }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid body.' }, 400); }

  // ── Master off: remove the tokens rather than setting a flag ──────────────
  if (body.master === false) {
    await supabase.from('push_devices').delete().eq('account_id', user.id);
    console.log('[push-prefs] master off');
    return json({ ok: true, devices: 0 });
  }

  // Whitelisted, not filtered: a field this loop does not name cannot be
  // written, however it arrives.
  const patch: Partial<Record<Toggle, boolean>> = {};
  for (const key of TOGGLES) {
    if (typeof body[key] === 'boolean') patch[key] = body[key] as boolean;
  }
  if (Object.keys(patch).length === 0) return json({ error: 'Nothing to update.' }, 400);

  const { data, error } = await supabase.from('push_devices')
    .update(patch)
    .eq('account_id', user.id)
    .select('id');

  if (error) {
    console.error('[push-prefs] update failed:', error.message);
    return json({ error: 'Could not save.' }, 500);
  }

  // The setting NAMES only — never which account, never the values.
  console.log(`[push-prefs] updated ${Object.keys(patch).join(',')} devices=${data?.length ?? 0}`);
  return json({ ok: true, devices: data?.length ?? 0 });
});
