/**
 * When to ask a reader to write — and, just as importantly, when to shut up.
 *
 * Motivation to write peaks right after someone has FELT other people's words,
 * and it peaks about a specific thing: three confessions about grief land
 * differently than three about nothing in particular. So the ask is counted per
 * category and fires on the third felt within ONE of them.
 *
 * ── The rules, and what each is protecting ──────────────────────────────────
 *  - Three in the SAME category. Three spread across three categories is a
 *    person browsing, not a person recognising themselves in something.
 *  - Once per session, ever. This is the difference between an invitation and
 *    being followed around.
 *  - "Not now" ends it for the session, and ALSO suppresses the generic
 *    interstitial invite. Someone who just declined to write should not meet
 *    the same ask, differently worded, ten cards later.
 *  - Writing is never gated or required (CLAUDE.md #2). This changes what we
 *    ask and when; it never changes what a reader is allowed to read.
 *
 * In memory and session-scoped on purpose — nothing here is persisted. A
 * reader's felt history is reading behaviour tied to categories they care
 * about, and the weakest version of this feature that works is the one that
 * forgets when the app closes.
 */

import { CATEGORIES, type CategoryId } from './categories';
import { isCategoryId, STARTERS } from './starters';

/** Felts within one category before the invite appears. */
export const INVITE_AFTER_FELTS = 3;

interface InviteState {
  counts:    Map<CategoryId, number>;
  /** Placements already counted as seen, so re-renders do not re-count. */
  seen:      Set<string>;
  /** Shown or dismissed — either way the session is done asking. */
  settled:   boolean;
  dismissed: boolean;
}

function fresh(): InviteState {
  return { counts: new Map(), seen: new Set(), settled: false, dismissed: false };
}

let state: InviteState = fresh();

/** Test seam, and what a real session boundary would call. */
export function resetWriteInvite(): void {
  state = fresh();
}

export interface TargetedInvite {
  category: CategoryId;
  label:    string;
  /** The first starter for that category — the chip shown on the card. */
  starter:  string;
}

/**
 * Record a felt and return the invite it just earned, or null.
 *
 * Returns non-null AT MOST ONCE per session: it marks itself settled on the way
 * out, so a caller that renders on every felt cannot show two.
 *
 * A confession carrying several categories counts toward each — the reader felt
 * something that belongs to all of them, and picking one arbitrarily would make
 * the trigger depend on server-side ordering nobody here controls.
 */
export function recordFelt(categories: readonly string[]): TargetedInvite | null {
  if (state.settled) return null;

  let hit: CategoryId | null = null;
  for (const c of categories) {
    if (!isCategoryId(c)) continue;
    const n = (state.counts.get(c) ?? 0) + 1;
    state.counts.set(c, n);
    // Keep counting the rest before returning, so the tally stays honest for
    // a category that crosses the line on the same confession.
    if (n >= INVITE_AFTER_FELTS && !hit) hit = c;
  }
  if (!hit) return null;

  state.settled = true;
  return {
    category: hit,
    label:    CATEGORIES.find((c) => c.id === hit)!.label,
    starter:  STARTERS[hit][0],
  };
}

/**
 * True the FIRST time a placement is seen this session, false after.
 *
 * The interstitial cards live in a FlatList separator, which React re-renders
 * on scroll, on state changes, on anything. Firing an impression per render
 * would inflate `write_invite_shown` without bound and quietly destroy the
 * denominator of the one number this phase is judged by.
 */
export function markInviteSeen(kind: string): boolean {
  if (state.seen.has(kind)) return false;
  state.seen.add(kind);
  return true;
}

/** "Not now" — no more asks of any kind this session. */
export function dismissWriteInvite(): void {
  state.settled  = true;
  state.dismissed = true;
}

/**
 * Whether the GENERIC interstitial invite may still appear.
 *
 * False once the targeted one has been shown or dismissed: the targeted ask is
 * strictly better aimed, and following it with the generic version is how an
 * invitation turns into nagging.
 */
export function genericInviteAllowed(): boolean {
  return !state.settled;
}

/** Test/debug read-only view. */
export function feltCountFor(category: CategoryId): number {
  return state.counts.get(category) ?? 0;
}

/**
 * Which ask, if any, belongs in the gap after feed item `index`.
 *
 * Pure and exported so the rule can be tested directly — it used to live inside
 * the separator's JSX, where the one property that matters ("these two never
 * appear together") could only be checked by reading it.
 *
 * The two asks alternate: write, premium, write, premium. Shown side by side
 * they read as a single transaction, and the invitation to write — the thing
 * the app actually needs from a reader — became the warm-up act for an upsell.
 *
 * Alternation keys off the interstitial's ORDINAL rather than the card index,
 * so the rhythm survives any change to `every`.
 */
export function interstitialAt(index: number, every: number): 'write' | 'premium' | null {
  if (index < 0 || every <= 0) return null;
  const n = index + 1;
  if (n % every !== 0) return null;
  return (n / every) % 2 === 1 ? 'write' : 'premium';
}
