/**
 * Resonance — "someone felt this too."
 * Onboarding: the scrap arriving between B and C.
 *
 * Clocks: heartbeat/beat (4.8s scrap scale + both heads lift),
 * breathe (B 5.2s, C 6.1s), blink (B 6.1s, C alternate 6.1s staggered),
 * B's head nod (7.0s), C's head nod (7.6s).
 *
 * Ported 1:1 from docs/design/illustration.md §7.3.
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
  withDelay,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { Svg, G, Path, Circle, Ellipse } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';

import { useReducedMotion } from '@/lib/a11y';
import { ILL_COLOR, STROKE } from '@/theme/illustration';
import { ILLUSTRATION, EASING, HEARTBEAT } from '@/theme/motion';

const AnimatedG = Animated.createAnimatedComponent(G);

// B's chest origin: approx (180, 226) — bottom of torso
const CX_B = 180, CY_B_CHEST = 226;
// B's neck: (180, 160)
const CY_B_NECK = 160;
// C's geometry is mirrored — transform="translate(400 0) scale(-1 1)" handles this
// C's chest origin (before mirror): same as B = (180, 226)
const CX_C = 180, CY_C_CHEST = 226;
// C's neck: (180, 160)
const CY_C_NECK = 160;
// Central scrap: translate(200, 104)
const SCRAP_X = 200, SCRAP_Y = 104;

// ─── Still component ──────────────────────────────────────────────────────────

function ResonanceStill({ style }: { style?: ViewStyle }) {
  return (
    <Svg viewBox="0 0 400 300" width="100%" preserveAspectRatio="xMidYMid meet" style={style}>
      <G {...STROKE.ink}><Path d="M36 244H364" /></G>
      <G {...STROKE.ink2}><Path d="M80 244l3-8M336 244l-3-8" /></G>

      {/* Central scrap — at rest (no beat animation) */}
      <G transform={`translate(${SCRAP_X}, ${SCRAP_Y})`}>
        <Path fill={ILL_COLOR.light} d="M-13-8L-10-11L8-11L13-6L12 8L-12 10L-14 2Z" transform="translate(3,2)" stroke="none" />
        <G {...STROKE.ink2}><Path d="M-13-8L-10-11L8-11L13-6L12 8L-12 10L-14 2Z" strokeWidth={2.6} /><Path d="M-7-3q3-3 6 0t6 0M-7 3h9" /></G>
      </G>

      {/* ── Figure B (left) ── */}
      <G {...STROKE.ink}><Path d="M176 226L146 214L150 240" strokeWidth={11} /></G>
      <G stroke={ILL_COLOR.dusk} strokeWidth={7.4} strokeLinecap="round" fill="none"><Path d="M176 226L146 214L150 240" /></G>
      <G {...STROKE.ink}><Path d="M142 243h12" strokeWidth={7} /></G>
      {/* B's chest */}
      <Path fill={ILL_COLOR.sage} d="M166 174C168 162 190 162 192 174L196 226C196 231 168 231 168 226Z" transform="translate(-2.6,2.4)" stroke="none" />
      <G {...STROKE.ink}><Path d="M166 174C168 162 190 162 192 174L196 226C196 231 168 231 168 226Z" /></G>
      <Path d="M166 174C168 162 190 162 192 174L196 226C196 231 168 231 168 226Z" {...STROKE.press} transform="translate(1,1.1)" />
      <G {...STROKE.ink}><Path d="M180 160V172" strokeWidth={10} /></G>
      <G stroke={ILL_COLOR.skinDp} strokeWidth={6.4} strokeLinecap="round" fill="none"><Path d="M180 160V172" /></G>
      <G {...STROKE.ink}><Path d="M182 180L152 212" strokeWidth={8.5} /></G>
      <G stroke={ILL_COLOR.sage} strokeWidth={4.9} strokeLinecap="round" fill="none"><Path d="M182 180L152 212" /></G>
      <Ellipse fill={ILL_COLOR.skinDp} cx={153} cy={216} rx={4.5} ry={3.6} stroke="none" />
      <G {...STROKE.ink2}><Ellipse cx={150} cy={214} rx={4.5} ry={3.6} /></G>
      {/* B's head */}
      <Circle fill={ILL_COLOR.skinDp} cx={183} cy={148} r={15} stroke="none" />
      <G {...STROKE.ink}><Circle cx={180} cy={146} r={15} /></G>
      <Circle cx={180} cy={146} r={15} {...STROKE.press} transform="translate(1,1.1)" />
      <Path fill={ILL_COLOR.ink} d="M166 136C166 126 195 126 195 146C189 136 176 132 166 136Z" transform="translate(3,2)" stroke="none" />
      <G {...STROKE.ink}><Path d="M166 136C166 126 195 126 195 146C189 136 176 132 166 136Z" /><Circle cx={194} cy={134} r={6} fill={ILL_COLOR.ink} /></G>
      <G {...STROKE.ink2}><Path d="M166 141l7-1M165 147c-3 1-3 5 0 6M167 154q2 2 4 0" /></G>
      <Circle fill={ILL_COLOR.ink} cx={170} cy={145} r={1.8} stroke="none" />

      {/* ── Figure C (right, mirrored) ── */}
      <G transform="translate(400 0) scale(-1 1)">
        <G {...STROKE.ink}><Path d="M176 226L146 214L150 240" strokeWidth={11} /></G>
        <G stroke={ILL_COLOR.sand} strokeWidth={7.4} strokeLinecap="round" fill="none"><Path d="M176 226L146 214L150 240" /></G>
        <G {...STROKE.ink}><Path d="M142 243h12" strokeWidth={7} /></G>
        {/* C's chest */}
        <Path fill={ILL_COLOR.dusk} d="M166 174C168 162 190 162 192 174L196 226C196 231 168 231 168 226Z" transform="translate(-2.6,2.4)" stroke="none" />
        <G {...STROKE.ink}><Path d="M166 174C168 162 190 162 192 174L196 226C196 231 168 231 168 226Z" /></G>
        <Path d="M166 174C168 162 190 162 192 174L196 226C196 231 168 231 168 226Z" {...STROKE.press} transform="translate(1,1.1)" />
        <G {...STROKE.ink}><Path d="M180 160V172" strokeWidth={10} /></G>
        <G stroke={ILL_COLOR.skin} strokeWidth={6.4} strokeLinecap="round" fill="none"><Path d="M180 160V172" /></G>
        <G {...STROKE.ink}><Path d="M182 180L152 212" strokeWidth={8.5} /></G>
        <G stroke={ILL_COLOR.dusk} strokeWidth={4.9} strokeLinecap="round" fill="none"><Path d="M182 180L152 212" /></G>
        <Ellipse fill={ILL_COLOR.skin} cx={153} cy={216} rx={4.5} ry={3.6} stroke="none" />
        <G {...STROKE.ink2}><Ellipse cx={150} cy={214} rx={4.5} ry={3.6} /></G>
        {/* C's head */}
        <Circle fill={ILL_COLOR.skin} cx={183} cy={148} r={15} stroke="none" />
        <G {...STROKE.ink}><Circle cx={180} cy={146} r={15} /></G>
        <Circle cx={180} cy={146} r={15} {...STROKE.press} transform="translate(1,1.1)" />
        <Path fill={ILL_COLOR.grey} d="M166 136C167 122 194 122 195 146C188 134 178 134 166 136Z" transform="translate(3,2)" stroke="none" />
        <G {...STROKE.ink}><Path d="M166 136C167 122 194 122 195 146C188 134 178 134 166 136Z" /></G>
        <G {...STROKE.ink2}><Path d="M180 124l4 10M166 140l7-1M174 145h9M165 147c-3 1-3 5 0 6M167 154q2 2 4 0" /><Circle cx={170} cy={145} r={4.2} /></G>
        <Circle fill={ILL_COLOR.ink} cx={170} cy={145} r={1.5} stroke="none" />
      </G>
    </Svg>
  );
}

