/**
 * useWalk — §3.1 "A stroll" — 1.4s, profile view.
 *
 * Returns shared values for all walking body parts.
 * Mount on the onboarding walk and website; never inside the app on its own.
 *
 * WALK_SCENE: ground-dash and scenery speeds must match (see §3.1).
 *   dashPx / dashMs === sceneryPx / sceneryMs  →  30/700 = 600/14000
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

// Ground-dash and scenery constants (both 30/700 px/ms = same speed).
export const WALK_SCENE = {
  dashPx:      30,    // stroke-dashoffset change per half-cycle
  dashMs:      700,   // half walk cycle
  sceneryPx:   600,   // scenery translateX per loop
  sceneryMs:   14000, // scenery loop duration (600/14000 === 30/700)
} as const;

export interface WalkValues {
  thighNear: SharedValue<number>;
  shinNear:  SharedValue<number>;
  footNear:  SharedValue<number>;
  thighFar:  SharedValue<number>;
  shinFar:   SharedValue<number>;
  footFar:   SharedValue<number>;
  armNear:   SharedValue<number>;
  foreNear:  SharedValue<number>;
  armFar:    SharedValue<number>;
  foreFar:   SharedValue<number>;
  lean:      SharedValue<number>;
  bodyBob:   SharedValue<number>;
  headBob:   SharedValue<number>;
}

export function useWalk(): WalkValues & { start: () => void; stop: () => void } {
  const T    = BEHAVIOUR.period.walk; // 1400
  const HALF = Math.round(T / 2);    // 700
  const SIN  = Easing.inOut(Easing.sin);

  // Near leg
  const thighNear = useSharedValue(-28);
  const shinNear  = useSharedValue(3);
  const footNear  = useSharedValue(-7);
  // Far leg (opposite phase — initial values placed at the 50% mark)
  const thighFar  = useSharedValue(24);
  const shinFar   = useSharedValue(62);
  const footFar   = useSharedValue(11);
  // Arms
  const armNear  = useSharedValue(24);
  const foreNear = useSharedValue(7);
  const armFar   = useSharedValue(-24);
  const foreFar  = useSharedValue(27);
  // Torso
  const lean    = useSharedValue(-1);
  const bodyBob = useSharedValue(0);
  const headBob = useSharedValue(0);  // head leads body by BEHAVIOUR.delay.headBob

  function start() {
    // Shin durations: 0→36% / 36→52% / 52→76% / 76→100%
    const d36 = Math.round(T * 0.36);
    const d16 = Math.round(T * 0.16);
    const d24 = Math.round(T * 0.24);

    // ── Near leg ──────────────────────────────────────────────────────────────
    thighNear.value = withRepeat(withTiming(24,  { duration: HALF, easing: SIN }), -1, true);

    shinNear.value = withRepeat(withSequence(
      withTiming(0,  { duration: d36, easing: SIN }),
      withTiming(18, { duration: d16, easing: SIN }),
      withTiming(62, { duration: d24, easing: SIN }),
      withTiming(3,  { duration: d24, easing: SIN }),
    ), -1);

    // Foot: 0→20% / 20→56% / 56→80% / 80→100%
    const d20a = Math.round(T * 0.20);
    const d36b = Math.round(T * 0.36);
    const d24b = Math.round(T * 0.24);
    const d20b = Math.round(T * 0.20);
    footNear.value = withRepeat(withSequence(
      withTiming(0,  { duration: d20a, easing: SIN }),
      withTiming(15, { duration: d36b, easing: SIN }),
      withTiming(11, { duration: d24b, easing: SIN }),
      withTiming(-7, { duration: d20b, easing: SIN }),
    ), -1);

    // ── Far leg (opposite phase — shin sequence rotated to start at 76%) ──────
    thighFar.value = withRepeat(withTiming(-28, { duration: HALF, easing: SIN }), -1, true);

    shinFar.value = withRepeat(withSequence(
      withTiming(3,  { duration: d24, easing: SIN }),  // 76→100%
      withTiming(0,  { duration: d36, easing: SIN }),  // 0→36%
      withTiming(18, { duration: d16, easing: SIN }),  // 36→52%
      withTiming(62, { duration: d24, easing: SIN }),  // 52→76%
    ), -1);

    footFar.value = withRepeat(withSequence(
      withTiming(-7, { duration: d20b, easing: SIN }), // 80→100%
      withTiming(0,  { duration: d20a, easing: SIN }), // 0→20%
      withTiming(15, { duration: d36b, easing: SIN }), // 20→56%
      withTiming(11, { duration: d24b, easing: SIN }), // 56→80%
    ), -1);

    // ── Arms ──────────────────────────────────────────────────────────────────
    armNear.value = withRepeat(withTiming(-24, { duration: HALF, easing: SIN }), -1, true);
    foreNear.value = withDelay(
      BEHAVIOUR.delay.walkForearm,
      withRepeat(withTiming(27, { duration: HALF, easing: SIN }), -1, true),
    );
    armFar.value = withRepeat(withTiming(24, { duration: HALF, easing: SIN }), -1, true);
    foreFar.value = withDelay(
      BEHAVIOUR.delay.walkForearm,
      withRepeat(withTiming(7, { duration: HALF, easing: SIN }), -1, true),
    );

    // ── Torso ─────────────────────────────────────────────────────────────────
    lean.value = withRepeat(withTiming(1, { duration: HALF, easing: SIN }), -1, true);

    // Head leads body: headBob starts immediately, bodyBob starts after headBob delay
    headBob.value = withRepeat(withTiming(1.1, { duration: HALF, easing: SIN }), -1, true);
    bodyBob.value = withDelay(
      BEHAVIOUR.delay.headBob,
      withRepeat(withTiming(-3, { duration: HALF, easing: SIN }), -1, true),
    );
  }

  function stop() {
    [thighNear, shinNear, footNear, thighFar, shinFar, footFar,
     armNear, foreNear, armFar, foreFar, lean, bodyBob, headBob].forEach(sv => {
      cancelAnimation(sv);
    });
    thighNear.value = -28; shinNear.value = 3;   footNear.value = -7;
    thighFar.value  =  24; shinFar.value  = 62;  footFar.value  = 11;
    armNear.value  = 24;  foreNear.value = 7;
    armFar.value   = -24; foreFar.value  = 27;
    lean.value = -1; bodyBob.value = 0; headBob.value = 0;
  }

  return {
    thighNear, shinNear, footNear,
    thighFar,  shinFar,  footFar,
    armNear, foreNear, armFar, foreFar,
    lean, bodyBob, headBob,
    start, stop,
  };
}
