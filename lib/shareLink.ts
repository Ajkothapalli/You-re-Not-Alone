/**
 * The link that travels with a shared card.
 *
 * Pure string building, kept apart from the share sheet so the rules below can
 * be tested without a native module in the room.
 *
 * ── What may be in this URL, and what may never be ──────────────────────────
 * ONLY two things: the bucket the share came from (`match` | `rtue` | `read`)
 * and, when one was minted, a random invite token.
 *
 * Never: a confession id, an account id, an author token, a persona, a felt
 * count, a timestamp, or anything derived from any of them. The card beside
 * this link shows a confession. Anything in the URL that identifies WHICH
 * confession, or WHO sent it, ties a person to that confession the moment two
 * shares are compared — which is the exact link CLAUDE.md #3 exists to prevent.
 *
 * The token is not an exception to that rule: it is random, minted per share,
 * and encodes nothing. Two tokens cannot be shown to belong to one person by
 * anyone but the server. See supabase/functions/create-share-token.
 */

/**
 * The share buckets. Defined here rather than on a card component because it
 * is a property of the LINK — these three strings are the only values that may
 * ever appear as `?c=` — and the card that happened to declare it first is
 * gone.
 */
export type ShareSource = 'match' | 'rtue' | 'read' | 'question' | 'invite';

export const SHARE_ORIGIN = 'https://soulyap.me';

/** 10 base62 characters — the shape create-share-token mints. */
export const TOKEN_RE = /^[A-Za-z0-9]{10}$/;

export function isValidToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token);
}

/**
 * `https://soulyap.me/s?c=<bucket>` — plus `&t=<token>` when one was minted.
 *
 * A malformed or missing token drops silently to the bucket-only link. Sharing
 * must never fail because attribution did: the card is the point, the token is
 * a nice-to-have, and a writer who taps Share gets a share.
 */
export function buildShareLink(source: ShareSource, token?: string | null): string {
  const base = `${SHARE_ORIGIN}/s?c=${encodeURIComponent(source)}`;
  return isValidToken(token) ? `${base}&t=${token}` : base;
}

/**
 * What rides alongside the image in the share sheet.
 *
 * No confession text. The words are in the picture, where the reader sees them
 * with the framing the card gives them — pasted as plain text into a chat they
 * are just someone's private sentence stripped of every bit of that care.
 */
export function shareMessage(link: string): string {
  return `Someone said this out loud on soulyap.\n${link}`;
}
