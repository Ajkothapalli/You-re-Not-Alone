import AnimatedSplash from '../components/AnimatedSplash';
import { DialogHost } from '../components/AppDialog';
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
          <Stack.Screen name="auth"        options={{ animation: 'none' }} />
          <Stack.Screen name="read"        />
          <Stack.Screen name="write"       />
          <Stack.Screen name="match"       />
          <Stack.Screen name="crisis"      />
          <Stack.Screen name="blocked"     />
          <Stack.Screen name="read-detail" />
          <Stack.Screen name="explore"     />
          <Stack.Screen name="settings"    options={{ presentation: 'transparentModal', gestureEnabled: true }} />
          <Stack.Screen name="plans"       options={{ presentation: 'transparentModal', gestureEnabled: true }} />
          <Stack.Screen name="profile"     options={{ presentation: 'transparentModal', gestureEnabled: true }} />
          <Stack.Screen name="categories"  options={{ presentation: 'transparentModal', gestureEnabled: true }} />
        </Stack>
        {!splashDone && <AnimatedSplash onDone={() => setSplashDone(true)} />}
        <DialogHost />
      </DraftProvider>
      </PremiumProvider>
    </ThemeProvider>
  );
}