// ─── Animated ─────────────────────────────────────────────────────────────────

function ResonanceAnimated({ style }: { style?: ViewStyle }) {
  // B's clocks
  const breathBX  = useSharedValue(1);
  const breathBY  = useSharedValue(1);
  const blinkB    = useSharedValue(1);
  // C's clocks
  const breathCX  = useSharedValue(1);
  const breathCY  = useSharedValue(1);
  const blinkC    = useSharedValue(1);
  // Heartbeat (scrap + both heads lift)
  const beatScale = useSharedValue(1);
  const liftBY    = useSharedValue(0); // B's head lift
  const liftBR    = useSharedValue(0);
  const liftCY    = useSharedValue(0); // C's head lift (−0.3s offset in SVG)
  const liftCR    = useSharedValue(0);

  const chestBProps = useAnimatedProps(() => {
    'worklet';
    return {
      transform: `translate(${CX_B},${CY_B_CHEST}) scale(${breathBX.value},${breathBY.value}) translate(-${CX_B},-${CY_B_CHEST})`,
    };
  });

  const chestCProps = useAnimatedProps(() => {
    'worklet';
    return {
      transform: `translate(${CX_C},${CY_C_CHEST}) scale(${breathCX.value},${breathCY.value}) translate(-${CX_C},-${CY_C_CHEST})`,
    };
  });

  const beatProps = useAnimatedProps(() => {
    'worklet';
    const s = beatScale.value;
    return {
      transform: `translate(${SCRAP_X},${SCRAP_Y}) scale(${s}) translate(-${SCRAP_X},-${SCRAP_Y})`,
    };
  });

  const blinkBProps = useAnimatedProps(() => {
    'worklet';
    return { transform: `translate(180,145) scaleY(${blinkB.value}) translate(-180,-145)` };
  });

  const blinkCProps = useAnimatedProps(() => {
    'worklet';
    return { transform: `translate(170,145) scaleY(${blinkC.value}) translate(-170,-145)` };
  });

  // B's head lifts at the heartbeat
  const liftBProps = useAnimatedProps(() => {
    'worklet';
    return {
      transform: `translate(${CX_B},${CY_B_NECK}) rotate(${liftBR.value}) translate(-${CX_B},-${CY_B_NECK}) translate(0,${liftBY.value})`,
    };
  });

  // C's head lifts at the heartbeat (−0.3s offset)
  const liftCProps = useAnimatedProps(() => {
    'worklet';
    return {
      transform: `translate(${CX_C},${CY_C_NECK}) rotate(${liftCR.value}) translate(-${CX_C},-${CY_C_NECK}) translate(0,${liftCY.value})`,
    };
  });

  function heartbeatLift(yVal: Animated.SharedValue<number>, rVal: Animated.SharedValue<number>, delayMs: number) {
    const HB = ILLUSTRATION.heartbeat; // 4800ms
    // lift at 70% (3360ms), settle by 86% (4128ms)
    const preHold   = Math.round(HB * 0.70);
    const lift      = Math.round(HB * 0.08);
    const settle    = Math.round(HB * 0.16);
    const postHold  = HB - preHold - lift - settle;
    yVal.value = withDelay(delayMs, withRepeat(
      withSequence(
        withTiming(0,    { duration: preHold }),
        withTiming(-1.5, { duration: lift, easing: EASING.enter }),
        withTiming(0,    { duration: settle, easing: EASING.breathe }),
        withTiming(0,    { duration: postHold }),
      ),
      -1, false,
    ));
    rVal.value = withDelay(delayMs, withRepeat(
      withSequence(
        withTiming(0,  { duration: preHold }),
        withTiming(-5, { duration: lift, easing: EASING.enter }),
        withTiming(0,  { duration: settle, easing: EASING.breathe }),
        withTiming(0,  { duration: postHold }),
      ),
      -1, false,
    ));
  }

  function startAnimations() {
    const HALF = (ms: number) => Math.round(ms / 2);

    // B's breath — primary period 5.2s
    breathBX.value = withRepeat(withTiming(1.008, { duration: HALF(ILLUSTRATION.breathe[0]), easing: EASING.breathe }), -1, true);
    breathBY.value = withRepeat(withTiming(1.02,  { duration: HALF(ILLUSTRATION.breathe[0]), easing: EASING.breathe }), -1, true);

    // C's breath — alternate period 6.1s
    breathCX.value = withRepeat(withTiming(1.008, { duration: HALF(ILLUSTRATION.breathe[1]), easing: EASING.breathe }), -1, true);
    breathCY.value = withRepeat(withTiming(1.02,  { duration: HALF(ILLUSTRATION.breathe[1]), easing: EASING.breathe }), -1, true);

    // Heartbeat — scrap lub-dub scale sequence
    const HB = ILLUSTRATION.heartbeat;
    beatScale.value = withRepeat(
      withSequence(
        withTiming(1.14, { duration: 100, easing: EASING.enter }),
        withTiming(0.88, { duration: 80,  easing: EASING.exit }),
        withTiming(1.05, { duration: 90,  easing: EASING.enter }),
        withTiming(1,    { duration: 150, easing: EASING.breathe }),
        withTiming(1,    { duration: HB - 420 }), // hold at rest for remainder
      ),
      -1, false,
    );

    // Both heads lift at heartbeat (C is 300ms behind = −0.3s in the SVG)
    heartbeatLift(liftBY, liftBR, 0);
    heartbeatLift(liftCY, liftCR, 300);

    // Blink B — 6.1s, in last 9%
    const openDur   = Math.round(ILLUSTRATION.blink * 0.91);
    const halfBlink = Math.round(ILLUSTRATION.blink * 0.045);
    const blinkSeq  = withSequence(
      withTiming(1,    { duration: openDur }),
      withTiming(0.08, { duration: halfBlink, easing: EASING.enter }),
      withTiming(1,    { duration: halfBlink, easing: EASING.enter }),
    );
    blinkB.value = withRepeat(blinkSeq, -1, false);
    // C's blink — same period but 2.5s offset (different phase)
    blinkC.value = withDelay(2500, withRepeat(blinkSeq, -1, false));
  }

  function stopAnimations() {
    [breathBX, breathBY, breathCX, breathCY, beatScale,
     liftBY, liftBR, liftCY, liftCR, blinkB, blinkC].forEach(sv => cancelAnimation(sv));
    breathBX.value = 1; breathBY.value = 1;
    breathCX.value = 1; breathCY.value = 1;
    beatScale.value = 1;
    liftBY.value = 0; liftBR.value = 0;
    liftCY.value = 0; liftCR.value = 0;
    blinkB.value = 1; blinkC.value = 1;
  }

  useFocusEffect(useCallback(() => { startAnimations(); return stopAnimations; }, []));

  return (
    <Svg viewBox="0 0 400 300" width="100%" preserveAspectRatio="xMidYMid meet" style={style}>
      <G {...STROKE.ink}><Path d="M36 244H364" /></G>
      <G {...STROKE.ink2}><Path d="M80 244l3-8M336 244l-3-8" /></G>

      {/* Central scrap — heartbeat clock */}
      <AnimatedG animatedProps={beatProps}>
        <G transform={`translate(${SCRAP_X}, ${SCRAP_Y})`}>
          <Path fill={ILL_COLOR.light} d="M-13-8L-10-11L8-11L13-6L12 8L-12 10L-14 2Z" transform="translate(3,2)" stroke="none" />
          <G {...STROKE.ink2}><Path d="M-13-8L-10-11L8-11L13-6L12 8L-12 10L-14 2Z" strokeWidth={2.6} /><Path d="M-7-3q3-3 6 0t6 0M-7 3h9" /></G>
        </G>
      </AnimatedG>

      {/* ── Figure B (left) ── */}
      <G {...STROKE.ink}><Path d="M176 226L146 214L150 240" strokeWidth={11} /></G>
      <G stroke={ILL_COLOR.dusk} strokeWidth={7.4} strokeLinecap="round" fill="none"><Path d="M176 226L146 214L150 240" /></G>
      <G {...STROKE.ink}><Path d="M142 243h12" strokeWidth={7} /></G>
      {/* B's chest — breathe */}
      <AnimatedG animatedProps={chestBProps}>
        <Path fill={ILL_COLOR.sage} d="M166 174C168 162 190 162 192 174L196 226C196 231 168 231 168 226Z" transform="translate(-2.6,2.4)" stroke="none" />
        <G {...STROKE.ink}><Path d="M166 174C168 162 190 162 192 174L196 226C196 231 168 231 168 226Z" /></G>
        <Path d="M166 174C168 162 190 162 192 174L196 226C196 231 168 231 168 226Z" {...STROKE.press} transform="translate(1,1.1)" />
        <G {...STROKE.ink}><Path d="M180 160V172" strokeWidth={10} /></G>
        <G stroke={ILL_COLOR.skinDp} strokeWidth={6.4} strokeLinecap="round" fill="none"><Path d="M180 160V172" /></G>
        <G {...STROKE.ink}><Path d="M182 180L152 212" strokeWidth={8.5} /></G>
        <G stroke={ILL_COLOR.sage} strokeWidth={4.9} strokeLinecap="round" fill="none"><Path d="M182 180L152 212" /></G>
        <Ellipse fill={ILL_COLOR.skinDp} cx={153} cy={216} rx={4.5} ry={3.6} stroke="none" />
        <G {...STROKE.ink2}><Ellipse cx={150} cy={214} rx={4.5} ry={3.6} /></G>
      </AnimatedG>
      {/* B's head — heartbeat lift */}
      <AnimatedG animatedProps={liftBProps}>
        <Circle fill={ILL_COLOR.skinDp} cx={183} cy={148} r={15} stroke="none" />
        <G {...STROKE.ink}><Circle cx={180} cy={146} r={15} /></G>
        <Circle cx={180} cy={146} r={15} {...STROKE.press} transform="translate(1,1.1)" />
        <Path fill={ILL_COLOR.ink} d="M166 136C166 126 195 126 195 146C189 136 176 132 166 136Z" transform="translate(3,2)" stroke="none" />
        <G {...STROKE.ink}><Path d="M166 136C166 126 195 126 195 146C189 136 176 132 166 136Z" /><Circle cx={194} cy={134} r={6} fill={ILL_COLOR.ink} /></G>
        <G {...STROKE.ink2}><Path d="M166 141l7-1M165 147c-3 1-3 5 0 6M167 154q2 2 4 0" /></G>
        <AnimatedG animatedProps={blinkBProps}>
          <Circle fill={ILL_COLOR.ink} cx={170} cy={145} r={1.8} stroke="none" />
        </AnimatedG>
      </AnimatedG>

      {/* ── Figure C (right, mirrored) ── */}
      <G transform="translate(400 0) scale(-1 1)">
        <G {...STROKE.ink}><Path d="M176 226L146 214L150 240" strokeWidth={11} /></G>
        <G stroke={ILL_COLOR.sand} strokeWidth={7.4} strokeLinecap="round" fill="none"><Path d="M176 226L146 214L150 240" /></G>
        <G {...STROKE.ink}><Path d="M142 243h12" strokeWidth={7} /></G>
        {/* C's chest — breathe c2 */}
        <AnimatedG animatedProps={chestCProps}>
          <Path fill={ILL_COLOR.dusk} d="M166 174C168 162 190 162 192 174L196 226C196 231 168 231 168 226Z" transform="translate(-2.6,2.4)" stroke="none" />
          <G {...STROKE.ink}><Path d="M166 174C168 162 190 162 192 174L196 226C196 231 168 231 168 226Z" /></G>
          <Path d="M166 174C168 162 190 162 192 174L196 226C196 231 168 231 168 226Z" {...STROKE.press} transform="translate(1,1.1)" />
          <G {...STROKE.ink}><Path d="M180 160V172" strokeWidth={10} /></G>
          <G stroke={ILL_COLOR.skin} strokeWidth={6.4} strokeLinecap="round" fill="none"><Path d="M180 160V172" /></G>
          <G {...STROKE.ink}><Path d="M182 180L152 212" strokeWidth={8.5} /></G>
          <G stroke={ILL_COLOR.dusk} strokeWidth={4.9} strokeLinecap="round" fill="none"><Path d="M182 180L152 212" /></G>
          <Ellipse fill={ILL_COLOR.skin} cx={153} cy={216} rx={4.5} ry={3.6} stroke="none" />
          <G {...STROKE.ink2}><Ellipse cx={150} cy={214} rx={4.5} ry={3.6} /></G>
        </AnimatedG>
        {/* C's head — heartbeat lift (−0.3s offset) */}
        <AnimatedG animatedProps={liftCProps}>
          <Circle fill={ILL_COLOR.skin} cx={183} cy={148} r={15} stroke="none" />
          <G {...STROKE.ink}><Circle cx={180} cy={146} r={15} /></G>
          <Circle cx={180} cy={146} r={15} {...STROKE.press} transform="translate(1,1.1)" />
          <Path fill={ILL_COLOR.grey} d="M166 136C167 122 194 122 195 146C188 134 178 134 166 136Z" transform="translate(3,2)" stroke="none" />
          <G {...STROKE.ink}><Path d="M166 136C167 122 194 122 195 146C188 134 178 134 166 136Z" /></G>
          <G {...STROKE.ink2}><Path d="M180 124l4 10M166 140l7-1M174 145h9M165 147c-3 1-3 5 0 6M167 154q2 2 4 0" /><Circle cx={170} cy={145} r={4.2} /></G>
          <AnimatedG animatedProps={blinkCProps}>
            <Circle fill={ILL_COLOR.ink} cx={170} cy={145} r={1.5} stroke="none" />
          </AnimatedG>
        </AnimatedG>
      </G>
    </Svg>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function Resonance({ style }: { style?: ViewStyle }) {
  const reduceMotion = useReducedMotion();
  return reduceMotion
    ? <ResonanceStill style={style} />
    : <ResonanceAnimated style={style} />;
}
