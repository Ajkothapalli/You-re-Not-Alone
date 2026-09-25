/**
 * The splash gate.
 *
 * AnimatedSplash is an in-tree overlay, so the screen beneath it mounts and
 * animates while nobody can see it. Lantern's wave occupies 0–2.4s of its 5s
 * cycle and the splash dismisses at 2.8s — so the greeting was always spent
 * behind the overlay, and the first thing anyone actually saw was a figure
 * sitting still until the next cycle at t=5s.
 *
 * The two properties that matter: it fires once when the splash clears, and it
 * is STICKY, so a screen mounted later (second visit, after navigation) waves
 * immediately instead of waiting for an event that already happened.
 */

import {
  markSplashDone, isSplashDone, subscribeSplashDone, __resetSplashGate,
} from '@/lib/splashGate';

beforeEach(() => __resetSplashGate());

describe('splashGate', () => {
  it('starts closed', () => {
    expect(isSplashDone()).toBe(false);
  });

  it('notifies a subscriber when the splash clears', () => {
    const seen: boolean[] = [];
    subscribeSplashDone((v) => seen.push(v));
    expect(seen).toEqual([]);

    markSplashDone();
    expect(seen).toEqual([true]);
    expect(isSplashDone()).toBe(true);
  });

  it('is sticky — a later mount sees it already open', () => {
    // This is the case that makes the fix correct rather than merely working
    // once: navigating back to a screen after the splash is long gone must
    // wave immediately, not wait for an event that will never fire again.
    markSplashDone();
    expect(isSplashDone()).toBe(true);

    const seen: boolean[] = [];
    subscribeSplashDone((v) => seen.push(v));
    // A late subscriber gets nothing — the caller checks isSplashDone() first.
    expect(seen).toEqual([]);
  });

  it('only fires once however many times it is marked', () => {
    const seen: boolean[] = [];
    subscribeSplashDone((v) => seen.push(v));
    markSplashDone();
    markSplashDone();
    markSplashDone();
    expect(seen).toEqual([true]);
  });

  it('stops notifying after unsubscribe', () => {
    const seen: boolean[] = [];
    const off = subscribeSplashDone((v) => seen.push(v));
    off();
    markSplashDone();
    expect(seen).toEqual([]);
  });
});

// ─── The wiring, so the gate cannot be left unpublished ──────────────────────

describe('the gate is actually wired up', () => {
  const read = (...p: string[]) =>
    require('fs').readFileSync(require('path').join(__dirname, '..', '..', ...p), 'utf8');

  it('the root layout marks it when the splash finishes', () => {
    // A gate nobody opens would leave the Lantern permanently still — a worse
    // bug than the one being fixed, and invisible in every unit test.
    const src = read('app', '_layout.tsx');
    expect(src).toContain('markSplashDone');
    expect(src).toMatch(/onDone=\{\(\) => \{[^}]*markSplashDone\(\)/);
  });

  it('Lantern waits on it, and checks the sticky value first', () => {
    const src = read('components', 'illustrations', 'Lantern.tsx');
    expect(src).toContain('isSplashDone()');
    expect(src).toContain('subscribeSplashDone');
    // Checking isSplashDone() BEFORE subscribing is what makes a later mount
    // wave at once instead of waiting forever.
    expect(src).toMatch(/if \(isSplashDone\(\)\) startWave\(\);\s*\n\s*else\s+unsubscribe = subscribeSplashDone\(startWave\)/);
  });

  it('Lantern unsubscribes and cancels on blur', () => {
    const src = read('components', 'illustrations', 'Lantern.tsx');
    expect(src).toMatch(/cancelled = true;/);
    expect(src).toMatch(/unsubscribe\?\.\(\)/);
  });
});
