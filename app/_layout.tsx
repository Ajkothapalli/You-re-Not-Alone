import AnimatedSplash from '../components/AnimatedSplash';
import { markSplashDone } from '../lib/splashGate';
import { DialogHost } from '../components/AppDialog';
import { ToastHost } from '../components/Toast';
import WriteFAB from '../components/WriteFAB';
import { DraftProvider } from '../lib/draftContext';
import { NotificationsProvider } from '../lib/notificationsContext';
import { PremiumProvider } from '../lib/premiumContext';
import { Stack } from 'expo-router';
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
function ThemedStack() {
  const { colors, isDark } = useTheme();
  const [splashDone, setSplashDone] = useState(false);

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
        <Stack.Screen name="read"        />

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

        {/* The scrollable reading feed — the app's only read surface
            card during D7. (It was previously listed as deep-link-only, which
            meant nothing in the app could actually get to it.) */}
        <Stack.Screen name="explore" />

        {/* Legacy route kept for deep-link compat */}
        <Stack.Screen name="write"   />
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
            <WriteFAB />
            <ToastHost />
          </NotificationsProvider>
        </DraftProvider>
      </PremiumProvider>
    </ThemeProvider>
  );
}
