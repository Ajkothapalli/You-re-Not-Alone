/**
 * useHop — §3.2 "A small hop" — 6.4s, front view.
 *
 * MARKETING AND WEBSITE ONLY — never mount in any app screen.
 * Build it, export it, leave it unmounted.
 *
 * HOP_CONSTRAINTS: testable invariants from the spec.
 */

import {
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  cancelAnimation,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { BEHAVIOUR } from '@/theme/illustration';

export const HOP_CONSTRAINTS = {
  maxTranslateY:   -30,  // body peak (abs = 30 ≤ 30px cap)
  maxScaleDeviation: 0.08, // landing squash/stretch ≤ 8%
  shinApexScaleY:   0.60,  // shin scaleY at apex (≤ 0.65 per spec)
} as const;

export interface HopValues {
  bodyY:        SharedValue<number>;
  bodyScaleX:   SharedValue<number>;
  bodyScaleY:   SharedValue<number>;
  thighScaleY:  SharedValue<number>;
  shinScaleY:   SharedValue<number>;
  shadowScale:  SharedValue<number>;
  shadowOpacity:SharedValue<number>;
  armL:         SharedValue<number>;
  foreArmL:     SharedValue<number>;
  armR:         SharedValue<number>;
  foreArmR:     SharedValue<number>;
  headY:        SharedValue<number>;
  headR:        SharedValue<number>;
}

export function useHop(): HopValues & { start: () => void; stop: () => void } {
  const T = BEHAVIOUR.period.hop; // 6400

  // Bezier easings per spec (one per segment)
  const e1  = Easing.bezier(0.4,  0,    0.7,  0.4);
  const e2  = Easing.bezier(0.15, 0.75, 0.35, 1);
  const e3  = Easing.bezier(0.35, 0,    0.75, 0.6);
  const e4  = Easing.bezier(0.55, 0,    0.9,  0.35);
  const e5  = Easing.bezier(0.2,  0.8,  0.4,  1);
  const EIO = Easing.inOut(Easing.sin);

  // Body
  const bodyY      = useSharedValue(0);
  const bodyScaleX = useSharedValue(1);
  const bodyScaleY = useSharedValue(1);
  // Legs
  const thighScaleY = useSharedValue(1);
  const shinScaleY  = useSharedValue(1);
  // Shadow
  const shadowScale   = useSharedValue(1);
  const shadowOpacity = useSharedValue(0.09);
  // Arms
  const armL   = useSharedValue(0);
  const foreArmL = useSharedValue(0);
  const armR   = useSharedValue(0);
  const foreArmR = useSharedValue(0);
  // Head
  const headY = useSharedValue(0);
  const headR = useSharedValue(0);

  function start() {
    // Segment durations from % of 6400ms
    const d_40  = Math.round(T * 0.40);  // 0→40%   rest
    const d_07  = Math.round(T * 0.07);  // 40→47%  crouch
    const d_06  = Math.round(T * 0.06);  // 47→53%  launch
    const d_035 = Math.round(T * 0.035); // 53→56.5% apex
    const d_055 = Math.round(T * 0.055); // 56.5→62% fall
    const d_05  = Math.round(T * 0.05);  // 62→67%  settle1
    const d_05b = Math.round(T * 0.05);  // 67→72%  settle2
    const d_06b = Math.round(T * 0.06);  // 72→78%  return
    const d_22  = T - d_40 - d_07 - d_06 - d_035 - d_055 - d_05 - d_05b - d_06b; // 78→100%

    // Body Y
    bodyY.value = withRepeat(withSequence(
      withTiming(0,   { duration: d_40,  easing: e1 }),
      withTiming(2,   { duration: d_07,  easing: e2 }),  // crouch
      withTiming(-27, { duration: d_06,  easing: e3 }),  // launch
      withTiming(-30, { duration: d_035, easing: e4 }),  // apex
      withTiming(0,   { duration: d_055, easing: e5 }),  // land
      withTiming(0,   { duration: d_05,  easing: EIO }), // settle1
      withTiming(0,   { duration: d_05b, easing: EIO }), // settle2
      withTiming(0,   { duration: d_06b, easing: EIO }), // return
      withTiming(0,   { duration: d_22              }),  // rest
    ), -1);

    // Body scale X — landing squash adjusted to ≤ 8%
    bodyScaleX.value = withRepeat(withSequence(
      withTiming(1,     { duration: d_40,  easing: e1 }),
      withTiming(1.06,  { duration: d_07,  easing: e2 }),
      withTiming(0.97,  { duration: d_06,  easing: e3 }),
      withTiming(1,     { duration: d_035, easing: e4 }),
      withTiming(1.06,  { duration: d_055, easing: e5 }), // landing (6% ≤ 8%)
      withTiming(0.985, { duration: d_05,  easing: EIO }),
      withTiming(1.008, { duration: d_05b, easing: EIO }),
      withTiming(1,     { duration: d_06b, easing: EIO }),
      withTiming(1,     { duration: d_22              }),
    ), -1);

    // Body scale Y — landing squash ≤ 8%
    bodyScaleY.value = withRepeat(withSequence(
      withTiming(1,     { duration: d_40,  easing: e1 }),
      withTiming(0.93,  { duration: d_07,  easing: e2 }),
      withTiming(1.05,  { duration: d_06,  easing: e3 }),
      withTiming(1,     { duration: d_035, easing: e4 }),
      withTiming(0.92,  { duration: d_055, easing: e5 }), // landing squash = 8%
      withTiming(1.025, { duration: d_05,  easing: EIO }),
      withTiming(0.996, { duration: d_05b, easing: EIO }),
      withTiming(1,     { duration: d_06b, easing: EIO }),
      withTiming(1,     { duration: d_22              }),
    ), -1);

    // Thigh scaleY (from hip)
    thighScaleY.value = withRepeat(withSequence(
      withTiming(1,    { duration: d_40  }),
      withTiming(0.90, { duration: d_07  }),
      withTiming(0.90, { duration: d_06  }),
      withTiming(0.90, { duration: d_035 }),
      withTiming(0.88, { duration: d_055 }),
      withTiming(1.02, { duration: d_05  }),
      withTiming(1,    { duration: d_05b }),
      withTiming(1,    { duration: d_06b }),
      withTiming(1,    { duration: d_22  }),
    ), -1);

    // Shin scaleY (from knee) — folds under thigh in air
    shinScaleY.value = withRepeat(withSequence(
      withTiming(1,    { duration: d_40,  easing: EIO }),
      withTiming(0.86, { duration: d_07,  easing: EIO }),
      withTiming(HOP_CONSTRAINTS.shinApexScaleY, { duration: d_06,  easing: EIO }),  // 0.60 ≤ 0.65
      withTiming(0.62, { duration: d_035, easing: EIO }),
      withTiming(0.85, { duration: d_055, easing: EIO }),
      withTiming(1.03, { duration: d_05,  easing: EIO }),
      withTiming(1,    { duration: d_05b, easing: EIO }),
      withTiming(1,    { duration: d_06b, easing: EIO }),
      withTiming(1,    { duration: d_22              }),
    ), -1);

    // Shadow (airborne phase 45→62%)
    const d_45 = Math.round(T * 0.45);
    const d_17 = Math.round(T * 0.17); // 45→62%
    const dRest = T - d_45 - d_17;
    shadowScale.value = withRepeat(withSequence(
      withTiming(1,    { duration: d_45, easing: EIO }),
      withTiming(0.74, { duration: d_17, easing: EIO }),
      withTiming(1,    { duration: dRest, easing: EIO }),
    ), -1);
    shadowOpacity.value = withRepeat(withSequence(
      withTiming(0.09,  { duration: d_45, easing: EIO }),
      withTiming(0.045, { duration: d_17, easing: EIO }),
      withTiming(0.09,  { duration: dRest, easing: EIO }),
    ), -1);

    // Arms L
    const dArm = (pct: number) => Math.round(T * pct);
    armL.value = withRepeat(withSequence(
      withTiming(0,  { duration: dArm(0.42), easing: EIO }),
      withTiming(10, { duration: dArm(0.05), easing: EIO }),
      withTiming(42, { duration: dArm(0.07), easing: EIO }),
      withTiming(36, { duration: dArm(0.04), easing: EIO }),
      withTiming(44, { duration: dArm(0.05), easing: EIO }),
      withTiming(-5, { duration: dArm(0.07), easing: EIO }),
      withTiming(0,  { duration: dArm(0.30), easing: EIO }),
    ), -1);
    foreArmL.value = withDelay(BEHAVIOUR.delay.hopForearm, withRepeat(withSequence(
      withTiming(0,   { duration: dArm(0.43), easing: EIO }),
      withTiming(14,  { duration: dArm(0.06), easing: EIO }),
      withTiming(24,  { duration: dArm(0.07), easing: EIO }),
      withTiming(-14, { duration: dArm(0.08), easing: EIO }),
      withTiming(4,   { duration: dArm(0.08), easing: EIO }),
      withTiming(0,   { duration: dArm(0.28), easing: EIO }),
    ), -1));
    // R arm: mirror L
    armR.value = withRepeat(withSequence(
      withTiming(0,   { duration: dArm(0.42), easing: EIO }),
      withTiming(-10, { duration: dArm(0.05), easing: EIO }),
      withTiming(-42, { duration: dArm(0.07), easing: EIO }),
      withTiming(-36, { duration: dArm(0.04), easing: EIO }),
      withTiming(-44, { duration: dArm(0.05), easing: EIO }),
      withTiming(5,   { duration: dArm(0.07), easing: EIO }),
      withTiming(0,   { duration: dArm(0.30), easing: EIO }),
    ), -1);
    foreArmR.value = withDelay(BEHAVIOUR.delay.hopForearm, withRepeat(withSequence(
      withTiming(0,   { duration: dArm(0.43), easing: EIO }),
      withTiming(-14, { duration: dArm(0.06), easing: EIO }),
      withTiming(-24, { duration: dArm(0.07), easing: EIO }),
      withTiming(14,  { duration: dArm(0.08), easing: EIO }),
      withTiming(-4,  { duration: dArm(0.08), easing: EIO }),
      withTiming(0,   { duration: dArm(0.28), easing: EIO }),
    ), -1));

    // Head Y and R (lags body up, overshoots on landing)
    headY.value = withRepeat(withSequence(
      withTiming(0,    { duration: dArm(0.47), easing: EIO }),
      withTiming(1.6,  { duration: dArm(0.06), easing: EIO }),
      withTiming(3,    { duration: dArm(0.04), easing: EIO }),
      withTiming(0.5,  { duration: dArm(0.03), easing: EIO }),
      withTiming(-2.4, { duration: dArm(0.05), easing: EIO }),
      withTiming(1.2,  { duration: dArm(0.05), easing: EIO }),
      withTiming(-0.4, { duration: dArm(0.05), easing: EIO }),
      withTiming(0,    { duration: dArm(0.25), easing: EIO }),
    ), -1);
    headR.value = withRepeat(withSequence(
      withTiming(0,    { duration: dArm(0.53), easing: EIO }),
      withTiming(-1.4, { duration: dArm(0.04), easing: EIO }),
      withTiming(0,    { duration: dArm(0.05), easing: EIO }),
      withTiming(0.8,  { duration: dArm(0.09), easing: EIO }),
      withTiming(0,    { duration: dArm(0.29), easing: EIO }),
    ), -1);
  }

  function stop() {
    [bodyY, bodyScaleX, bodyScaleY, thighScaleY, shinScaleY,
     shadowScale, shadowOpacity,
     armL, foreArmL, armR, foreArmR, headY, headR].forEach(sv => cancelAnimation(sv));
    bodyY.value = 0; bodyScaleX.value = 1; bodyScaleY.value = 1;
    thighScaleY.value = 1; shinScaleY.value = 1;
    shadowScale.value = 1; shadowOpacity.value = 0.09;
    armL.value = 0; foreArmL.value = 0; armR.value = 0; foreArmR.value = 0;
    headY.value = 0; headR.value = 0;
  }

  return {
    bodyY, bodyScaleX, bodyScaleY,
    thighScaleY, shinScaleY,
    shadowScale, shadowOpacity,
    armL, foreArmL, armR, foreArmR,
    headY, headR,
    start, stop,
  };
}
