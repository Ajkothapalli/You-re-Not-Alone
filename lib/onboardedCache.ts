/**
 * "Has this person already finished onboarding?" — answered locally.
 *
 * Boot used to prove this over the network every time: fetch the account row,
 * then the preferences row, then evaluate the milestone, and only then show
 * the feed. Three sequential round trips in front of the first card, on every
 * single launch, to re-establish something that had been true since the day
 * they signed up.
 *
 * The flag is written once onboarding is genuinely complete and read on the
 * next boot to route immediately. The server checks still run — in the
 * BACKGROUND, redirecting only if something is actually wrong.
 *
 * ── Why a local flag is safe here ───────────────────────────────────────────
 * It decides which SCREEN opens first, nothing else. It grants no access:
 * every read the feed performs is still authorised server-side by RLS and by
 * the recommender's own filters. The worst a tampered or stale flag can do is
 * open the feed for someone who should have seen onboarding — and the
 * background check then redirects them, because it is still running.
 *
 * It is deliberately NOT used for anything that must be true: not for
 * premium, not for the age gate, not for ban state.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@yana/onboarded_v1';

/**
 * Both halves must be true. An account with no categories is not onboarded —
 * routing them to the feed would show a reader-preferences-shaped hole and
 * then bounce them to /welcome, which is worse than a moment on the splash.
 */
export interface OnboardedState {
  hasAccount:    boolean;
  hasCategories: boolean;
}

export async function readOnboarded(): Promise<OnboardedState | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as OnboardedState;
    if (typeof v?.hasAccount !== 'boolean' || typeof v?.hasCategories !== 'boolean') {
      return null;
    }
    return v;
  } catch {
    // A miss looks exactly like a first launch: prove it over the network.
    return null;
  }
}

export async function writeOnboarded(state: OnboardedState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

/** Sign-out and account deletion — the next person on this device is not them. */
export async function clearOnboarded(): Promise<void> {
  try { await AsyncStorage.removeItem(KEY); } catch {}
}

/** Can we open the feed straight away? */
export function canSkipToFeed(state: OnboardedState | null): boolean {
  return state !== null && state.hasAccount && state.hasCategories;
}
