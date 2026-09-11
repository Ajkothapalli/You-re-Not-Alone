/**
 * NotificationsEmpty — "Nothing new yet."
 * Notifications tab empty state.
 *
 * Scene: Character A cross-legged with a warm cup, two wisps of steam.
 * Four clocks: breathe c2 (chest 6.1s), nod h2 (head 7.6s),
 * steam (3.8s), steam s2 (3.8s, −1.4s offset).
 *
 * Ported 1:1 from docs/design/illustration.md §7.4.
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
import { Svg, G, Path, Rect, Circle, Ellipse } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';

import { useReducedMotion } from '@/lib/a11y';
import { ILL_COLOR, STROKE, EASING_WORKLET } from '@/theme/illustration';
import { ILLUSTRATION } from '@/theme/motion';
import { useIdleLayer } from '@/components/illustrations/behaviours';

const AnimatedG = Animated.createAnimatedComponent(G);

// Chest: alternate period 6.1s; origin approximately (200, 212) bottom of torso
const CX = 200, CY_CHEST = 212;
// Head: alternate period 7.6s; neck at (200, 142)
const CY_NECK = 142, CY_HEAD = 126;
// Sway: plant base at (312, 112) — connects to shelf
const CX_SWAY = 312, CY_SWAY = 112;
// Steam path origins at roughly (195, 176) and (204, 176)
const STEAM_RISE = 18; // SVG units

// ─── Designed still positions ─────────────────────────────────────────────────
const STEAM_STILL_TRANSFORM = `translate(0, -6)`;
const STEAM_STILL_OPACITY   = 0.7;

// ─── Still component ──────────────────────────────────────────────────────────

function NotificationsEmptyStill({ style }: { style?: ViewStyle }) {
  return (
    <Svg viewBox="0 0 400 300" width="100%" preserveAspectRatio="xMidYMid meet" style={style}>
      {/* Shelf */}
      <Rect fill={ILL_COLOR.sand} x="270" y="112" width="90" height="6" rx="2" transform="translate(-2.6,2.4)" stroke="none" />
      <G {...STROKE.ink}><Rect x="270" y="112" width="90" height="6" rx="2" /></G>

      {/* Plant on shelf */}
      <Path fill={ILL_COLOR.sage} d="M312 90C300 78 300 66 312 62C318 70 318 80 312 90Z" transform="translate(2.2,-2.6)" stroke="none" />
      <Path fill={ILL_COLOR.sage} d="M312 90C324 80 326 68 316 60C310 68 308 80 312 90Z" transform="translate(2.2,-2.6)" stroke="none" />
      <G {...STROKE.ink2}>
        <Path d="M312 90C300 78 300 66 312 62C318 70 318 80 312 90Z" />
        <Path d="M312 90C324 80 326 68 316 60C310 68 308 80 312 90Z" />
      </G>

      {/* Cup body */}
      <Rect fill={ILL_COLOR.coral} x="300" y="90" width="24" height="22" rx="3" transform="translate(3,2)" stroke="none" />
      <G {...STROKE.ink}><Rect x="300" y="90" width="24" height="22" rx="3" /></G>

      {/* Ground */}
      <G {...STROKE.ink}><Path d="M36 244H364" /></G>
      <G {...STROKE.ink2}><Path d="M110 244l3-8M118 244l1-6" /></G>

      {/* Legs (cross-legged) */}
      <G {...STROKE.ink}><Path d="M208 210L244 226L194 240" strokeWidth={11} /></G>
      <G stroke={ILL_COLOR.dusk} strokeWidth={7.4} strokeLinecap="round" fill="none"><Path d="M208 210L244 226L194 240" /></G>
      <G {...STROKE.ink}><Path d="M192 210L156 226L206 240" strokeWidth={11} /></G>
      <G stroke={ILL_COLOR.dusk} strokeWidth={7.4} strokeLinecap="round" fill="none"><Path d="M192 210L156 226L206 240" /></G>

      {/* Chest */}
      <Path fill={ILL_COLOR.coral} d="M180 156C180 148 220 148 220 156L216 212C216 217 184 217 184 212Z" transform="translate(3,2)" stroke="none" />
      <G {...STROKE.ink}><Path d="M180 156C180 148 220 148 220 156L216 212C216 217 184 217 184 212Z" /></G>
      <Path d="M180 156C180 148 220 148 220 156L216 212C216 217 184 217 184 212Z" {...STROKE.press} transform="translate(1,1.1)" />
      {/* Neck */}
      <G {...STROKE.ink}><Path d="M200 142V154" strokeWidth={10} /></G>
      <G stroke={ILL_COLOR.skinMd} strokeWidth={6.4} strokeLinecap="round" fill="none"><Path d="M200 142V154" /></G>
      {/* Arms */}
      <G {...STROKE.ink}><Path d="M183 164L191 190M217 164L209 190" strokeWidth={8.5} /></G>
      <G stroke={ILL_COLOR.coral} strokeWidth={4.9} strokeLinecap="round" fill="none"><Path d="M183 164L191 190M217 164L209 190" /></G>
      {/* Cup held */}
      <Rect fill={ILL_COLOR.sand} x="189" y="182" width="22" height="17" rx="3" transform="translate(2.2,-2.6)" stroke="none" />
      <G {...STROKE.ink}><Rect x="189" y="182" width="22" height="17" rx="3" /></G>
      <G {...STROKE.ink2}><Path d="M211 186c7 0 7 9 0 9" /></G>
      {/* Hands */}
      <Ellipse fill={ILL_COLOR.skinMd} cx={195} cy={194} rx={4.5} ry={3.6} stroke="none" />
      <Ellipse fill={ILL_COLOR.skinMd} cx={211} cy={194} rx={4.5} ry={3.6} stroke="none" />
      <G {...STROKE.ink2}><Ellipse cx={192} cy={192} rx={4.5} ry={3.6} /><Ellipse cx={208} cy={192} rx={4.5} ry={3.6} /></G>

      {/* Head */}
      <Circle fill={ILL_COLOR.skinMd} cx={203} cy={128} r={16} stroke="none" />
      <G {...STROKE.ink}><Circle cx={200} cy={126} r={16} /></G>
      <Circle cx={200} cy={126} r={16} {...STROKE.press} transform="translate(1,1.1)" />
      {/* Hair */}
      <Path fill={ILL_COLOR.ink} d="M184 122C182 110 190 104 196 108C200 102 210 104 212 110C218 108 220 118 216 124C212 116 204 114 200 116C196 112 188 114 184 122Z" transform="translate(-2.6,2.4)" stroke="none" />
      <G {...STROKE.ink}><Path d="M184 122C182 110 190 104 196 108C200 102 210 104 212 110C218 108 220 118 216 124C212 116 204 114 200 116C196 112 188 114 184 122Z" /></G>
      {/* Content expression — closed arcs for eyes */}
      <G {...STROKE.ink2}><Path d="M190 121q3-1 7 0M203 121q4-1 7 0M191 128q3 3 6 0M203 128q3 3 6 0M196 135q4 2 8 0" /></G>

      {/* Steam — still poses */}
      <G {...STROKE.ink2} opacity={STEAM_STILL_OPACITY} transform={STEAM_STILL_TRANSFORM}>
        <Path d="M195 176c-5-6 5-10 0-18c-4-5 3-8 0-14" />
      </G>
      <G {...STROKE.ink2} opacity={STEAM_STILL_OPACITY} transform={STEAM_STILL_TRANSFORM}>
        <Path d="M204 176c-5-6 5-10 0-18c-4-5 3-8 0-14" />
      </G>
    </Svg>
  );
}

