/**
 * ManyWindows — "there are hundreds more."
 *
 * A figure at their own window at night, facing a wall of other lit windows.
 * Each lit window is somebody else awake with something unsaid; that is the
 * thing premium actually buys access to, so the illustration is the offer
 * rather than a decoration next to it.
 *
 * The pull is quantity you can see but not reach — which is honest here in a
 * way "unlock unlimited" is not. Nothing is withheld that the reader has
 * already been shown.
 *
 * Two clocks:
 *   glow  — windows breathe in and out of brightness on staggered phases, so
 *           the wall reads as occupied rather than as wallpaper. 4.8s.
 *   chest — the near figure breathes, 5.4s, slightly slower than the windows
 *           so the two never lock into a visible pulse together.
 *
 * The single ILL_COLOR.light object rule is deliberately stretched: the lit
 * windows are all `light`, because they are collectively one object — the
 * thing on the other side of the glass.
 */

import React, { useCallback } from 'react';
import { ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated';
import { Svg, G, Path, Circle, Rect } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';
import { ILL_COLOR, STROKE, EASING_WORKLET } from '@/theme/illustration';
import { useReducedMotion } from '@/lib/a11y';

const AnimatedG    = Animated.createAnimatedComponent(G);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

// x, y, phase offset. Phases are irregular on purpose — an even spread reads
// mechanical, like a loading indicator rather than a building.
const WINDOWS: ReadonlyArray<readonly [number, number, number]> = [
  [222, 74, 0.00], [258, 74, 0.42], [294, 74, 0.17],
  [222, 112, 0.68], [258, 112, 0.09], [294, 112, 0.83],
  [222, 150, 0.31], [258, 150, 0.95], [294, 150, 0.55],
  [222, 188, 0.77], [258, 188, 0.24], [294, 188, 0.61],
];

function LitWindow({ x, y, phase, glow }: {
  x: number; y: number; phase: number; glow: SharedValue<number>;
}) {
  const props = useAnimatedProps(() => {
    'worklet';
    // Each window sits at its own point in the cycle.
    const t = (glow.value + phase) % 1;
    // Never fully dark: an unlit window would read as nobody there, and the
    // point is that everyone is there.
    const o = 0.55 + 0.45 * (0.5 - 0.5 * Math.cos(t * 2 * Math.PI));
    return { opacity: o };
  });
  return (
    <>
      <AnimatedRect
        x={x} y={y} width={26} height={26} rx={2}
        fill={ILL_COLOR.light}
        animatedProps={props}
      />
      <Rect x={x} y={y} width={26} height={26} rx={2} {...STROKE.ink2} />
    </>
  );
}

export function ManyWindows({ style }: { style?: ViewStyle }) {
  const reduceMotion = useReducedMotion();

  const glow  = useSharedValue(0);
  const chest = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      if (reduceMotion) {
        glow.value = 0.5;
        chest.value = 0;
        return;
      }
      glow.value = withRepeat(withTiming(1, { duration: 4800 }), -1, false);
      chest.value = withRepeat(
        withTiming(1, { duration: 2700, easing: EASING_WORKLET.breathe }),
        -1,
        true,
      );
      return () => {
        cancelAnimation(glow);
        cancelAnimation(chest);
      };
    }, [reduceMotion]),
  );

  const chestProps = useAnimatedProps(() => {
    'worklet';
    const s = 1 + chest.value * 0.014;
    return { transform: `translate(96,210) scale(1,${s}) translate(-96,-210)` };
  });

  return (
    <Svg viewBox="0 0 400 300" style={style} preserveAspectRatio="xMidYMid meet">
      {/* the far building */}
      <Path d="M206 52L326 52L326 250L206 250Z" fill={ILL_COLOR.dusk} />
      <Path d="M206 52L326 52L326 250L206 250Z" {...STROKE.ink} />
      {WINDOWS.map(([x, y, p]) => (
        <LitWindow key={`${x}-${y}`} x={x} y={y} phase={p} glow={glow} />
      ))}

      {/* ground */}
      <Path d="M40 250L360 250" {...STROKE.ink} />

      {/* near window frame — the reader's own side, unlit */}
      <Path d="M46 60L166 60L166 250" {...STROKE.ink} />
      <Path d="M106 60L106 250M46 150L166 150" {...STROKE.ink2} />

      {/* the near figure, back to us, looking across */}
      <AnimatedG animatedProps={chestProps}>
        <Path d="M76 250C76 208 82 186 96 186C110 186 116 208 116 250Z" fill={ILL_COLOR.coral} />
        <Path d="M76 250C76 208 82 186 96 186C110 186 116 208 116 250" {...STROKE.ink} />
        <Circle cx="96" cy="166" r="22" fill={ILL_COLOR.skinDp} />
        <Circle cx="96" cy="166" r="22" {...STROKE.ink} />
        {/* back of the head — no face. They are looking at the windows, not us. */}
        <Path d="M75 160q4 -24 21 -24q19 0 22 24q-11 -8 -22 -8q-12 0 -21 8Z" fill={ILL_COLOR.ink} />
      </AnimatedG>
    </Svg>
  );
}

export default ManyWindows;
