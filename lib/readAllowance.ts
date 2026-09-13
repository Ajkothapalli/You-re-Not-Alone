/**
 * How much someone may read in a day, once their intro window has passed.
 *
 * Owner decision 2026-09-13 (supersedes "reading is never gated", set earlier
 * the same day — see CLAUDE.md §2/§6):
 *   - First 30 days (lib/introWindow.ts): unlimited. Nothing below applies.
 *   - After that: DAILY_ALLOWANCE confessions per day.
 *   - Writing one grants PER_WRITE more, for that day.
 *   - Premium: unlimited, no counting at all.
 *   - Midnight local: a fresh DAILY_ALLOWANCE. Nothing carries over, and
 *     nothing is lost — a reader who hits the limit is a day away from more,
 *     not permanently stuck.
 *
 * This is a conversion nudge, not DRM. It is deliberately client-side and
 * deliberately cheap to defeat — clearing app storage resets it. Enforcing it
 * server-side would mean the recommender withholding real confessions from
 * free readers, which is the exact shape that left the feed permanently empty
 * behind copy promising more were coming. A reader determined enough to clear
 * storage is not the reader this is for.
 *
 * Nothing here gates writing, reporting, or the crisis path.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@yana/read_allowance_v2';

/** Free reads per day, after the intro window. */
export const DAILY_ALLOWANCE = 10;

/** Additional reads granted for each confession written, same day. */
export const PER_WRITE = 2;

interface DayState {
  /** Local calendar day, YYYY-MM-DD. */
  day:    string;
  /** Confessions opened today. */
  read:   number;
  /** Extra slots earned by writing today. */
  earned: number;
}

/**
 * Local date, not UTC. A reader in IST rolling over at 05:30 because the
 * server thinks it is still yesterday would read as the limit being broken.
 */
function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

async function load(): Promise<DayState> {
  const fresh: DayState = { day: today(), read: 0, earned: 0 };
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return fresh;
    const parsed = JSON.parse(raw) as Partial<DayState>;
    // A stored day that isn't today is yesterday's state — start over.
    if (parsed?.day !== fresh.day) return fresh;
    return {
      day:    fresh.day,
      read:   Number.isFinite(parsed.read)   ? Number(parsed.read)   : 0,
      earned: Number.isFinite(parsed.earned) ? Number(parsed.earned) : 0,
    };
  } catch {
    return fresh;
  }
}

async function save(state: DayState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Losing a day's count is a poor outcome, not a broken one: the reader
    // gets a fuller allowance than they earned. Never throw — this runs on
    // the read path and after successful writes, and must not surface as an
    // error for something the user did nothing wrong in.
  }
}

/** Today's total allowance, including anything earned by writing. */
export async function getDailyLimit(opts: {
  withinIntroWindow: boolean;
  isPremium:         boolean;
}): Promise<number | null> {
  // null means unlimited. Callers branch on null rather than comparing against
  // a sentinel, so an unlimited reader is never accidentally sliced.
  if (opts.withinIntroWindow || opts.isPremium) return null;
  const s = await load();
  return DAILY_ALLOWANCE + s.earned;
}

/** How many the reader has already opened today. */
export async function getReadToday(): Promise<number> {
  return (await load()).read;
}

/** Count one confession as read. Call when a confession is actually opened. */
export async function recordRead(): Promise<void> {
  const s = await load();
  await save({ ...s, read: s.read + 1 });
}

/** Call after a confession is successfully submitted. Grants PER_WRITE today. */
export async function grantForWrite(): Promise<void> {
  const s = await load();
  await save({ ...s, earned: s.earned + PER_WRITE });
}

/** Reads left today. `null` when unlimited. */
export async function getRemaining(opts: {
  withinIntroWindow: boolean;
  isPremium:         boolean;
}): Promise<number | null> {
  const limit = await getDailyLimit(opts);
  if (limit === null) return null;
  const s = await load();
  return Math.max(0, limit - s.read);
}
