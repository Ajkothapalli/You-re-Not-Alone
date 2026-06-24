/**
 * useAppLock — locks the UI when the app is sent to the background, so a
 * confession left open isn't exposed if the phone is handed over or stolen.
 *
 * Defense-in-depth only. Pair with the OS device lock; this is not auth.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

interface Options {
  /** Grace period (ms) the app may be backgrounded before locking. 0 = immediate. */
  backgroundMs?: number;
  /** Start locked (e.g. require unlock on cold start). */
  initiallyLocked?: boolean;
}

export function useAppLock(opts: Options = {}) {
  const backgroundMs = opts.backgroundMs ?? 0;
  const [locked, setLocked] = useState(opts.initiallyLocked ?? false);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        if (backgroundedAt.current === null) backgroundedAt.current = Date.now();
      } else if (next === 'active') {
        const since = backgroundedAt.current;
        backgroundedAt.current = null;
        if (since !== null && Date.now() - since >= backgroundMs) setLocked(true);
      }
    });
    return () => sub.remove();
  }, [backgroundMs]);

  const lock = useCallback(() => setLocked(true), []);
  const unlock = useCallback(() => setLocked(false), []);

  return { locked, lock, unlock };
}
