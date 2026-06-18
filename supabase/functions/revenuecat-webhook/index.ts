/**
 * Edge Function: revenuecat-webhook
 *
 * Receives RevenueCat webhook events and writes premium status to the
 * `entitlements` table so the SERVER (not just the client) knows who is
 * premium. This is what makes the reading paywall non-bypassable.
 *
 * RevenueCat dashboard → Integrations → Webhooks:
 *   URL:    https://<project>.functions.supabase.co/revenuecat-webhook
 *   Header: Authorization: Bearer <RC_WEBHOOK_SECRET>   (you choose this)
 * Set the same value as the RC_WEBHOOK_SECRET function secret.
 *
 * The event's app_user_id is the Supabase auth uid (we configure
 * Purchases with appUserID = user.id), so it maps directly to account_id.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RC_WEBHOOK_SECRET    = Deno.env.get('RC_WEBHOOK_SECRET') ?? '';
const supabase             = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const ENTITLEMENT = 'premium';

// Events that mean the user currently has access.
const ACTIVE = new Set([
  'INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION',
  'NON_RENEWING_PURCHASE', 'SUBSCRIPTION_EXTENDED', 'PRODUCT_CHANGE',
]);
// Events that revoke access.
const INACTIVE = new Set(['EXPIRATION', 'CANCELLATION', 'BILLING_ISSUE', 'SUBSCRIPTION_PAUSED']);

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // Shared-secret auth — reject anything not from our RevenueCat webhook.
  const auth = req.headers.get('Authorization') ?? '';
  if (!RC_WEBHOOK_SECRET || auth !== `Bearer ${RC_WEBHOOK_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { return new Response('Bad JSON', { status: 400 }); }

  const event   = body?.event;
  const type    = event?.type as string | undefined;
  const userId  = event?.app_user_id as string | undefined;
  if (!type || !userId) return new Response('Ignored', { status: 200 });

  // Trust the entitlement state in the event when present; else infer from type.
  const entActive: boolean =
    event?.entitlement_ids?.includes(ENTITLEMENT) ?? ACTIVE.has(type);
  const isPremium = ACTIVE.has(type) ? true : INACTIVE.has(type) ? false : entActive;

  const expiresAt = event?.expiration_at_ms
    ? new Date(event.expiration_at_ms).toISOString()
    : null;

  const { error } = await supabase.from('entitlements').upsert(
    {
      account_id: userId,
      is_premium: isPremium,
      product_id: event?.product_id ?? null,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'account_id' },
  );

  if (error) {
    console.error('[revenuecat-webhook] upsert failed:', error.message);
    return new Response('DB error', { status: 500 });
  }
  return new Response('OK', { status: 200 });
});
