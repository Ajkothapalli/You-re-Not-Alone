import AnimatedSplash from '../components/AnimatedSplash';
import { DraftProvider } from '../lib/draftContext';
import { PremiumProvider } from '../lib/premiumContext';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { useAppFonts } from '../lib/useFonts';
import { ThemeProvider } from '../theme/ThemeProvider';
import { color } from '../theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();
  const [splashDone, setSplashDone] = useState(false);

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
          <Stack.Screen name="settings"    options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="plans"       options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="profile"     options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="categories"  options={{ animation: 'slide_from_bottom' }} />
        </Stack>
        {!splashDone && <AnimatedSplash onDone={() => setSplashDone(true)} />}
      </DraftProvider>
      </PremiumProvider>
    </ThemeProvider>
  );
}
