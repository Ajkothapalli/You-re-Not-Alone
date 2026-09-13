/**
 * Single-use claim on an OAuth callback credential.
 *
 * A Google PKCE `code` (and a magic-link `access_token`) can be exchanged
 * exactly once. It can reach us from up to three places for the same sign-in:
 *
 *   1. `WebBrowser.openAuthSessionAsync`'s resolved success URL (lib/oauth.ts)
 *   2. the `Linking` 'url' event listener (app/index.tsx)
 *   3. `Linking.getInitialURL()` when the redirect cold-starts the app, and
 *      the `?code=` query param expo-router parses onto the /auth route
 *
 * Whichever loses the race gets "code already used" back from Supabase and
 * lands in an error path, where it used to clobber the winner's in-flight
 * routing. This module is the check-and-claim that makes that impossible:
 * the first caller wins, every later caller becomes a true no-op.
 *
 * It lives at MODULE scope on purpose. This used to be a `useRef` inside
 * IndexScreen, which is wrong for the cold-start path — the callback arrives
 * on /auth, IndexScreen mounts afterwards, and a per-component ref starts
 * empty and re-claims a code another screen is already exchanging. Module
 * state outlives every mount, which is the lifetime the claim actually needs.
 *
 * The set is small and bounded by sign-in attempts within one process; it is
 * never persisted, because a claim is only meaningful for as long as the
 * exchange it guards can still be in flight.
 */

const claimed = new Set<string>();

/**
 * Claim `credential` for exchange. Returns true exactly once per value.
 *
 * Synchronous by design: the check and the claim must not be separated by an
 * await, or two callers can both pass the check before either claims. JS's
 * single-threaded execution is what makes this safe.
 */
export function claimAuthCredential(credential: string): boolean {
  if (claimed.has(credential)) return false;
  claimed.add(credential);
  return true;
}

/** True if some other caller is already exchanging (or has exchanged) this value. */
export function isAuthCredentialClaimed(credential: string): boolean {
  return claimed.has(credential);
}

/** The PKCE authorization code in a callback URL, if it carries one. */
export function extractAuthCode(url: string): string | null {
  const m = url.match(/[?&#]code=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** True if this URL is an auth callback we can actually complete a sign-in from. */
export function isAuthCallbackUrl(url: string): boolean {
  return /[?&#]code=/.test(url) || url.includes('access_token');
}
