import { Tabs } from 'expo-router';

// WriteFAB (the curved gravity-dip bar) renders as a global overlay
// in the root _layout.tsx and handles navigation for all screens —
// no need for expo-router's built-in tab bar.
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={() => null}
      initialRouteName="write"
    >
      <Tabs.Screen name="write"         options={{ title: 'Write' }} />
      <Tabs.Screen name="you"           options={{ title: 'You' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Alerts' }} />
    </Tabs>
  );
}
