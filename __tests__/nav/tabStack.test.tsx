/**
 * [NAV] The router-level proof that switching tabs adds no routes.
 *
 * __tests__/invariants.nav.test.ts checks the SHAPE of the code — where the
 * files are, which verb each call site uses. This checks the BEHAVIOUR, in a
 * real expo-router, because the shape guards only hold as long as the
 * reasoning behind them does: if expo-router 57 changed what navigate() means
 * against a tab route, every source guard would still pass while the bug came
 * straight back.
 *
 * ── Why a fixture app and not the real screens ──────────────────────────────
 * renderRouter mounts whatever route map it is given. Handing it the real
 * feed would mean standing up the recommender, playback, the allowance, the
 * premium provider and the share flow — and then the test would be about
 * those. The thing under test is the NAVIGATOR: a stack containing one tab
 * group, four tabs inside it, navigated the way the app navigates. That is
 * reproduced exactly here, and nothing else is.
 */

// The suite-wide expo-router mock in jest.setup.js replaces the router with
// jest.fn()s. This is the one file that needs the real one.
jest.unmock('expo-router');

import React from 'react';
import { Text, Pressable, View } from 'react-native';
import { renderRouter, act, fireEvent, screen } from 'expo-router/testing-library';
import { router, Stack, Tabs } from 'expo-router';

/** The four tabs, in the order the bar shows them. */
const TABS = ['explore', 'write', 'you', 'notifications'] as const;

/** How many times each tab screen has MOUNTED, across a single test. */
const mounts: Record<string, number> = {};

function tabScreen(name: string) {
  return function Screen() {
    React.useEffect(() => { mounts[name] = (mounts[name] ?? 0) + 1; }, []);
    return (
      <View>
        <Text testID={`screen-${name}`}>{name}</Text>
        {/* The bar's own gesture: navigate to a sibling tab by name. */}
        {TABS.map((t) => (
          <Pressable key={t} testID={`go-${t}`} onPress={() => router.navigate(`/${t}`)}>
            <Text>{t}</Text>
          </Pressable>
        ))}
      </View>
    );
  };
}

/** The route map, mirroring app/ — one tab group inside the root stack. */
function app() {
  return {
    '_layout': () => <Stack screenOptions={{ headerShown: false }} />,
    '(tabs)/_layout': () => (
      <Tabs initialRouteName="explore" backBehavior="firstRoute"
            screenOptions={{ headerShown: false }} />
    ),
    '(tabs)/explore':       tabScreen('explore'),
    '(tabs)/write':         tabScreen('write'),
    '(tabs)/you':           tabScreen('you'),
    '(tabs)/notifications': tabScreen('notifications'),
    // Pushed screens, above the tabs. 'blocked' mirrors app/blocked.tsx:
    // a screen stacked on top whose only way out is back to a tab.
    'match':                () => <Text testID="screen-match">match</Text>,
    'blocked':              () => (
      <Pressable testID="blocked-to-write" onPress={() => router.dismissTo('/write')}>
        <Text testID="screen-blocked">blocked</Text>
      </Pressable>
    ),
  };
}

type Rendered = ReturnType<typeof renderRouter>;

/**
 * Mount, and WAIT for it.
 *
 * render() is asynchronous in this setup (React 19 concurrent root via the
 * jest-expo preset), and renderRouter returns its promise with the getters
 * bolted on. Not awaiting it gives a pathname of "/" and a router state of
 * undefined — assertions against a tree that has not mounted, which read as
 * a routing bug rather than as a test that started too early.
 */
async function mount(initialUrl: string): Promise<{ nav: Rendered }> {
  const nav = renderRouter(app(), { initialUrl });
  await nav;
  // BOXED on purpose. `return nav` from an async function resolves the
  // thenable and hands back the plain RTL result — without getPathname or
  // getRouterState, which are properties of the promise object itself. The
  // box is not a thenable, so it survives.
  return { nav };
}

/**
 * The ROOT stack's routes.
 *
 * getRouterState() returns the whole navigation tree, whose single top-level
 * route is expo-router's own `__root`. The stack the app declares in
 * app/_layout.tsx is one level down — that is the one that used to grow.
 */
function rootRoutes(r: Rendered): { name: string }[] {
  const tree = r.getRouterState() as
    | { routes?: { state?: { routes?: { name: string }[] } }[] }
    | undefined;
  return tree?.routes?.[0]?.state?.routes ?? [];
}

function rootRouteCount(r: Rendered): number {
  return rootRoutes(r).length;
}

function rootRouteNames(r: Rendered): string[] {
  return rootRoutes(r).map((x) => x.name);
}

