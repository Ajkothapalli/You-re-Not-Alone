/**
 * [N1] Talking to the server about this device.
 *
 * Thin on purpose. Every one of these is fire-and-forget from the app's
 * point of view: a failed registration means notifications quietly do not
 * arrive, which is bad, but a failed registration that blocks a screen or
 * throws into a render is worse. Nothing here is ever awaited by the UI.
 *
 * The account is never sent. Every function below is authenticated by the
 * JWT and the server reads account_id from it — see register-push.
 */

import * as Localization from 'expo-localization';
import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * The device's IANA timezone.
 *
 * Quiet hours are meaningless without it. Intl is the source of truth here
 * rather than expo-localization's calendar list, because it is what the
 * server-side rules also use — the two must agree on the string or a
 * device will be quiet at the wrong hours.
 */
export function deviceTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) return tz;
  } catch { /* fall through */ }
  try {
    return Localization.getCalendars()[0]?.timeZone ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

async function call(body: Record<string, unknown>): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;
    const { error } = await supabase.functions.invoke('register-push', { body });
    return !error;
  } catch {
    return false;
  }
}

/** After a grant. Records the token so anything can ever be sent. */
export async function registerPushToken(token: string): Promise<boolean> {
  return call({
    action:   'register',
    token,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    tz:       deviceTimezone(),
  });
}

/**
 * On launch, when permission is ALREADY granted.
 *
 * Refreshes last_seen_at, which the weekly-question cron uses to skip
 * devices nobody has opened in a month. It requests nothing — see
 * existingToken() in lib/pushPermission.ts, which returns null rather than
 * prompting when permission is not already granted.
 */
export async function touchPushDevice(token: string): Promise<boolean> {
  return call({ action: 'seen', token });
}

/**
 * Sign-out. Drops THIS device's token, not the account's others.
 *
 * Someone signing out on a shared phone must stop receiving another
 * person's felt notifications on it — and a felt notification is about a
 * confession they wrote, so leaving it registered would leak authorship to
 * whoever signs in next.
 */
export async function unregisterPushToken(token: string): Promise<boolean> {
  return call({ action: 'remove', token });
}

// ─── Preferences ─────────────────────────────────────────────────────────────

export interface PushPrefs {
  felt_on:     boolean;
  question_on: boolean;
  quiet_hours: boolean;
  discreet:    boolean;
}

/**
 * Update one or more toggles.
 *
 * `master: false` is not a column — it deletes this account's tokens, so
 * the server stops having anywhere to send. A boolean would leave a live
 * token on a device belonging to somebody who has said no, one bug away
 * from being used.
 */
export async function updatePushPrefs(
  patch: Partial<PushPrefs> | { master: false },
): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;
    const { error } = await supabase.functions.invoke('update-push-prefs', { body: patch });
    return !error;
  } catch {
    return false;
  }
}
