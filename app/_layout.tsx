import AnimatedSplash from '../components/AnimatedSplash';
import { useAppLock } from '../hooks';
import { DraftProvider } from '../lib/draftContext';
import { PremiumProvider } from '../lib/premiumContext';
import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppFonts } from '../lib/useFonts';
import { ThemeProvider } from '../theme/ThemeProvider';
import { color, fontFamily } from '../theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

const SHEET_OPTIONS = {
  presentation:                   'formSheet' as const,
  sheetAllowedDetents:            [0.85] as number[],
  sheetGrabberVisible:            true,
  sheetCornerRadius:              28,
  sheetExpandsWhenScrolledToEdge: false,
  gestureEnabled:                 true,
};

function AppLockOverlay({ onUnlock }: { onUnlock: () => void }) {
  return (
    <Pressable style={lockStyles.overlay} onPress={onUnlock} accessibilityRole="button" accessibilityLabel="Tap to continue">
      <View style={lockStyles.card}>
        <Text style={lockStyles.icon}>🔒</Text>
        <Text style={lockStyles.title}>soulyap</Text>
        <Text style={lockStyles.hint}>Tap anywhere to continue</Text>
      </View>
    </Pressable>
  );
}

const lockStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: color.bg,
    zIndex: 9999,
    alignItems:      'center',
    justifyContent:  'center',
  },
  card: {
    alignItems: 'center',
    gap:        12,
  },
  icon: {
    fontSize:   44,
  },
  title: {
    fontFamily: fontFamily.sansBold,
    fontSize:   22,
    color:      color.paper,
  },
  hint: {
    fontFamily: fontFamily.sans,
    fontSize:   14,
    color:      color.dim,
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();
  const [splashDone, setSplashDone] = useState(false);

  // Lock after 5 min in background. Crisis screen (/crisis) is exempt —
  // users must never be blocked from accessing crisis resources.
  const { locked, unlock } = useAppLock({ backgroundMs: 5 * 60 * 1000 });
  const pathname = usePathname();
  const showLock = locked && pathname !== '/crisis';

  if (!fontsLoaded && !fontError) return null;

  return (
    <ThemeProvider>
      <PremiumProvider>
      <DraftProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown:              false,
            contentStyle:             { backgroundColor: color.bg },
            animation:                'slide_from_right',
            gestureEnabled:           true,
            fullScreenGestureEnabled: true,
          }}
        >
          <Stack.Screen name="index"       />
          <Stack.Screen name="read"        />
          <Stack.Screen name="write"       />
          <Stack.Screen name="match"       />
          <Stack.Screen name="crisis"      />
          <Stack.Screen name="blocked"     />
          <Stack.Screen name="read-detail" />
          <Stack.Screen name="explore"     />
          <Stack.Screen name="settings"   options={SHEET_OPTIONS} />
          <Stack.Screen name="plans"      options={SHEET_OPTIONS} />
          <Stack.Screen name="profile"    options={SHEET_OPTIONS} />
          <Stack.Screen name="categories" options={SHEET_OPTIONS} />
        </Stack>
        {!splashDone && <AnimatedSplash onDone={() => setSplashDone(true)} />}
        {showLock && <AppLockOverlay onUnlock={unlock} />}
      </DraftProvider>
      </PremiumProvider>
    </ThemeProvider>
  );
}
