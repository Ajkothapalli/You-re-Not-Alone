/**
 * useAspectFit — arithmetic tests.
 *
 * Per the design brief: given known container dimensions and a target ratio,
 * assert the returned box fits and preserves the ratio. This is deliberately
 * NOT a Yoga/layout test — the whole point of hooks/useAspectFit.ts is to
 * sidestep Yoga's aspectRatio-vs-flex resolution entirely, so the thing worth
 * testing is the pure arithmetic, which is safe to check without a device.
 */

import { act, renderHook } from '@testing-library/react-native';
import {
  fitAspectRatio,
  deriveHeightFromWidth,
  useAspectFit,
  useAspectFitWidth,
} from '@/hooks/useAspectFit';

function layoutEvent(width: number, height: number) {
  return { nativeEvent: { layout: { x: 0, y: 0, width, height } } } as any;
}

describe('fitAspectRatio (contain fit)', () => {
  it('returns a 0x0 box for non-positive inputs', () => {
    expect(fitAspectRatio(0, 100, 4 / 3)).toEqual({ width: 0, height: 0 });
    expect(fitAspectRatio(100, 0, 4 / 3)).toEqual({ width: 0, height: 0 });
    expect(fitAspectRatio(100, 100, 0)).toEqual({ width: 0, height: 0 });
    expect(fitAspectRatio(-10, 100, 4 / 3)).toEqual({ width: 0, height: 0 });
  });

  it('binds to height when the available box is relatively wider than the ratio', () => {
    // 800x300 is far wider than 4:3 — height (300) should be the constraint.
    const box = fitAspectRatio(800, 300, 4 / 3);
    expect(box.height).toBe(300);
    expect(box.width).toBeCloseTo(400, 5);
  });

  it('binds to width when the available box is relatively taller than the ratio', () => {
    // 300x800 is far taller than 4:3 — width (300) should be the constraint.
    const box = fitAspectRatio(300, 800, 4 / 3);
    expect(box.width).toBe(300);
    expect(box.height).toBeCloseTo(225, 5);
  });

  it('returns the exact box unchanged when it already matches the target ratio', () => {
    const box = fitAspectRatio(400, 300, 4 / 3);
    expect(box).toEqual({ width: 400, height: 300 });
  });

  it('never exceeds either axis of the available box, for a range of shapes', () => {
    const ratio = 4 / 3;
    const cases: [number, number][] = [
      [100, 100], [50, 500], [500, 50], [1, 1000], [1000, 1],
      [402, 874], // a real device's logical point size (beat 0's heroCenter class of container)
    ];
    for (const [availWidth, availHeight] of cases) {
      const box = fitAspectRatio(availWidth, availHeight, ratio);
      expect(box.width).toBeLessThanOrEqual(availWidth + 1e-6);
      expect(box.height).toBeLessThanOrEqual(availHeight + 1e-6);
      expect(box.width / box.height).toBeCloseTo(ratio, 5);
    }
  });
});

describe('deriveHeightFromWidth', () => {
  it('derives height from a known width and ratio', () => {
    expect(deriveHeightFromWidth(400, 4 / 3)).toBeCloseTo(300, 5);
    expect(deriveHeightFromWidth(100, 1)).toBe(100);
  });

  it('returns 0 for non-positive inputs', () => {
    expect(deriveHeightFromWidth(0, 4 / 3)).toBe(0);
    expect(deriveHeightFromWidth(100, 0)).toBe(0);
    expect(deriveHeightFromWidth(-5, 4 / 3)).toBe(0);
  });
});

describe('useAspectFit (contain hook)', () => {
  it('is not ready until the first onLayout fires', async () => {
    const { result } = await renderHook(() => useAspectFit(4 / 3));
    expect(result.current.ready).toBe(false);
    expect(result.current.width).toBe(0);
    expect(result.current.height).toBe(0);
  });

  it('computes a contain-fit box from a measured layout, matching fitAspectRatio', async () => {
    const { result } = await renderHook(() => useAspectFit(4 / 3));
    await act(async () => { result.current.onLayout(layoutEvent(300, 900)); });
    expect(result.current.ready).toBe(true);
    expect(result.current).toMatchObject(fitAspectRatio(300, 900, 4 / 3));
  });

  it('recomputes on a subsequent layout pass (e.g. rotation)', async () => {
    const { result } = await renderHook(() => useAspectFit(4 / 3));
    await act(async () => { result.current.onLayout(layoutEvent(300, 900)); });
    const first = { width: result.current.width, height: result.current.height };
    await act(async () => { result.current.onLayout(layoutEvent(900, 300)); });
    expect(result.current).not.toMatchObject(first);
    expect(result.current).toMatchObject(fitAspectRatio(900, 300, 4 / 3));
  });
});

describe('useAspectFitWidth (width-anchored hook)', () => {
  it('is not ready until the first onLayout fires', async () => {
    const { result } = await renderHook(() => useAspectFitWidth(4 / 3));
    expect(result.current.ready).toBe(false);
  });

  it('derives height purely from measured width, ignoring measured height', async () => {
    const { result } = await renderHook(() => useAspectFitWidth(4 / 3));
    // Height in the layout event is 0 (an empty View with no explicit height,
    // exactly the "aspectRatio replacement" scenario this hook exists for) —
    // the box must still resolve correctly from width alone.
    await act(async () => { result.current.onLayout(layoutEvent(400, 0)); });
    expect(result.current.ready).toBe(true);
    expect(result.current.width).toBe(400);
    expect(result.current.height).toBeCloseTo(300, 5);
  });
});
