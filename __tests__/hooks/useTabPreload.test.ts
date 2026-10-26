/**
 * Preloading the tabs nobody has opened yet.
 *
 * The thing being bought is a first tab tap that does not stutter. Three
 * things must not be broken buying it, and all three are SILENT if they
 * break, which is why they are pinned here rather than left to the comment
 * in the hook:
 *
 *   - the tab the reader is LOOKING AT is never preloaded;
 *   - nothing happens before the app has gone idle, or the cost just moves
 *     on top of cold start, where it hurts more;
 *   - the screens mount one at a time, or the stutter simply relocates.
 *
 * Tested through scheduleTabPreload rather than by mounting a component:
 * the subject is a queue and a clock. Driving it through an async `render`
 * under fake timers meant only the first render in the file ever flushed
 * its effects, so every later test passed or failed for reasons that had
 * nothing to do with this code.
 */

import { InteractionManager } from 'react-native';
import {
  scheduleTabPreload, PRELOAD_DELAY_MS, PRELOAD_GAP_MS,
} from '@/hooks/useTabPreload';

const ROUTES = ['explore', 'write', 'you', 'notifications'];

/**
 * Swapped by hand, and restored by hand — not jest.spyOn plus
 * restoreAllMocks, which this repo has been bitten by before.
 */
const realRunAfterInteractions = InteractionManager.runAfterInteractions;

/** The real one defers to a frame callback that never runs under fake timers. */
const inline = ((cb: any) => {
  if (typeof cb === 'function') cb();
  return { cancel: () => {}, then: () => {}, done: () => {} };
}) as any;

beforeEach(() => {
  jest.useFakeTimers();
  (InteractionManager as any).runAfterInteractions = inline;
});

afterEach(() => {
  jest.useRealTimers();
  (InteractionManager as any).runAfterInteractions = realRunAfterInteractions;
});

/** Long enough for every queued screen. */
const settle = () =>
  jest.advanceTimersByTime(PRELOAD_DELAY_MS + PRELOAD_GAP_MS * (ROUTES.length + 1));

describe('what gets preloaded', () => {
  it('mounts every tab except the one on screen', () => {
    const preload = jest.fn();
    scheduleTabPreload({ preload }, ROUTES, 0);
    settle();

    expect(preload.mock.calls.map((c) => c[0]).sort())
      .toEqual(['notifications', 'write', 'you']);
  });

  it('never preloads the active tab, whichever it is', () => {
    for (let active = 0; active < ROUTES.length; active++) {
      const preload = jest.fn();
      scheduleTabPreload({ preload }, ROUTES, active);
      settle();
      expect(preload).not.toHaveBeenCalledWith(ROUTES[active]);
      expect(preload).toHaveBeenCalledTimes(ROUTES.length - 1);
    }
  });

  it('mounts them ONE at a time, not all in one frame', () => {
    // Three heavy screens in a single frame is the stutter being fixed,
    // moved somewhere the reader did not ask for it.
    const preload = jest.fn();
    scheduleTabPreload({ preload }, ROUTES, 0);

    jest.advanceTimersByTime(PRELOAD_DELAY_MS);
    expect(preload).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(PRELOAD_GAP_MS);
    expect(preload).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(PRELOAD_GAP_MS);
    expect(preload).toHaveBeenCalledTimes(3);
  });

  it('stops once every tab is queued', () => {
    const preload = jest.fn();
    scheduleTabPreload({ preload }, ROUTES, 0);
    settle();
    settle();
    expect(preload).toHaveBeenCalledTimes(ROUTES.length - 1);
  });
});

describe('when it happens', () => {
  it('nothing is preloaded before the delay is up', () => {
    // The whole point is that Read paints first. A preload racing the first
    // paint would be lazy:false with extra steps.
    const preload = jest.fn();
    scheduleTabPreload({ preload }, ROUTES, 0);

    jest.advanceTimersByTime(PRELOAD_DELAY_MS - 1);
    expect(preload).not.toHaveBeenCalled();
  });

  it('waits for interactions to finish, not just for the clock', () => {
    let release: (() => void) | null = null;
    (InteractionManager as any).runAfterInteractions = (cb: any) => {
      release = () => cb();
      return { cancel: () => {}, then: () => {}, done: () => {} };
    };

    const preload = jest.fn();
    scheduleTabPreload({ preload }, ROUTES, 0);
    jest.advanceTimersByTime(PRELOAD_DELAY_MS * 4);
    // The clock ran out; the reader is still mid-gesture.
    expect(preload).not.toHaveBeenCalled();

    release!();
    expect(preload).toHaveBeenCalledTimes(1);
  });

  it('cancelling stops everything, including what is already queued', () => {
    const preload = jest.fn();
    const cancel = scheduleTabPreload({ preload }, ROUTES, 0);

    jest.advanceTimersByTime(PRELOAD_DELAY_MS);
    expect(preload).toHaveBeenCalledTimes(1);

    cancel();
    settle();
    expect(preload).toHaveBeenCalledTimes(1);
  });

  it('cancelling before anything starts preloads nothing', () => {
    const preload = jest.fn();
    scheduleTabPreload({ preload }, ROUTES, 0)();
    settle();
    expect(preload).not.toHaveBeenCalled();
  });
});

describe('when the navigator will not play', () => {
  it('does nothing at all if preload is missing', () => {
    // It arrives through a structural type, not a package export. An older
    // or future router without it must cost a slow first tap, not a crash.
    expect(() => { scheduleTabPreload({}, ROUTES, 0)(); settle(); }).not.toThrow();
  });

  it('a throwing preload does not stop the ones after it', () => {
    const preload = jest.fn(() => { throw new Error('router said no'); });
    expect(() => { scheduleTabPreload({ preload }, ROUTES, 0); settle(); }).not.toThrow();
    expect(preload).toHaveBeenCalledTimes(ROUTES.length - 1);
  });
});
