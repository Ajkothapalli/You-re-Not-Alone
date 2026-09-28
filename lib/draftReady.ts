/**
 * Is there enough here to submit? Instant feedback for the Let-it-out button.
 *
 * A CLIENT MIRROR of the cheap half of [3.6] SUBSTANCE's Layer 1 — the length
 * floor only. The server is the authority and always re-checks; this exists so
 * the button is obviously not ready yet, instead of the writer tapping it and
 * waiting for a round trip to be told the same thing.
 *
 * ── Only the length floor, deliberately ─────────────────────────────────────
 * Not repetition, not contact details, not the meaning check. Those all reject
 * text the writer has already finished typing, and discovering mid-sentence
 * that the button has gone dead — with no explanation — is worse than tapping
 * it and getting a sentence that explains itself. The floor is the only rule
 * where "not yet" is the honest reading.
 *
 * The server copy lives in supabase/functions/_shared/substance.ts. They must
 * agree on the floor, and a test asserts it on a shared corpus: a client that
 * is STRICTER than the server would block a confession the server would have
 * accepted, which is the failure that matters.
 */

/** Matches substance.ts MIN_WORDS. "I cheated." is a complete confession. */
export const MIN_WORDS = 2;
/** Matches substance.ts MIN_LETTERS_NO_SPACE. */
export const MIN_LETTERS_NO_SPACE = 6;

/** Han, Hiragana, Katakana, Thai, Lao, Khmer, Myanmar — kept in step with the server. */
const NO_SPACE_SCRIPT =
  /[㐀-䶿一-鿿぀-ゟ゠-ヿ฀-๿຀-໿ក-៿က-႟]/u;

export function isDraftReady(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  const letters = trimmed.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return false;

  const noSpace = letters.filter((c) => NO_SPACE_SCRIPT.test(c)).length;
  if (noSpace / letters.length >= 0.5) {
    // A complete Chinese sentence can be eight characters and one "word";
    // the character and word floors would both reject it.
    return letters.length >= MIN_LETTERS_NO_SPACE;
  }

  const words = trimmed.match(/\p{L}+/gu) ?? [];
  return words.length >= MIN_WORDS;
}
