/**
 * Edge Function: claim-invite
 *
 * Called once, after sign-in, when the app is holding a pending invite token
 * from the install referrer. Grants the INVITEE seven days of unlimited
 * reading. The inviter gets nothing here — their thank-you week is decided
 * later, by process-referrals, on evidence this function cannot see.
 *
 * ── Rejections are silent ───────────────────────────────────────────────────
 * Every rejection returns 200 with { claimed: false }. The reason is stored
 * server-side for the dashboard and NEVER shown to the user. Telling someone
 * "you already claimed on this device" or "that was your own link" hands a
 * fraud probe a free oracle, and tells an innocent person they did something
 * wrong when they merely reinstalled. They simply do not get a gift week.
 *
 * ── The device fingerprint, and why it is not the usual device hash ─────────
 * `computeDeviceHash` elsewhere in this project hashes
 * `accountId:user-agent:ip`. That is correct for rate limiting — it is
 * per-account by design — but it is USELESS for the two checks this function
 * needs, because two accounts on one phone produce two different hashes. The
 * "same device as the inviter" and "this device already claimed" checks would
 * both be permanent no-ops, i.e. security theatre.
 *
 * So this uses an account-INDEPENDENT fingerprint: HMAC('referral:ua:ip').
 * It is deliberately coarse and it is the best signal available server-side
 * without a device identifier we do not collect. Its known weakness is stated
 * plainly: a household or café behind one NAT with similar phones can collide,
 * and a colliding second person silently loses a gift week they were entitled
 * to. That is the direction the error was chosen to fall — a missed gift is
 * recoverable by a human; a farmed reward programme is not.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';
import { verifyJwt } from '../_shared/auth.ts';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AUTHOR_TOKEN_SECRET  = Deno.env.get('AUTHOR_TOKEN_SECRET') ?? '';
const REVENUECAT_SECRET    = Deno.env.get('REVENUECAT_SECRET_KEY') ?? '';

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

const TOKEN_RE = /^[A-Za-z0-9]{10}$/;
/** A token older than this cannot be claimed. */
const TOKEN_MAX_AGE_DAYS = 30;
/** An account older than this is not a new install and cannot be invited. */
const INVITEE_MAX_AGE_DAYS = 7;
export const GIFT_DAYS = 7;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, ...SEC, 'Content-Type': 'application/json' },
  });
}

async function hmacSha256(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Account-independent. See the header for why, and for its limits. */
async function deviceFingerprint(req: Request): Promise<string> {
  const ua = req.headers.get('user-agent') ?? 'unknown';
  const ip =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'unknown';
  return hmacSha256(`referral:${ua}:${ip}`, AUTHOR_TOKEN_SECRET || 'fallback-hash-secret');
}

/**
 * Grant N days of the 'premium' entitlement in RevenueCat, then mirror it into
 * the server `entitlements` table.
 *
 * FAILS CLOSED. If REVENUECAT_SECRET_KEY is absent, or RevenueCat refuses,
 * NOTHING is granted — not even a local entitlements row. CLAUDE.md's stub
 * rule exists because a missing key must never become a silent pass, and
 * writing a local row RevenueCat does not know about would be exactly that:
 * the app would show premium, RevenueCat would disagree, and the two would
 * never reconcile.
 *
 * Returns false on every failure so the caller leaves the referral unrewarded
 * and the work can be retried later.
 */
export async function grantPremiumDays(accountId: string, days: number): Promise<boolean> {
  if (!REVENUECAT_SECRET) {
    console.error('[REFERRAL] REVENUECAT_SECRET_KEY not set — granting nothing');
    return false;
  }

  try {
    // RevenueCat REST v1: grant a promotional entitlement to a subscriber.
    // POST /v1/subscribers/{app_user_id}/entitlements/{entitlement_id}/promotional
    // The app_user_id is the Supabase auth uid (see revenuecat-webhook).
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(accountId)}` +
      `/entitlements/premium/promotional`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${REVENUECAT_SECRET}`,
          'Content-Type': 'application/json',
        },
        // 'weekly' is RevenueCat's fixed one-week promotional duration.
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
        product_id: 'referral_gift_week',
        expires_at: expires,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id' },
    );
    if (error) {
      console.error('[REFERRAL] entitlements upsert failed');
      return false;
    }
    return true;
  } catch {
    console.error('[REFERRAL] RevenueCat grant threw');
    return false;
  }
}

