/**
 * A place to park the feed's FIRST fetch so it can be started before the feed
 * is on screen.
 *
 * Why this exists: finishing onboarding used to land on app/explore.tsx, which
 * then began its own request from scratch — so the last thing a new reader saw
 * was a spinner, not a confession. The fetch is started at the end of the FTUE
 * instead (app/welcome.tsx, persist()), the moment the chosen categories have
 * been saved, and explore picks it up when it mounts.
 *
 * What this is NOT: a read surface. CLAUDE.md invariant 2 allows exactly one
 * (the feed), and this module renders nothing, holds no UI, and makes no
 * decision about what is shown — it carries the same single getRecommendations
 * call the feed would have made itself, a few hundred milliseconds earlier.
 * Nothing here refills the feed, loads on scroll, or runs unprompted: it is
 * primed once, by an explicit tap on the last onboarding beat, and consumed
 * once.
 *
 * Single-use and short-lived by design. A handoff that outlived the navigation
 * would be a cache, and a cache would eventually show someone a feed assembled
 * for different categories than the ones they now have.
 */

import type { Recommendation } from './api';

/** Older than this and the feed refetches rather than trusting the handoff. */
const MAX_AGE_MS = 60_000;

let pending:  Promise<Recommendation[] | null> | null = null;
let primedAt: number = 0;

/**
 * Hand an in-flight getRecommendations() call to whichever mount of the feed
 * comes next. Failures are swallowed here on purpose: a prefetch that fails
 * must not surface as an unhandled rejection, and must not be the reason the
 * feed shows an error — the consumer simply falls back to fetching normally.
 */
export function primeFeed(p: Promise<{ confessions: Recommendation[] }>): void {
  primedAt = Date.now();
  pending  = p.then((r) => r.confessions).catch(() => null);
}

/**
 * Take the primed feed, if there is a fresh one. Resolves null when there is
 * nothing to take, when it went stale, or when the prefetch failed — in every
 * one of those cases the caller should fetch as it always did.
 *
 * Always clears, even when stale, so a handoff is used at most once.
 */
export async function takePrimedFeed(): Promise<Recommendation[] | null> {
  const p  = pending;
  const at = primedAt;
  pending  = null;
  primedAt = 0;
  if (!p || Date.now() - at > MAX_AGE_MS) return null;
  return p;
}

/** Drop anything primed — categories changed, or the reader signed out. */
export function clearPrimedFeed(): void {
  pending  = null;
  primedAt = 0;
}
