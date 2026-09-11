/**
 * useIdle — §3.5 "Just being" — 14s, front view, the default standing behaviour.
 *
 * Sequence: rest → glance left → glance right → shift weight → scratch → settle.
 * Eyes lead head by ~2% of period = 280ms (within 250–350ms spec).
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

// Eye leads head by 2% of period = 280ms — testable invariant.
export const IDLE_EYE_LEAD_MS = Math.round(BEHAVIOUR.period.idle * 0.02); // 280

export interface IdleValues {
  eyeX:       SharedValue<number>;
  headR:      SharedValue<number>;
  chestX:     SharedValue<number>;
  chestR:     SharedValue<number>;
  scratchArm: SharedValue<number>;
  scratchFore:SharedValue<number>;
}

export function useIdle(): IdleValues & { start: () => void; stop: () => void } {
  const T   = BEHAVIOUR.period.idle; // 14000
  const EIO = Easing.inOut(Easing.sin);

  const eyeX       = useSharedValue(0);
  const headR      = useSharedValue(0);
  const chestX     = useSharedValue(0);
  const chestR     = useSharedValue(0);
  const scratchArm = useSharedValue(0);
  const scratchFore = useSharedValue(0);

  function start() {
    const d = (pct: number) => Math.round(T * pct);

    // Eyes — lead head by IDLE_EYE_LEAD_MS (2% = 280ms)
    // Glance left at 19%, hold 22–30%, glance right at 33%, hold 36–44%, centre 47%
    eyeX.value = withRepeat(withSequence(
      withTiming(0,    { duration: d(0.19), easing: EIO }),
      withTiming(-3.4, { duration: d(0.00), easing: EIO }), // snap at 19%
      withTiming(-3,   { duration: d(0.03), easing: EIO }), // 19→22%: settle to -3
      withTiming(-3,   { duration: d(0.08), easing: EIO }), // 22→30%: hold
      withTiming(3.4,  { duration: d(0.03), easing: EIO }), // 30→33%: glance right
      withTiming(3,    { duration: d(0.03), easing: EIO }), // 33→36%: settle
      withTiming(3,    { duration: d(0.08), easing: EIO }), // 36→44%: hold
      withTiming(0,    { duration: d(0.03), easing: EIO }), // 44→47%: centre
      withTiming(0,    { duration: d(0.53), easing: EIO }), // 47→100%: rest
    ), -1);

    // Head — follows eyes with 2% delay = 280ms (startting at 21%)
    // Glance L 21%, hold 24→31%, glance R 35%, hold 38→45%, weight shift, scratch
    headR.value = withRepeat(withSequence(
      withTiming(0,    { duration: d(0.21), easing: EIO }),
      withTiming(-4.8, { duration: d(0.00), easing: EIO }), // snap at 21%
      withTiming(-4,   { duration: d(0.03), easing: EIO }), // 21→24%: settle
      withTiming(-4,   { duration: d(0.07), easing: EIO }), // 24→31%: hold
      withTiming(4.8,  { duration: d(0.04), easing: EIO }), // 31→35%: overshoot right
      withTiming(4,    { duration: d(0.03), easing: EIO }), // 35→38%: settle
      withTiming(4,    { duration: d(0.07), easing: EIO }), // 38→45%: hold
      withTiming(0,    { duration: d(0.02), easing: EIO }), // 45→47%: return
      // weight shift at ~47–62%
      withTiming(0,    { duration: d(0.18), easing: EIO }),
      // head tips with body lean
      withTiming(4.6,  { duration: d(0.03), easing: EIO }), // 65%
      withTiming(4,    { duration: d(0.03), easing: EIO }), // 65→68%
      withTiming(4,    { duration: d(0.08), easing: EIO }), // 68→76%: hold
      withTiming(-0.6, { duration: d(0.04), easing: EIO }), // 76→80%
      withTiming(0,    { duration: d(0.03), easing: EIO }), // 80→83%: return
      withTiming(0,    { duration: d(0.17), easing: EIO }), // 83→100%: rest
    ), -1);

    // Chest weight shift (47.5–62%)
    chestX.value = withRepeat(withSequence(
      withTiming(0,    { duration: d(0.475), easing: EIO }),
      withTiming(-1.5, { duration: d(0.035), easing: EIO }), // anticipation dip
      withTiming(4.6,  { duration: d(0.035), easing: EIO }), // 51%
      withTiming(4,    { duration: d(0.020), easing: EIO }), // 53→56%
      withTiming(4,    { duration: d(0.030), easing: EIO }), // hold
      withTiming(-0.6, { duration: d(0.040), easing: EIO }), // 60%
      withTiming(0,    { duration: d(0.020), easing: EIO }), // 62%
      withTiming(0,    { duration: d(0.340), easing: EIO }), // 62→100%: rest
    ), -1);
    chestR.value = withRepeat(withSequence(
      withTiming(0,    { duration: d(0.475), easing: EIO }),
      withTiming(-0.5, { duration: d(0.035), easing: EIO }),
      withTiming(1.8,  { duration: d(0.035), easing: EIO }),
      withTiming(1.5,  { duration: d(0.050), easing: EIO }),
      withTiming(-0.2, { duration: d(0.040), easing: EIO }),
      withTiming(0,    { duration: d(0.020), easing: EIO }),
      withTiming(0,    { duration: d(0.340), easing: EIO }),
    ), -1);

    // Scratch upper arm (61.5–85%)
    scratchArm.value = withRepeat(withSequence(
      withTiming(0,    { duration: d(0.615), easing: EIO }),
      withTiming(8,    { duration: d(0.030), easing: EIO }), // anticipation
      withTiming(-156, { duration: d(0.020), easing: EIO }), // 64.5%: raise
      withTiming(-150, { duration: d(0.020), easing: EIO }), // 66.5%
      withTiming(-150, { duration: d(0.105), easing: EIO }), // hold to 77%
      withTiming(-6,   { duration: d(0.035), easing: EIO }), // 80.5%
      withTiming(4,    { duration: d(0.020), easing: EIO }), // 82.5%
      withTiming(0,    { duration: d(0.025), easing: EIO }), // 85%
      withTiming(0,    { duration: d(0.150), easing: EIO }), // 85→100%: rest
    ), -1);

    // Scratch forearm — decaying wiggle in the forearm, delay +0.1s
    scratchFore.value = withDelay(BEHAVIOUR.delay.scratchFore, withRepeat(withSequence(
      withTiming(0,   { duration: d(0.645), easing: EIO }),
      withTiming(-41, { duration: d(0.020), easing: EIO }),
      withTiming(-33, { duration: d(0.020), easing: EIO }),
      withTiming(-40, { duration: d(0.020), easing: EIO }),
      withTiming(-31, { duration: d(0.020), easing: EIO }),
      withTiming(-39, { duration: d(0.020), easing: EIO }),
      withTiming(-32, { duration: d(0.020), easing: EIO }),
      withTiming(-38, { duration: d(0.020), easing: EIO }),
      withTiming(-34, { duration: d(0.020), easing: EIO }),
      withTiming(-35, { duration: d(0.025), easing: EIO }), // 77% hold
      withTiming(-6,  { duration: d(0.035), easing: EIO }),
      withTiming(3,   { duration: d(0.020), easing: EIO }),
      withTiming(0,   { duration: d(0.025), easing: EIO }),
      withTiming(0,   { duration: d(0.150), easing: EIO }),
    ), -1));
  }

  function stop() {
    [eyeX, headR, chestX, chestR, scratchArm, scratchFore].forEach(sv => cancelAnimation(sv));
    eyeX.value = 0; headR.value = 0;
    chestX.value = 0; chestR.value = 0;
    scratchArm.value = 0; scratchFore.value = 0;
  }

  return { eyeX, headR, chestX, chestR, scratchArm, scratchFore, start, stop };
}
