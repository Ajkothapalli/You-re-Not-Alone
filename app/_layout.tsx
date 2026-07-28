import AnimatedSplash from '../components/AnimatedSplash';
import { DialogHost } from '../components/AppDialog';
import { DraftProvider } from '../lib/draftContext';
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
        <Stack.Screen name="index"       />
        <Stack.Screen name="auth"        options={{ animation: 'none' }} />
        <Stack.Screen name="read"        />
        <Stack.Screen name="write"       />
        <Stack.Screen name="match"       options={SHEET_OPTIONS} />
        <Stack.Screen name="crisis"      />
        <Stack.Screen name="blocked"     />
        <Stack.Screen name="read-detail" />
        <Stack.Screen name="explore"     />
        <Stack.Screen name="settings"    options={SHEET_OPTIONS} />
        <Stack.Screen name="plans"       options={SHEET_OPTIONS} />
        <Stack.Screen name="profile"         options={{ animation: 'slide_from_right', gestureEnabled: true }} />
        <Stack.Screen name="my-confessions" options={SHEET_OPTIONS} />
        <Stack.Screen name="categories"     options={SHEET_OPTIONS} />
      </Stack>
      <DialogHost />
      {!splashDone && <AnimatedSplash onDone={() => setSplashDone(true)} />}
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();
  const [fontTimeout, setFontTimeout] = useState(false);

  // If font loading wedges past 5s, render anyway so the boot screen is visible.
  useEffect(() => {
    const t = setTimeout(() => setFontTimeout(true), 5_000);
    return () => clearTimeout(t);
  }, []);

  if (!fontsLoaded && !fontError && !fontTimeout) return null;

  return (
    <ThemeProvider>
      <PremiumProvider>
        <DraftProvider>
          <ThemedStack />
        </DraftProvider>
      </PremiumProvider>
    </ThemeProvider>
  );
}
