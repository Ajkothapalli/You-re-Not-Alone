/**
 * Writing — "it's your turn."
 *
 * A figure bent over a page, mid-sentence. The one yellow object in the scene
 * is the page itself (ILL_COLOR.light), because the page is the thing we are
 * asking for.
 *
 * Two clocks:
 *   hand  — the writing hand tracks left→right and resets, 3.4s, the small
 *           repetitive motion of actually writing rather than posing with a pen.
 *   chest — 5.2s breathe, so the figure is alive between strokes.
 *
 * No rotate() anywhere: Reanimated 4's transform processor requires a `deg`
 * suffix that react-native-svg's parser rejects, so nothing in this codebase
 * can animate a rotation through both. The pen angle is baked into the path
 * and only its translation animates.
 */

import React, { useCallback } from 'react';
import { ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
} from 'react-native-reanimated';
import { Svg, G, Path, Circle } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';
import { ILL_COLOR, STROKE, EASING_WORKLET } from '@/theme/illustration';
import { useReducedMotion } from '@/lib/a11y';

const AnimatedG = Animated.createAnimatedComponent(G);

export function Writing({ style }: { style?: ViewStyle }) {
  const reduceMotion = useReducedMotion();

  const hand  = useSharedValue(0);   // 0 → 1 across the line
  const chest = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      if (reduceMotion) {
        hand.value = 0.5;
        chest.value = 0;
        return;
      }
      // Write across, lift, return. The pause at the end of the line is what
      // makes it read as writing rather than sliding.
      hand.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 2200, easing: EASING_WORKLET.breathe }),
          withTiming(1, { duration: 250 }),
          withTiming(0, { duration: 420, easing: EASING_WORKLET.exit }),
          withTiming(0, { duration: 530 }),
        ),
        -1,
        false,
      );
      chest.value = withRepeat(
        withTiming(1, { duration: 2600, easing: EASING_WORKLET.breathe }),
        -1,
        true,
      );
      return () => {
        cancelAnimation(hand);
        cancelAnimation(chest);
      };
    }, [reduceMotion]),
  );

  // Hand + pen travel together along the writing line.
  const penProps = useAnimatedProps(() => {
    'worklet';
    const x = 168 + hand.value * 74;
    // A shallow dip mid-line — the wrist drops slightly through the stroke.
    const y = 176 + Math.sin(hand.value * Math.PI) * 2.5;
    return { transform: `translate(${x},${y})` };
  });

  const chestProps = useAnimatedProps(() => {
    'worklet';
    const s = 1 + chest.value * 0.012;
    return { transform: `translate(200,150) scale(1,${s}) translate(-200,-150)` };
  });

  return (
    <Svg viewBox="0 0 400 300" style={style} preserveAspectRatio="xMidYMid meet">
      {/* ground */}
      <Path d="M60 262L340 262" {...STROKE.ink} />

      {/* desk */}
      <Path d="M104 214L296 214L286 262L114 262Z" fill={ILL_COLOR.sand} />
      <Path d="M104 214L296 214L286 262L114 262Z" {...STROKE.ink} />

      {/* the page — the one yellow object, and the thing being asked for */}
      <Path d="M156 198L262 198L268 226L162 226Z" fill={ILL_COLOR.light} />
      <Path d="M156 198L262 198L268 226L162 226Z" {...STROKE.ink} />
      {/* written lines already on the page */}
      <Path d="M170 208L232 208M170 216L214 216" {...STROKE.ink2} />

      <AnimatedG animatedProps={chestProps}>
        {/* torso */}
        <Path d="M168 196C168 160 180 138 200 138C220 138 232 160 232 196Z" fill={ILL_COLOR.sage} />
        <Path d="M168 196C168 160 180 138 200 138C220 138 232 160 232 196" {...STROKE.ink} />

        {/* head, tipped toward the page */}
        <Circle cx="204" cy="116" r="25" fill={ILL_COLOR.skinMd} />
        <Circle cx="204" cy="116" r="25" {...STROKE.ink} />
        {/* hair */}
        <Path d="M181 108q6 -22 25 -22q20 0 24 20q-10 -9 -24 -9q-15 0 -25 11Z" fill={ILL_COLOR.ink} />
        {/* eyes down at the page, not at us */}
        <Path d="M194 120q3.5 3 7 0M208 120q3.5 3 7 0" {...STROKE.ink2} />

        {/* far arm resting on the desk */}
        <Path d="M176 176C160 182 152 196 156 206" {...STROKE.ink} />
      </AnimatedG>

      {/* writing arm — shoulder fixed, hand travels */}
      <Path d="M226 168C238 172 244 176 248 180" {...STROKE.ink} />
      <AnimatedG animatedProps={penProps}>
        {/* hand */}
        <Circle cx="0" cy="0" r="9" fill={ILL_COLOR.skinMd} />
        <Circle cx="0" cy="0" r="9" {...STROKE.ink2} />
        {/* pen — angle baked into the path, only the group translates */}
        <Path d="M4 -4L18 -24" {...STROKE.ink} />
        <Path d="M-2 4L4 -4" {...STROKE.ink2} />
      </AnimatedG>
    </Svg>
  );
}

export default Writing;
