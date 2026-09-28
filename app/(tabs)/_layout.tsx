import { Tabs } from 'expo-router';

// WriteFAB (the curved gravity-dip bar) renders as a global overlay
// in the root _layout.tsx and handles navigation for all screens —
// no need for expo-router's built-in tab bar.
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        /**
         * Hidden tabs stop re-rendering entirely.
         *
         * Without this, every mounted tab re-renders whenever anything above
         * it does — so switching to Alerts also re-rendered the whole feed,
         * its cards, their avatars and their SVGs, for nobody to see. The
         * screens stay MOUNTED (state and scroll position survive); they
         * simply do no work while blurred.
         */
        freezeOnBlur: true,
        // Tabs are a lateral move, not a journey. Sliding between them adds
        // a transition the user has to wait out before the screen is usable.
        animation: 'none',
      }}
      tabBar={() => null}
      initialRouteName="write"
    >
      <Tabs.Screen name="write"         options={{ title: 'Write' }} />
      <Tabs.Screen name="you"           options={{ title: 'You' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Alerts' }} />
    </Tabs>
  );
}
