/**
 * useSecureFetch — hardened client fetch for any direct network call.
 *  • forces HTTPS (blocks accidental cleartext)
 *  • timeout + abort (no hung requests)
 *  • standard JSON headers
 *  • NEVER logs request/response bodies — confession text must never reach logs
 *
 * This is client hardening, not a security boundary. The server still verifies
 * auth, validates input, and rate-limits every request.
 */

import { useCallback } from 'react';

const DEFAULT_TIMEOUT_MS = 15000;

export function useSecureFetch() {
  return useCallback(
    async (url: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> => {
      if (!/^https:\/\//i.test(url)) {
        throw new Error('useSecureFetch: refusing non-HTTPS request');
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, {
          ...init,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(init.headers ?? {}),
          },
        });
      } finally {
        clearTimeout(timer);
      }
    },
    [],
  );
}
