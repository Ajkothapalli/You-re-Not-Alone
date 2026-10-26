import { pushNative } from '@/lib/pushNative';
import { openFromPush } from '@/lib/pushRouting';
import { existingToken } from '@/lib/pushPermission';
import { touchPushDevice } from '@/lib/pushRegistration';
import AnimatedSplash from '../components/AnimatedSplash';
import { markSplashDone } from '../lib/splashGate';
import { DialogHost } from '../components/AppDialog';
import { ToastHost } from '../components/Toast';
import { DraftProvider } from '../lib/draftContext';
import { NotificationsProvider } from '../lib/notificationsContext';
import { PremiumProvider } from '../lib/premiumContext';
import { useRootNavigationState, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useAppFonts } from '../lib/useFonts';
import { ThemeProvider, useTheme } from '../theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => {});

const SHEET_OPTIONS = {
  presentation:                    'formSheet' as const,
  sheetAllowedDetents:             [0.85] as number[],
  sheetGrabberVisible:             true,
  sheetCornerRadius:               28,
  sheetExpandsWhenScrolledToEdge:  false,
  gestureEnabled:                  true,
};

// Plans is taller than the other sheets (badge, heading, three tiers, perks,
// CTA, restore, footnote), so it gets a taller detent — but a FRACTION, not
// 'fitToContents'.
//
// It used to be ['fitToContents'] and rendered as a grey screen on Android.
// That option sizes the sheet from its content's intrinsic height, and
// app/plans.tsx roots at a ScrollView with flex:1 — which has no intrinsic
// height, it expands to fill its parent. The sheet asks the child how tall it
// is, the child answers "as tall as you are", and the measurement resolves to
// zero. The `as any` it needed was the warning: the typings don't accept that
// value here. Every other sheet in this file uses a fraction and works.
const PLANS_SHEET_OPTIONS = {
  presentation:                    'formSheet' as const,
  sheetAllowedDetents:             [0.9] as number[],
  sheetGrabberVisible:             true,
  sheetCornerRadius:               28,
  sheetExpandsWhenScrolledToEdge:  false,
  gestureEnabled:                  true,
};

// Inner component — lives inside ThemeProvider so it can call useTheme().
/**
 * Catches the bug this phase existed to fix, the moment it comes back.
 *
 * The root stack must hold exactly ONE '(tabs)' route and no 'explore' or
 * 'write' route at all. A stray router.push to a tab path, or re-declaring a
 * tab screen at the root, re-creates the pile — and the symptom (screens
 * slowly getting heavier, back walking through old copies) is subtle enough
 * to survive a release unnoticed. This turns it into a console error the
 * first time it happens.
 *
 * __DEV__ only: it is a developer tripwire, not a runtime check.
 */
/**
 * [N1] Opening the app from a notification.
 *
 * Two cases, and forgetting the second is the classic bug: a tap while the
 * app is running (the listener), and a tap that LAUNCHED it, where the
 * response already happened before any listener existed and has to be
 * fetched. Without getLastNotificationResponseAsync, tapping a push on a
 * cold start opens the app on whatever screen it last had.
 *
 * Nothing here requests permission. A device receiving a push has already
 * granted it.
 */
function usePushTaps() {
  useEffect(() => {
    let alive = true;

    /**
     * Null on a binary without the native module — see lib/pushNative.ts.
     * Nothing to listen for on such a build, because nothing can be
     * delivered to it.
     */
    const N = pushNative();
    if (!N) return;

    // The cold-start case.
    void N.getLastNotificationResponseAsync()
      .then((res) => {
        if (!alive || !res) return;
        openFromPush(res.notification.request.content.data);
      })
      .catch(() => {});

    // The warm case.
    const sub = N.addNotificationResponseReceivedListener((res) => {
      openFromPush(res.notification.request.content.data);
    });

    /**
     * Keep last_seen_at fresh, so the weekly-question cron does not skip
     * this device as stale. Reads only: existingToken returns null rather
     * than prompting when permission is not already granted.
     */
    void existingToken()
      .then((token) => { if (token) void touchPushDevice(token); })
      .catch(() => {});

    return () => { alive = false; sub.remove(); };
  }, []);
}

