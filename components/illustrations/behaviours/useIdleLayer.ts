/**
 * useIdleLayer — §2 always-on character layer.
 *
 * Breathe + nod + blink + sympathetic arm sway.
 * Runs underneath every behaviour and alone on seated scenes.
 * Gate calls: only call inside the Animated (non-reduced-motion) component branch.
 */

import {
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { ILLUSTRATION } from '@/theme/motion';
import { BEHAVIOUR, EASING_WORKLET } from '@/theme/illustration';

export interface IdleLayerValues {
  breathX:  SharedValue<number>;
  breathY:  SharedValue<number>;
  nodY:     SharedValue<number>;
  nodR:     SharedValue<number>;
  blinkS:   SharedValue<number>;
  swayArm:  SharedValue<number>;
  swayFore: SharedValue<number>;
}

export function useIdleLayer({ alternate = false } = {}): IdleLayerValues & {
  start: () => void;
  stop:  () => void;
} {
  const breathX  = useSharedValue(1);
  const breathY  = useSharedValue(1);
  const nodY     = useSharedValue(0);
  const nodR     = useSharedValue(0);
  const blinkS   = useSharedValue(1);
  const swayArm  = useSharedValue(0);
  const swayFore = useSharedValue(-3); // start at opposite end for visual phase separation

  const breathPeriod = alternate ? ILLUSTRATION.breathe[1] : ILLUSTRATION.breathe[0];
  const nodPeriod    = alternate ? ILLUSTRATION.nod[1]     : ILLUSTRATION.nod[0];
  const SIN = Easing.inOut(Easing.sin);
  const HALF = (ms: number) => Math.round(ms / 2);

  function start() {
    // Breathe — scale(1.008, 1.02) from chest bottom-centre
    breathX.value = withRepeat(
      withTiming(1.008, { duration: HALF(breathPeriod), easing: SIN }),
      -1, true,
    );
    breathY.value = withRepeat(
      withTiming(1.02, { duration: HALF(breathPeriod), easing: SIN }),
      -1, true,
    );

    // Nod — translateY −1.2px, rotate 0.8° from neck
    nodY.value = withRepeat(
      withTiming(-1.2, { duration: HALF(nodPeriod), easing: SIN }),
      -1, true,
    );
    nodR.value = withRepeat(
      withTiming(0.8, { duration: HALF(nodPeriod), easing: SIN }),
      -1, true,
    );

    // Blink — scaleY 1→0.08→1 in last 9% of 6.1s cycle
    const openDur   = Math.round(ILLUSTRATION.blink * 0.91);
    const halfBlink = Math.round(ILLUSTRATION.blink * 0.045);
    blinkS.value = withRepeat(
      withSequence(
        withTiming(1,    { duration: openDur,   easing: Easing.linear }),
        withTiming(0.08, { duration: halfBlink, easing: EASING_WORKLET.enter }),
        withTiming(1,    { duration: halfBlink, easing: EASING_WORKLET.enter }),
      ),
      -1, false,
    );

    // Sympathetic sway — non-acting arm: ±2.4° upper, forearm +4→−3°
    // Forearm starts at -3 (phase-shifted) to separate visually from upper arm
    const swayHalf = Math.round(BEHAVIOUR.period.sway / 2);
    swayArm.value = withRepeat(
      withTiming(2.4, { duration: swayHalf, easing: SIN }),
      -1, true,
    );
    swayFore.value = withRepeat(
      withTiming(4, { duration: swayHalf, easing: SIN }),
      -1, true,
    );
  }

  function stop() {
    cancelAnimation(breathX);  breathX.value  = 1;
    cancelAnimation(breathY);  breathY.value  = 1;
    cancelAnimation(nodY);     nodY.value     = 0;
    cancelAnimation(nodR);     nodR.value     = 0;
    cancelAnimation(blinkS);   blinkS.value   = 1;
    cancelAnimation(swayArm);  swayArm.value  = 0;
    cancelAnimation(swayFore); swayFore.value = 0;
  }

  return { breathX, breathY, nodY, nodR, blinkS, swayArm, swayFore, start, stop };
}
