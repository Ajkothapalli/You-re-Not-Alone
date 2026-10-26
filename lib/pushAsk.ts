/**
 * [N1] Whether to ask for notification permission, and at which moment.
 *
 * The system dialog can be shown ONCE. Android and iOS both remember the
 * answer and neither offers a second chance — a "no" is permanent until
 * somebody walks into their phone settings, which almost nobody does. So
 * the whole design here is about not spending that one dialog badly.
 *
 * Hence: never at install, never at launch, never in onboarding. The dialog
 * is shown only after a person has been handed a reason, and only at a
 * moment when the reason is in front of them — somebody felt what they
 * wrote, they just posted, the weekly question just landed.
 *
 * ── Pure, and that is the point ─────────────────────────────────────────────
 * `decide()` takes a snapshot and returns a verdict. No storage, no clock,
 * no permission API. Everything that makes this hard to reason about — the
 * cooldowns, the decline count, the "not the install day" rule — becomes a
 * number in a plain object that a test can set to anything.
 *
 * ── The one thing this file must never do ───────────────────────────────────
 * It must never call requestPermissionsAsync. Deciding whether to ask and
 * actually asking are separate acts, and the whole point of the pre-permission
 * card is that a person sees a plain-language explanation and taps a button
 * BEFORE the OS dialog appears. An eligibility check that could trigger the
 * dialog would defeat that by existing.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getInstallDate } from './introWindow';

/** Where the card can appear, in priority order. A > B > C. */
export type AskMoment = 'proof' | 'just_posted' | 'question';

/** What the OS says. `undetermined` is the only state worth asking in. */
export type PermissionState = 'undetermined' | 'granted' | 'denied' | 'blocked';

export const COOLDOWN_DAYS = 14;
export const MAX_DECLINES  = 3;
/** Distinct local days the app must have been opened on. */
export const MIN_ACTIVE_DAYS = 2;

const KEY_DAYS     = '@yana/push_active_days';
const KEY_DECLINES = '@yana/push_declines';
const KEY_LAST_NO  = '@yana/push_last_decline';

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── The decision ────────────────────────────────────────────────────────────

export interface AskSnapshot {
  /** From lib/introWindow.ts. null = never recorded. */
  installedAt:   number | null;
  /** Distinct local calendar days this app has been opened on. */
  activeDays:    number;
  permission:    PermissionState;
  /** Has a card already been shown this session? At most one. */
  shownThisSession: boolean;
  declineCount:  number;
  /** When "Not now" was last tapped. null = never. */
  lastDeclineAt: number | null;
  /**
   * Did this session hit crisis or a moderation block?
   *
   * Nothing may follow either of those with a request for anything. A person
   * who just saw crisis resources, or who was just told their words were
   * refused, is not somebody to ask a favour of.
   */
  sessionHadCrisisOrBlock: boolean;
  /** Is any other ask already on screen? One at a time, ever. */
  otherAskOnScreen: boolean;
  /** Which moments are available right now, unordered. */
  available:     AskMoment[];
  now:           number;
}

export type AskDecision =
  | { show: true;  moment: AskMoment }
  | { show: false; reason: AskReason };

export type AskReason =
  | 'install_day' | 'too_few_days' | 'already_answered' | 'blocked_forever'
  | 'already_shown' | 'cooling_off' | 'declined_enough'
  | 'crisis_or_block' | 'other_ask' | 'no_moment';

/** A > B > C. At most one per session, and the strongest reason wins. */
const PRIORITY: AskMoment[] = ['proof', 'just_posted', 'question'];

/**
 * Should a card be shown, and for which moment?
 *
 * The order of these checks is deliberate: the ones that are permanent
 * ("they said no three times", "the OS will not ask again") come before the
 * ones that are temporary, so the reason returned is the most useful one
 * rather than the first one that happened to match.
 */
export function decide(s: AskSnapshot): AskDecision {
  // Permanent states first.
  if (s.permission === 'granted' || s.permission === 'denied') {
    return { show: false, reason: 'already_answered' };
  }
  // The OS will not show the dialog again. A card offering to ask would be
  // a button that does nothing, which is worse than no button. Only the
  // Settings toggle remains, and it opens the phone's own settings.
  if (s.permission === 'blocked') return { show: false, reason: 'blocked_forever' };
  if (s.declineCount >= MAX_DECLINES) return { show: false, reason: 'declined_enough' };

  // Then the ones about this person's history.
  if (s.installedAt !== null && isSameLocalDay(s.installedAt, s.now)) {
    // Day one is for finding out what this place is, not for being asked
    // to let it reach you outside itself.
    return { show: false, reason: 'install_day' };
  }
  if (s.activeDays < MIN_ACTIVE_DAYS) return { show: false, reason: 'too_few_days' };

  if (s.lastDeclineAt !== null && s.now - s.lastDeclineAt < COOLDOWN_DAYS * DAY_MS) {
    return { show: false, reason: 'cooling_off' };
  }

  // Then the ones about right now.
  if (s.sessionHadCrisisOrBlock) return { show: false, reason: 'crisis_or_block' };
  if (s.shownThisSession)        return { show: false, reason: 'already_shown' };
  if (s.otherAskOnScreen)        return { show: false, reason: 'other_ask' };

  const moment = PRIORITY.find((m) => s.available.includes(m));
  if (!moment) return { show: false, reason: 'no_moment' };

  return { show: true, moment };
}

