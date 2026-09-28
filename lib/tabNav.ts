/**
 * Tab navigation state, as pure functions.
 *
 * The bar used to derive its active tab from usePathname() alone, which only
 * updates AFTER the navigation has completed. On a mid-range phone that is a
 * visible beat between the tap and anything moving — the tab felt slow even
 * when the screen itself was ready, because the only feedback was the screen
 * arriving.
 *
 * So the index becomes optimistic: set on press, reconciled when the pathname
 * catches up. Kept here, apart from the component, because "which tab is lit"
 * is now a small state machine with three ways to be wrong and it is worth
 * testing directly rather than through a render tree.
 */

export const TAB_ROUTES = ['/explore', '/write', '/you', '/notifications'] as const;
export type TabRoute = typeof TAB_ROUTES[number];

/**
 * How long an optimistic index is trusted before the pathname wins again.
 *
 * It exists for one failure mode: a navigation that never lands (a guard
 * redirects, the route throws, the user backgrounds the app mid-tap). Without
 * it the bar would light a tab the user is not on, indefinitely. Comfortably
 * longer than a normal transition, short enough that a stuck indicator
 * corrects itself before anyone files it as a bug.
 */
export const OPTIMISTIC_TTL_MS = 1200;

export function indexForPath(pathname: string): number {
  return (TAB_ROUTES as readonly string[]).indexOf(pathname);
}

export interface NavState {
  /** Set on press; null when the pathname is authoritative. */
  optimistic:   number | null;
  optimisticAt: number;
}

export const IDLE: NavState = { optimistic: null, optimisticAt: 0 };

/**
 * Which tab should be lit right now.
 *
 * The optimistic index wins while it is fresh AND still disagrees with the
 * pathname. Once the pathname agrees there is nothing to be optimistic about,
 * and once it has gone stale the pathname is the only thing we still trust.
 */
export function activeIndex(state: NavState, pathname: string, now: number): number {
  const real = indexForPath(pathname);
  if (state.optimistic === null) return real;
  if (state.optimistic === real) return real;
  if (now - state.optimisticAt > OPTIMISTIC_TTL_MS) return real;
  return state.optimistic;
}

/** Has the pathname caught up, so the optimistic guess can be dropped? */
export function settled(state: NavState, pathname: string, now: number): boolean {
  if (state.optimistic === null) return true;
  return state.optimistic === indexForPath(pathname)
      || now - state.optimisticAt > OPTIMISTIC_TTL_MS;
}

/**
 * Should this tap navigate at all?
 *
 * Two taps are dropped, for different reasons:
 *   - A tap on the ALREADY ACTIVE tab. expo-router would push or replace and
 *     remount the screen, so tapping "Read" while reading would throw away
 *     the feed and the scroll position. Doing nothing is the correct
 *     behaviour, not a missing feature.
 *   - A repeat tap while a navigation is still in flight, which is how
 *     double-taps end up on the wrong screen or stack two transitions.
 */
export function shouldNavigate(
  state: NavState, pathname: string, target: number, now: number,
): boolean {
  if (target === activeIndex(state, pathname, now)) return false;
  if (state.optimistic !== null && !settled(state, pathname, now)) return false;
  return true;
}

export function press(target: number, now: number): NavState {
  return { optimistic: target, optimisticAt: now };
}
