/**
 * Unburdened — "you let it out."
 * The delight beat after a confession is posted (components/Celebration.tsx).
 *
 * Scene: Character A standing, throwing both arms up in relief, while the
 * confession scrap (the yap — the one `light` yellow object, per
 * docs/design/illustration.md) lifts away above them and dissolves into a
 * few sparks. Replaces the old profile-avatar-in-a-clay-disc emblem, which
 * showed the reader their own face rather than the thing they just did.
 *
 * This is a ONE-SHOT beat, not a looping idle: Celebration holds for a couple
 * of seconds and auto-advances, so the choreography plays once on mount and
 * then settles into a gentle float.
 *
 * Choreography:
 *   0.12s  lift     — arms swing up and the body rises (the exhale)
 *   0.26s  release  — the scrap floats up, fading as it goes
 *   0.70s  sparks   — three dots pop where it dissolved
 *   1.0s+  float    — slow body bob, alive until the overlay fades
 *
 * Construction follows docs/design/illustration.md: 400x300 viewBox, standing
 * proportions ported from Release.tsx/Threshold.tsx (chest 126-180, head
 * centre (200,96)), ILL_COLOR only, reduceMotion-safe still fallback.
 *
 * NOTE — no rotate(). Per EmptyBench.tsx: no rotate() string survives both
 * Reanimated 4's transform processor and react-native-svg's parser at once, so
 * the arms are animated as PATH GEOMETRY (elbow/wrist positions interpolated
 * in a worklet), the same technique Lantern.tsx uses for its wave.
 */

