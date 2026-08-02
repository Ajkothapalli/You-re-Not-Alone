import AnimatedSplash from '../components/AnimatedSplash';
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

const PLANS_SHEET_OPTIONS = {
  presentation:                    'formSheet' as const,
  sheetAllowedDetents:             ['fitToContents'] as any,
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
        <Stack.Screen name="my-confessions" options={SHEET_OPTIONS} />
        <Stack.Screen name="categories"     options={SHEET_OPTIONS} />

        {/* Legacy routes kept for deep-link compat */}
        <Stack.Screen name="write"   />
        <Stack.Screen name="explore" />
      </Stack>
      <DialogHost />
      {!splashDone && <AnimatedSplash onDone={() => setSplashDone(true)} />}
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
