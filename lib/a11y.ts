/**
 * Accessibility helpers.
 *
 * - useReducedMotion(): tracks the OS "Reduce Motion" setting so animated
 *   surfaces can fall back to instant/quiet states. Honour it for anything
 *   that moves, pulses, drifts, or springs.
 * - announce(): pushes a message to the screen reader (VoiceOver / TalkBack)
 *   for state changes that aren't tied to a focus change — errors, the
 *   celebration moment, a revealed match, a sent report.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (mounted) setReduced(v); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}

export function announce(message: string): void {
  if (!message) return;
  AccessibilityInfo.announceForAccessibility(message);
}

/** True when a screen reader (VoiceOver/TalkBack) is currently running. */
export function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((v) => { if (mounted) setOn(v); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => { mounted = false; sub.remove(); };
  }, []);
  return on;
}
