import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAppFonts } from '../lib/useFonts';
import { ThemeProvider } from '../theme/ThemeProvider';
import { color } from '../theme/tokens';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, backgroundColor: color.ink, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={color.paper} />
      </View>
    );
  }

  return (
    <ThemeProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown:  false,
          contentStyle: { backgroundColor: color.ink },
          animation:    'fade',
        }}
      >
        <Stack.Screen name="index"   />
        <Stack.Screen name="write"   />
        <Stack.Screen name="match"   />
        <Stack.Screen name="crisis"  />
        <Stack.Screen name="blocked" />
        <Stack.Screen name="preview" />
      </Stack>
    </ThemeProvider>
  );
}
