/**
 * Edge Function: process-referrals  (service-only, scheduled)
 *
 * Walks pending referrals once a day and decides whether each inviter has
 * earned their thank-you week. Never called by the app; guarded by a shared
 * secret, exactly like push-daily-stories.
 *
 * ── What this function is NOT allowed to know ───────────────────────────────
 * The criteria touch a confession the INVITEE wrote. This function must never
 * be able to hand any of that back to the inviter, so it does not evaluate
 * them itself: it calls referral_reward_due(referral_id), a SECURITY DEFINER
 * SQL function that returns ONE BOOLEAN. No confession id, no text, no
 * timestamp crosses back over. Nothing about the invitee is logged here, and
 * the notification the inviter receives mentions neither writing, nor felts,
 * nor when anything happened — because timing alone would leak that a
 * specific person wrote something (CLAUDE.md #3).
 *
 * ── Rewards fail CLOSED ─────────────────────────────────────────────────────
 * A referral that cannot be evaluated stays pending forever rather than being
 * granted. That is the opposite of the substance gate's fail-open stance, and
 * deliberately so: a false negative here costs someone a free week, while a
 * false positive is a reward programme that can be farmed.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET          = Deno.env.get('SEED_CRON_SECRET') ?? '';
const REVENUECAT_SECRET    = Deno.env.get('REVENUECAT_SECRET_KEY') ?? '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const SEC = {
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control':          'no-store',
};

const REWARD_DAYS = 7;
/** Bounded so one run cannot stall on a large backlog. */
const BATCH = 200;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...SEC, 'Content-Type': 'application/json' },
  });
}

/** Same fail-closed grant as claim-invite. Nothing local without RevenueCat. */
async function grantPremiumDays(accountId: string, days: number): Promise<boolean> {
  if (!REVENUECAT_SECRET) {
    console.error('[REFERRAL] REVENUECAT_SECRET_KEY not set — granting nothing');
    return false;
  }
  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(accountId)}` +
      `/entitlements/premium/promotional`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${REVENUECAT_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ duration: 'weekly' }),
      },
    );
    if (!res.ok) {
      console.error(`[REFERRAL] RevenueCat grant failed: ${res.status}`);
      return false;
    }
    const expires = new Date(Date.now() + days * 86_400_000).toISOString();
    const { error } = await supabase.from('entitlements').upsert(
      {
        account_id: accountId,
        is_premium: true,
        product_id: 'referral_thank_you_week',
        expires_at: expires,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id' },
    );
    return !error;
  } catch {
    console.error('[REFERRAL] RevenueCat grant threw');
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  /**
   * Service-only, authenticated exactly like push-daily-stories.
   *
   * The secret travels in its OWN header, not in Authorization. Supabase's
   * gateway verifies Authorization as a JWT before the function runs, so a
   * bare secret there is rejected upstream and never reaches this code — the
   * scheduler sends the anon key there to get through the door, and the real
   * credential in x-cron-secret.
   */
  const provided = req.headers.get('x-cron-secret') ?? '';
  const accepted = [CRON_SECRET, SUPABASE_SERVICE_KEY].filter(Boolean);
  if (!provided || !accepted.includes(provided)) {
    return json({ error: 'unauthorized' }, 401);
  }

  const { data: pending, error } = await supabase
    .from('referrals')
    .select('id, inviter_account')
    .eq('status', 'pending')
    .order('claimed_at', { ascending: true })
    .limit(BATCH);

  if (error) {
    console.error('[REFERRAL] could not read pending referrals');
    return json({ error: 'read_failed' }, 500);
  }

  let rewarded = 0, capped = 0, waiting = 0, failed = 0;

  for (const r of pending ?? []) {
    // ONE BOOLEAN. See the header.
    const { data: due, error: dueErr } = await supabase
      .rpc('referral_reward_due', { p_referral_id: r.id });

    if (dueErr) { failed++; continue; }        // stays pending, retried tomorrow
    if (due !== true) { waiting++; continue; }

    const { data: isCapped } = await supabase
      .rpc('referral_cap_reached', { p_inviter: r.inviter_account });

    if (isCapped === true) {
      await supabase.from('referrals')
        .update({ status: 'capped' })
        .eq('id', r.id).eq('status', 'pending');
      capped++;
      continue;
    }

    const granted = await grantPremiumDays(r.inviter_account, REWARD_DAYS);
    if (!granted) { failed++; continue; }      // stays pending; retried tomorrow

    // Guarded on status so a concurrent run cannot reward twice.
    const { data: updated } = await supabase.from('referrals')
      .update({ status: 'rewarded', rewarded_at: new Date().toISOString() })
      .eq('id', r.id).eq('status', 'pending')
      .select('id');

    if (!updated?.length) continue;

    // Says nothing about writing, felts, or when. See the header.
    await supabase.from('notifications').insert({
      account_id: r.inviter_account,
      type:       'referral_reward',
      data:       { days: REWARD_DAYS },
    });

    rewarded++;
  }

  // Counts only — no ids of any kind.
  console.log(`[REFERRAL] rewarded=${rewarded} capped=${capped} waiting=${waiting} failed=${failed}`);
  return json({ rewarded, capped, waiting, failed });
});
