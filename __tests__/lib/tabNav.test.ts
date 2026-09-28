/**
 * The tab bar's active-index state machine.
 *
 * It exists because usePathname() only updates AFTER a navigation lands, so
 * the bar sat still through the whole transition. The optimistic index has
 * three ways to be wrong, and each gets a test: it must not stick when the
 * navigation never completes, it must not fight the pathname once it agrees,
 * and it must not let a double-tap queue two transitions.
 */

import {
  TAB_ROUTES, OPTIMISTIC_TTL_MS, IDLE,
  indexForPath, activeIndex, settled, shouldNavigate, press,
} from '@/lib/tabNav';

const T0 = 1_000_000;

describe('the routes', () => {
  it('are Read, Write, You, Alerts in bar order', () => {
    expect(TAB_ROUTES).toEqual(['/explore', '/write', '/you', '/notifications']);
  });

  it.each([['/explore', 0], ['/write', 1], ['/you', 2], ['/notifications', 3]])(
    '%s is index %s', (p, i) => expect(indexForPath(p)).toBe(i));

  it('is -1 anywhere else, so the bar lights nothing', () => {
    for (const p of ['/crisis', '/match', '/', '/read-detail']) {
      expect(indexForPath(p)).toBe(-1);
    }
  });
});

describe('the indicator moves on press, not on arrival', () => {
  it('lights the target immediately, before the pathname changes', () => {
    const s = press(2, T0);
    expect(activeIndex(s, '/explore', T0 + 1)).toBe(2);
  });

  it('keeps following the pathname when nothing is pending', () => {
    expect(activeIndex(IDLE, '/you', T0)).toBe(2);
  });

  it('hands back to the pathname once it agrees', () => {
    const s = press(2, T0);
    expect(settled(s, '/you', T0 + 50)).toBe(true);
    expect(activeIndex(s, '/you', T0 + 50)).toBe(2);
  });
});

describe('a navigation that never lands corrects itself', () => {
  it('falls back to the pathname after the timeout', () => {
    // A guard redirect, a thrown route, or the app backgrounded mid-tap would
    // otherwise leave the bar lighting a tab the user is not on, forever.
    const s = press(3, T0);
    expect(activeIndex(s, '/explore', T0 + OPTIMISTIC_TTL_MS + 1)).toBe(0);
    expect(settled(s, '/explore', T0 + OPTIMISTIC_TTL_MS + 1)).toBe(true);
  });

  it('still trusts the guess just before the timeout', () => {
    const s = press(3, T0);
    expect(activeIndex(s, '/explore', T0 + OPTIMISTIC_TTL_MS - 1)).toBe(3);
  });

  it('the window is long enough for a real transition', () => {
    expect(OPTIMISTIC_TTL_MS).toBeGreaterThanOrEqual(1000);
  });
});

describe('taps that must be ignored', () => {
  it('a tap on the already-active tab does nothing', () => {
    // expo-router would remount the screen, throwing away the feed and the
    // scroll position — so doing nothing is correct, not a missing feature.
    expect(shouldNavigate(IDLE, '/explore', 0, T0)).toBe(false);
    expect(shouldNavigate(IDLE, '/you', 2, T0)).toBe(false);
  });

  it('a repeat tap while a navigation is in flight is dropped', () => {
    const s = press(2, T0);
    // Same tab again, and a different tab — both dropped until it settles.
    expect(shouldNavigate(s, '/explore', 2, T0 + 10)).toBe(false);
    expect(shouldNavigate(s, '/explore', 3, T0 + 10)).toBe(false);
  });

  it('accepts a new tap once the first has landed', () => {
    const s = press(2, T0);
    expect(shouldNavigate(s, '/you', 3, T0 + 60)).toBe(true);
  });

  it('accepts a new tap after a stuck navigation times out', () => {
    const s = press(2, T0);
    expect(shouldNavigate(s, '/explore', 3, T0 + OPTIMISTIC_TTL_MS + 1)).toBe(true);
  });

  it('a first tap from idle always goes', () => {
    for (const target of [1, 2, 3]) {
      expect(shouldNavigate(IDLE, '/explore', target, T0)).toBe(true);
    }
  });

  it('double-tapping the same tab navigates at most once', () => {
    let state = IDLE;
    let navigations = 0;
    for (let i = 0; i < 5; i++) {
      if (shouldNavigate(state, '/explore', 2, T0 + i * 5)) {
        navigations++;
        state = press(2, T0 + i * 5);
      }
    }
    expect(navigations).toBe(1);
  });
});
