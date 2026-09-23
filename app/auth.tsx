/**
 * OAuth callback route (`soulyap://auth?code=…`).
 *
 * THE "STUCK ON LOADING AFTER GOOGLE SIGN-IN" BUG LIVED HERE. What this file
 * used to be: a bare <ActivityIndicator /> and a comment saying it existed
 * "only to prevent Expo Router from showing Unmatched Route — the actual code
 * exchange is handled by Linking.addEventListener in index.tsx". That comment
 * described a screen with no exit. Expo Router NAVIGATES to this route when the
 * Google redirect deep-links back, so it is not an invisible placeholder: it is
 * the screen on top, and it never moved off itself.
 *
 * Why it only bit FIRST-TIME users, which is the detail that pins the cause:
 *   - Returning user → routeAfterAuth() ends in router.replace('/explore').
 *     That is a navigation, and it replaces whatever route is current — /auth
 *     included. The user escapes by side effect, so the bug looks fixed.
 *   - New user → routeAfterAuth() ends in setStep('dob'). Pure local state on
 *     IndexScreen, which is mounted UNDERNEATH this route. The DOB form renders
 *     correctly and is completely invisible, because this spinner is still on
 *     top of it. Nothing here ever called back, popped, or replaced. Forever.
 *
 * And on a cold start it was worse and not first-time-specific at all: if
 * Android reaps the app while the Chrome Custom Tab is foregrounded (most
 * likely on a first sign-in, which is the slowest — account picker plus consent
 * screen), the redirect launches the app fresh with /auth as the INITIAL route.
 * IndexScreen never mounts, so the Linking listener this file delegated to does
 * not exist, and nothing exchanges the code at all.
 *
 * The fix is to give the route an exit that does not depend on another screen's
 * side effects: hand the callback URL to "/" and replace ourselves out of the
 * stack. IndexScreen owns the exchange and the routing either way — this route
 * now only makes sure it gets the URL and gets off the screen. Handing off
 * rather than exchanging here keeps one owner for the post-auth routing rules
 * (age gate, prefs, RTUE) instead of a second copy that will drift.
 */

import { isAuthCallbackUrl } from '@/lib/authCallback';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily } from '@/theme/tokens';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { QuoteLeft, QuoteRight } from '@/components/brand/SoulyapLogo';

export default function AuthCallbackScreen() {
  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);

  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const codeParam = Array.isArray(params.code) ? params.code[0] : params.code;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Two sources, because neither is reliable alone:
      //   - getInitialURL() carries the whole URL including the #fragment (the
      //     implicit magic-link flow lives there), but on a WARM deep link
      //     Android may still report the intent that originally launched the
      //     activity rather than this one.
      //   - the router's parsed `code` param is always this navigation's, but
      //     a fragment is not part of the path or query, so it never appears.
      // Prefer the full URL when it is genuinely a callback; fall back to
      // rebuilding a minimal one from the param.
      const initial = await Linking.getInitialURL().catch(() => null);
      const authUrl =
        initial && isAuthCallbackUrl(initial)
          ? initial
          : codeParam
            ? `soulyap://auth?code=${encodeURIComponent(codeParam)}`
            : null;

      if (cancelled) return;

      // No credential to hand over (a cancelled consent screen arrives as
      // ?error=access_denied). Go to "/" with no param: runBoot finds no
      // session and lands on the email step, which is the right place to be
      // after backing out of Google.
      if (!authUrl) { router.replace('/'); return; }

      router.replace({ pathname: '/', params: { authUrl } });
    })();

    return () => { cancelled = true; };
    // Deliberately mount-only. A second navigation to /auth for the same code
    // is de-duped downstream by claimAuthCredential, so re-running on a param
    // change would buy nothing and risks a replace loop.
  }, []);

  // Pixel-identical to IndexScreen's 'loading' step so the handoff does not
  // flash a different screen. The old version showed a bare amber spinner on
  // an empty background — visibly NOT the app's loading splash, which is how
  // this route was identifiable in the wild.
  return (
    <View style={styles.center}>
      <View style={styles.logoRow}>
        <QuoteLeft style={styles.logoLeft} />
        <QuoteRight style={styles.logoRight} />
      </View>
      <Text style={styles.wordmark} accessibilityRole="header">soulyap</Text>
      <ActivityIndicator
        color={color.dim}
        style={{ marginTop: 20 }}
        accessibilityLabel="Finishing sign-in"
      />
    </View>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    center: {
      flex:            1,
      backgroundColor: color.bg,
      justifyContent:  'center',
      alignItems:      'center',
    },
    logoRow: {
      flexDirection: 'row',
      width:         140,
      height:        140,
      marginBottom:  -28,
    },
    logoLeft:  { width: 140 * 0.4111,       height: 140 },
    logoRight: { width: 140 * (1 - 0.4111), height: 140 },
    wordmark: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      30,
      color:         color.paper,
      textAlign:     'center',
      textTransform: 'none',
    },
  });
}
