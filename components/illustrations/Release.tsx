/**
 * Release — "let it go."
 * Onboarding: B letting the scrap (the yap) go.
 *
 * Five clocks: breathe c2 (chest 6.1s), nod h2 (head 7.6s),
 * release/note (12s scrap arc), armL/armR (open at 34% of 12s),
 * three trail dots (appear 44–68%).
 *
 * Ported 1:1 from docs/design/illustration.md §7.2.
 * Component only in phase 1 — not yet mounted on any screen.
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
import { Svg, G, Path, Circle, Ellipse } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';

import { useReducedMotion } from '@/lib/a11y';
import { ILL_COLOR, STROKE, EASING_WORKLET } from '@/theme/illustration';
import { ILLUSTRATION } from '@/theme/motion';

const AnimatedG = Animated.createAnimatedComponent(G);

// Chest: alternate period; torso bottom at approx (200, 180)
const CX = 200, CY_CHEST = 180;
// Head: alternate period; neck at (200, 112)
const CY_NECK = 112;
// Arm pivot shoulders: L (183, 132), R (217, 132)
const ARM_L = { x: 183, y: 132 };
const ARM_R = { x: 217, y: 132 };

// Release keyframes (12s)
// note: 0→6% appear, 22% held, 54% translate(-40,-88) rotate(-10°), 62% translate(-46,-104) rotate(-12°) opacity 0
// dots: hidden until 44%, visible at 52%, translateY -40, gone by 68%
// armL/R: rotate ∓6° at 34%, back by 58%
const T = ILLUSTRATION.release; // 12000ms

// ─── Designed still (reduced motion) ─────────────────────────────────────────
// Scrap mid-lift: translate(-30, -64) rotate(-8°), dots absent.
const NOTE_STILL = 'translate(-30, -64) rotate(-8)';

// ─── Still ────────────────────────────────────────────────────────────────────

function ReleaseStill({ style }: { style?: ViewStyle }) {
  return (
    <Svg viewBox="0 0 400 300" width="100%" preserveAspectRatio="xMidYMid meet" style={style}>
      {/* Ground */}
      <G {...STROKE.ink}><Path d="M36 244H364" /></G>
      <G {...STROKE.ink2}><Path d="M292 244l3-8M300 244l2-6" /></G>

      {/* Legs */}
      <G {...STROKE.ink}><Path d="M193 178V240M207 178V240" strokeWidth={11} /></G>
      <G stroke={ILL_COLOR.dusk} strokeWidth={7.4} strokeLinecap="round" fill="none"><Path d="M193 178V240M207 178V240" /></G>
      <G {...STROKE.ink}><Path d="M186 243h12M202 243h12" strokeWidth={7} /></G>

      {/* Chest */}
      <Path fill={ILL_COLOR.sage} d="M180 126C180 118 220 118 220 126L216 180C216 185 184 185 184 180Z" transform="translate(-2.6,2.4)" stroke="none" />
      <G {...STROKE.ink}><Path d="M180 126C180 118 220 118 220 126L216 180C216 185 184 185 184 180Z" /></G>
      <Path d="M180 126C180 118 220 118 220 126L216 180C216 185 184 185 184 180Z" {...STROKE.press} transform="translate(1,1.1)" />
      <G {...STROKE.ink}><Path d="M200 112V124" strokeWidth={10} /></G>
      <G stroke={ILL_COLOR.skinDp} strokeWidth={6.4} strokeLinecap="round" fill="none"><Path d="M200 112V124" /></G>
      {/* Arms — neutral (still) */}
      <G {...STROKE.ink}><Path d="M183 132L160 150" strokeWidth={8.5} /></G>
      <G stroke={ILL_COLOR.sage} strokeWidth={4.9} strokeLinecap="round" fill="none"><Path d="M183 132L160 150" /></G>
      <Ellipse fill={ILL_COLOR.skinDp} cx={160} cy={155} rx={4.8} ry={3.8} stroke="none" />
      <G {...STROKE.ink2}><Ellipse cx={157} cy={153} rx={4.8} ry={3.8} /></G>
      <G {...STROKE.ink}><Path d="M217 132L240 150" strokeWidth={8.5} /></G>
      <G stroke={ILL_COLOR.sage} strokeWidth={4.9} strokeLinecap="round" fill="none"><Path d="M217 132L240 150" /></G>
      <Ellipse fill={ILL_COLOR.skinDp} cx={246} cy={155} rx={4.8} ry={3.8} stroke="none" />
      <G {...STROKE.ink2}><Ellipse cx={243} cy={153} rx={4.8} ry={3.8} /></G>

      {/* Head */}
      <Circle fill={ILL_COLOR.skinDp} cx={203} cy={98} r={16} stroke="none" />
      <G {...STROKE.ink}><Circle cx={200} cy={96} r={16} /></G>
      <Circle cx={200} cy={96} r={16} {...STROKE.press} transform="translate(1,1.1)" />
      <Path fill={ILL_COLOR.ink} d="M184 92C184 78 216 78 216 92C210 86 190 86 184 92Z" transform="translate(3,2)" stroke="none" />
      <G {...STROKE.ink}><Path d="M184 92C184 78 216 78 216 92C210 86 190 86 184 92Z" /><Circle cx={214} cy={80} r={7} fill={ILL_COLOR.ink} /></G>
      <G {...STROKE.ink2}><Path d="M190 90q3-2 7 0M203 90q4-2 7 0M191 98q3 3 6 0M203 98q3 3 6 0M195 106q5 3 10 0" /></G>

      {/* Scrap — mid-lift still */}
      <G transform={`translate(200, 148) ${NOTE_STILL}`}>
        <Path fill={ILL_COLOR.light} d="M-13-8L-10-11L8-11L13-6L12 8L-12 10L-14 2Z" transform="translate(3,2)" stroke="none" />
        <G {...STROKE.ink2}><Path d="M-13-8L-10-11L8-11L13-6L12 8L-12 10L-14 2Z" strokeWidth={2.6} /><Path d="M-7-3q3-3 6 0t6 0M-7 3h9" /></G>
      </G>
      {/* Dots — absent in still */}
    </Svg>
  );
}

