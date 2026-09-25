/**
 * Lantern — "come in, we're listening."
 * Login screen hero illustration (app/index.tsx, email step only).
 *
 * A return-visitor moment: calmer and more intimate than onboarding's grand
 * first impression (Threshold), and not the empty-inbox mood of "you haven't
 * written anything yet" (EmptyBench, reserved for the My Confessions empty
 * state per its own file header). Character A sits cross-legged and at ease,
 * hands open and resting rather than clutching or holding anything, looking
 * out with the level, attentive "waiting" expression — present, not idle.
 * A small lantern hangs from a floating beam, a warm light left on rather
 * than EmptyBench's tall standing lamppost or Sanctuary's night moon.
 *
 * Single-clock construction, same idle-only treatment as EmptyBench and
 * Sanctuary: breathe (chest 5.2s), nod (head 7.0s), blink (eyes 6.1s) via
 * useIdleLayer's §2 always-on layer — this is a seated scene, so per
 * motion-behaviours.md §4 it keeps the §2 layer only, no §3 behaviour.
 *
 * Construction: the cross-legged torso/neck/head/hair are ported 1:1 from
 * NotificationsEmpty.tsx's own seated figure (chest 156–212, head centre
 * (200,126), A's usual hair silhouette shifted dy=+14 for this head height
 * per docs/design/illustration.md §3's "shift y for other heads" note —
 * NotificationsEmpty already uses this exact shifted hair path, confirming
 * the technique). Only the arms/hands (open at the sides, not converging on
 * a held cup) and the expression (open-eyed "waiting", not NotificationsEmpty's
 * closed-eyed "content") are new. The lantern is a static prop with no clock
 * of its own, like Sanctuary's moon.
 */