import React, { useEffect } from 'react';
import { ViewStyle } from 'react-native';
import Animated, {
  useAnimatedProps,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { Svg, G, Path, Circle, Ellipse } from 'react-native-svg';

import { useReducedMotion } from '@/lib/a11y';
import { ILL_COLOR, STROKE } from '@/theme/illustration';

const AnimatedG       = Animated.createAnimatedComponent(G);
const AnimatedPath    = Animated.createAnimatedComponent(Path);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

// ─── Geometry ─────────────────────────────────────────────────────────────────
const CHEST_D = 'M180 126C180 118 220 118 220 126L216 180C216 185 184 185 184 180Z';
// A's hair, shifted to the standing head centre (200,96) — same dy=-16 shift
// Threshold.tsx documents.
const HAIR_D  = 'M184 92C182 80 190 74 196 78C200 72 210 74 212 80C218 78 220 88 216 94C212 86 204 84 200 86C196 82 188 84 184 92Z';
// The scrap, authored around its own origin so the worklet can place it.
const SCRAP_D = 'M-13-8L-10-11L8-11L13-6L12 8L-12 10L-14 2Z';

// Shoulders are fixed; elbow/wrist interpolate between "at rest" and "thrown up".
const SH_L = { x: 183, y: 132 }, SH_R = { x: 217, y: 132 };
const REST_L = { ex: 178, ey: 152, wx: 176, wy: 172 };
const RAISED_L = { ex: 168, ey: 112, wx: 162, wy: 86 };
const REST_R = { ex: 222, ey: 152, wx: 224, wy: 172 };
const RAISED_R = { ex: 232, ey: 112, wx: 238, wy: 86 };

const SCRAP_X = 200, SCRAP_Y = 150;

const lerp = (a: number, b: number, t: number) => {
  'worklet';
  return a + (b - a) * t;
};

// ─── Still (reduced motion) ───────────────────────────────────────────────────
// §6: the designed still pose is the END of the beat — arms already up, scrap
// mid-flight above, sparks present. The moment, held.

function UnburdenedStill({ style }: { style?: ViewStyle }) {
  return (
    <Svg viewBox="0 0 400 300" width="100%" preserveAspectRatio="xMidYMid meet" style={style}>
      <G {...STROKE.ink}><Path d="M36 244H364" /></G>
      <G {...STROKE.ink2}><Path d="M110 244l3-8M118 244l1-6M292 244l3-8M300 244l1-6" /></G>

      {/* Legs */}
      <G {...STROKE.ink}><Path d="M193 178V240M207 178V240" strokeWidth={11} /></G>
      <G stroke={ILL_COLOR.dusk} strokeWidth={7.4} strokeLinecap="round" strokeLinejoin="round" fill="none"><Path d="M193 178V240M207 178V240" /></G>
      <G {...STROKE.ink}><Path d="M186 243h12M202 243h12" strokeWidth={7} /></G>

      {/* Torso */}
      <Path fill={ILL_COLOR.coral} d={CHEST_D} transform="translate(3,2)" stroke="none" />
      <G {...STROKE.ink}><Path d={CHEST_D} /></G>
      <Path d={CHEST_D} {...STROKE.press} transform="translate(1,1.1)" />
      <G {...STROKE.ink}><Path d="M200 112V124" strokeWidth={10} /></G>
      <G stroke={ILL_COLOR.skinMd} strokeWidth={6.4} strokeLinecap="round" fill="none"><Path d="M200 112V124" /></G>

      {/* Arms — up */}
      <G {...STROKE.ink} strokeWidth={8.5}>
        <Path d={`M${SH_L.x} ${SH_L.y}L${RAISED_L.ex} ${RAISED_L.ey}L${RAISED_L.wx} ${RAISED_L.wy}`} />
        <Path d={`M${SH_R.x} ${SH_R.y}L${RAISED_R.ex} ${RAISED_R.ey}L${RAISED_R.wx} ${RAISED_R.wy}`} />
      </G>
      <G stroke={ILL_COLOR.coral} strokeWidth={4.9} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <Path d={`M${SH_L.x} ${SH_L.y}L${RAISED_L.ex} ${RAISED_L.ey}L${RAISED_L.wx} ${RAISED_L.wy}`} />
        <Path d={`M${SH_R.x} ${SH_R.y}L${RAISED_R.ex} ${RAISED_R.ey}L${RAISED_R.wx} ${RAISED_R.wy}`} />
      </G>
      <Ellipse fill={ILL_COLOR.skinMd} cx={RAISED_L.wx + 3} cy={RAISED_L.wy + 2} rx={4.8} ry={3.8} stroke="none" />
      <Ellipse fill={ILL_COLOR.skinMd} cx={RAISED_R.wx + 3} cy={RAISED_R.wy + 2} rx={4.8} ry={3.8} stroke="none" />
      <G {...STROKE.ink2}>
        <Ellipse cx={RAISED_L.wx} cy={RAISED_L.wy} rx={4.8} ry={3.8} />
        <Ellipse cx={RAISED_R.wx} cy={RAISED_R.wy} rx={4.8} ry={3.8} />
      </G>

      {/* Head — looking up, delighted */}
      <Circle fill={ILL_COLOR.skinMd} cx={203} cy={98} r={16} stroke="none" />
      <G {...STROKE.ink}><Circle cx={200} cy={96} r={16} /></G>
      <Circle cx={200} cy={96} r={16} {...STROKE.press} transform="translate(1,1.1)" />
      <Path fill={ILL_COLOR.ink} d={HAIR_D} transform="translate(-2.6,2.4)" stroke="none" />
      <G {...STROKE.ink}><Path d={HAIR_D} /></G>
      <Circle fill={ILL_COLOR.ink} cx={194} cy={96} r={1.8} stroke="none" />
      <Circle fill={ILL_COLOR.ink} cx={206} cy={96} r={1.8} stroke="none" />
      <G {...STROKE.ink2}><Path d="M193 104q7 6 14 0" /></G>

      {/* Scrap mid-flight + sparks */}
      <G transform="translate(232, 70)" opacity={0.9}>
        <Path fill={ILL_COLOR.light} d={SCRAP_D} transform="translate(3,2)" stroke="none" />
        <G {...STROKE.ink2}><Path d={SCRAP_D} strokeWidth={2.6} /></G>
      </G>
      <Circle cx={168} cy={62} r={2.6} fill={ILL_COLOR.ink} stroke="none" />
      <Circle cx={232} cy={56} r={2.2} fill={ILL_COLOR.ink} stroke="none" />
      <Circle cx={204} cy={44} r={2.4} fill={ILL_COLOR.ink} stroke="none" />
    </Svg>
  );
}

// ─── Animated ─────────────────────────────────────────────────────────────────

function UnburdenedAnimated({ style }: { style?: ViewStyle }) {
  const lift   = useSharedValue(0); // 0 = arms down, 1 = thrown up
  const rise   = useSharedValue(0); // whole-body lift on the exhale
  const scrapX = useSharedValue(0);
  const scrapY = useSharedValue(0);
  const scrapO = useSharedValue(0);
  const spark  = useSharedValue(0);
  const float  = useSharedValue(0);

  useEffect(() => {
    lift.value = withDelay(120, withTiming(1, { duration: 540, easing: Easing.out(Easing.cubic) }));
    rise.value = withDelay(120, withSequence(
      withTiming(-6, { duration: 320, easing: Easing.out(Easing.cubic) }),
      withTiming(0,  { duration: 420, easing: Easing.inOut(Easing.sin) }),
    ));

    scrapO.value = withDelay(260, withSequence(
      withTiming(1, { duration: 140 }),
      withTiming(1, { duration: 520 }),
      withTiming(0, { duration: 520, easing: Easing.in(Easing.quad) }),
    ));
    scrapY.value = withDelay(260, withTiming(-96, { duration: 1180, easing: Easing.out(Easing.quad) }));
    // Drift right as it rises — keeps it clear of the head (head spans x 184-216).
    scrapX.value = withDelay(260, withTiming(34, { duration: 1180, easing: Easing.out(Easing.quad) }));

    spark.value = withDelay(760, withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }));

    // Gentle float once the beat has landed — keeps the frame alive while the
    // celebration copy is still on screen.
    float.value = withDelay(1000, withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
      -1, true,
    ));

    return () => {
      [lift, rise, scrapX, scrapY, scrapO, spark, float].forEach(sv => cancelAnimation(sv));
    };
  }, []);

  const bodyProps = useAnimatedProps(() => {
    'worklet';
    return { transform: `translate(0,${rise.value - float.value * 2.5})` };
  });

  const arms = useDerivedValue(() => {
    'worklet';
    const t = lift.value;
    return {
      lex: lerp(REST_L.ex, RAISED_L.ex, t), ley: lerp(REST_L.ey, RAISED_L.ey, t),
      lwx: lerp(REST_L.wx, RAISED_L.wx, t), lwy: lerp(REST_L.wy, RAISED_L.wy, t),
      rex: lerp(REST_R.ex, RAISED_R.ex, t), rey: lerp(REST_R.ey, RAISED_R.ey, t),
      rwx: lerp(REST_R.wx, RAISED_R.wx, t), rwy: lerp(REST_R.wy, RAISED_R.wy, t),
    };
  });

  const armLProps = useAnimatedProps(() => {
    'worklet';
    const a = arms.value;
    return { d: `M${SH_L.x} ${SH_L.y}L${a.lex} ${a.ley}L${a.lwx} ${a.lwy}` };
  });
  const armRProps = useAnimatedProps(() => {
    'worklet';
    const a = arms.value;
    return { d: `M${SH_R.x} ${SH_R.y}L${a.rex} ${a.rey}L${a.rwx} ${a.rwy}` };
  });
  const handLProps = useAnimatedProps(() => {
    'worklet';
    return { cx: arms.value.lwx, cy: arms.value.lwy };
  });
  const handRProps = useAnimatedProps(() => {
    'worklet';
    return { cx: arms.value.rwx, cy: arms.value.rwy };
  });

  const scrapProps = useAnimatedProps(() => {
    'worklet';
    // Origin folded into this same string — never a separate static transform
    // on the same element (see EmptyBench.tsx's leaf bug).
    return {
      opacity:   scrapO.value,
      transform: `translate(${SCRAP_X + scrapX.value},${SCRAP_Y + scrapY.value})`,
    };
  });

  const sparkProps = useAnimatedProps(() => {
    'worklet';
    const s = spark.value;
    return { opacity: s, transform: `translate(0,${(1 - s) * 10})` };
  });

  return (
    <Svg viewBox="0 0 400 300" width="100%" preserveAspectRatio="xMidYMid meet" style={style}>
      <G {...STROKE.ink}><Path d="M36 244H364" /></G>
      <G {...STROKE.ink2}><Path d="M110 244l3-8M118 244l1-6M292 244l3-8M300 244l1-6" /></G>

      {/* Legs stay planted */}
      <G {...STROKE.ink}><Path d="M193 178V240M207 178V240" strokeWidth={11} /></G>
      <G stroke={ILL_COLOR.dusk} strokeWidth={7.4} strokeLinecap="round" strokeLinejoin="round" fill="none"><Path d="M193 178V240M207 178V240" /></G>
      <G {...STROKE.ink}><Path d="M186 243h12M202 243h12" strokeWidth={7} /></G>

      {/* Everything above the hips rises on the exhale */}
      <AnimatedG animatedProps={bodyProps}>
        <Path fill={ILL_COLOR.coral} d={CHEST_D} transform="translate(3,2)" stroke="none" />
        <G {...STROKE.ink}><Path d={CHEST_D} /></G>
        <Path d={CHEST_D} {...STROKE.press} transform="translate(1,1.1)" />
        <G {...STROKE.ink}><Path d="M200 112V124" strokeWidth={10} /></G>
        <G stroke={ILL_COLOR.skinMd} strokeWidth={6.4} strokeLinecap="round" fill="none"><Path d="M200 112V124" /></G>

        {/* Arms — ink outline then coral fill, both on the same animated path */}
        <AnimatedPath animatedProps={armLProps} {...STROKE.ink} strokeWidth={8.5} />
        <AnimatedPath animatedProps={armRProps} {...STROKE.ink} strokeWidth={8.5} />
        <AnimatedPath animatedProps={armLProps} stroke={ILL_COLOR.coral} strokeWidth={4.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <AnimatedPath animatedProps={armRProps} stroke={ILL_COLOR.coral} strokeWidth={4.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <AnimatedEllipse animatedProps={handLProps} rx={4.8} ry={3.8} fill={ILL_COLOR.skinMd} stroke="none" />
        <AnimatedEllipse animatedProps={handRProps} rx={4.8} ry={3.8} fill={ILL_COLOR.skinMd} stroke="none" />
        <AnimatedEllipse animatedProps={handLProps} rx={4.8} ry={3.8} {...STROKE.ink2} />
        <AnimatedEllipse animatedProps={handRProps} rx={4.8} ry={3.8} {...STROKE.ink2} />

        {/* Head */}
        <Circle fill={ILL_COLOR.skinMd} cx={203} cy={98} r={16} stroke="none" />
        <G {...STROKE.ink}><Circle cx={200} cy={96} r={16} /></G>
        <Circle cx={200} cy={96} r={16} {...STROKE.press} transform="translate(1,1.1)" />
        <Path fill={ILL_COLOR.ink} d={HAIR_D} transform="translate(-2.6,2.4)" stroke="none" />
        <G {...STROKE.ink}><Path d={HAIR_D} /></G>
        <Circle fill={ILL_COLOR.ink} cx={194} cy={96} r={1.8} stroke="none" />
        <Circle fill={ILL_COLOR.ink} cx={206} cy={96} r={1.8} stroke="none" />
        <G {...STROKE.ink2}><Path d="M193 104q7 6 14 0" /></G>
      </AnimatedG>

      {/* The scrap, lifting away */}
      <AnimatedG animatedProps={scrapProps}>
        <Path fill={ILL_COLOR.light} d={SCRAP_D} transform="translate(3,2)" stroke="none" />
        <G {...STROKE.ink2}><Path d={SCRAP_D} strokeWidth={2.6} /></G>
      </AnimatedG>

      {/* Sparks where it dissolved */}
      <AnimatedG animatedProps={sparkProps}>
        <Circle cx={168} cy={62} r={2.6} fill={ILL_COLOR.ink} stroke="none" />
        <Circle cx={232} cy={56} r={2.2} fill={ILL_COLOR.light} stroke={ILL_COLOR.ink} strokeWidth={1.4} />
        <Circle cx={204} cy={44} r={2.4} fill={ILL_COLOR.ink} stroke="none" />
      </AnimatedG>
    </Svg>
  );
}

// ─── Public ───────────────────────────────────────────────────────────────────

export function Unburdened({ style }: { style?: ViewStyle }) {
  const reduceMotion = useReducedMotion();
  return reduceMotion
    ? <UnburdenedStill style={style} />
    : <UnburdenedAnimated style={style} />;
}
