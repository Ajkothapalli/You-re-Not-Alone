/**
 * useAppIntegrity — device/app attestation (Apple App Attest / Google Play
 * Integrity). Proves a request comes from the genuine, unmodified app on a real
 * device — the strongest client signal against emulators, tampered clients,
 * and bots.
 *
 * CRITICAL: the returned token is only meaningful when VERIFIED SERVER-SIDE
 * (in submit-confession, against Apple/Google) before the request is trusted.
 * The client value here is advisory and must never be the sole gate.
 *
 * Provider pattern: the native attestation is registered once at startup in a
 * dev/EAS build. Defaults to unavailable (no-op) so the app runs in Expo Go.
 */

import { useCallback, useEffect, useState } from 'react';

export interface IntegrityResult {
  available: boolean; // attestation supported on this device/build
  attested: boolean;  // device/app passed attestation
  token?: string;     // opaque token to be verified server-side
}

type IntegrityProvider = () => Promise<IntegrityResult>;

let provider: IntegrityProvider | null = null;

/** Wire App Attest (iOS) / Play Integrity (Android) here. See hooks/SECURITY.md. */
export function registerIntegrityProvider(p: IntegrityProvider): void {
  provider = p;
}

const UNAVAILABLE: IntegrityResult = { available: false, attested: false };

export function useAppIntegrity(): IntegrityResult & { refresh: () => void } {
  const [result, setResult] = useState<IntegrityResult>(UNAVAILABLE);

  const refresh = useCallback(() => {
    const run = provider ? provider() : Promise.resolve(UNAVAILABLE);
    run.then(setResult).catch(() => setResult(UNAVAILABLE));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...result, refresh };
}
