/**
 * Native OAuth flows — Apple (iOS only) and Google (all platforms).
 *
 * Apple uses the native Sign in with Apple sheet (expo-apple-authentication).
 * Google uses Supabase's OAuth redirect + PKCE via an in-app browser session
 * (expo-web-browser). Both return true on success, false on user cancellation
 * or Android dismiss (deep link still pending), and throw on unexpected errors.
 *
 * REDIRECT_URL must be added to Supabase Auth → URL Configuration → Allowed
 * Redirect URLs before either provider will work in production.
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

const REDIRECT_URL = Linking.createURL('auth');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract a named param from a URL string using [?&#]key=value. */
function extractParam(url: string, key: string): string | null {
  const match = url.match(new RegExp(`[?&#]${key}=([^&# ]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// ── Apple ─────────────────────────────────────────────────────────────────────

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple(): Promise<boolean> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
  } catch (err: any) {
    if (err?.code === 'ERR_REQUEST_CANCELED') return false;
    throw err;
  }

  const { identityToken } = credential;
  if (!identityToken) throw new Error('Apple did not return an identity token.');

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token:    identityToken,
  });
  if (error) throw error;

  return true;
}

// ── Google ────────────────────────────────────────────────────────────────────

/**
 * Returns true when the session is fully established (iOS success path or
 * implicit token path). Returns false when the browser closes without a
 * success URL — on Android this always happens because openAuthSessionAsync
 * is a polyfill that returns 'dismiss' as soon as Chrome Custom Tabs closes,
 * regardless of whether OAuth completed. In that case the PKCE code arrives
 * via the Linking deep-link event and handleDeepLink (index.tsx) finishes
 * the exchange. The caller must keep the loading state alive until it does.
 */
export async function signInWithGoogle(): Promise<boolean> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options:  { redirectTo: REDIRECT_URL, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Supabase did not return an OAuth URL.');

  // Logged because a redirect mismatch is invisible from the app's side: if
  // REDIRECT_URL is not in the project's allowlist, Supabase silently falls
  // back to the Site URL and the browser simply never returns here. Knowing
  // what we asked for, and how the browser came back, separates "not
  // allowlisted" from "user cancelled" in one line of logcat.
  console.warn('[auth] oauth redirect requested:', REDIRECT_URL);
  const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_URL);
  console.warn('[auth] browser returned:', result.type);
  if (result.type !== 'success') {
    // Android: browser closed (dismiss). The deep-link handler in index.tsx
    // will complete the exchange and clear the loading state. Signal the
    // caller to wait instead of dismissing the spinner immediately.
    return false;
  }

  const url = result.url;

  const code = extractParam(url, 'code');
  if (code) {
    // handleDeepLink in index.tsx may have already exchanged this code via the
    // Linking listener — ignore "code already used" errors if session exists.
    const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code);
    if (exchErr) {
      const { data: { session } } = await supabase.auth.getSession().catch(
        () => ({ data: { session: null } }),
      );
      if (!session?.user) throw exchErr;
    }
    return true;
  }

  const accessToken  = extractParam(url, 'access_token');
  const refreshToken = extractParam(url, 'refresh_token');
  if (accessToken && refreshToken) {
    const { error: sessErr } = await supabase.auth.setSession({
      access_token:  accessToken,
      refresh_token: refreshToken,
    });
    if (sessErr) throw sessErr;
    return true;
  }

  // No code and no token means the provider round-trip FAILED and Supabase
  // put the reason in the URL. Log it — redacting only the three params that
  // are actually credentials, because "no code or token" on its own says
  // nothing about why, which cost a full debug cycle to discover.
  const redacted = url.replace(
    /\b(code|access_token|refresh_token)=[^&#]*/g,
    '$1=<redacted>',
  );
  console.warn('[auth] no credential in redirect:', redacted);
  throw new Error(`OAuth returned ${result.type} with no code or token.`);
}