import React, { useCallback } from 'react';
import { ViewStyle } from 'react-native';
import Animated, {
  useAnimatedProps,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { Svg, G, Path, Rect, Circle, Ellipse } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';

import { useReducedMotion } from '@/lib/a11y';
import { isSplashDone, subscribeSplashDone } from '@/lib/splashGate';
import { ILL_COLOR, STROKE } from '@/theme/illustration';
import { useIdleLayer } from '@/components/illustrations/behaviours';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

// ─── Wave geometry (screen-right arm) ───────────────────────────────────────────
// The wave animates the arm's PATH GEOMETRY directly (elbow + wrist positions
// recomputed per frame in a worklet), NOT an SVG rotate() transform — see the
// rotate() note below / EmptyBench.tsx: no rotate() string survives both
// Reanimated 4's transform processor and react-native-svg's parser at once, so
// a rigged-joint rotation can't be used. Instead the forearm's free end swings
// around the elbow via sin/cos in the worklet, which is pure path data.
const SH_X = 217, SH_Y = 164;   // shoulder (fixed pivot)
const REST_WX = 228, REST_WY = 194; // wrist at rest (arm down at side)
const FORE_R = 23;              // raised forearm length (elbow → wrist)
const BASE_A = 0.31;            // neutral raised-forearm angle from vertical (rad)

// ─── Geometry constants ────────────────────────────────────────────────────────
// Chest origin (bottom-centre of torso): (200, 212) — ported from
// NotificationsEmpty's own seated torso.
const CX = 200, CY_CHEST = 212;
// Head centre for this seated pose: (200, 126). Eyes: (194/206, 128).
const CY_EYES = 128;

// ─── Shared path data ──────────────────────────────────────────────────────────
// A's hair silhouette, shifted from its usual head-centre-112 anchor to this
// scene's head-centre-126 (dy = +14, x unchanged) — the exact same shift
// NotificationsEmpty already applies for the same head height.
const HAIR_D = 'M184 122C182 110 190 104 196 108C200 102 210 104 212 110C218 108 220 118 216 124C212 116 204 114 200 116C196 112 188 114 184 122Z';
// "Waiting" expression (A), dy=+14 shift applied to the level-brow / open-eye set.
const FACE_D = 'M190 121l7-1M203 120l7 1M196 135q4 2 8 0';
// Cross-legged tubes. The knee (the mid vertex) is a quadratic bend, not a
// hard L-to-L corner, so it reads as a natural rounded knee rather than a
// sharp point — the original polyline pointed straight out at (244,226) /
// (156,226). Control point sits at the old vertex; the curve eases in/out of it.
const LEG_R_D = 'M208 210L237 223Q244 226 236 228L194 240';
const LEG_L_D = 'M192 210L163 223Q156 226 164 228L206 240';
// Chest silhouette — ported 1:1 from NotificationsEmpty.
const CHEST_D = 'M180 156C180 148 220 148 220 156L216 212C216 217 184 217 184 212Z';

// ─── Still component (reduced motion) ─────────────────────────────────────────

function LanternStill({ style }: { style?: ViewStyle }) {
  return (
    <Svg viewBox="0 0 400 300" width="100%" preserveAspectRatio="xMidYMid meet" style={style}>
      {/* Hanging lantern — a light left on, not a standing lamppost or a moon.
          Hangs from a floating beam (same weightless-prop convention as
          NotificationsEmpty's shelf) rather than a bare string from nowhere —
          the beam's width also gives this side of the scene the same visual
          balance EmptyBench gets from spreading props edge to edge. */}
      <Rect fill={ILL_COLOR.sand} x="270" y="104" width="90" height="6" rx="2" transform="translate(-2.6,2.4)" stroke="none" />
      <G {...STROKE.ink}><Rect x="270" y="104" width="90" height="6" rx="2" /></G>
      <G {...STROKE.ink2}><Path d="M310 110V138" /></G>
      <Rect fill={ILL_COLOR.sand} x="296" y="138" width="28" height="34" rx="6" transform="translate(3,2)" stroke="none" />
      <G {...STROKE.ink}><Rect x="296" y="138" width="28" height="34" rx="6" /></G>

      {/* Ground */}
      <G {...STROKE.ink}><Path d="M36 244H364" /></G>
      <G {...STROKE.ink2}><Path d="M110 244l3-8M118 244l1-6" /></G>

      {/* Legs (cross-legged) — at rest */}
      <G {...STROKE.ink}><Path d={LEG_R_D} strokeWidth={11} /></G>
      <G stroke={ILL_COLOR.dusk} strokeWidth={7.4} strokeLinecap="round" strokeLinejoin="round" fill="none"><Path d={LEG_R_D} /></G>
      <G {...STROKE.ink}><Path d={LEG_L_D} strokeWidth={11} /></G>
      <G stroke={ILL_COLOR.dusk} strokeWidth={7.4} strokeLinecap="round" strokeLinejoin="round" fill="none"><Path d={LEG_L_D} /></G>

      {/* Chest — at rest */}
      <Path fill={ILL_COLOR.coral} d={CHEST_D} transform="translate(3,2)" stroke="none" />
      <G {...STROKE.ink}><Path d={CHEST_D} /></G>
      <Path d={CHEST_D} {...STROKE.press} transform="translate(1,1.1)" />
      {/* Neck */}
      <G {...STROKE.ink}><Path d="M200 142V154" strokeWidth={10} /></G>
      <G stroke={ILL_COLOR.skinMd} strokeWidth={6.4} strokeLinecap="round" fill="none"><Path d="M200 142V154" /></G>
      {/* Arms — open, resting at the sides */}
      <G {...STROKE.ink}><Path d="M183 164L172 194M217 164L228 194" strokeWidth={8.5} /></G>
      <G stroke={ILL_COLOR.coral} strokeWidth={4.9} strokeLinecap="round" fill="none"><Path d="M183 164L172 194M217 164L228 194" /></G>
      <Ellipse fill={ILL_COLOR.skinMd} cx={175} cy={196} rx={4.5} ry={3.6} stroke="none" />
      <Ellipse fill={ILL_COLOR.skinMd} cx={231} cy={196} rx={4.5} ry={3.6} stroke="none" />
      <G {...STROKE.ink2}><Ellipse cx={172} cy={194} rx={4.5} ry={3.6} /><Ellipse cx={228} cy={194} rx={4.5} ry={3.6} /></G>

      {/* Head — at rest */}
      <Circle fill={ILL_COLOR.skinMd} cx={203} cy={128} r={16} stroke="none" />
      <G {...STROKE.ink}><Circle cx={200} cy={126} r={16} /></G>
      <Circle cx={200} cy={126} r={16} {...STROKE.press} transform="translate(1,1.1)" />
      <Path fill={ILL_COLOR.ink} d={HAIR_D} transform="translate(-2.6,2.4)" stroke="none" />
      <G {...STROKE.ink}><Path d={HAIR_D} /></G>
      <G {...STROKE.ink2}><Path d={FACE_D} /></G>
      {/* Eyes — open (no blink in still) */}
      <Circle fill={ILL_COLOR.ink} cx={194} cy={128} r={1.8} stroke="none" />
      <Circle fill={ILL_COLOR.ink} cx={206} cy={128} r={1.8} stroke="none" />
    </Svg>
  );
}

// ─── Animated component ───────────────────────────────────────────────────────

function LanternAnimated({ style }: { style?: ViewStyle }) {
  // §2 always-on layer only — seated scene, same treatment as EmptyBench/Sanctuary.
  const idle = useIdleLayer({ alternate: false });

  const chestProps = useAnimatedProps(() => {
    'worklet';
    const sx = idle.breathX.value, sy = idle.breathY.value;
    return {
      transform: `translate(${CX},${CY_CHEST}) scale(${sx},${sy}) translate(-${CX},-${CY_CHEST})`,
    };
  });

  // NOTE — rotate() is deliberately not used below. See EmptyBench.tsx for the
  // full explanation: no rotate() string survives both Reanimated 4's
  // transform-string processor (requires a "deg" unit) and react-native-svg's
  // native SVG transform parser (rejects a "deg" unit) at once, so
  // rotation-based motion is approximated with translate instead.
  const headProps = useAnimatedProps(() => {
    'worklet';
    const ty = idle.nodY.value;
    return { transform: `translate(0,${ty})` };
  });

  const blinkProps = useAnimatedProps(() => {
    'worklet';
    const s = idle.blinkS.value;
    return {
      transform: `translate(${CX},${CY_EYES}) scale(1,${s}) translate(-${CX},-${CY_EYES})`,
    };
  });

  // ── Wave clock ────────────────────────────────────────────────────────────────
  // raise: 0 = arm resting at side, 1 = raised to wave. swing: forearm angle
  // offset (rad) that oscillates while raised. Both loop on a 5 s cadence and
  // start immediately on mount, so the hand waves once on first appearance and
  // then again every 5 seconds.
  const raise = useSharedValue(0);
  const swing = useSharedValue(0);
  const glowT = useSharedValue(0); // lantern glow driver, 0..1

  // Elbow + wrist recomputed each frame from raise/swing (see geometry note above).
  const arm = useDerivedValue(() => {
    'worklet';
    const r  = raise.value;
    const ex = 224 + (233 - 224) * r;             // elbow x: rest 224 → raised 233
    const ey = 180 + (150 - 180) * r;             // elbow y: rest 180 → raised 150
    const a  = BASE_A + swing.value;              // forearm angle from vertical
    const rax = ex + FORE_R * Math.sin(a);        // raised wrist (swinging)
    const ray = ey - FORE_R * Math.cos(a);
    const wx = REST_WX + (rax - REST_WX) * r;     // blend rest ↔ raised by r
    const wy = REST_WY + (ray - REST_WY) * r;
    return { ex, ey, wx, wy };
  });

  const armInkProps = useAnimatedProps(() => {
    'worklet';
    return { d: `M${SH_X} ${SH_Y}L${arm.value.ex} ${arm.value.ey}L${arm.value.wx} ${arm.value.wy}` };
  });
  const handFillProps = useAnimatedProps(() => {
    'worklet';
    return { cx: arm.value.wx + 3, cy: arm.value.wy + 2 };
  });
  const handInkProps = useAnimatedProps(() => {
    'worklet';
    return { cx: arm.value.wx, cy: arm.value.wy };
  });

  const glowProps = useAnimatedProps(() => {
    'worklet';
    const t = glowT.value;
    return {
      opacity:   0.12 + 0.22 * t,
      transform: `translate(310,155) scale(${1 + 0.12 * t}) translate(-310,-155)`,
    };
  });

  useFocusEffect(useCallback(() => {
    idle.start();

    // The wave must not run behind the splash. AnimatedSplash is an in-tree
    // overlay, so this screen mounts and animates underneath it: the wave
    // occupies 0-2.4s of the 5s cycle and the splash dismisses at 2.8s, which
    // meant the greeting was always spent unseen and the first thing anyone
    // watched was a figure sitting still until t=5s.
    //
    // isSplashDone() is sticky and already true on any later visit, so this
    // costs nothing after the first launch.
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const startWave = () => {
      if (cancelled) return;

      const T = 5000;
      const d = (p: number) => Math.round(T * p);
      const EIO = Easing.inOut(Easing.sin);

      // raise: up (0→10%), hold raised (10→38%), down (38→48%), rest (48→100%)
      raise.value = withRepeat(withSequence(
        withTiming(1, { duration: d(0.10), easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: d(0.28) }),
        withTiming(0, { duration: d(0.10), easing: Easing.in(Easing.cubic) }),
        withTiming(0, { duration: d(0.52) }),
      ), -1);

      // swing: neutral until raised, then a decaying oscillation, then neutral/rest
      swing.value = withRepeat(withSequence(
        withTiming(0,    { duration: d(0.12) }),
        withTiming(0.5,  { duration: d(0.05), easing: EIO }),
        withTiming(-0.4, { duration: d(0.05), easing: EIO }),
        withTiming(0.3,  { duration: d(0.04), easing: EIO }),
        withTiming(-0.2, { duration: d(0.04), easing: EIO }),
        withTiming(0.1,  { duration: d(0.04), easing: EIO }),
        withTiming(0,    { duration: d(0.03), easing: EIO }),
        withTiming(0,    { duration: d(0.63) }),
      ), -1);

      // glow: gentle independent pulse on the lantern
      glowT.value = withRepeat(withTiming(1, { duration: 1400, easing: EIO }), -1, true);
    };

    if (isSplashDone()) startWave();
    else unsubscribe = subscribeSplashDone(startWave);

    return () => {
      cancelled = true;
      unsubscribe?.();
      idle.stop();
      [raise, swing, glowT].forEach(sv => cancelAnimation(sv));
      raise.value = 0; swing.value = 0; glowT.value = 0;
    };
  }, []));

  return (
    <Svg viewBox="0 0 400 300" width="100%" preserveAspectRatio="xMidYMid meet" style={style}>
      {/* Warm glow behind the lantern — pulses opacity + a slight scale. Uses
          the reserved `light` yellow: this login scene carries no confession
          scrap/yap, so the lantern is the one warm accent, not competing with a
          "yap" object. Drawn first so it sits behind the lantern body. */}
      <AnimatedG animatedProps={glowProps}>
        <Circle cx={310} cy={155} r={26} fill={ILL_COLOR.light} stroke="none" />
      </AnimatedG>

      {/* Hanging lantern — static prop, no clock. Hangs from a floating beam,
          same weightless-prop convention as NotificationsEmpty's shelf. */}
      <Rect fill={ILL_COLOR.sand} x="270" y="104" width="90" height="6" rx="2" transform="translate(-2.6,2.4)" stroke="none" />
      <G {...STROKE.ink}><Rect x="270" y="104" width="90" height="6" rx="2" /></G>
      <G {...STROKE.ink2}><Path d="M310 110V138" /></G>
      <Rect fill={ILL_COLOR.sand} x="296" y="138" width="28" height="34" rx="6" transform="translate(3,2)" stroke="none" />
      <G {...STROKE.ink}><Rect x="296" y="138" width="28" height="34" rx="6" /></G>

      {/* Ground */}
      <G {...STROKE.ink}><Path d="M36 244H364" /></G>
      <G {...STROKE.ink2}><Path d="M110 244l3-8M118 244l1-6" /></G>

      {/* Legs (cross-legged) */}
      <G {...STROKE.ink}><Path d={LEG_R_D} strokeWidth={11} /></G>
      <G stroke={ILL_COLOR.dusk} strokeWidth={7.4} strokeLinecap="round" strokeLinejoin="round" fill="none"><Path d={LEG_R_D} /></G>
      <G {...STROKE.ink}><Path d={LEG_L_D} strokeWidth={11} /></G>
      <G stroke={ILL_COLOR.dusk} strokeWidth={7.4} strokeLinecap="round" strokeLinejoin="round" fill="none"><Path d={LEG_L_D} /></G>

      {/* Chest — breathe clock */}
      <AnimatedG animatedProps={chestProps}>
        <Path fill={ILL_COLOR.coral} d={CHEST_D} transform="translate(3,2)" stroke="none" />
        <G {...STROKE.ink}><Path d={CHEST_D} /></G>
        <Path d={CHEST_D} {...STROKE.press} transform="translate(1,1.1)" />
        {/* Neck */}
        <G {...STROKE.ink}><Path d="M200 142V154" strokeWidth={10} /></G>
        <G stroke={ILL_COLOR.skinMd} strokeWidth={6.4} strokeLinecap="round" fill="none"><Path d="M200 142V154" /></G>
        {/* Left arm — resting at the side (the right arm is the animated waver,
            rendered as a sibling after the head so its geometry isn't also
            scaled by this breathe group). */}
        <G {...STROKE.ink}><Path d="M183 164L172 194" strokeWidth={8.5} /></G>
        <G stroke={ILL_COLOR.coral} strokeWidth={4.9} strokeLinecap="round" fill="none"><Path d="M183 164L172 194" /></G>
        <Ellipse fill={ILL_COLOR.skinMd} cx={175} cy={196} rx={4.5} ry={3.6} stroke="none" />
        <G {...STROKE.ink2}><Ellipse cx={172} cy={194} rx={4.5} ry={3.6} /></G>
      </AnimatedG>

      {/* Head — nod clock */}
      <AnimatedG animatedProps={headProps}>
        <Circle fill={ILL_COLOR.skinMd} cx={203} cy={128} r={16} stroke="none" />
        <G {...STROKE.ink}><Circle cx={200} cy={126} r={16} /></G>
        <Circle cx={200} cy={126} r={16} {...STROKE.press} transform="translate(1,1.1)" />
        <Path fill={ILL_COLOR.ink} d={HAIR_D} transform="translate(-2.6,2.4)" stroke="none" />
        <G {...STROKE.ink}><Path d={HAIR_D} /></G>
        <G {...STROKE.ink2}><Path d={FACE_D} /></G>
        {/* Eyes — blink clock */}
        <AnimatedG animatedProps={blinkProps}>
          <Circle fill={ILL_COLOR.ink} cx={194} cy={128} r={1.8} stroke="none" />
          <Circle fill={ILL_COLOR.ink} cx={206} cy={128} r={1.8} stroke="none" />
        </AnimatedG>
      </AnimatedG>

      {/* Right arm — the waver. Ink outline + coral fill share one animated
          path (shoulder → elbow → wrist); the hand is two ellipses tracking the
          wrist. Rendered here (after the head) so the raised hand reads as being
          in front, and outside the breathe group so its geometry is driven only
          by the wave worklet. */}
      <AnimatedPath animatedProps={armInkProps} {...STROKE.ink} strokeWidth={8.5} />
      <AnimatedPath
        animatedProps={armInkProps}
        stroke={ILL_COLOR.coral}
        strokeWidth={4.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <AnimatedEllipse animatedProps={handFillProps} rx={4.5} ry={3.6} fill={ILL_COLOR.skinMd} stroke="none" />
      <AnimatedEllipse animatedProps={handInkProps} rx={4.5} ry={3.6} {...STROKE.ink2} />
    </Svg>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function Lantern({ style }: { style?: ViewStyle }) {
  const reduceMotion = useReducedMotion();
  return reduceMotion
    ? <LanternStill style={style} />
    : <LanternAnimated style={style} />;
}