// ─── Animated component ───────────────────────────────────────────────────────

function NotificationsEmptyAnimated({ style }: { style?: ViewStyle }) {
  // §2 always-on layer — alternate periods (this is the second figure)
  const idle = useIdleLayer({ alternate: true });

  // Scenery: plant sway + steam
  const swayR   = useSharedValue(0);
  const steam1Y = useSharedValue(0);
  const steam1O = useSharedValue(0);
  const steam2Y = useSharedValue(0);
  const steam2O = useSharedValue(0);

  const chestProps = useAnimatedProps(() => {
    'worklet';
    const sx = idle.breathX.value, sy = idle.breathY.value;
    return {
      transform: `translate(${CX},${CY_CHEST}) scale(${sx},${sy}) translate(-${CX},-${CY_CHEST})`,
    };
  });

  // NOTE — rotate() is deliberately not used below. See EmptyBench.tsx for
  // the full explanation: no rotate() string survives both Reanimated 4's
  // transform-string processor (requires a "deg" unit) and react-native-svg's
  // native SVG transform parser (rejects a "deg" unit) at once, so
  // rotation-based motion is approximated with translate/scale instead.
  const headProps = useAnimatedProps(() => {
    'worklet';
    const ty = idle.nodY.value;
    return {
      transform: `translate(0,${ty})`,
    };
  });

  const swayProps = useAnimatedProps(() => {
    'worklet';
    // Was a ±1.6° rotate around the plant base; substituted with an
    // equally subtle horizontal scale pulse to keep a "breeze" feel.
    return { transform: `translate(${CX_SWAY},${CY_SWAY}) scale(${1 + swayR.value / 80},1) translate(-${CX_SWAY},-${CY_SWAY})` };
  });

  const steam1Props = useAnimatedProps(() => {
    'worklet';
    return { opacity: steam1O.value, transform: `translate(0,${steam1Y.value})` };
  });

  const steam2Props = useAnimatedProps(() => {
    'worklet';
    return { opacity: steam2O.value, transform: `translate(0,${steam2Y.value})` };
  });

  function startSteam(yVal: Animated.SharedValue<number>, oVal: Animated.SharedValue<number>, delayMs: number) {
    const T = ILLUSTRATION.steam;
    yVal.value = withDelay(delayMs, withRepeat(
      withTiming(-STEAM_RISE, { duration: T, easing: Easing.out(Easing.quad) }),
      -1, false,
    ));
    oVal.value = withDelay(delayMs, withRepeat(
      withSequence(
        withTiming(0.85, { duration: Math.round(T * 0.35) }),
        withTiming(0.85, { duration: Math.round(T * 0.30) }),
        withTiming(0,    { duration: Math.round(T * 0.35) }),
      ),
      -1, false,
    ));
  }

  function startScenery() {
    const HALF = (ms: number) => Math.round(ms / 2);
    swayR.value = withRepeat(withTiming(1.6, { duration: HALF(ILLUSTRATION.sway), easing: EASING_WORKLET.breathe }), -1, true);
    startSteam(steam1Y, steam1O, 0);
    startSteam(steam2Y, steam2O, 1400);
  }

  function stopScenery() {
    [swayR, steam1Y, steam1O, steam2Y, steam2O].forEach(sv => cancelAnimation(sv));
    swayR.value = 0;
    steam1Y.value = 0; steam1O.value = 0;
    steam2Y.value = 0; steam2O.value = 0;
  }

  useFocusEffect(useCallback(() => {
    idle.start();
    startScenery();
    return () => {
      idle.stop();
      stopScenery();
    };
  }, []));

  return (
    <Svg viewBox="0 0 400 300" width="100%" preserveAspectRatio="xMidYMid meet" style={style}>
      {/* Shelf */}
      <Rect fill={ILL_COLOR.sand} x="270" y="112" width="90" height="6" rx="2" transform="translate(-2.6,2.4)" stroke="none" />
      <G {...STROKE.ink}><Rect x="270" y="112" width="90" height="6" rx="2" /></G>

      {/* Plant — sway clock */}
      <AnimatedG animatedProps={swayProps}>
        <Path fill={ILL_COLOR.sage} d="M312 90C300 78 300 66 312 62C318 70 318 80 312 90Z" transform="translate(2.2,-2.6)" stroke="none" />
        <Path fill={ILL_COLOR.sage} d="M312 90C324 80 326 68 316 60C310 68 308 80 312 90Z" transform="translate(2.2,-2.6)" stroke="none" />
        <G {...STROKE.ink2}>
          <Path d="M312 90C300 78 300 66 312 62C318 70 318 80 312 90Z" />
          <Path d="M312 90C324 80 326 68 316 60C310 68 308 80 312 90Z" />
        </G>
      </AnimatedG>

      {/* Cup body */}
      <Rect fill={ILL_COLOR.coral} x="300" y="90" width="24" height="22" rx="3" transform="translate(3,2)" stroke="none" />
      <G {...STROKE.ink}><Rect x="300" y="90" width="24" height="22" rx="3" /></G>

      {/* Ground */}
      <G {...STROKE.ink}><Path d="M36 244H364" /></G>
      <G {...STROKE.ink2}><Path d="M110 244l3-8M118 244l1-6" /></G>

      {/* Legs (cross-legged) */}
      <G {...STROKE.ink}><Path d="M208 210L244 226L194 240" strokeWidth={11} /></G>
      <G stroke={ILL_COLOR.dusk} strokeWidth={7.4} strokeLinecap="round" fill="none"><Path d="M208 210L244 226L194 240" /></G>
      <G {...STROKE.ink}><Path d="M192 210L156 226L206 240" strokeWidth={11} /></G>
      <G stroke={ILL_COLOR.dusk} strokeWidth={7.4} strokeLinecap="round" fill="none"><Path d="M192 210L156 226L206 240" /></G>

      {/* Chest — breathe c2 clock */}
      <AnimatedG animatedProps={chestProps}>
        <Path fill={ILL_COLOR.coral} d="M180 156C180 148 220 148 220 156L216 212C216 217 184 217 184 212Z" transform="translate(3,2)" stroke="none" />
        <G {...STROKE.ink}><Path d="M180 156C180 148 220 148 220 156L216 212C216 217 184 217 184 212Z" /></G>
        <Path d="M180 156C180 148 220 148 220 156L216 212C216 217 184 217 184 212Z" {...STROKE.press} transform="translate(1,1.1)" />
        <G {...STROKE.ink}><Path d="M200 142V154" strokeWidth={10} /></G>
        <G stroke={ILL_COLOR.skinMd} strokeWidth={6.4} strokeLinecap="round" fill="none"><Path d="M200 142V154" /></G>
        <G {...STROKE.ink}><Path d="M183 164L191 190M217 164L209 190" strokeWidth={8.5} /></G>
        <G stroke={ILL_COLOR.coral} strokeWidth={4.9} strokeLinecap="round" fill="none"><Path d="M183 164L191 190M217 164L209 190" /></G>
        <Rect fill={ILL_COLOR.sand} x="189" y="182" width="22" height="17" rx="3" transform="translate(2.2,-2.6)" stroke="none" />
        <G {...STROKE.ink}><Rect x="189" y="182" width="22" height="17" rx="3" /></G>
        <G {...STROKE.ink2}><Path d="M211 186c7 0 7 9 0 9" /></G>
        <Ellipse fill={ILL_COLOR.skinMd} cx={195} cy={194} rx={4.5} ry={3.6} stroke="none" />
        <Ellipse fill={ILL_COLOR.skinMd} cx={211} cy={194} rx={4.5} ry={3.6} stroke="none" />
        <G {...STROKE.ink2}><Ellipse cx={192} cy={192} rx={4.5} ry={3.6} /><Ellipse cx={208} cy={192} rx={4.5} ry={3.6} /></G>
      </AnimatedG>

      {/* Head — nod h2 clock */}
      <AnimatedG animatedProps={headProps}>
        <Circle fill={ILL_COLOR.skinMd} cx={203} cy={128} r={16} stroke="none" />
        <G {...STROKE.ink}><Circle cx={200} cy={126} r={16} /></G>
        <Circle cx={200} cy={126} r={16} {...STROKE.press} transform="translate(1,1.1)" />
        <Path fill={ILL_COLOR.ink} d="M184 122C182 110 190 104 196 108C200 102 210 104 212 110C218 108 220 118 216 124C212 116 204 114 200 116C196 112 188 114 184 122Z" transform="translate(-2.6,2.4)" stroke="none" />
        <G {...STROKE.ink}><Path d="M184 122C182 110 190 104 196 108C200 102 210 104 212 110C218 108 220 118 216 124C212 116 204 114 200 116C196 112 188 114 184 122Z" /></G>
        <G {...STROKE.ink2}><Path d="M190 121q3-1 7 0M203 121q4-1 7 0M191 128q3 3 6 0M203 128q3 3 6 0M196 135q4 2 8 0" /></G>
      </AnimatedG>

      {/* Steam 1 — primary clock */}
      <AnimatedG animatedProps={steam1Props}>
        <G {...STROKE.ink2}><Path d="M195 176c-5-6 5-10 0-18c-4-5 3-8 0-14" /></G>
      </AnimatedG>

      {/* Steam 2 — secondary clock, 1.4s offset */}
      <AnimatedG animatedProps={steam2Props}>
        <G {...STROKE.ink2}><Path d="M204 176c-5-6 5-10 0-18c-4-5 3-8 0-14" /></G>
      </AnimatedG>
    </Svg>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function NotificationsEmpty({ style }: { style?: ViewStyle }) {
  const reduceMotion = useReducedMotion();
  return reduceMotion
    ? <NotificationsEmptyStill style={style} />
    : <NotificationsEmptyAnimated style={style} />;
}
