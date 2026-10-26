/**
 * What a tab already knows, kept across a tab switch.
 *
 * The tabs stay mounted now (Phase NAV), so React state survives a switch on
 * its own. This exists for the two cases state does not cover:
 *
 *   1. The FIRST focus of a session, and any remount — a config change, a
 *      fast refresh, a navigator rebuild. Without a cache the screen paints
 *      a spinner over content the app fetched forty seconds ago.
 *   2. The re-fetch on every focus. Both Alerts and You refresh when focused,
 *      and both used to blank themselves to a spinner while doing it. The
 *      list they were about to replace was already on screen and, nine times
 *      out of ten, identical to the one arriving.
 *
 * So: render what is known, refresh quietly behind it, and show a spinner
 * only when there is genuinely nothing to show.
 *
 * ── Memory only, deliberately ───────────────────────────────────────────────
 * Nothing here touches disk, unlike lib/feedCache.ts. The feed is other
 * people's public confessions; these two caches hold THIS person's alerts and
 * THIS person's own confessions. Persisting either would leave one account's
 * private content on the device for the next account to paint on screen
 * before its fetch returned. A cold start pays one spinner instead. Signing
 * out clears it anyway (clearTabMemory) — belt and braces, because the cost
 * of being wrong here is showing someone another person's alerts.
 *
 * ── Staleness ───────────────────────────────────────────────────────────────
 * Past MAX_AGE_MS the cache is dropped rather than shown. An hour-old alerts
 * list is not "instant", it is wrong: it can be missing the very notification
 * the person opened the tab to read, and showing it with no spinner gives
 * them no sign that anything is still coming.
 */

/** Past this, a cached value is a lie rather than a head start. */
export const MAX_AGE_MS = 5 * 60 * 1000;   // 5 minutes

interface Slot<T> {
  value:   T;
  savedAt: number;
}

const slots = new Map<string, Slot<unknown>>();

/** The last known value for a slot, or null if absent or stale. */
export function readTabMemory<T>(key: string, now = Date.now()): T | null {
  const slot = slots.get(key);
  if (!slot) return null;
  if (now - slot.savedAt > MAX_AGE_MS) { slots.delete(key); return null; }
  return slot.value as T;
}

/**
 * Remember a value.
 *
 * An empty list IS remembered, unlike feedCache: "you have no alerts" is a
 * real answer and the screen has a designed empty state for it. Re-showing
 * the spinner to arrive at the same emptiness is the flicker this removes.
 */
export function writeTabMemory<T>(key: string, value: T, now = Date.now()): void {
  slots.set(key, { value, savedAt: now });
}

/** Sign-out, account deletion, and the test seam. */
export function clearTabMemory(): void {
  slots.clear();
}

/** Slot names live here so two screens cannot quietly collide on one. */
export const TAB_MEMORY = {
  alerts:        'alerts',
  myConfessions: 'my-confessions',
} as const;
