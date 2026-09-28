/**
 * Referral — "Give someone 7 days".
 *
 * Every share already carries a per-share token, so every share is already an
 * invite. This adds one explicit way in, the copy around it, and the claim
 * call that turns a pending token into the invitee's gift week.
 *
 * ── What the inviter is told, and what they are never told ──────────────────
 * They are told a thank-you week arrived. That is all. Not who, not when, not
 * that anyone wrote anything. There is no per-invitee surface anywhere in this
 * module, and there must never be one: the reward criteria depend on a
 * confession the invitee wrote, so anything that revealed WHY or WHEN a reward
 * landed would leak — by timing alone — that a specific person wrote
 * something. That is the author↔account link CLAUDE.md #3 forbids, arriving
 * through the back door.
 *
 * ── No dark patterns ────────────────────────────────────────────────────────
 * No countdown, no scarcity, no "don't miss out", and at most one prompt a
 * week. The honest line stays on both variants: the thank-you is not
 * immediate and we say so, because a reward people expect and do not get is
 * worse than one they were never promised.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { withTimeout } from './withTimeout';
import { analytics } from './analytics';
import { getPendingInvite, clearPendingInvite } from './installReferrer';

export type ReferralVariant = 'gift' | 'earn';

/** The A/B copy. Both carry the same honest line about timing. */
export const VARIANT_COPY: Record<ReferralVariant, { headline: string }> = {
  gift: { headline: 'Give someone you love 7 days of reading.' },
  earn: { headline: 'Invite a friend. You both get 7 days of reading.' },
};

export const HONEST_LINE = 'Your thank-you arrives once they’ve settled in.';

/** What the invitee sees, once, after onboarding. */
export const GIFT_CARD_TITLE =
  'Someone who cares about you gave you 7 days of unlimited reading.';
export const GIFT_CARD_NOTE =
  'When you’ve settled in, they get a thank-you week too. They’ll never see what you read or write.';

const VARIANT_KEY    = '@yana/referral_variant_v1';
const PROMPT_KEY     = '@yana/referral_prompt_at_v1';
const GIFT_SHOWN_KEY = '@yana/gift_card_shown_v1';

/** At most one invite prompt per week. Never a countdown, never a nag. */
export const PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The inviter's sticky variant.
 *
 * Assigned SERVER-side and cached locally. A client-rolled variant would
 * re-roll on reinstall and drift between devices, which would make the test
 * measure nothing.
 */
export async function getVariant(): Promise<ReferralVariant> {
  try {
    const cached = await AsyncStorage.getItem(VARIANT_KEY);
    if (cached === 'gift' || cached === 'earn') return cached;

    const { data, error } = await withTimeout(
      supabase.rpc('assign_referral_variant'), 4_000, 'variant');
    if (!error) {
      const v = Array.isArray(data) ? data[0] : data;
      const assigned = typeof v === 'string' ? v : v?.assign_referral_variant;
      if (assigned === 'gift' || assigned === 'earn') {
        await AsyncStorage.setItem(VARIANT_KEY, assigned);
        return assigned;
      }
    }
  } catch {
    // fall through
  }
  // A readable default rather than a broken screen. Not persisted, so the
  // real assignment still lands on the next attempt.
  return 'gift';
}

/**
 * Claim a pending invite. Called once, after sign-in.
 *
 * Silent in every direction: a rejection is indistinguishable from never
 * having had a token, and the pending token is cleared either way so it is
 * never retried. The server decides and does not explain.
 */
export async function claimPendingInvite(): Promise<boolean> {
  const token = await getPendingInvite();
  if (!token) return false;

  try {
    const { data: { session } } = await withTimeout(
      supabase.auth.getSession(), 4_000, 'session');
    if (!session) return false;    // keep the token; try again once signed in

    const { data, error } = await withTimeout(
      supabase.functions.invoke<{ claimed?: boolean }>('claim-invite', {
        body:    { token },
        headers: { Authorization: `Bearer ${session.access_token}` },
      }),
      8_000,
      'claim-invite',
    );

    await clearPendingInvite();
    if (error || !data?.claimed) {
      // The reason stays server-side. Nothing is shown to the user, and the
      // event carries no token and no reason we were not given.
      analytics.inviteClaimRejected('server');
      return false;
    }

    analytics.inviteClaimed();
    analytics.giftWeekGranted('invitee');
    return true;
  } catch {
    // Network trouble is not a rejection — leave the token for next launch.
    return false;
  }
}

// ─── The one-time gift card ──────────────────────────────────────────────────

export async function shouldShowGiftCard(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(GIFT_SHOWN_KEY)) === null; }
  catch { return false; }
}

export async function markGiftCardShown(): Promise<void> {
  try { await AsyncStorage.setItem(GIFT_SHOWN_KEY, '1'); } catch {}
}

// ─── Prompt pacing ───────────────────────────────────────────────────────────

/** True when a week has passed since the last invite prompt. */
export async function mayPromptForInvite(now = Date.now()): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(PROMPT_KEY);
    if (!raw) return true;
    const last = Number.parseInt(raw, 10);
    if (!Number.isFinite(last)) return true;
    return now - last >= PROMPT_COOLDOWN_MS;
  } catch {
    // Fail QUIET, not open: if we cannot tell when we last asked, do not ask.
    return false;
  }
}

export async function markInvitePrompted(now = Date.now()): Promise<void> {
  try { await AsyncStorage.setItem(PROMPT_KEY, String(now)); } catch {}
}
