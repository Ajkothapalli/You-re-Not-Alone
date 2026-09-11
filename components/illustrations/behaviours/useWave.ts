/**
 * useWave — §3.4 "Hello" — 5.6s, front view, first launch only.
 *
 * Forearm amplitude strictly decays: 26 → 22 → 19 → 14 → 9 → 4.
 * Head starts before the arm (head leads by ~30% of the period).
 * One wave, then idle (caller should switch to useIdle after).
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

// Exported for testing: successive peaks are strictly decreasing.
export const WAVE_FORE_AMPLITUDES = [26, 22, 19, 14, 9, 4] as const;

export interface WaveValues {
  upperArm: SharedValue<number>;
  foreArm:  SharedValue<number>;
  hand:     SharedValue<number>;
  headR:    SharedValue<number>;
}

export function useWave(): WaveValues & { start: () => void; stop: () => void } {
  const T   = BEHAVIOUR.period.wave; // 5600
  const EIO = Easing.inOut(Easing.sin);

  const upperArm = useSharedValue(0);
  const foreArm  = useSharedValue(0);
  const hand     = useSharedValue(0);
  const headR    = useSharedValue(0);

  function start() {
    const d = (pct: number) => Math.round(T * pct);

    // Upper arm: raised + held, brief anticipation dip at 22→27%, held 33→63%, down by 72%
    upperArm.value = withRepeat(withSequence(
      withTiming(0,  { duration: d(0.22), easing: EIO }),  // 0→22%: rest
      withTiming(-5, { duration: d(0.05), easing: EIO }),  // 22→27%: dip
      withTiming(-3, { duration: d(0.06), easing: EIO }),  // 27→33%: raise
      withTiming(-3, { duration: d(0.30), easing: EIO }),  // 33→63%: hold raised
      withTiming(0,  { duration: d(0.09), easing: EIO }),  // 63→72%: lower
      withTiming(0,  { duration: d(0.28)              }),  // 72→100%: rest
    ), -1);

    // Forearm: decaying wave — amplitudes 26,22,19,14,9,4 (strictly decreasing)
    // Keyframes: 25%=0, 28%=-7, 33%=+26, 39%=-22, 45%=+19, 51%=-14, 57%=+9, 63%=-4, 69%=0
    foreArm.value = withRepeat(withSequence(
      withTiming(0,   { duration: d(0.25), easing: EIO }),  // 0→25%: rest
      withTiming(-7,  { duration: d(0.03), easing: EIO }),  // 25→28%: anticipation
      withTiming(WAVE_FORE_AMPLITUDES[0],  { duration: d(0.05), easing: EIO }), // +26
      withTiming(-WAVE_FORE_AMPLITUDES[1], { duration: d(0.06), easing: EIO }), // -22
      withTiming(WAVE_FORE_AMPLITUDES[2],  { duration: d(0.06), easing: EIO }), // +19
      withTiming(-WAVE_FORE_AMPLITUDES[3], { duration: d(0.06), easing: EIO }), // -14
      withTiming(WAVE_FORE_AMPLITUDES[4],  { duration: d(0.06), easing: EIO }), // +9
      withTiming(-WAVE_FORE_AMPLITUDES[5], { duration: d(0.06), easing: EIO }), // -4
      withTiming(0,   { duration: d(0.06), easing: EIO }),  // 63→69%: settle
      withTiming(0,   { duration: d(0.31)              }),  // 69→100%: rest
    ), -1);

    // Hand: ~45% of forearm amplitude, delay +0.09s
    hand.value = withDelay(BEHAVIOUR.delay.waveHand, withRepeat(withSequence(
      withTiming(0,    { duration: d(0.25), easing: EIO }),
      withTiming(-3,   { duration: d(0.03), easing: EIO }),
      withTiming(12,   { duration: d(0.05), easing: EIO }),
      withTiming(-10,  { duration: d(0.06), easing: EIO }),
      withTiming(9,    { duration: d(0.06), easing: EIO }),
      withTiming(-6,   { duration: d(0.06), easing: EIO }),
      withTiming(4,    { duration: d(0.06), easing: EIO }),
      withTiming(-2,   { duration: d(0.06), easing: EIO }),
      withTiming(0,    { duration: d(0.06), easing: EIO }),
      withTiming(0,    { duration: d(0.31)              }),
    ), -1));

    // Head: starts before arm at 30%, holds, returns by 74%
    headR.value = withRepeat(withSequence(
      withTiming(0,   { duration: d(0.30), easing: EIO }),  // 0→30%: rest
      withTiming(3.6, { duration: d(0.10), easing: EIO }),  // 30→40%: tilt
      withTiming(3,   { duration: d(0.34), easing: EIO }),  // 40→74%: hold
      withTiming(0,   { duration: d(0.26), easing: EIO }),  // 74→100%: return
    ), -1);
  }

  function stop() {
    [upperArm, foreArm, hand, headR].forEach(sv => cancelAnimation(sv));
    upperArm.value = 0; foreArm.value = 0; hand.value = 0; headR.value = 0;
  }

  return { upperArm, foreArm, hand, headR, start, stop };
}
