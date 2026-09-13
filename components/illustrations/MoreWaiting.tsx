/**
 * MoreWaiting — "there is more here than you can get through."
 *
 * A figure sitting with one confession open in their hands, a stack of others
 * beside them, and more still drifting in from above the frame. That is the
 * premium offer drawn literally: not a lock, but the pile you have not reached.
 *
 * Replaced an earlier "wall of lit windows" version. A rectangle with a grid
 * of squares on it read as a spreadsheet, not a building at night, and the
 * near figure ended up hidden behind the tab bar. This uses the scrap shape
 * the rest of the system already speaks (see Release) — a torn note — so the
 * pile is unmistakably confessions rather than paperwork.
 *
 * House technique (docs/design/illustration.md §1):
 *   - Limbs: thick ink stroke (8.5) with a thinner garment stroke (4.9) over.
 *   - Fills drawn OFF-REGISTER from their outlines for the riso misprint.
 *   - Pressure pass on the shadow side.
 *
 * Two clocks:
 *   drift — the three loose scraps fall and reset on staggered phases, so
 *           more is always arriving. 6.2s.
 *   chest — 5.4s breathe, deliberately not a multiple of the drift so the two
 *           never lock into a visible pulse.
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
import { Svg, G, Path, Circle, Ellipse } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';
import { ILL_COLOR, STROKE, EASING_WORKLET } from '@/theme/illustration';
import { useReducedMotion } from '@/lib/a11y';

const AnimatedG = Animated.createAnimatedComponent(G);

/** The torn-note shape the system already uses (Release). */
const SCRAP = 'M-13-8L-10-11L8-11L13-6L12 8L-12 10L-14 2Z';

function Scrap({ x, y }: { x: number; y: number }) {
  return (
    <G transform={`translate(${x},${y})`}>
      <Path fill={ILL_COLOR.light} stroke="none" transform="translate(2.6,2)" d={SCRAP} />
      <G {...STROKE.ink2}>
        <Path d={SCRAP} strokeWidth={2.6} />
        <Path d="M-7-3q3-3 6 0t6 0M-7 3h9" />
      </G>
    </G>
  );
}

/** A scrap still falling — x fixed, y and opacity driven by its own phase. */
function FallingScrap({ x, phase, drift }: {
  x: number; phase: number; drift: SharedValue<number>;
}) {
  const props = useAnimatedProps(() => {
    'worklet';
    const t = (drift.value + phase) % 1;
    // Enters above the frame, settles toward the stack.
    const y = -30 + t * 150;
    // Fades in on arrival and out as it reaches the pile, so nothing pops.
    const o = t < 0.15 ? t / 0.15 : t > 0.82 ? (1 - t) / 0.18 : 1;
    return { transform: `translate(${x},${y})`, opacity: o };
  });
  return (
    <AnimatedG animatedProps={props}>
      <Path fill={ILL_COLOR.light} stroke="none" transform="translate(2.6,2)" d={SCRAP} />
      <G {...STROKE.ink2}><Path d={SCRAP} strokeWidth={2.6} /></G>
    </AnimatedG>
  );
}

