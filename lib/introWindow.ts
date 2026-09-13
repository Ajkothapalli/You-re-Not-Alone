/**
 * The intro window — how long someone can read before we ask them to write.
 *
 * Owner decision 2026-09-13 (replaces the 7-day "D7" window):
 *   - 30 days, not 7.
 *   - Inside it: read freely. The feed is the whole experience and we never
 *     ask for a confession in return.
 *   - After it: the write prompt appears at the end of the feed. It is a
 *     prompt, never a gate — reading is not withheld, before or after.
 *
 * This used to be lib/d7.ts. Renamed because "d7" stopped being true, and a
 * constant whose name contradicts its value is how the next person ships a
 * bug. The storage key is unchanged (@yana/install_ts) so existing installs
 * keep their original date rather than silently restarting the window.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@yana/install_ts';

export const INTRO_WINDOW_DAYS = 30;
const INTRO_WINDOW_MS = INTRO_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Call once on first successful login. Idempotent — will not overwrite an existing date. */
export async function markInstall(): Promise<void> {
  try {
    const existing = await AsyncStorage.getItem(KEY);
    if (!existing) await AsyncStorage.setItem(KEY, String(Date.now()));
  } catch {}
}

/**
 * True while the reader is still inside their first INTRO_WINDOW_DAYS.
 *
 * Fails OPEN (returns true) on a storage error: the cost of wrongly treating
 * someone as new is that they see the feed without a write prompt, which is
 * the gentler mistake. The old implementation returned false here, which meant
 * a transient AsyncStorage failure would nag a brand-new reader to write.
 */
export async function isWithinIntroWindow(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return true; // not yet recorded → treat as day 0
    const started = Number(raw);
    if (!Number.isFinite(started)) return true;
    return Date.now() - started < INTRO_WINDOW_MS;
  } catch {
    return true;
  }
}
