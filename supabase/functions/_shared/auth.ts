/**
 * One place that turns a request into a verified user id.
 *
 * Every function used to call `supabase.auth.getUser(jwt)`, which makes a
 * NETWORK round trip to /auth/v1/user on every single request. Fifteen
 * functions, every call, sitting in front of everything else they do.
 *
 * Both projects publish an ES256 JWKS key, so the token can be verified
 * LOCALLY against a cached public key — no round trip at all once the key set
 * is fetched. `getClaims()` does exactly that.
 *
 * ── The security difference, stated plainly ─────────────────────────────────
 * This is not a pure optimisation and should not be read as one.
 *
 * `getUser()` asks the auth server, so it reflects revocation IMMEDIATELY: a
 * signed-out or deleted user is refused on the next call. Local verification
 * only proves the token was signed by this project and has not expired — a
 * token revoked mid-life stays cryptographically valid until it expires.
 *
 * Why that is acceptable here, specifically:
 *   - The checks that actually protect people are unchanged and still run
 *     server-side on every request: the account must exist, must not be
 *     banned, must not be temp-banned, and rate limits still apply. A banned
 *     account is refused on its very next call regardless of its token.
 *   - Access tokens are short-lived (one hour by default), so the window is
 *     bounded and is the same window every JWT-based system accepts.
 *   - Nothing here grants new capability. It decides WHO is calling; what
 *     they may do is still decided downstream, by RLS and by those checks.
 *
 * What this must never be used for: deciding that a user is allowed to do
 * something. It answers "who signed this token", nothing more.
 *
 * ── Failing closed ──────────────────────────────────────────────────────────
 * Every failure path returns null. A malformed token, a wrong issuer, an
 * expired token, a missing subject, or an unexpected error all mean "not
 * authenticated" — never "probably fine".
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';

export interface VerifiedUser {
  id: string;
}

/**
 * Verify a bearer token and return the user id.
 *
 * Falls back to getUser() when local verification is unavailable — an older
 * supabase-js, or a project that has not enabled asymmetric keys. The
 * fallback is slower, not weaker, so falling back is always safe.
 */
export async function verifyJwt(
  supabase: SupabaseClient,
  jwt: string | null | undefined,
): Promise<VerifiedUser | null> {
  if (!jwt || typeof jwt !== 'string') return null;

  const auth = supabase.auth as unknown as {
    getClaims?: (t: string) => Promise<{ data: unknown; error: unknown }>;
  };

  if (typeof auth.getClaims === 'function') {
    try {
      const { data, error } = await auth.getClaims(jwt);
      if (!error && data) {
        // getClaims has returned two shapes across versions: the claims
        // object directly, and { claims }. Read both rather than pinning to
        // whichever one this version happens to use.
        const holder = data as { claims?: Record<string, unknown> };
        const claims = (holder.claims ?? data) as Record<string, unknown>;
        const sub = claims?.sub;
        if (typeof sub === 'string' && sub.length > 0) return { id: sub };
      }
      // A token that verified but carries no subject is malformed, not a
      // reason to try again over the network with the same bytes.
      if (!error) return null;
    } catch {
      // Fall through: a thrown getClaims (no cached JWKS yet, a transient
      // fetch failure) should degrade to the slower path, not to a 401.
    }
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(jwt);
    if (error || !user) return null;
    return { id: user.id };
  } catch {
    return null;
  }
}

/** Pull the bearer token out of a request. Returns null when absent. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization') ?? '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/** The common case: verify the caller, or null. */
export async function requireUser(
  supabase: SupabaseClient,
  req: Request,
): Promise<VerifiedUser | null> {
  return verifyJwt(supabase, bearerToken(req));
}
