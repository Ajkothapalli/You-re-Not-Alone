/**
 * Writing — "it's your turn."
 *
 * A figure at a desk, pen in hand, mid-sentence. The page is the one yellow
 * object in the scene, because the page is the thing being asked for.
 *
 * Built with the house technique (docs/design/illustration.md §1), which the
 * first version of this file ignored and looked wrong for:
 *   - Limbs are a thick ink stroke (8.5) with a thinner garment/skin stroke
 *     (4.9) laid over it — not a thin outline.
 *   - Fills are drawn OFF-REGISTER from their outlines (2-3px) for the
 *     risograph misprint feel.
 *   - A pressure pass (STROKE.press, translated ~1px) on the shadow side.
 *
 * The writing arm is a real arm: the forearm path is redrawn every frame from
 * a FIXED shoulder to the MOVING hand, so the hand never detaches from the
 * body. The first version drew the arm ending at one point and the pen at
 * another, which read exactly as what it was — writing with no hands.
 *
 * No rotate(): Reanimated 4's transform processor requires a `deg` suffix that
 * react-native-svg's parser rejects, so nothing here can animate a rotation.
 * The pen angle is baked into its path; only position animates.
 *
 * Two clocks:
 *   hand  — travels the line, lifts, returns. 3.4s.
 *   chest — 5.2s breathe, so the figure is alive between strokes.
 */

import React, { useCallback } from 'react';
import { ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
} from 'react-native-reanimated';
import { Svg, G, Path, Circle, Ellipse } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';
import { ILL_COLOR, STROKE, EASING_WORKLET } from '@/theme/illustration';
import { useReducedMotion } from '@/lib/a11y';

const AnimatedPath    = Animated.createAnimatedComponent(Path);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedG       = Animated.createAnimatedComponent(G);

// Writing shoulder stays put; the hand travels the page between these.
const SHOULDER = { x: 250, y: 150 };
const HAND_X0  = 136;
const HAND_X1  = 258;
const HAND_Y   = 190;

// Bone lengths. A straight shoulder-to-hand line changed length from ~41 to
// ~121 across the stroke — the arm stretched like a rubber band, which is
// exactly how it read. Real arms keep their bones and bend at the elbow, so
// these are FIXED and the elbow is solved for.
//   UPPER + FORE must reach the furthest point of the travel (~121).
//   |UPPER - FORE| must be small enough to fold to the nearest (~41).
const UPPER = 62;
const FORE  = 62;