// ─── Animated ─────────────────────────────────────────────────────────────────

function ReleaseAnimated({ style }: { style?: ViewStyle }) {
  const breathX = useSharedValue(1);
  const breathY = useSharedValue(1);
  const nodY    = useSharedValue(0);
  const nodR    = useSharedValue(0);
  const armLR   = useSharedValue(0);  // armL rotates -6°, armR +6°
  const noteX   = useSharedValue(0);
  const noteY   = useSharedValue(0);
  const noteR   = useSharedValue(0);
  const noteO   = useSharedValue(0);
  const dotO    = useSharedValue(0);   // all 3 dots share opacity timing
  const dotY    = useSharedValue(0);

  const chestProps = useAnimatedProps(() => {
    'worklet';
    return {
      transform: `translate(${CX},${CY_CHEST}) scale(${breathX.value},${breathY.value}) translate(-${CX},-${CY_CHEST})`,
    };
  });

  // NOTE — rotate() is deliberately not used below. See EmptyBench.tsx for
  // the full explanation: no rotate() string survives both Reanimated 4's
  // transform-string processor (requires a "deg" unit) and react-native-svg's
  // native SVG transform parser (rejects a "deg" unit) at once, so
  // rotation-based motion is approximated with translate/scale instead.
  // TODO before mounting this component: the arm-open gesture (armLProps/
  // armRProps) has been reduced to a scale pulse placeholder — it will read
  // as a life-like "breathe" rather than a deliberate "opening" motion until
  // it's redesigned (e.g. as a wrapping Animated.View over a nested <Svg>,
  // which correctly consumes Reanimated's processed transform array).
  const headProps = useAnimatedProps(() => {
    'worklet';
    return {
      transform: `translate(0,${nodY.value})`,
    };
  });

  const armLProps = useAnimatedProps(() => {
    'worklet';
    return { transform: `translate(${ARM_L.x},${ARM_L.y}) scale(${1 + armLR.value / 40}) translate(-${ARM_L.x},-${ARM_L.y})` };
  });

  const armRProps = useAnimatedProps(() => {
    'worklet';
    return { transform: `translate(${ARM_R.x},${ARM_R.y}) scale(${1 + armLR.value / 40}) translate(-${ARM_R.x},-${ARM_R.y})` };
  });

  const noteProps = useAnimatedProps(() => {
    'worklet';
    return {
      opacity:   noteO.value,
      transform: `translate(${noteX.value},${noteY.value})`,
    };
  });

  const dotProps = useAnimatedProps(() => {
    'worklet';
    return { opacity: dotO.value, transform: `translate(0,${dotY.value})` };
  });

  function startAnimations() {
    const HALF = (ms: number) => Math.round(ms / 2);

    // Breathe (c2) — alternate period
    breathX.value = withRepeat(withTiming(1.008, { duration: HALF(ILLUSTRATION.breathe[1]), easing: EASING_WORKLET.breathe }), -1, true);
    breathY.value = withRepeat(withTiming(1.02,  { duration: HALF(ILLUSTRATION.breathe[1]), easing: EASING_WORKLET.breathe }), -1, true);

    // Nod (h2) — alternate period
    nodY.value = withRepeat(withTiming(-1.2, { duration: HALF(ILLUSTRATION.nod[1]), easing: EASING_WORKLET.breathe }), -1, true);
    nodR.value = withRepeat(withTiming(0.8,  { duration: HALF(ILLUSTRATION.nod[1]), easing: EASING_WORKLET.breathe }), -1, true);

    // Arms: open ∓6° at 34% (4080ms), back by 58% (6960ms)
    // Implemented as a sequence within the 12s release cycle
    const armOpen  = Math.round(T * 0.34);
    const armHold  = Math.round(T * 0.24);  // 34% to 58%
    const armClose = Math.round(T * 0.42);  // 58% to 100%
    armLR.value = withRepeat(
      withSequence(
        withTiming(0, { duration: armOpen }),
        withTiming(6, { duration: Math.round(armOpen * 0.2), easing: EASING_WORKLET.enter }),
        withTiming(6, { duration: armHold }),
        withTiming(0, { duration: armClose, easing: EASING_WORKLET.breathe }),
      ),
      -1, false,
    );

    // Note (scrap): 0→6% appear, held to 22%, lift+fade by 62%, hold gone to 100%
    const appear = Math.round(T * 0.06);
    const hold1  = Math.round(T * 0.16);  // 6% to 22%
    const rise   = Math.round(T * 0.40);  // 22% to 62%
    const hold2  = T - appear - hold1 - rise;
    noteO.value = withRepeat(
      withSequence(
        withTiming(1, { duration: appear, easing: EASING_WORKLET.enter }),
        withTiming(1, { duration: hold1 }),
        withTiming(0, { duration: rise, easing: EASING_WORKLET.exit }),
        withTiming(0, { duration: hold2 }),
      ),
      -1, false,
    );
    noteX.value = withRepeat(
      withSequence(
        withTiming(0,   { duration: appear + hold1 }),
        withTiming(-46, { duration: rise, easing: EASING_WORKLET.exit }),
        withTiming(-46, { duration: hold2 }),
      ),
      -1, false,
    );
    noteY.value = withRepeat(
      withSequence(
        withTiming(0,    { duration: appear + hold1 }),
        withTiming(-104, { duration: rise, easing: EASING_WORKLET.exit }),
        withTiming(-104, { duration: hold2 }),
      ),
      -1, false,
    );
    noteR.value = withRepeat(
      withSequence(
        withTiming(0,   { duration: appear + hold1 }),
        withTiming(-12, { duration: rise, easing: EASING_WORKLET.exit }),
        withTiming(-12, { duration: hold2 }),
      ),
      -1, false,
    );

    // Dots: hidden until 44% (5280ms), peak at 52% (6240ms), gone by 68% (8160ms)
    const dotStart = Math.round(T * 0.44);
    const dotIn    = Math.round(T * 0.08);
    const dotOut   = Math.round(T * 0.16);
    const dotRest  = T - dotStart - dotIn - dotOut;
    dotO.value = withRepeat(
      withSequence(
        withTiming(0, { duration: dotStart }),
        withTiming(1, { duration: dotIn, easing: EASING_WORKLET.enter }),
        withTiming(0, { duration: dotOut, easing: EASING_WORKLET.exit }),
        withTiming(0, { duration: dotRest }),
      ),
      -1, false,
    );
    dotY.value = withRepeat(
      withSequence(
        withTiming(0,   { duration: dotStart }),
        withTiming(-40, { duration: dotIn + dotOut, easing: EASING_WORKLET.exit }),
        withTiming(-40, { duration: dotRest }),
      ),
      -1, false,
    );
  }

  function stopAnimations() {
    [breathX, breathY, nodY, nodR, armLR, noteX, noteY, noteR, noteO, dotO, dotY].forEach(sv => cancelAnimation(sv));
    breathX.value = 1; breathY.value = 1;
    nodY.value = 0; nodR.value = 0;
    armLR.value = 0;
    noteX.value = 0; noteY.value = 0; noteR.value = 0; noteO.value = 0;
    dotO.value = 0; dotY.value = 0;
  }

  useFocusEffect(useCallback(() => { startAnimations(); return stopAnimations; }, []));

  return (
    <Svg viewBox="0 0 400 300" width="100%" preserveAspectRatio="xMidYMid meet" style={style}>
      <G {...STROKE.ink}><Path d="M36 244H364" /></G>
      <G {...STROKE.ink2}><Path d="M292 244l3-8M300 244l2-6" /></G>

      <G {...STROKE.ink}><Path d="M193 178V240M207 178V240" strokeWidth={11} /></G>
      <G stroke={ILL_COLOR.dusk} strokeWidth={7.4} strokeLinecap="round" fill="none"><Path d="M193 178V240M207 178V240" /></G>
      <G {...STROKE.ink}><Path d="M186 243h12M202 243h12" strokeWidth={7} /></G>

      {/* Chest — breathe c2 */}
      <AnimatedG animatedProps={chestProps}>
        <Path fill={ILL_COLOR.sage} d="M180 126C180 118 220 118 220 126L216 180C216 185 184 185 184 180Z" transform="translate(-2.6,2.4)" stroke="none" />
        <G {...STROKE.ink}><Path d="M180 126C180 118 220 118 220 126L216 180C216 185 184 185 184 180Z" /></G>
        <Path d="M180 126C180 118 220 118 220 126L216 180C216 185 184 185 184 180Z" {...STROKE.press} transform="translate(1,1.1)" />
        <G {...STROKE.ink}><Path d="M200 112V124" strokeWidth={10} /></G>
        <G stroke={ILL_COLOR.skinDp} strokeWidth={6.4} strokeLinecap="round" fill="none"><Path d="M200 112V124" /></G>
        {/* Arm L — pivot at shoulder (183,132) */}
        <AnimatedG animatedProps={armLProps}>
          <G {...STROKE.ink}><Path d="M183 132L160 150" strokeWidth={8.5} /></G>
          <G stroke={ILL_COLOR.sage} strokeWidth={4.9} strokeLinecap="round" fill="none"><Path d="M183 132L160 150" /></G>
          <Ellipse fill={ILL_COLOR.skinDp} cx={160} cy={155} rx={4.8} ry={3.8} stroke="none" />
          <G {...STROKE.ink2}><Ellipse cx={157} cy={153} rx={4.8} ry={3.8} /></G>
        </AnimatedG>
        {/* Arm R — pivot at shoulder (217,132) */}
        <AnimatedG animatedProps={armRProps}>
          <G {...STROKE.ink}><Path d="M217 132L240 150" strokeWidth={8.5} /></G>
          <G stroke={ILL_COLOR.sage} strokeWidth={4.9} strokeLinecap="round" fill="none"><Path d="M217 132L240 150" /></G>
          <Ellipse fill={ILL_COLOR.skinDp} cx={246} cy={155} rx={4.8} ry={3.8} stroke="none" />
          <G {...STROKE.ink2}><Ellipse cx={243} cy={153} rx={4.8} ry={3.8} /></G>
        </AnimatedG>
      </AnimatedG>

      {/* Head — nod h2 */}
      <AnimatedG animatedProps={headProps}>
        <Circle fill={ILL_COLOR.skinDp} cx={203} cy={98} r={16} stroke="none" />
        <G {...STROKE.ink}><Circle cx={200} cy={96} r={16} /></G>
        <Circle cx={200} cy={96} r={16} {...STROKE.press} transform="translate(1,1.1)" />
        <Path fill={ILL_COLOR.ink} d="M184 92C184 78 216 78 216 92C210 86 190 86 184 92Z" transform="translate(3,2)" stroke="none" />
        <G {...STROKE.ink}><Path d="M184 92C184 78 216 78 216 92C210 86 190 86 184 92Z" /><Circle cx={214} cy={80} r={7} fill={ILL_COLOR.ink} /></G>
        <G {...STROKE.ink2}><Path d="M190 90q3-2 7 0M203 90q4-2 7 0M191 98q3 3 6 0M203 98q3 3 6 0M195 106q5 3 10 0" /></G>
      </AnimatedG>

      {/* Scrap — release clock */}
      <AnimatedG animatedProps={noteProps} transform="translate(200, 148)">
        <Path fill={ILL_COLOR.light} d="M-13-8L-10-11L8-11L13-6L12 8L-12 10L-14 2Z" transform="translate(3,2)" stroke="none" />
        <G {...STROKE.ink2}><Path d="M-13-8L-10-11L8-11L13-6L12 8L-12 10L-14 2Z" strokeWidth={2.6} /><Path d="M-7-3q3-3 6 0t6 0M-7 3h9" /></G>
      </AnimatedG>

      {/* Trail dots — appear 44–68% */}
      <AnimatedG animatedProps={dotProps}>
        <Circle cx={168} cy={62} r={2.6} fill={ILL_COLOR.ink} stroke="none" />
        <Circle cx={178} cy={54} r={2.2} fill={ILL_COLOR.light} stroke={ILL_COLOR.ink} strokeWidth={1.4} />
        <Circle cx={160} cy={46} r={2.4} fill={ILL_COLOR.ink} stroke="none" />
      </AnimatedG>
    </Svg>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function Release({ style }: { style?: ViewStyle }) {
  const reduceMotion = useReducedMotion();
  return reduceMotion
    ? <ReleaseStill style={style} />
    : <ReleaseAnimated style={style} />;
}
