/**
 * soulyap client security hooks — defense-in-depth only.
 * See hooks/SECURITY.md for the layered model (edge → server → client) and the
 * native wiring for the provider-based hooks.
 */

export { useAppLock } from './useAppLock';
export { useScreenCaptureGuard, registerScreenCaptureControls } from './useScreenCaptureGuard';
export type { ScreenCaptureControls } from './useScreenCaptureGuard';
export { useAppIntegrity, registerIntegrityProvider } from './useAppIntegrity';
export type { IntegrityResult } from './useAppIntegrity';
export { useTamperGuard, registerTamperChecker } from './useTamperGuard';
export { useSecureFetch } from './useSecureFetch';
