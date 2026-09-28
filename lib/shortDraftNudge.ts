/**
 * The one-time nudge on a very short draft.
 *
 * A NUDGE, not a gate. "I cheated." is a complete confession and posts exactly
 * as written — the writer taps [Post as it is] and it goes. The only thing this
 * buys is one moment to notice they had more to say, for the person who did.
 *
 * ── The rules it has to keep ────────────────────────────────────────────────
 *  - Once per draft. Asking twice turns a nudge into nagging, and nagging about
 *    the length of someone's confession is a small cruelty.
 *  - Never the word "short". The floor already told someone their words did not
 *    count once; this must not imply it again. "Want to say a little more?" is
 *    an invitation, "That's short" is a verdict.
 *  - Never on the crisis path — but note that this runs BEFORE submit, so the
 *    crisis check has not happened yet and cannot be consulted. The protection
 *    is that the nudge never blocks: whatever the writer chooses, the text
 *    reaches the server, and crisis routing happens there as it always did.
 *    A crisis message typed in four words is delayed by one tap at most.
 *
 * "Seen" is keyed to the draft TEXT, not to a flag, so editing the words and
 * coming back does not re-ask, while starting a genuinely new confession does.
 */

/** Below this many characters, offer the nudge once. */
export const NUDGE_UNDER_CHARS = 40;

export const NUDGE_TITLE = 'Want to say a little more?';
export const NUDGE_BODY  = 'More words give people more to feel.';
export const NUDGE_POST  = 'Post as it is';
export const NUDGE_MORE  = 'Add more';

/**
 * Per-draft memory. Module-scoped rather than component state because the
 * write screen remounts (navigation, theme change) and a remount must not
 * re-ask about a draft the writer already answered for.
 */
let askedFor: string | null = null;

export function shouldNudge(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length >= NUDGE_UNDER_CHARS) return false;
  return askedFor !== trimmed;
}

/** Called when the nudge has been shown, so it is not shown again for this text. */
export function markNudged(text: string): void {
  askedFor = text.trim();
}

/** A posted or abandoned draft clears the memory for the next confession. */
export function resetNudge(): void {
  askedFor = null;
}
