/**
 * [N1] The ONLY file that may show the system notification dialog.
 *
 * Enforced by __tests__/invariants.push.test.ts, which fails if
 * requestPermissionsAsync appears anywhere else under app/, components/,
 * lib/ or hooks/.
 *
 * ── Why a single chokepoint ─────────────────────────────────────────────────
 * The dialog can be shown once. Android and iOS both remember the answer,
 * neither offers a second chance, and a "no" stands until somebody walks
 * into their phone settings — which almost nobody does. A stray call at
 * launch, in onboarding, or on a screen reached by accident spends that one
 * chance at the worst possible moment, and it cannot be taken back.
 *
 * Two callers are allowed, and both are a deliberate tap on a control that
 * says what it does:
 *   - the primary button on PushAskCard, after the explanation
 *   - the master toggle in Settings
 *
 * ── Reading is not asking ───────────────────────────────────────────────────
 * `currentPermission()` uses getPermissionsAsync, which never shows
 * anything. Anywhere may call it.
 */

import { pushNative } from './pushNative';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { PermissionState } from './pushAsk';

export const CHANNEL_ID = 'soulyap';

/**
 * Read the current state without prompting.
 *
 * `blocked` is the state worth separating out: the OS will not show the
 * dialog again, so the card must never appear and only the Settings toggle
 * — which opens the phone's own settings — is any use.
 */
export async function currentPermission(): Promise<PermissionState> {
  try {
    const N = pushNative();
    // No native module, no permission to speak of. 'denied' rather than
    // 'undetermined' so nothing offers to ask — see the catch below.
    if (!N) return 'denied';
    const p = await N.getPermissionsAsync();
    if (p.granted) return 'granted';
    if (p.status === 'undetermined') return 'undetermined';
    // canAskAgain false = the OS is finished with us.
    return p.canAskAgain ? 'denied' : 'blocked';
  } catch {
    // Treat an unreadable state as already-answered: the safe direction is
    // not showing a card, because the cost of the other mistake is a spent
    // dialog.
    return 'denied';
  }
}

/**
 * The Android channel.
 *
 * MUST be created before getExpoPushTokenAsync — the SDK 56 docs are
 * explicit about that ordering, and a token obtained first arrives on a
 * device with no channel to deliver into.
 *
 * lockscreenVisibility PRIVATE is the one setting here that is a product
 * decision rather than plumbing: on a secure lock screen Android then shows
 * "Contents hidden" instead of the body. Somebody whose phone is on a desk,
 * or shared, does not have "someone felt what you wrote" read by whoever
 * walks past. PUBLIC would undo the point of the whole feature.
 *
 * No custom sound: the default is what the person has already chosen for
 * their phone, and a bespoke one is this app deciding it deserves to be
 * recognisable from across a room.
 */
export async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const N = pushNative();
    if (!N) return;
    await N.setNotificationChannelAsync(CHANNEL_ID, {
      name:                 'soulyap',
      importance:           N.AndroidImportance.DEFAULT,
      lockscreenVisibility: N.AndroidNotificationVisibility.PRIVATE,
      sound:                null,
      vibrationPattern:     undefined,
      showBadge:            false,
    });
  } catch {
    // A channel that could not be created is not a reason to fail the
    // grant; Android falls back to its default channel.
  }
}

export interface AskResult {
  granted: boolean;
  /** Present on a grant. Null when the token could not be obtained. */
  token:   string | null;
}

/**
 * Show the dialog. THE one call site.
 *
 * Returns the outcome and, on a grant, the Expo token. Never throws: a
 * failure here becomes `granted: false`, which the caller handles as a
 * decline — the same path, and no worse than being told no.
 */
export async function requestAndRegister(): Promise<AskResult> {
  try {
    const N = pushNative();
    // Reads as a decline, which is the path the caller already handles.
    if (!N) return { granted: false, token: null };

    // The channel first — see ensureChannel.
    await ensureChannel();

    const res = await N.requestPermissionsAsync();
    if (!res.granted) return { granted: false, token: null };

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId
      ?? (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;

    // projectId passed explicitly rather than left to the default. The docs
    // recommend it, and in a bare or misconfigured build the default
    // resolves to undefined and the call throws — which would turn a
    // successful grant into a silent no-token state.
    const token = await N.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return { granted: true, token: token.data ?? null };
  } catch {
    return { granted: false, token: null };
  }
}

/**
 * The token for an ALREADY granted permission.
 *
 * Used on launch to refresh last_seen_at. Requests nothing: if permission
 * is not already granted this returns null rather than prompting, which is
 * the difference between "keeping a registration fresh" and "asking again".
 */
export async function existingToken(): Promise<string | null> {
  try {
    const N = pushNative();
    if (!N) return null;
    if ((await currentPermission()) !== 'granted') return null;
    await ensureChannel();
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId
      ?? (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    const token = await N.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return token.data ?? null;
  } catch {
    return null;
  }
}
