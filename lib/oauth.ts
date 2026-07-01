/**
 * Native OAuth flows — Apple (iOS only) and Google (all platforms).
 *
 * Apple uses the native Sign in with Apple sheet (expo-apple-authentication).
 * Google uses Supabase's OAuth redirect + PKCE via an in-app browser session
 * (expo-web-browser). Both return true on success, false on user cancellation,
 * and throw on unexpected errors.
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
    // In Expo Go (and any binary built before expo-apple-authentication was
    // added) the native module is absent — isAvailableAsync rejects/throws.
    // Treat that as "unavailable" so the UI hides the button instead of
    // rendering the native view and crashing with "Unimplemented component".
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

export async function signInWithGoogle(): Promise<boolean> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options:  { redirectTo: REDIRECT_URL, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Supabase did not return an OAuth URL.');

  // openAuthSessionAsync opens an ASWebAuthenticationSession modal sheet —
  // no system Safari handoff, no "Open in X?" dialog. The second argument
  // is the redirect scheme Expo should intercept to close the modal.
  const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_URL);
  if (result.type !== 'success') {
    // On Android, the Linking listener in index.tsx may have already exchanged
    // the PKCE code and dismissed the browser — check for an existing session
    // before reporting failure so we don't block the caller unnecessarily.
    const { data: { session } } = await supabase.auth.getSession().catch(
      () => ({ data: { session: null } }),
    );
    if (session?.user) return true;
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

  throw new Error('OAuth completed but no token was returned.');
}
