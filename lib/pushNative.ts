/**
 * [N1] The ONE place expo-notifications is loaded.
 *
 * ── Why a guarded require and not an import ─────────────────────────────────
 * `expo-notifications` is a NATIVE module. Its JS evaluates
 * `requireNativeModule('ExpoPushTokenManager')` at module scope, so on a
 * binary that does not carry the native side the failure is not a null
 * return or a rejected promise — it is a THROW during module evaluation,
 * before a single line of the importing file has run.
 *
 * That is what took the app down on 2026-10-02: `app/_layout.tsx` imported
 * it on line 1, the iOS dev client predated N1 adding the dependency, and
 * the app died at the root layout with "Cannot find native module
 * 'ExpoPushTokenManager'". Every call site in lib/pushPermission.ts was
 * already wrapped in try/catch and none of it helped, because nothing had
 * got as far as a call.
 *
 * This is not only a stale-dev-client problem. `EXPO_PUBLIC_*` aside, an
 * `eas update` reaches installs built BEFORE this dependency existed, and
 * a static import would be a boot crash landing automatically, with no
 * store review in the way. lib/shareCard.ts carries the same guard for
 * `react-native-share` and `expo-clipboard`, for the same reason and in
 * the same shape.
 *
 * ── What this file deliberately does NOT do ─────────────────────────────────
 * It does not wrap the API in friendlier functions. It hands back the
 * module or null, so the literal calls — `requestPermissionsAsync` above
 * all — stay written out at their real call sites, where
 * __tests__/invariants.push.test.ts can see them. A wrapper here would
 * move the one call that may only exist in one file into a file that is
 * not that file.
 */

/** The slice of expo-notifications this app actually uses. */
export interface PushNative {
  getPermissionsAsync: () => Promise<{
    granted: boolean; status: string; canAskAgain: boolean;
  }>;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  getExpoPushTokenAsync: (opts?: { projectId?: string }) => Promise<{ data?: string }>;
  setNotificationChannelAsync: (id: string, channel: Record<string, unknown>) => Promise<unknown>;
  getLastNotificationResponseAsync: () => Promise<null | {
    notification: { request: { content: { data: unknown } } };
  }>;
  addNotificationResponseReceivedListener: (
    cb: (res: { notification: { request: { content: { data: unknown } } } }) => void,
  ) => { remove: () => void };
  AndroidImportance: Record<string, number>;
  AndroidNotificationVisibility: Record<string, number>;
}

let mod: PushNative | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const m = require('expo-notifications');
  const candidate = (m?.default ?? m) as PushNative | undefined;
  // Presence of the JS is not presence of the NATIVE side. A build missing
  // the module can still resolve the package and hand back something
  // without the functions on it.
  mod = typeof candidate?.getPermissionsAsync === 'function' ? candidate : null;
} catch {
  mod = null;
}

/**
 * True when this binary can do push at all.
 *
 * Everything push-related must read as "off" rather than "broken" when this
 * is false: no card, no toggle doing nothing, no error. A reader on an old
 * build simply does not get notifications, which is exactly where they
 * already were.
 */
export const PUSH_AVAILABLE = mod !== null;

/** The module, or null on a binary without the native side. */
export function pushNative(): PushNative | null {
  return mod;
}
