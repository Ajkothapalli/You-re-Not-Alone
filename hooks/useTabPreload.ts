/**
 * Mount the tabs nobody has opened yet, while the phone is idle.
 *
 * ── What the jerk actually was ──────────────────────────────────────────────
 * NAV fixed tabs REMOUNTING on every visit. What it could not fix is the
 * FIRST visit: `lazy` (the bottom-tab default) defers each screen's mount
 * until the tap, so the first Read→Write, Read→You and Read→Alerts each pay
 * for building a whole screen — background pattern, SVGs, the lot — inside
 * the frame that is supposed to be showing it. That is the stutter.
 *
 * `lazy: false` is the documented alternative and is the wrong trade: it
 * mounts all four before Read paints, moving the cost to cold start, where
 * it is more expensive and more visible.
 *
 * PRELOAD is the right one. It mounts a tab WITHOUT focusing it, so the cost
 * lands in idle time after Read is already interactive and the first tap has
 * nothing left to build.
 *
 * ── This is a public API, despite what app/(tabs)/_layout.tsx used to say ───
 * That file claimed preload was unreachable because `CommonActions.preload`
 * lives under expo-router/build/react-navigation/, which is marked internal.
 * True, and beside the point: nothing needs to import it. Every action
 * creator in CommonActions is spread onto the navigation object itself
 * (core/useNavigationHelpers.js), so the navigator hands `preload` to its own
 * tabBar as an ordinary method. It is still typed optional here and checked
 * at runtime, because it reaches us through a structurally-typed prop rather
 * than a package export.
 *
 * ── Two things were verified in the vendored router before relying on it ────
 * 1. PRELOAD does not change `state.index` (routers/TabRouter.js) — so the
 *    visible tab does not move and `useFocusEffect` never fires for a
 *    preloaded screen. This matters beyond tidiness: Alerts marks
 *    notifications READ in its focus effect, and a preload that fired it
 *    would silently clear somebody's unread badge for a screen they never
 *    opened.
 * 2. A preloaded route is exempt from freezeOnBlur (`shouldFreeze:
 *    activityState === STATE_INACTIVE && !isPreloaded` in BottomTabView),
 *    but its key is dropped from `preloadedRouteKeys` the moment it is
 *    focused. So a tab is unfrozen only until its first visit, and normal
 *    freeze-on-blur resumes after that — the thing NAV added freezeOnBlur
 *    for is not quietly undone.
 */

import { useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';

/** After Read is interactive, before the first plausible tab tap. */
export const PRELOAD_DELAY_MS = 450;
/**
 * Between screens. They are mounted ONE AT A TIME on purpose: three heavy
 * trees in a single frame is the stutter being fixed, just moved somewhere
 * the reader did not ask for it.
 */
export const PRELOAD_GAP_MS = 300;

export interface PreloadNavigation {
  preload?: (name: string) => void;
}

/**
 * The scheduling, with no React in it.
 *
 * Separate from the hook so it can be tested by calling it — mounting a
 * component to assert on setTimeout meant fighting fake timers through an
 * async `render`, and the thing under test is a queue and a clock, not a
 * component.
 *
 * Returns a cancel function. Safe to call more than once.
 */
export function scheduleTabPreload(
  navigation: PreloadNavigation,
  routeNames: string[],
  activeIndex: number,
): () => void {
  if (typeof navigation.preload !== 'function') return () => {};

  const pending = routeNames.filter((_, i) => i !== activeIndex);
  let cancelled = false;
  let timer:  ReturnType<typeof setTimeout>   | undefined;
  let handle: { cancel: () => void } | undefined;

  const step = (delay: number) => {
    timer = setTimeout(() => {
      if (cancelled) return;
      // Yields to anything the reader is doing: a scroll in progress keeps
      // the frame, and the mount waits for the gap after it.
      handle = InteractionManager.runAfterInteractions(() => {
        if (cancelled) return;
        const name = pending.shift();
        if (name === undefined) return;
        // A preload that throws must never take the tab bar with it — the
        // cost of failing is a slow first tap, which is where we started.
        try { navigation.preload?.(name); } catch { /* not fatal */ }
        if (pending.length > 0) step(PRELOAD_GAP_MS);
      });
    }, delay);
  };

  step(PRELOAD_DELAY_MS);

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
    handle?.cancel();
  };
}

export function useTabPreload(
  navigation: PreloadNavigation,
  routeNames: string[],
  activeIndex: number,
): void {
  // Once per session. Not per mount: re-running it would re-dispatch PRELOAD
  // for tabs already visited, which re-adds their keys to preloadedRouteKeys
  // and un-freezes screens that should be frozen.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    return scheduleTabPreload(navigation, routeNames, activeIndex);
    // Deliberately once: `started` guards re-entry, and re-running on an
    // index change would preload the tab the reader is currently looking at.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