beforeEach(() => { for (const k of Object.keys(mounts)) delete mounts[k]; });

describe('switching tabs', () => {
  it('lands on Read', async () => {
    const { nav: r } = await mount('/explore');
    expect(r.getPathname()).toBe('/explore');
    expect(screen.getByTestId('screen-explore')).toBeTruthy();
  });

  it('does not grow the root stack, however many times you switch', async () => {
    /**
     * THE regression. Before Phase NAV the root stack grew by one route per
     * switch — [explore, (tabs), explore, (tabs), …] — because Read was a
     * root-stack screen and the bar navigated across the group boundary, so
     * NAVIGATE could not match the target and pushed a fresh key instead.
     *
     * Asserted on the COUNT rather than on a snapshot: what matters is that
     * nothing accumulates, and a count says that in a way that survives the
     * router renaming or reordering its internals.
     */
    const { nav: r } = await mount('/explore');
    const before = rootRouteCount(r);
    // A zero here would make every assertion below vacuously true.
    expect(before).toBeGreaterThan(0);

    for (const t of ['write', 'you', 'notifications', 'explore', 'write', 'explore']) {
      await act(async () => { fireEvent.press(screen.getByTestId(`go-${t}`)); });
    }

    expect(r.getPathname()).toBe('/explore');
    expect(rootRouteCount(r)).toBe(before);
    // And exactly one copy of the group, not several stacked on each other.
    expect(rootRouteNames(r).filter((n) => n === '(tabs)')).toHaveLength(1);
  });

  it('does not REMOUNT a tab you come back to', async () => {
    /**
     * The user-visible half of the bug: Read rebuilt itself every time you
     * came back to it — spinner, lost scroll position, re-fetched feed —
     * because each visit was mounting a brand-new copy.
     *
     * Asserted on a mount COUNT rather than on the rendered tree: react-
     * navigation detaches an inactive tab's views, so "is it in the RTL
     * output" answers a question about rendering, not about lifetime. The
     * count answers the one that matters — did React tear this screen down
     * and build it again.
     */
    const { nav: r } = await mount('/explore');
    expect(mounts.explore).toBe(1);

    await act(async () => { fireEvent.press(screen.getByTestId('go-write')); });
    expect(r.getPathname()).toBe('/write');

    await act(async () => { fireEvent.press(screen.getByTestId('go-explore')); });
    expect(r.getPathname()).toBe('/explore');

    // Back on Read, and it was never rebuilt.
    expect(mounts.explore).toBe(1);
  });

  it('a pushed screen DOES add a route — the difference is the target', async () => {
    // Without this the first test could pass because nothing navigates at all.
    const { nav: r } = await mount('/explore');
    const before = rootRouteCount(r);

    await act(async () => { router.push('/match'); });

    expect(r.getPathname()).toBe('/match');
    expect(rootRouteCount(r)).toBe(before + 1);
  });
});

describe('reaching a tab from a screen stacked above it', () => {
  it('dismissTo pops back to the existing tabs instead of stacking a new set', async () => {
    /**
     * The other half of the copy bug. From a pushed screen, navigate() and
     * replace() both create a route; only dismissTo() uses the router's `pop`
     * branch and lands on the tabs that are already there. app/blocked.tsx,
     * app/rtue.tsx, components/share/ShareAfter.tsx and app/categories.tsx
     * all take this path.
     */
    const { nav: r } = await mount('/explore');
    const before = rootRouteCount(r);

    await act(async () => { router.push('/blocked'); });
    expect(r.getPathname()).toBe('/blocked');
    expect(rootRouteCount(r)).toBe(before + 1);

    await act(async () => { fireEvent.press(screen.getByTestId('blocked-to-write')); });

    expect(r.getPathname()).toBe('/write');
    // Back to where we started: the pushed screen is gone and no tab set was
    // added to replace the one that was already mounted.
    expect(rootRouteCount(r)).toBe(before);
    expect(rootRouteNames(r).filter((n) => n === '(tabs)')).toHaveLength(1);
    // And the tab was not rebuilt on the way back in.
    expect(mounts.write).toBe(1);
  });

  it('/write resolves to the tab, not to a second screen, from anywhere', async () => {
    const { nav: r } = await mount('/explore');

    await act(async () => { router.navigate('/write'); });
    expect(r.getPathname()).toBe('/write');
    expect(rootRouteNames(r)).not.toContain('write');

    await act(async () => { router.push('/match'); });
    await act(async () => { router.dismissTo('/write'); });
    expect(r.getPathname()).toBe('/write');
    expect(rootRouteNames(r)).not.toContain('write');
    expect(mounts.write).toBe(1);
  });
});