export function MoreWaiting({ style }: { style?: ViewStyle }) {
  const reduceMotion = useReducedMotion();

  const drift = useSharedValue(0);
  const chest = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      if (reduceMotion) {
        drift.value = 0.4;
        chest.value = 0;
        return;
      }
      drift.value = withRepeat(withTiming(1, { duration: 6200 }), -1, false);
      chest.value = withRepeat(
        withTiming(1, { duration: 2700, easing: EASING_WORKLET.breathe }),
        -1,
        true,
      );
      return () => {
        cancelAnimation(drift);
        cancelAnimation(chest);
      };
    }, [reduceMotion]),
  );

  const chestProps = useAnimatedProps(() => {
    'worklet';
    const s = 1 + chest.value * 0.014;
    return { transform: `translate(150,176) scale(1,${s}) translate(-150,-176)` };
  });

  return (
    <Svg viewBox="0 0 400 300" style={style} preserveAspectRatio="xMidYMid meet">
      {/* ground */}
      <G {...STROKE.ink}><Path d="M56 244L344 244" /></G>

      {/* more arriving, always */}
      <FallingScrap x={268} phase={0.00} drift={drift} />
      <FallingScrap x={312} phase={0.41} drift={drift} />
      <FallingScrap x={288} phase={0.73} drift={drift} />

      {/* the pile already waiting — leaning, not stacked square */}
      <Scrap x={268} y={196} />
      <Scrap x={296} y={202} />
      <Scrap x={276} y={216} />
      <Scrap x={306} y={222} />
      <Scrap x={284} y={234} />

      {/* ── the reader ───────────────────────────────────────────────── */}
      <AnimatedG animatedProps={chestProps}>
        {/* torso */}
        <Path
          fill={ILL_COLOR.coral} stroke="none" transform="translate(-2.6,2.4)"
          d="M126 168C126 150 136 142 150 142C164 142 174 150 174 168L178 244L122 244Z"
        />
        <G {...STROKE.ink}>
          <Path d="M126 168C126 150 136 142 150 142C164 142 174 150 174 168L178 244L122 244Z" />
        </G>
        <Path {...STROKE.press} transform="translate(1,1.1)" d="M174 168L178 244" />

        {/* neck */}
        <G {...STROKE.ink}><Path d="M150 130V144" strokeWidth={10} /></G>
        <G stroke={ILL_COLOR.skinDp} strokeWidth={6.4} strokeLinecap="round" fill="none">
          <Path d="M150 130V144" />
        </G>

        {/* head, looking down at what they're holding */}
        <Circle fill={ILL_COLOR.skinDp} cx={153} cy={118} r={19} stroke="none" />
        <G {...STROKE.ink}><Circle cx={150} cy={116} r={19} /></G>
        <Circle cx={150} cy={116} r={19} {...STROKE.press} transform="translate(1,1.1)" />
        <Path
          fill={ILL_COLOR.ink} stroke="none" transform="translate(2.4,1.8)"
          d="M131 112C131 96 169 96 169 112C163 105 137 105 131 112Z"
        />
        <G {...STROKE.ink}>
          <Path d="M131 112C131 96 169 96 169 112C163 105 137 105 131 112Z" />
        </G>
        <G {...STROKE.ink2}><Path d="M141 120q3.5 3 7 0M153 120q3.5 3 7 0" /></G>
      </AnimatedG>

      {/* both arms come forward to hold the page — hands ON it */}
      <G {...STROKE.ink}><Path d="M130 168L136 196" strokeWidth={8.5} /></G>
      <G stroke={ILL_COLOR.coral} strokeWidth={4.9} strokeLinecap="round" fill="none">
        <Path d="M130 168L136 196" />
      </G>
      <G {...STROKE.ink}><Path d="M170 168L164 196" strokeWidth={8.5} /></G>
      <G stroke={ILL_COLOR.coral} strokeWidth={4.9} strokeLinecap="round" fill="none">
        <Path d="M170 168L164 196" />
      </G>

      {/* the one they're reading, held open */}
      <Path
        fill={ILL_COLOR.light} stroke="none" transform="translate(-2.4,2.2)"
        d="M120 192L180 192L184 220L124 220Z"
      />
      <G {...STROKE.ink}><Path d="M120 192L180 192L184 220L124 220Z" /></G>
      <G {...STROKE.ink2}><Path d="M130 200L168 200M130 209L156 209" /></G>

      {/* hands over the page edge, so it is held rather than floating */}
      <Ellipse fill={ILL_COLOR.skinDp} cx={134} cy={198} rx={6.2} ry={5} stroke="none" />
      <G {...STROKE.ink2}><Ellipse cx={136} cy={196} rx={6.2} ry={5} /></G>
      <Ellipse fill={ILL_COLOR.skinDp} cx={162} cy={198} rx={6.2} ry={5} stroke="none" />
      <G {...STROKE.ink2}><Ellipse cx={164} cy={196} rx={6.2} ry={5} /></G>
    </Svg>
  );
}

export default MoreWaiting;
