/**
 * useTalk — §3.3 "Yapping" — 4.2s, front view.
 *
 * Mouth: 4 shapes × 12 equal slots of 350ms — never tweened between shapes.
 * Head: deliberate 6.3s period (not a whole-number multiple of 4.2s).
 * Gesture arm: right arm drives; forearm follows with delay.
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

// Mouth shape indices: 0=closed, 1=small circle, 2=open ellipse, 3=wide curve
// 12-slot pattern cycling the 4 shapes — never interpolated.
export const MOUTH_PATTERN = [0, 1, 2, 1, 3, 1, 2, 1, 0, 1, 2, 1] as const;
export const MOUTH_SLOT_MS = Math.round(BEHAVIOUR.period.talk / 12); // 350

export interface TalkValues {
  mouthIdx:   SharedValue<number>;
  gestureArm: SharedValue<number>;
  gestureFore:SharedValue<number>;
  browY:      SharedValue<number>;
  headR:      SharedValue<number>;
  scrapX:     SharedValue<number>;
  scrapY:     SharedValue<number>;
  scrapR:     SharedValue<number>;
  scrapOp:    SharedValue<number>;
}

export function useTalk(): TalkValues & { start: () => void; stop: () => void } {
  const T    = BEHAVIOUR.period.talk;     // 4200
  const TH   = BEHAVIOUR.period.talkHead; // 6300
  const EIO  = Easing.inOut(Easing.sin);

  const mouthIdx    = useSharedValue(0);
  const gestureArm  = useSharedValue(0);
  const gestureFore = useSharedValue(0);
  const browY       = useSharedValue(0);
  const headR       = useSharedValue(0);
  const scrapX      = useSharedValue(0);
  const scrapY      = useSharedValue(0);
  const scrapR      = useSharedValue(0);
  const scrapOp     = useSharedValue(0);

  function start() {
    // Mouth — discrete: jump (duration 0) then hold (350ms each slot)
    const S = MOUTH_SLOT_MS;
    // Build flat sequence: for each slot, instantly jump then hold
    const steps: ReturnType<typeof withTiming>[] = [];
    for (const idx of MOUTH_PATTERN) {
      steps.push(withTiming(idx, { duration: 0 }));  // instant jump — no tween
      steps.push(withTiming(idx, { duration: S }));  // hold
    }
    mouthIdx.value = withRepeat(withSequence(...steps), -1);

    // Gesture arm (upper arm, R side): shaped action
    const d = (pct: number) => Math.round(T * pct);
    gestureArm.value = withRepeat(withSequence(
      withTiming(0,   { duration: d(0.04), easing: EIO }),
      withTiming(-40, { duration: d(0.09), easing: EIO }), // 4→13%
      withTiming(-34, { duration: d(0.04), easing: EIO }), // 13→17%
      withTiming(-18, { duration: d(0.16), easing: EIO }), // 17→33%
      withTiming(-23, { duration: d(0.05), easing: EIO }), // 33→38%
      withTiming(-47, { duration: d(0.14), easing: EIO }), // 38→52%
      withTiming(-41, { duration: d(0.04), easing: EIO }), // 52→56%
      withTiming(-11, { duration: d(0.14), easing: EIO }), // 56→70%
      withTiming(-16, { duration: d(0.04), easing: EIO }), // 70→74%
      withTiming(-2,  { duration: d(0.14), easing: EIO }), // 74→88%
      withTiming(0,   { duration: d(0.12), easing: EIO }), // 88→100%
    ), -1);

    // Gesture forearm: ~60% amplitude, delay +0.11s
    gestureFore.value = withDelay(BEHAVIOUR.delay.talkFore, withRepeat(withSequence(
      withTiming(0,   { duration: d(0.14), easing: EIO }),
      withTiming(-24, { duration: d(0.05), easing: EIO }), // 14→19%
      withTiming(-14, { duration: d(0.05), easing: EIO }), // 19→24%
      withTiming(-6,  { duration: d(0.10), easing: EIO }), // 24→34%
      withTiming(-13, { duration: d(0.05), easing: EIO }), // 34→39%
      withTiming(-28, { duration: d(0.14), easing: EIO }), // 39→53%
      withTiming(-18, { duration: d(0.05), easing: EIO }), // 53→58%
      withTiming(-2,  { duration: d(0.13), easing: EIO }), // 58→71%
      withTiming(-9,  { duration: d(0.05), easing: EIO }), // 71→76%
      withTiming(-1,  { duration: d(0.13), easing: EIO }), // 76→89%
      withTiming(0,   { duration: d(0.11), easing: EIO }), // 89→100%
    ), -1));

    // Brow lift on emphatic words (at 13% and 53%)
    browY.value = withRepeat(withSequence(
      withTiming(0,    { duration: d(0.13), easing: EIO }),
      withTiming(-1.9, { duration: d(0.04), easing: EIO }),
      withTiming(-1.4, { duration: d(0.04), easing: EIO }),
      withTiming(0,    { duration: d(0.32), easing: EIO }),
      withTiming(-1.9, { duration: d(0.04), easing: EIO }),
      withTiming(-1.4, { duration: d(0.04), easing: EIO }),
      withTiming(0,    { duration: d(0.39), easing: EIO }),
    ), -1);

    // Head on 6.3s clock (not a multiple of 4.2s)
    const dH = (pct: number) => Math.round(TH * pct);
    headR.value = withRepeat(withSequence(
      withTiming(-2,   { duration: dH(0.09), easing: EIO }),
      withTiming(-1,   { duration: dH(0.09), easing: EIO }),
      withTiming(2.4,  { duration: dH(0.12), easing: EIO }),
      withTiming(1.6,  { duration: dH(0.08), easing: EIO }),
      withTiming(-1.2, { duration: dH(0.14), easing: EIO }),
      withTiming(2,    { duration: dH(0.12), easing: EIO }),
      withTiming(0.4,  { duration: dH(0.13), easing: EIO }),
      withTiming(-2.2, { duration: dH(0.11), easing: EIO }),
      withTiming(0,    { duration: dH(0.12), easing: EIO }),
    ), -1);

    // Scrap (yellow confession): fades in 18→26%, drifts to (+38,-46) rotate 8° by 70%, gone 82%
    const dS = (pct: number) => Math.round(T * pct);
    scrapOp.value = withRepeat(withSequence(
      withTiming(0, { duration: dS(0.18) }),
      withTiming(1, { duration: dS(0.08), easing: EIO }),
      withTiming(1, { duration: dS(0.44) }),
      withTiming(0, { duration: dS(0.12), easing: EIO }),
      withTiming(0, { duration: dS(0.18) }),
    ), -1);
    scrapX.value = withRepeat(withSequence(
      withTiming(0,  { duration: dS(0.18) }),
      withTiming(38, { duration: dS(0.52), easing: EIO }),
      withTiming(0,  { duration: dS(0.30) }),
    ), -1);
    scrapY.value = withRepeat(withSequence(
      withTiming(0,   { duration: dS(0.18) }),
      withTiming(-46, { duration: dS(0.52), easing: EIO }),
      withTiming(0,   { duration: dS(0.30) }),
    ), -1);
    scrapR.value = withRepeat(withSequence(
      withTiming(0, { duration: dS(0.18) }),
      withTiming(8, { duration: dS(0.52), easing: EIO }),
      withTiming(0, { duration: dS(0.30) }),
    ), -1);
  }

  function stop() {
    [mouthIdx, gestureArm, gestureFore, browY, headR,
     scrapX, scrapY, scrapR, scrapOp].forEach(sv => cancelAnimation(sv));
    mouthIdx.value = 0; gestureArm.value = 0; gestureFore.value = 0;
    browY.value = 0; headR.value = 0;
    scrapX.value = 0; scrapY.value = 0; scrapR.value = 0; scrapOp.value = 0;
  }

  return {
    mouthIdx, gestureArm, gestureFore, browY, headR,
    scrapX, scrapY, scrapR, scrapOp,
    start, stop,
  };
}
