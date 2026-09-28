/**
 * Install attribution — where a new install came from, read once, on Android.
 *
 * The Play Install Referrer hands us the string the share page put in the
 * install URL: `utm_source=share&utm_campaign=<bucket>&utm_content=<token>`.
 * Two things come out of it and nothing else: a BUCKET for analytics, and a
 * TOKEN held back for the invite claim.
 *
 * ── The token is not analytics data ─────────────────────────────────────────
 * `installAttributed` is called with the bucket alone. A token in an analytics
 * payload would tie a share — and therefore, server-side, an account — to a
 * device and a moment. That is precisely the link the per-share token design
 * exists to prevent (CLAUDE.md #3). The token goes to secure storage and then
 * to one Edge Function that can actually resolve it, and nowhere else: not to
 * analytics, not to a log, not into a URL.
 *
 * ── Read exactly once ───────────────────────────────────────────────────────
 * The referrer survives reinstalls and is readable indefinitely, so without a
 * persisted flag every cold start would re-attribute the same install and
 * inflate the only number this phase is measured by.
 *
 * Android only. The API does not exist elsewhere, and there is no iOS build.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { analytics } from './analytics';

/** Guarded: expo-application is in no binary shipped before this release. */
type AppModule = { getInstallReferrerAsync?: () => Promise<string> };
let appModule: AppModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('expo-application');
  appModule = typeof mod?.getInstallReferrerAsync === 'function' ? mod : null;
} catch {
  appModule = null;
}

const DONE_KEY    = '@yana/install_attributed_v1';
/** Secure, not AsyncStorage: it is a claimable credential until it is spent. */
const PENDING_KEY = 'yana_pending_invite_v1';

export const VALID_BUCKETS = ['match', 'rtue', 'read', 'question', 'invite', 'share'] as const;
export const TOKEN_RE = /^[A-Za-z0-9]{10}$/;

export interface ParsedReferrer {
  bucket: string;
  token:  string | null;
}

/**
 * Pure parse of a Play referrer string. Returns null unless this is one of
 * OUR share installs — an organic install carries a referrer too, and
 * attributing it would be inventing data.
 */
export function parseReferrer(raw: string | null | undefined): ParsedReferrer | null {
  if (!raw || typeof raw !== 'string') return null;

  const params = new URLSearchParams(raw);
  if (params.get('utm_source') !== 'share') return null;

  const campaign = params.get('utm_campaign') ?? '';
  const bucket = (VALID_BUCKETS as readonly string[]).includes(campaign) ? campaign : 'share';

  const raw_t = params.get('utm_content') ?? '';
  const token = TOKEN_RE.test(raw_t) ? raw_t : null;

  return { bucket, token };
}

/**
 * Read the install referrer once and record what it says.
 *
 * Never throws and never blocks startup: every failure leaves the app exactly
 * as it would be on an organic install. Attribution is the least important
 * thing happening on a first launch.
 */
export async function attributeInstallOnce(): Promise<ParsedReferrer | null> {
  if (Platform.OS !== 'android') return null;      // no API, and no iOS build
  if (!appModule?.getInstallReferrerAsync) return null;

  try {
    if (await AsyncStorage.getItem(DONE_KEY)) return null;

    const parsed = parseReferrer(await appModule.getInstallReferrerAsync());

    // Mark done even when the referrer was not ours: the answer will not
    // change on the next launch, and re-reading it forever is wasted work.
    await AsyncStorage.setItem(DONE_KEY, '1');
    if (!parsed) return null;

    // The BUCKET only. See the header.
    analytics.installAttributed(parsed.bucket);

    if (parsed.token) await setPendingInvite(parsed.token);
    return parsed;
  } catch {
    return null;
  }
}

// ─── The pending invite ──────────────────────────────────────────────────────
// Held from install until the user is signed in, because claiming needs a JWT.

export async function setPendingInvite(token: string): Promise<void> {
  if (!TOKEN_RE.test(token)) return;
  try {
    await SecureStore.setItemAsync(PENDING_KEY, token);
  } catch {
    // A device without a keychain simply does not get the gift week. It is
    // not worth falling back to unencrypted storage for a claimable credential.
  }
}

export async function getPendingInvite(): Promise<string | null> {
  try {
    const t = await SecureStore.getItemAsync(PENDING_KEY);
    return t && TOKEN_RE.test(t) ? t : null;
  } catch {
    return null;
  }
}

/** Spent, rejected, or abandoned — either way it is never retried. */
export async function clearPendingInvite(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PENDING_KEY);
  } catch {}
}