/**
 * Same LOCAL calendar day.
 *
 * Deliberately not a 24-hour window. Someone who installs at 11pm and comes
 * back at 9am the next morning has arrived on a second day, and treating
 * that as "still the install day" would push their first possible ask a
 * whole day later for no reason a person would recognise.
 */
export function isSameLocalDay(a: number, b: number): boolean {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear()
      && da.getMonth()    === db.getMonth()
      && da.getDate()     === db.getDate();
}

// ─── Persistence ─────────────────────────────────────────────────────────────
//
// Every read fails to the SAFEST value, which here means "do not ask". A
// storage error must never manufacture eligibility: the cost of not asking
// is that somebody is asked next session instead, and the cost of asking
// wrongly is one spent dialog and possibly a permanent no.

/** Local calendar day as YYYY-MM-DD, so a day boundary is the phone's. */
export function localDayKey(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Record that the app was opened today, and return how many distinct days
 * it has now been opened on.
 *
 * Stores the DAY KEYS rather than a counter, so a double call on one day
 * cannot inflate it — and capped, because the only question ever asked of
 * this is "at least two?".
 */
export async function recordActiveDay(now = Date.now()): Promise<number> {
  const today = localDayKey(now);
  try {
    const raw  = await AsyncStorage.getItem(KEY_DAYS);
    const days: string[] = raw ? JSON.parse(raw) : [];
    if (!days.includes(today)) {
      days.push(today);
      // Two is the threshold; keeping a year of dates to answer a question
      // about the number 2 is storage nobody needs.
      await AsyncStorage.setItem(KEY_DAYS, JSON.stringify(days.slice(-5)));
    }
    return days.length;
  } catch {
    return 0;
  }
}

export async function getActiveDays(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEY_DAYS);
    return raw ? (JSON.parse(raw) as string[]).length : 0;
  } catch {
    return 0;
  }
}

export async function recordDecline(now = Date.now()): Promise<void> {
  try {
    const n = Number(await AsyncStorage.getItem(KEY_DECLINES)) || 0;
    await AsyncStorage.setItem(KEY_DECLINES, String(n + 1));
    await AsyncStorage.setItem(KEY_LAST_NO, String(now));
  } catch {}
}

export async function getDeclines(): Promise<{ count: number; lastAt: number | null }> {
  try {
    const count  = Number(await AsyncStorage.getItem(KEY_DECLINES)) || 0;
    const rawLast = await AsyncStorage.getItem(KEY_LAST_NO);
    const lastAt = rawLast ? Number(rawLast) : null;
    return { count, lastAt: Number.isFinite(lastAt) ? lastAt : null };
  } catch {
    // Fail to "recently declined the maximum number of times": the safe
    // direction is silence.
    return { count: MAX_DECLINES, lastAt: null };
  }
}

// ─── Session state ───────────────────────────────────────────────────────────
//
// In memory only. A session is one run of the app, and every one of these
// resets when it ends — which is the intended behaviour, not a limitation.

let shownThisSession   = false;
let crisisOrBlockSeen  = false;

export function markCardShown(): void   { shownThisSession = true; }
export function markCrisisOrBlock(): void { crisisOrBlockSeen = true; }
export function sessionState(): { shown: boolean; crisisOrBlock: boolean } {
  return { shown: shownThisSession, crisisOrBlock: crisisOrBlockSeen };
}
/** Test seam, and what a sign-out should call. */
export function resetSession(): void {
  shownThisSession  = false;
  crisisOrBlockSeen = false;
}

/**
 * Gather everything and decide.
 *
 * The permission state is passed IN rather than read here, because reading
 * it is the caller's job and because this module must not import the
 * notifications API at all — see the header.
 */
export async function shouldAsk(opts: {
  permission:       PermissionState;
  available:        AskMoment[];
  otherAskOnScreen?: boolean;
  now?:             number;
}): Promise<AskDecision> {
  const now = opts.now ?? Date.now();
  const [installedAt, activeDays, declines] = await Promise.all([
    getInstallDate(), getActiveDays(), getDeclines(),
  ]);
  const session = sessionState();

  return decide({
    installedAt,
    activeDays,
    permission:              opts.permission,
    shownThisSession:        session.shown,
    declineCount:            declines.count,
    lastDeclineAt:           declines.lastAt,
    sessionHadCrisisOrBlock: session.crisisOrBlock,
    otherAskOnScreen:        opts.otherAskOnScreen ?? false,
    available:               opts.available,
    now,
  });
}

/** Sign-out and account deletion. Someone else's history is not theirs. */
export async function resetPushAsk(): Promise<void> {
  resetSession();
  try {
    await AsyncStorage.multiRemove([KEY_DAYS, KEY_DECLINES, KEY_LAST_NO]);
  } catch {}
}