export function Writing({ style }: { style?: ViewStyle }) {
  const reduceMotion = useReducedMotion();

  const t     = useSharedValue(0);   // 0 → 1 across the line
  const chest = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      if (reduceMotion) {
        t.value = 0.45;
        chest.value = 0;
        return;
      }
      // Across, pause at the line end, lift back, pause before the next line.
      // The pauses are what make it read as writing rather than sliding.
      t.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 2100, easing: EASING_WORKLET.breathe }),
          withTiming(1, { duration: 220 }),
          withTiming(0, { duration: 380, easing: EASING_WORKLET.exit }),
          withTiming(0, { duration: 500 }),
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
        cancelAnimation(t);
        cancelAnimation(chest);
      };
    }, [reduceMotion]),
  );

  // One source of truth for the whole arm. Two-bone inverse kinematics: given
  // where the hand wants to be, solve for the elbow that keeps both bones at
  // their fixed length. Everything downstream reads from this, so the hand,
  // the pen and both bones cannot drift apart.
  const arm = useDerivedValue(() => {
    'worklet';
    const tx = HAND_X0 + (HAND_X1 - HAND_X0) * t.value;
    // The wrist dips slightly through the stroke and lifts on the return.
    const ty = HAND_Y + Math.sin(t.value * Math.PI) * 2;

    const dx = tx - SHOULDER.x;
    const dy = ty - SHOULDER.y;
    const raw = Math.sqrt(dx * dx + dy * dy) || 0.001;
    // Clamp to what the arm can actually reach, then place the hand AT the
    // clamped point — otherwise the bones stay honest and the hand floats off
    // the end of them, which is the same bug in a different disguise.
    const d  = Math.min(raw, UPPER + FORE - 0.5);
    const ux = dx / raw;
    const uy = dy / raw;
    const hx = SHOULDER.x + ux * d;
    const hy = SHOULDER.y + uy * d;

    // Circle-circle intersection gives the elbow.
    const a = (UPPER * UPPER - FORE * FORE + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
    const px = SHOULDER.x + a * ux;
    const py = SHOULDER.y + a * uy;
    // Perpendicular, signed so the elbow falls away from the body rather than
    // folding through the torso.
    const ex = px + h * uy;
    const ey = py - h * ux;

    return { hx, hy, ex, ey };
  });

  // Kept as a stable alias so the hand/pen worklets below read naturally.
  const hand = useDerivedValue(() => {
    'worklet';
    return { x: arm.value.hx, y: arm.value.hy };
  });

  const upperArmProps = useAnimatedProps(() => {
    'worklet';
    return { d: `M${SHOULDER.x} ${SHOULDER.y}L${arm.value.ex} ${arm.value.ey}` };
  });
  const forearmProps = useAnimatedProps(() => {
    'worklet';
    return { d: `M${arm.value.ex} ${arm.value.ey}L${arm.value.hx} ${arm.value.hy}` };
  });
  const handProps = useAnimatedProps(() => {
    'worklet';
    return { cx: hand.value.x, cy: hand.value.y };
  });
  const handFillProps = useAnimatedProps(() => {
    'worklet';
    // Off-register: the fill sits 2.4px down-left of its outline.
    return { cx: hand.value.x - 3, cy: hand.value.y + 2.6 };
  });
  const penProps = useAnimatedProps(() => {
    'worklet';
    const { x, y } = hand.value;
    // Nib at the page, barrel up and back over the hand.
    return { d: `M${x + 3} ${y - 5}L${x + 19} ${y - 32}` };
  });

  const chestProps = useAnimatedProps(() => {
    'worklet';
    const s = 1 + chest.value * 0.013;
    return { transform: `translate(200,180) scale(1,${s}) translate(-200,-180)` };
  });

  return (
    <Svg viewBox="0 0 400 300" style={style} preserveAspectRatio="xMidYMid meet">
      {/* ground line */}
      <G {...STROKE.ink}><Path d="M40 268L360 268" /></G>

      {/* ── far arm — drawn BEFORE the desk deliberately: it rests ON the
             desk surface, so the desk must not cover it. It is placed here
             only so the torso overlaps its shoulder end. ─────────────── */}

      {/* ── figure ───────────────────────────────────────────────────── */}
      <AnimatedG animatedProps={chestProps}>
        {/* torso */}
        <Path
          fill={ILL_COLOR.sage} stroke="none" transform="translate(-3,2.6)"
          d="M152 152C152 126 168 112 200 112C232 112 248 126 248 152L256 232L144 232Z"
        />
        <G {...STROKE.ink}>
          <Path d="M152 152C152 126 168 112 200 112C232 112 248 126 248 152L256 232L144 232Z" />
        </G>
        <Path {...STROKE.press} transform="translate(1,1.1)" d="M248 152L256 232" />

        {/* neck */}
        <G {...STROKE.ink}><Path d="M200 88V116" strokeWidth={14} /></G>
        <G stroke={ILL_COLOR.skinMd} strokeWidth={9} strokeLinecap="round" fill="none">
          <Path d="M200 88V116" />
        </G>

        {/* head */}
        <Circle fill={ILL_COLOR.skinMd} cx={204} cy={68} r={30} stroke="none" />
        <G {...STROKE.ink}><Circle cx={200} cy={66} r={30} /></G>
        <Circle cx={200} cy={66} r={30} {...STROKE.press} transform="translate(1.2,1.3)" />
        {/* hair */}
        <Path
          fill={ILL_COLOR.ink} stroke="none" transform="translate(3,2.2)"
          d="M170 60C170 34 230 34 230 60C220 48 180 48 170 60Z"
        />
        <G {...STROKE.ink}>
          <Path d="M170 60C170 34 230 34 230 60C220 48 180 48 170 60Z" />
        </G>
        {/* eyes down at the page */}
        <G {...STROKE.ink2}><Path d="M184 74q5 4 10 0M206 74q5 4 10 0" strokeWidth={2.6} /></G>
      </AnimatedG>

      {/* far arm — reaches down to rest a hand on the desk */}
      <G {...STROKE.ink}><Path d="M156 158L96 198" strokeWidth={12} /></G>
      <G stroke={ILL_COLOR.sage} strokeWidth={7} strokeLinecap="round" fill="none">
        <Path d="M156 158L96 198" />
      </G>
      <Ellipse fill={ILL_COLOR.skinMd} cx={87} cy={206} rx={9} ry={7.4} stroke="none" />
      <G {...STROKE.ink2}><Ellipse cx={90} cy={203} rx={9} ry={7.4} strokeWidth={2.6} /></G>

      {/* ── desk ─────────────────────────────────────────────────────── */}
      <Path
        fill={ILL_COLOR.sand} stroke="none" transform="translate(-3,2.6)"
        d="M52 212L348 212L348 268L52 268Z"
      />
      <G {...STROKE.ink}><Path d="M52 212L348 212L348 268L52 268Z" /></G>
      <Path {...STROKE.press} transform="translate(1,1.1)" d="M348 212L348 268" />

      {/* ── the page — the one yellow object ─────────────────────────── */}
      <Path
        fill={ILL_COLOR.light} stroke="none" transform="translate(-3,2.4)"
        d="M108 168L286 168L294 212L116 212Z"
      />
      <G {...STROKE.ink}><Path d="M108 168L286 168L294 212L116 212Z" /></G>
      <G {...STROKE.ink2}>
        <Path d="M128 182L256 182M128 196L214 196" strokeWidth={2.6} />
      </G>

      {/* ── writing arm — forearm redrawn each frame, shoulder to hand ── */}
      <AnimatedPath {...STROKE.ink} strokeWidth={12} animatedProps={upperArmProps} />
      <AnimatedPath {...STROKE.ink} strokeWidth={12} animatedProps={forearmProps} />
      <AnimatedPath
        stroke={ILL_COLOR.sage} strokeWidth={7} strokeLinecap="round" fill="none"
        animatedProps={upperArmProps}
      />
      <AnimatedPath
        stroke={ILL_COLOR.sage} strokeWidth={7} strokeLinecap="round" fill="none"
        animatedProps={forearmProps}
      />
      <AnimatedEllipse fill={ILL_COLOR.skinMd} rx={9.4} ry={7.8} stroke="none" animatedProps={handFillProps} />
      <AnimatedEllipse {...STROKE.ink2} strokeWidth={2.6} rx={9.4} ry={7.8} animatedProps={handProps} />
      {/* pen */}
      <AnimatedPath {...STROKE.ink} strokeWidth={4.4} animatedProps={penProps} />
    </Svg>
  );
}

export default Writing;
