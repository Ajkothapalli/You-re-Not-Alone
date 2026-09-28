/**
 * What the after-screen says once a share has actually gone out.
 *
 * The headings rotate so that sharing twice does not produce the same sentence
 * twice — repetition is what turns a moment into a notification.
 *
 * ── The line that is not decoration ─────────────────────────────────────────
 * The subline for someone else's confession is "Only the words travel. Never
 * who wrote them." That is a factual claim about the product, and it is the
 * claim the whole share design has to keep: the card carries no id, no token,
 * no persona and no timestamp (see components/share/QuotedCard.tsx), and the
 * link carries only a bucket and a random token (lib/shareLink.ts). If either
 * of those ever stops being true, this sentence becomes a lie told at the most
 * trusting moment in the app — so it is asserted in tests, not just written.
 */

export const AFTER_HEADINGS_OTHERS = [
  'It’s out there now.',
  'Passed on, gently.',
  'Someone might need this tonight.',
  'Words travel further than we think.',
] as const;

export const AFTER_HEADINGS_OWN = [
  'It’s out there now.',
  'Your words are travelling.',
  'You said it. Now it travels.',
] as const;

export const AFTER_SUBLINE_OTHERS = 'Only the words travel. Never who wrote them.';
export const AFTER_SUBLINE_OWN    = 'Only you know it was you.';

export function afterHeading(own: boolean, n: number): string {
  const pool = own ? AFTER_HEADINGS_OWN : AFTER_HEADINGS_OTHERS;
  const i = Number.isFinite(n) ? Math.abs(Math.trunc(n)) % pool.length : 0;
  return pool[i];
}

export function afterSubline(own: boolean): string {
  return own ? AFTER_SUBLINE_OWN : AFTER_SUBLINE_OTHERS;
}

/** The primary button: the whole point of the screen is the next confession. */
export function afterPrimaryLabel(own: boolean): string {
  return own ? 'Write something new' : 'Say yours';
}