type Reason =
  | 'unknown_token' | 'expired_token' | 'self_invite' | 'same_device'
  | 'device_claimed' | 'account_claimed' | 'account_too_old' | 'grant_failed';

/** Record the rejection for the dashboard, then tell the user nothing. */
async function reject(reason: Reason): Promise<Response> {
  console.log(`[REFERRAL] claim rejected: ${reason}`);
  return json({ claimed: false });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ error: 'Method not allowed.' }, 405);

  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return json({ error: 'Unauthorized' }, 401);

  const user = await verifyJwt(supabase, jwt);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  let body: { token?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const token = typeof body.token === 'string' ? body.token : '';
  if (!TOKEN_RE.test(token)) return reject('unknown_token');

  // ── The token ──────────────────────────────────────────────────────────────
  const { data: share } = await supabase
    .from('share_tokens')
    .select('token, account_id, created_at')
    .eq('token', token)
    .maybeSingle();

  if (!share) return reject('unknown_token');

  const ageDays = (Date.now() - new Date(share.created_at).getTime()) / 86_400_000;
  if (ageDays > TOKEN_MAX_AGE_DAYS) return reject('expired_token');

  const inviter = share.account_id as string;
  if (inviter === user.id) return reject('self_invite');

  // ── The invitee ────────────────────────────────────────────────────────────
  const { data: account } = await supabase
    .from('accounts').select('created_at').eq('id', user.id).maybeSingle();

  if (account) {
    const acctAge = (Date.now() - new Date(account.created_at).getTime()) / 86_400_000;
    // An established user cannot be "invited" — the gift is for arrivals.
    if (acctAge > INVITEE_MAX_AGE_DAYS) return reject('account_too_old');
  }

  const { data: already } = await supabase
    .from('referrals').select('id').eq('invitee_account', user.id).maybeSingle();
  if (already) return reject('account_claimed');

  const fingerprint = await deviceFingerprint(req);

  // Same phone as the person who sent the link.
  const { data: inviterDevice } = await supabase
    .from('referrals').select('id')
    .eq('inviter_account', inviter).eq('invitee_device_hash', fingerprint).maybeSingle();
  if (inviterDevice) return reject('same_device');

  const { data: deviceUsed } = await supabase
    .from('referrals').select('id').eq('invitee_device_hash', fingerprint).maybeSingle();
  if (deviceUsed) return reject('device_claimed');

  // ── The inviter's sticky variant ───────────────────────────────────────────
  const { data: inviterAcct } = await supabase
    .from('accounts').select('referral_variant').eq('id', inviter).maybeSingle();
  const variant = inviterAcct?.referral_variant ?? null;

  // ── Grant first, record second ─────────────────────────────────────────────
  // A referral row without a granted week would tell the invitee they have
  // premium when they do not, and would burn their one claim.
  const granted = await grantPremiumDays(user.id, GIFT_DAYS);
  if (!granted) return reject('grant_failed');

  const { error: insertErr } = await supabase.from('referrals').insert({
    share_token_id:      token,
    inviter_account:     inviter,
    invitee_account:     user.id,
    invitee_device_hash: fingerprint,
    variant,
    status:              'pending',   // the INVITER's reward is still pending
  });

  if (insertErr) {
    // The week is already granted; losing the row only costs the inviter's
    // thank-you, which is the right way for this to fail.
    console.error('[REFERRAL] referral insert failed after grant');
  }

  await supabase.from('notifications').insert({
    account_id: user.id,
    type:       'gift_week',
    data:       { days: GIFT_DAYS },
  });

  return json({ claimed: true, days: GIFT_DAYS });
});
