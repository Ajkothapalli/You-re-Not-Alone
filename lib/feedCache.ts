/**
 * The last feed, kept so returning to Read is instant.
 *
 * Before this, every return to Read showed a full-screen spinner while the
 * recommender was re-fetched — even when the reader had left the tab four
 * seconds earlier and nothing had changed. The content was already known; it
 * was thrown away on unmount and asked for again.
 *
 * Two layers, because they solve different problems:
 *   - MEMORY makes a tab switch instant within a session.
 *   - AsyncStorage makes a COLD START show something while the network runs.
 *
 * ── Stale content is shown on purpose ───────────────────────────────────────
 * The cached feed is rendered immediately and refreshed quietly behind it. A
 * confession that has since been removed could therefore be on screen for a
 * moment — which is why the refresh is not optional and why nothing here is
 * ever used as the basis for a WRITE. It is a display cache in front of a
 * surface whose safety filtering happens server-side on every fetch.
 *
 * ── What it must never do ───────────────────────────────────────────────────
 * Never load on scroll, never refresh on a gesture, never grow the feed by
 * itself. "Keep reading" stays the one explicit tap (CLAUDE.md #2). This only
 * changes how fast previously-fetched content reappears.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Recommendation } from './api';

const KEY = '@yana/feed_cache_v1';

/**
 * Past this age the cached feed is not shown at all, and the reader waits for
 * a fresh one. A day-old feed is not "instant", it is wrong: felt counts have
 * moved, and some of it may have been moderated away.
 */
export const MAX_AGE_MS = 6 * 60 * 60 * 1000;   // 6 hours

/** Cap what we persist. The full 200-item payload is not worth the disk I/O. */
export const MAX_CACHED = 30;

export interface CachedFeed {
  confessions: Recommendation[];
  savedAt:     number;
}

/** Survives a tab switch; dies with the process. */
let memory: CachedFeed | null = null;

export function readMemory(now = Date.now()): Recommendation[] | null {
  if (!memory) return null;
  if (now - memory.savedAt > MAX_AGE_MS) { memory = null; return null; }
  return memory.confessions;
}

/**
 * The cold-start layer. Never throws: a cache miss must look exactly like a
 * first launch, not like an error.
 */
export async function readDisk(now = Date.now()): Promise<Recommendation[] | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedFeed;
    if (!Array.isArray(parsed?.confessions) || typeof parsed.savedAt !== 'number') return null;
    if (now - parsed.savedAt > MAX_AGE_MS) return null;
    // A cached entry missing the fields the card renders would crash the list
    // rather than degrade, so it is treated as a miss.
    if (parsed.confessions.some((c) => !c?.id || typeof c.text !== 'string')) return null;

    memory = parsed;
    return parsed.confessions;
  } catch {
    return null;
  }
}

export function save(confessions: Recommendation[], now = Date.now()): void {
  if (!Array.isArray(confessions) || confessions.length === 0) return;

  const trimmed = confessions.slice(0, MAX_CACHED);
  memory = { confessions: trimmed, savedAt: now };

  // Fire and forget: the reader is already looking at this content, and a
  // slow disk write must not sit in front of anything.
  AsyncStorage.setItem(KEY, JSON.stringify(memory)).catch(() => {});
}

/** Sign-out and account deletion — someone else's feed must not persist. */
export async function clear(): Promise<void> {
  memory = null;
  try { await AsyncStorage.removeItem(KEY); } catch {}
}
