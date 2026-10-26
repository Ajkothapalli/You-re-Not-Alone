import { Tabs } from 'expo-router';
import WriteFAB from '@/components/WriteFAB';

/**
 * The app's ONE tab navigator.
 *
 * Read used to be a ROOT stack screen while Write/You/Alerts lived here, and
 * the bar called router.navigate() across that boundary. In expo-router 56
 * (build/react-navigation/routers/StackRouter.js) NAVIGATE reuses a route only
 * when getId matches, when the name equals the CURRENT route, or when
 * payload.pop is set — otherwise it pushes a new route with a fresh key. So
 * Read→Write pushed a brand-new (tabs) navigator and Write→Read pushed a
 * brand-new explore, and the root stack grew [explore,(tabs),explore,(tabs),…].
 *
 * Every copy stayed mounted and re-rendered on every context change — the
 * draft context fires on each keystroke — and every new (tabs) re-mounted
 * Write, You and Alerts from scratch. Android back walked the whole pile.
 *
 * With all four here, switching is a tab jump: no new routes, no remounts,
 * scroll position and state survive, and back leaves the app.
 *
 * ── On preloading (corrected 2026-10-01) ────────────────────────────────────
 * This note used to say tab preload was "NOT reachable through any public API
 * here", because CommonActions.preload lives under the internal
 * expo-router/build/react-navigation/ path. The premise was right and the
 * conclusion was wrong: nothing needs to import it. Every CommonActions
 * creator is spread onto the navigation object itself, so the navigator
 * hands `preload` to its own tabBar as an ordinary method.
 *
 * It also said the remaining first-visit mount cost "is paid once either
 * way", and that nobody here could measure the trade without a device. The
 * device has now reported: switching was still jerky, and that mount was it.
 *
 * So the tab bar preloads the other three during idle — see
 * hooks/useTabPreload.ts, which documents what was verified in the vendored
 * router before relying on it (PRELOAD does not move state.index, so Alerts'
 * mark-as-read never fires for an unopened tab; and a preloaded route is
 * exempt from freezeOnBlur only until its first visit, so the freezing below
 * is not quietly undone).
 *
 * lazy:false remains deliberately NOT set: it mounts all four before Read
 * paints, which moves the cost to cold start rather than removing it.
 */
export default function TabLayout() {
  return (
    <Tabs
      // Read is the app's landing surface, and firstRoute back behaviour
      // means Android back from any tab goes to Read and then exits, rather
      // than stepping backwards through visit history.
      initialRouteName="explore"
      backBehavior="firstRoute"
      screenOptions={{
        headerShown: false,
        /**
         * Hidden tabs stop re-rendering entirely. Without it, every mounted
         * tab re-renders whenever anything above it does — switching to
         * Alerts also re-rendered the whole feed, its cards and their SVGs,
         * for nobody to see. The screens stay MOUNTED; they just do no work.
         */
        freezeOnBlur: true,
        // Tabs are a lateral move, not a journey. Sliding between them adds a
        // transition the user waits out before the screen is usable.
        animation: 'none',
      }}
      // The bar lives INSIDE the navigator now, so it reads the active tab
      // from navigation state — which updates in the same frame as the tap —
      // instead of from usePathname, which only updates once a navigation has
      // completed. Pushed screens cover it naturally, so there is no longer a
      // list of routes it has to know to hide on.
      tabBar={(props) => <WriteFAB {...props} />}
    >
      {/* Order matters: it is the tab order in the bar. */}
      <Tabs.Screen name="explore"       options={{ title: 'Read' }} />
      <Tabs.Screen name="write"         options={{ title: 'Write' }} />
      <Tabs.Screen name="you"           options={{ title: 'You' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Alerts' }} />
    </Tabs>
  );
}
