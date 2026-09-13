/**
 * How much someone may read, once their intro window has passed.
 *
 * Owner decision 2026-09-13 (supersedes "reading is never gated", set earlier
 * the same day — see CLAUDE.md §2/§6):
 *   - First 30 days (lib/introWindow.ts): unlimited. Nothing below applies.
 *   - After that: BASE_ALLOWANCE confessions.
 *   - Writing one grants PER_WRITE more, permanently.
 *   - Premium: unlimited, no counting at all.
 *
 * This is a conversion nudge, not DRM. It is deliberately client-side and
 * deliberately cheap to defeat — clearing app storage resets it. Enforcing it
 * server-side would mean the recommender withholding real confessions from
 * free readers, which is the exact shape that left the feed permanently empty
 * behind copy promising more were coming. A reader who wants past this badly
 * enough to clear storage is not the reader this is for.
 *
 * The crisis path is never affected: crisis submissions never reach the feed,
 * and nothing here gates writing, reporting, or support resources.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@yana/read_unlocked_extra';

/** Readable after the intro window, before writing anything. */
export const BASE_ALLOWANCE = 2;

/** Additional confessions unlocked per confession written. */
export const PER_WRITE = 2;

/**
 * Extra slots earned by writing. Survives restarts — a reader who wrote last
 * week should not find their unlock gone today.
 */
export async function getUnlockedExtra(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Call after a confession is successfully submitted. Idempotent per call. */
export async function grantForWrite(): Promise<void> {
  try {
    const current = await getUnlockedExtra();
    await AsyncStorage.setItem(KEY, String(current + PER_WRITE));
  } catch {
    // Losing an unlock is a poor outcome but not a broken one — the reader
    // keeps what the server gave them and can write again. Never throw here:
    // this runs after a successful submission and must not turn a completed
    // write into an error the user sees.
  }
}

/**
 * How many confessions to show.
 *
 * `null` means unlimited — inside the intro window, or premium. Callers should
 * branch on null rather than comparing against a sentinel number, so an
 * unlimited reader is never accidentally sliced.
 */
export async function getReadLimit(opts: {
  withinIntroWindow: boolean;
  isPremium:         boolean;
}): Promise<number | null> {
  if (opts.withinIntroWindow || opts.isPremium) return null;
  return BASE_ALLOWANCE + (await getUnlockedExtra());
}
