/**
 * useScreenCaptureGuard — blocks screenshots / screen recording while a
 * sensitive screen is mounted (writing a confession, viewing a match).
 *
 * Provider pattern (keeps this folder dependency-free and Metro-safe): the
 * native controls (expo-screen-capture) are registered once at startup in a
 * dev/EAS build. Until then this no-ops safely (e.g. in Expo Go).
 */

import { useEffect } from 'react';

export interface ScreenCaptureControls {
  prevent: () => void;
  allow: () => void;
}

let controls: ScreenCaptureControls | null = null;

/** Wire expo-screen-capture here in a dev/EAS build. See hooks/SECURITY.md. */
export function registerScreenCaptureControls(c: ScreenCaptureControls): void {
  controls = c;
}

/** Prevent capture while `active` (default true) and this component is mounted. */
export function useScreenCaptureGuard(active = true): void {
  useEffect(() => {
    if (!active || !controls) return;
    controls.prevent();
    return () => controls?.allow();
  }, [active]);
}
