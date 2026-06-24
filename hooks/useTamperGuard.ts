/**
 * useTamperGuard — jailbreak/root + debugger detection.
 *
 * Advisory ONLY: a compromised device should lower trust or add friction to
 * sensitive actions, never be the sole line of defense (these checks can be
 * bypassed). Verify trust server-side; never block the crisis path.
 *
 * Provider pattern: register a native checker (e.g. jail-monkey) at startup in
 * a dev/EAS build. Defaults to "not compromised" (no-op) for Expo Go.
 */

import { useEffect, useState } from 'react';

type TamperChecker = () => Promise<boolean> | boolean; // true = compromised

let checker: TamperChecker | null = null;

/** Wire jail-monkey (or similar) here. See hooks/SECURITY.md. */
export function registerTamperChecker(c: TamperChecker): void {
  checker = c;
}

export function useTamperGuard(): { compromised: boolean } {
  const [compromised, setCompromised] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(checker ? checker() : false)
      .then((v) => { if (!cancelled) setCompromised(!!v); })
      .catch(() => { /* fail open: never lock the user out on a flaky check */ });
    return () => { cancelled = true; };
  }, []);

  return { compromised };
}
