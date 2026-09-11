/**
 * useAspectFit — measured, deterministic illustration sizing.
 *
 * Background: every illustration in this app is a `viewBox="0 0 400 300"`
 * (4:3) SVG rendered with `preserveAspectRatio="xMidYMid meet"`. The old
 * pattern of sizing the wrapper with RN's own `aspectRatio` style prop
 * (`{ width: '100%', aspectRatio: 4/3 }`, or worse, `{ width: '100%',
 * height: '100%' }`) only produces a clean 4:3 box when the wrapper's OTHER
 * axis isn't itself being flex-resolved against sibling content. Inside a
 * `flex: 1` hero area competing for height with logo/tagline/button siblings
 * (welcome.tsx beat 0), Yoga can resolve a box whose actual rendered ratio
 * doesn't match 4:3 at all — `preserveAspectRatio="xMidYMid meet"` then has
 * to letterbox/reposition the scene to fit, which is what put the falling
 * leaf (absolute SVG position translate(300,64)) somewhere far from where it
 * was drawn.
 *
 * The fix is to stop asking Yoga to resolve an aspect-ratio box at all: measure
 * the real available box with `onLayout`, then hand the illustration an exact
 * pre-computed pixel `{ width, height }`. With an exact 4:3 pixel box,
 * `preserveAspectRatio="xMidYMid meet"` never has anything left to reconcile —
 * it's already a 1:1 uniform scale, so nothing can drift or overflow into a
 * parent's `overflow: hidden`.
 *
 * Two flavours, matching the two shapes of container this app actually has:
 *
 *  - `useAspectFit` ("contain"): for a wrapper whose BOTH axes are already
 *    bounded by layout (typically `flex: 1` inside a fixed-height card, e.g.
 *    welcome.tsx beat 0's `heroCenter`). Measures the full available box and
 *    returns the largest 4:3 box that fits inside it on both axes — the
 *    classic letterbox/"contain" fit:
 *      if (availWidth / availHeight > ratio) { height = availHeight; width = height * ratio }
 *      else                                  { width  = availWidth;  height = width / ratio }
 *
 *  - `useAspectFitWidth` ("derive from width"): for a wrapper whose width is
 *    already fixed (a percentage of an unconstrained-height parent — e.g. a
 *    plain ScrollView column) but which has no height of its own to measure
 *    against (an empty View with no explicit height reports height 0 until
 *    something inside gives it one — using the "contain" formula here would
 *    deadlock at a 0×0 box). Measures only the available width and derives
 *    height arithmetically: `height = width / ratio`. This is a drop-in,
 *    Yoga-free replacement for `{ width: X, aspectRatio: ratio }`.
 *
 * Both are pure-arithmetic on top of a single `onLayout` measurement — no
 * dependency on Yoga's aspectRatio-vs-flex resolution, so the box is always
 * mathematically guaranteed to fit and preserve the ratio. `fitAspectRatio`
 * and `deriveHeightFromWidth` are exported standalone so the arithmetic can
 * be unit-tested with plain numbers, without a device or a live layout pass.
 */

import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

export interface AspectFitBox {
  width:  number;
  height: number;
}

export interface UseAspectFitResult extends AspectFitBox {
  /** Attach to the measuring container's `onLayout` prop. */
  onLayout: (event: LayoutChangeEvent) => void;
  /** False until the first layout pass has produced a usable (non-zero) box. */
  ready: boolean;
}

/**
 * Pure "contain" fit: the largest box with `targetAspectRatio` (width / height)
 * that fits inside `availWidth` × `availHeight` without exceeding either axis.
 * Safe to unit-test with plain numbers — no Yoga, no native measurement.
 */
export function fitAspectRatio(
  availWidth: number,
  availHeight: number,
  targetAspectRatio: number,
): AspectFitBox {
  if (availWidth <= 0 || availHeight <= 0 || targetAspectRatio <= 0) {
    return { width: 0, height: 0 };
  }
  if (availWidth / availHeight > targetAspectRatio) {
    // Available box is relatively wider than the target — height is the
    // binding constraint; width is derived from it.
    const height = availHeight;
    return { width: height * targetAspectRatio, height };
  }
  // Available box is relatively taller than (or equal to) the target —
  // width is the binding constraint; height is derived from it.
  const width = availWidth;
  return { width, height: width / targetAspectRatio };
}

/** Pure width→height derivation for the "only width is known" case. */
export function deriveHeightFromWidth(width: number, targetAspectRatio: number): number {
  if (width <= 0 || targetAspectRatio <= 0) return 0;
  return width / targetAspectRatio;
}

/**
 * "Contain" fit hook — for a wrapper whose both axes are already bounded by
 * layout (e.g. `flex: 1` inside a fixed-height parent). Measures the whole
 * available box on `onLayout` and returns the exact 4:3 (or whatever ratio)
 * pixel box that fits inside it on both axes.
 */
export function useAspectFit(targetAspectRatio: number): UseAspectFitResult {
  const [box, setBox] = useState<AspectFitBox>({ width: 0, height: 0 });

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width: availWidth, height: availHeight } = event.nativeEvent.layout;
    setBox(fitAspectRatio(availWidth, availHeight, targetAspectRatio));
  }, [targetAspectRatio]);

  return { ...box, onLayout, ready: box.width > 0 && box.height > 0 };
}

/**
 * Width-anchored fit hook — for a wrapper whose width is fixed (e.g. a
 * percentage of its parent) but whose height is NOT itself bounded by
 * layout (an empty View has no intrinsic height to measure). Measures only
 * the available width on `onLayout` and derives height arithmetically.
 * Drop-in replacement for `{ width: X, aspectRatio: ratio }`.
 */
export function useAspectFitWidth(targetAspectRatio: number): UseAspectFitResult {
  const [box, setBox] = useState<AspectFitBox>({ width: 0, height: 0 });

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width: availWidth } = event.nativeEvent.layout;
    setBox({ width: availWidth, height: deriveHeightFromWidth(availWidth, targetAspectRatio) });
  }, [targetAspectRatio]);

  return { ...box, onLayout, ready: box.width > 0 && box.height > 0 };
}
