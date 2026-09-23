/**
 * In-memory handoff for opening a confession's detail screen.
 *
 * Why this exists: expo-router serialises route params through the URL, and
 * newlines do not survive the round trip — a confession pushed as
 * `params: { text }` arrives at read-detail with every "\n\n" stripped, so a
 * three-paragraph confession renders as one run-on block ("...here.Second
 * paragraph here."). Verified by logging the received param: the text is
 * already flattened before the screen renders, so it's lost in transport, not
 * at render time.
 *
 * Confession bodies are also long enough that stuffing them in a URL is a bad
 * idea regardless. So the caller stashes the confession here immediately
 * before navigating, and read-detail reads it back by id.
 *
 * Route params are still passed and still used as a fallback, so an external
 * deep link (or a remount after this module's state is gone) degrades to the
 * old behaviour rather than showing an empty screen.
 *
 * Deliberately NOT persisted: this is a single in-flight navigation, not
 * state. It holds exactly one confession and is overwritten by the next push.
 * Nothing here is written to disk, logged, or sent anywhere — it's the same
 * text already on screen.
 */

export interface ConfessionHandoff {
  /**
   * Set on voice confessions. Carried so read-detail can offer playback: the
   * feed card truncates long text, so a voice confession with a long
   * transcript is read HERE — and without this the play control vanished at
   * exactly the point someone chose to engage with it properly.
   */
  audioDurationMs?: number;
  id:           string;
  text:         string;
  feltCount:    number;
  paletteIndex: number;
}

let pending: ConfessionHandoff | null = null;

/** Call immediately before router.push to the detail screen. */
export function setConfessionHandoff(h: ConfessionHandoff): void {
  pending = h;
}

/**
 * Read the stashed confession back, if it's the one being opened. Returns null
 * when the ids don't match (a deep link, or a stale entry), so the caller can
 * fall back to route params.
 *
 * Not cleared on read — the screen may render more than once, and the entry is
 * replaced on the next navigation anyway.
 */
export function getConfessionHandoff(id: string | undefined): ConfessionHandoff | null {
  if (!id || !pending || pending.id !== id) return null;
  return pending;
}