function useSingleTabsGuard() {
  const navigation = useRootNavigationState();
  useEffect(() => {
    if (!__DEV__ || !navigation?.routes) return;
    const names = navigation.routes.map((r: { name: string }) => r.name);
    const tabs  = names.filter((n) => n === '(tabs)').length;
    const stray = names.filter((n) => n === 'explore' || n === 'write');
    if (tabs > 1) {
      console.error(
        `[nav] ${tabs} copies of (tabs) in the root stack — a navigation ` +
        `created a second tab navigator. Use router.dismissTo() from screens ` +
        `above the tabs. Stack: ${names.join(' → ')}`);
    }
    if (stray.length > 0) {
      console.error(
        `[nav] '${stray.join("', '")}' is in the ROOT stack — these live in ` +
        `(tabs) now. Stack: ${names.join(' → ')}`);
    }
  }, [navigation]);
}

function ThemedStack() {
  const { colors, isDark } = useTheme();
  const [splashDone, setSplashDone] = useState(false);

  useSingleTabsGuard();
  usePushTaps();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown:              false,
          contentStyle:             { backgroundColor: colors.bg },
          animation:                'slide_from_right',
          gestureEnabled:           true,
          fullScreenGestureEnabled: true,
        }}
      >
        {/* Auth / onboarding — Stack screens above the tab shell */}
        <Stack.Screen name="index"       />
        <Stack.Screen name="auth"        options={{ animation: 'none' }} />
        <Stack.Screen name="welcome"     />

        {/* Main app shell — tabs live here */}
        <Stack.Screen name="(tabs)"      options={{ animation: 'none', headerShown: false }} />

        {/* Full-screen overlays above the tab shell */}
        <Stack.Screen name="match"       options={SHEET_OPTIONS} />
        <Stack.Screen name="crisis"      />
        <Stack.Screen name="blocked"     />
        <Stack.Screen name="read-detail" />
        <Stack.Screen name="rtue"        />
        <Stack.Screen name="settings"    options={SHEET_OPTIONS} />
        <Stack.Screen name="contact"     options={SHEET_OPTIONS} />
        <Stack.Screen name="plans"       options={PLANS_SHEET_OPTIONS} />
        <Stack.Screen name="policy"      options={SHEET_OPTIONS} />
        {/* A full pushed page, not a sheet — it's a scrollable list you drill
            into from the You tab's "My confessions" card. */}
        <Stack.Screen name="my-confessions" />
        <Stack.Screen name="categories"     options={SHEET_OPTIONS} />

        {/* explore and write are NOT listed here any more: both now live
            inside (tabs). Declaring them at the root is what made the stack
            grow — expo-router 56's NAVIGATE reuses a route only when its name
            matches the CURRENT one (layouts/StackClient.js), so Read→Write
            pushed a fresh (tabs) and Write→Read pushed a fresh explore, each
            copy staying mounted and re-rendering on every context change.
            Route groups are stripped from URLs, so /explore and /write still
            resolve — to the tab, exactly once. */}
      </Stack>
      <DialogHost />
      {!splashDone && <AnimatedSplash onDone={() => { setSplashDone(true); markSplashDone(); }} />}
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();
  const [fontTimeout, setFontTimeout] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setFontTimeout(true), 5_000);
    return () => clearTimeout(t);
  }, []);

  if (!fontsLoaded && !fontError && !fontTimeout) return null;

  return (
    <ThemeProvider>
      <PremiumProvider>
        <DraftProvider>
          <NotificationsProvider>
            <ThemedStack />
            <ToastHost />
          </NotificationsProvider>
        </DraftProvider>
      </PremiumProvider>
    </ThemeProvider>
  );
}
