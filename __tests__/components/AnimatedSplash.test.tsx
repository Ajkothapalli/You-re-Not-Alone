/**
 * AnimatedSplash unit tests — cover the four invariants that prevent the
 * spinner-flash / stuck-splash bugs on Android/MIUI:
 *
 *   1. No Modal in the render tree.
 *   2. SplashScreen.hideAsync() is deferred to onLayout + rAF (never on mount).
 *      The 3 s fallback fires it if onLayout is never called.
 *      The guard makes it idempotent across both paths.
 *   3. onDone() fires unconditionally via the 6 s last-resort even when
 *      Animated.timing.start() never calls its callback.
 *   4. reduceMotion path: onDone() fires without the old `finished` guard.
 *
 * IMPORTANT: Do NOT use jest.runAllTimers() here. AnimatedSplash uses
 * Animated.loop which schedules rAF callbacks indefinitely — runAllTimers
 * will hit the 100 000-timer abort guard. Use advanceTimersByTime() only.
 */

jest.mock('expo-splash-screen', () => ({
  hideAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/a11y', () => ({
  announce:         jest.fn(),
  useReducedMotion: jest.fn(() => false),
}));

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Animated } from 'react-native';
import AnimatedSplash from '../../components/AnimatedSplash';
import { useReducedMotion } from '@/lib/a11y';

// ─── helpers ──────────────────────────────────────────────────────────────────

function renderSplash(onDone = jest.fn()) {
  return render(<AnimatedSplash onDone={onDone} />);
}

// utils is the resolved render result (Awaited<ReturnType<typeof render>>).
function fireLayout(utils: Awaited<ReturnType<typeof render>>) {
  const overlay = utils.getByTestId('splash-overlay');
  fireEvent(overlay, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 812 } },
  });
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('AnimatedSplash', () => {
  let hideAsync: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    hideAsync = require('expo-splash-screen').hideAsync;
    hideAsync.mockClear();
    (useReducedMotion as jest.Mock).mockReturnValue(false);
  });

  afterEach(() => {
    // clearAllTimers — NOT runAllTimers, which loops forever on Animated.loop.
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // ── 1. No Modal ────────────────────────────────────────────────────────────

  it('root element is the splash overlay — not a Modal container', async () => {
    // In the old implementation the root was <Modal>; now it must be the
    // absoluteFill Animated.View. toJSON() returns the top-most host element.
    const { toJSON } = await renderSplash();
    const root = toJSON() as any;
    expect(root.props.testID).toBe('splash-overlay');
  });

  // ── 2. SplashScreen.hideAsync gating ──────────────────────────────────────

  it('does NOT call hideAsync before onLayout fires', async () => {
    await renderSplash();
    expect(hideAsync).not.toHaveBeenCalled();
  });

  it('calls hideAsync exactly once after onLayout + requestAnimationFrame', async () => {
    const utils = await renderSplash();

    await act(async () => {
      fireLayout(utils);
      // requestAnimationFrame fires at ~16 ms with fake timers.
      jest.advanceTimersByTime(20);
    });

    expect(hideAsync).toHaveBeenCalledTimes(1);
  });

  it('3 s fallback calls hideAsync if onLayout never fires', async () => {
    await renderSplash();

    await act(async () => {
      // 3 000 ms fires the fallback; +20 ms flushes its rAF.
      jest.advanceTimersByTime(3_020);
    });

    expect(hideAsync).toHaveBeenCalledTimes(1);
  });

  it('hideAsync is called exactly once even when both onLayout and the 3 s fallback fire', async () => {
    const utils = await renderSplash();

    await act(async () => {
      fireLayout(utils);           // schedules rAF
      jest.advanceTimersByTime(20); // flush that rAF → hideAsync called
    });

    // Advance past the 3 s fallback; guard prevents a second call.
    await act(async () => {
      jest.advanceTimersByTime(3_020);
    });

    expect(hideAsync).toHaveBeenCalledTimes(1);
  });

  // ── 3. 6 s last-resort ────────────────────────────────────────────────────

  it('calls onDone via 6 s last-resort even when Animated.timing.start never calls back', async () => {
    // Stub every Animated.timing so no animation callback ever fires.
    // This also prevents Animated.loop from scheduling infinite rAF callbacks,
    // making it safe to advance 6 s with fake timers.
    jest.spyOn(Animated, 'timing').mockReturnValue({
      start: jest.fn(), // never invokes its argument
      stop:  jest.fn(),
      reset: jest.fn(),
    } as unknown as Animated.CompositeAnimation);

    const onDone = jest.fn();
    await act(async () => {
      render(<AnimatedSplash onDone={onDone} />);
    });

    // 2.5 s dismiss timer fires but mocked start() never calls finish().
    expect(onDone).not.toHaveBeenCalled();

    // 6 s last-resort calls finish() unconditionally.
    await act(async () => {
      jest.advanceTimersByTime(6_001);
    });

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  // ── 4. reduceMotion path ──────────────────────────────────────────────────

  it('reduceMotion: onDone fires without needing the animation finished flag', async () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);

    const onDone = jest.fn();
    await act(async () => {
      render(<AnimatedSplash onDone={onDone} />);
    });

    // 1.1 s delay, then overlay fade; flush the fade (Animated completes in test env).
    await act(async () => {
      jest.advanceTimersByTime(1_200);
    });

    expect(onDone).toHaveBeenCalled();
  });
});
