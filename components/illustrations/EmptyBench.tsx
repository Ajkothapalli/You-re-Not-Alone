/**
 * EmptyBench — "Nothing here yet."
 * My Confessions empty state and Error/offline still.
 *
 * Scene: Character A on a park bench, notebook closed, one floating leaf.
 * Five clocks: breathe (chest 5.2s), nod (head 7.0s), blink (eyes 6.1s),
 * sway (shrub 6.4s), leaf (13.0s falling loop).
 *
 * Ported 1:1 from docs/design/illustration.md §7.1.
 */

import React, { useCallback } from 'react';
import { ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
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

// ─── Geometry constants ────────────────────────────────────────────────────────
// Chest origin: bottom-centre of torso (200, 194)
const CX = 200, CY_CHEST = 194;
// Head origin: neck (200, 128) — the nod pivots here
const CY_NECK = 128;
// Head centre: (200, 112)
const CY_HEAD = 112;
// Shrub origin: base of bush (approximately 330, 244)
const CX_SWAY = 330, CY_SWAY = 244;
// Leaf origin (absolute): (300, 64). Folded into leafProps' own transform
// string below rather than a separate static `transform` prop on the same
// <AnimatedG> — see the leafProps comment for why that combination is broken.
const LEAF_X = 300, LEAF_Y = 64;
// Eye centres: (194, 114) and (206, 114) — midpoint (200, 114)
const CY_EYES = 114;

// ─── Designed still positions (reduced motion) ────────────────────────────────
// §6: leaf mid-fall translate(−12,52) rotate(−22°); steam faint; breathing gone.
const LEAF_STILL = 'translate(-12, 52) rotate(-22)';

// ─── Still component ──────────────────────────────────────────────────────────

function EmptyBenchStill({ style }: { style?: ViewStyle }) {
  return (
    <Svg viewBox="0 0 400 300" width="100%" preserveAspectRatio="xMidYMid meet" style={style}>
      {/* Lamp post */}
      <G {...STROKE.ink}><Path d="M78 244V88" /></G>
      <Rect fill={ILL_COLOR.sand} x="68" y="72" width="20" height="16" rx="3" transform="translate(3,2)" />
      <G {...STROKE.ink}><Rect x="68" y="72" width="20" height="16" rx="3" /></G>

      {/* Ground line */}
      <G {...STROKE.ink}><Path d="M36 244H364" /></G>
      <G {...STROKE.ink2}><Path d="M110 244l3-8M118 244l1-6" /></G>

      {/* Shrub (at still position — no sway applied) */}
      <Path fill={ILL_COLOR.sage} d="M298 244C294 226 306 212 318 217C322 204 344 204 346 219C358 217 364 234 352 244Z" transform="translate(-2.6,2.4)" stroke="none" />
      <G {...STROKE.ink}><Path d="M298 244C294 226 306 212 318 217C322 204 344 204 346 219C358 217 364 234 352 244Z" /></G>

      {/* Bench seat top */}
      <Rect fill={ILL_COLOR.sand} x="110" y="150" width="180" height="8" rx="4" transform="translate(2.2,-2.6)" stroke="none" />
      <G {...STROKE.ink}><Rect x="110" y="150" width="180" height="8" rx="4" /><Path d="M130 158V190M270 158V190" /></G>

      {/* Bench seat bottom */}
      <Rect fill={ILL_COLOR.sand} x="110" y="190" width="180" height="10" rx="5" transform="translate(-2.6,2.4)" stroke="none" />
      <G {...STROKE.ink}><Rect x="110" y="190" width="180" height="10" rx="5" /><Path d="M130 200V244M270 200V244" /></G>

      {/* Legs */}
      <G {...STROKE.ink}><Path d="M192 194L184 208V240M208 194L216 208V240" strokeWidth={11} /></G>
      <G stroke={ILL_COLOR.dusk} strokeWidth={7.4} strokeLinecap="round" strokeLinejoin="round" fill="none"><Path d="M192 194L184 208V240M208 194L216 208V240" /></G>

      {/* Shoes */}
      <G {...STROKE.ink}><Path d="M176 243h12M212 243h12" strokeWidth={7} /></G>

      {/* Chest group — at rest */}
      <Path fill={ILL_COLOR.coral} d="M180 142C180 134 220 134 220 142L216 194C216 199 184 199 184 194Z" transform="translate(3,2)" stroke="none" />
      <G {...STROKE.ink}><Path d="M180 142C180 134 220 134 220 142L216 194C216 199 184 199 184 194Z" /></G>
      <Path d="M180 142C180 134 220 134 220 142L216 194C216 199 184 199 184 194Z" {...STROKE.press} transform="translate(1,1.1)" />
      {/* Neck */}
      <G {...STROKE.ink}><Path d="M200 128V140" strokeWidth={10} /></G>
      <G stroke={ILL_COLOR.skinMd} strokeWidth={6.4} strokeLinecap="round" fill="none"><Path d="M200 128V140" /></G>
      {/* Notebook */}
      <Rect fill={ILL_COLOR.sage} x="184" y="178" width="32" height="10" rx="2" transform="translate(2.2,-2.6)" stroke="none" />
      <G {...STROKE.ink}><Rect x="184" y="178" width="32" height="10" rx="2" /></G>
      <G {...STROKE.ink2}><Path d="M190 183h20" /></G>
      {/* Arms */}
      <G {...STROKE.ink}><Path d="M183 148L190 182M217 148L210 182" strokeWidth={8.5} /></G>
      <G stroke={ILL_COLOR.coral} strokeWidth={4.9} strokeLinecap="round" fill="none"><Path d="M183 148L190 182M217 148L210 182" /></G>
      {/* Hands */}
      <Ellipse fill={ILL_COLOR.skinMd} cx={193} cy={186} rx={4.5} ry={3.6} stroke="none" />
      <Ellipse fill={ILL_COLOR.skinMd} cx={213} cy={186} rx={4.5} ry={3.6} stroke="none" />
      <G {...STROKE.ink2}><Ellipse cx={190} cy={184} rx={4.5} ry={3.6} /><Ellipse cx={210} cy={184} rx={4.5} ry={3.6} /></G>

      {/* Head group — at rest */}
      <Circle fill={ILL_COLOR.skinMd} cx={203} cy={114} r={16} stroke="none" />
      <G {...STROKE.ink}><Circle cx={200} cy={112} r={16} /></G>
      <Circle cx={200} cy={112} r={16} {...STROKE.press} transform="translate(1,1.1)" />
      {/* Hair */}
      <Path fill={ILL_COLOR.ink} d="M184 108C182 96 190 90 196 94C200 88 210 90 212 96C218 94 220 104 216 110C212 102 204 100 200 102C196 98 188 100 184 108Z" transform="translate(-2.6,2.4)" stroke="none" />
      <G {...STROKE.ink}><Path d="M184 108C182 96 190 90 196 94C200 88 210 90 212 96C218 94 220 104 216 110C212 102 204 100 200 102C196 98 188 100 184 108Z" /></G>
      {/* Face */}
      <G {...STROKE.ink2}><Path d="M190 107l7-1M203 106l7 1M196 121q4 2 8 0" /></G>
      {/* Eyes — open (no blink in still) */}
      <Circle fill={ILL_COLOR.ink} cx={194} cy={114} r={1.8} stroke="none" />
      <Circle fill={ILL_COLOR.ink} cx={206} cy={114} r={1.8} stroke="none" />

      {/* Leaf — mid-fall still pose */}
      <G transform={`translate(300, 64) ${LEAF_STILL}`}>
        <Path fill={ILL_COLOR.sage} d="M0 0C6-9 18-9 20 0C18 9 6 9 0 0Z" transform="translate(3,2)" stroke="none" />
        <G {...STROKE.ink2}><Path d="M0 0C6-9 18-9 20 0C18 9 6 9 0 0Z" /><Path d="M3 0H17" /></G>
      </G>
    </Svg>
  );
}

// ─── Animated component ───────────────────────────────────────────────────────

function EmptyBenchAnimated({ style, isActive = true }: { style?: ViewStyle; isActive?: boolean }) {
  // §2 always-on layer (breathe, nod, blink, sympathetic sway)
  const idle = useIdleLayer({ alternate: false });

  // Scenery-specific shared values (shrub sway, leaf fall)
  const swayR  = useSharedValue(0);
  const leafX  = useSharedValue(0);
  const leafY  = useSharedValue(0);
  const leafR  = useSharedValue(0);
  const leafOp = useSharedValue(0);

  const chestProps = useAnimatedProps(() => {
    'worklet';
    const sx = idle.breathX.value, sy = idle.breathY.value;
    return {
      transform: `translate(${CX},${CY_CHEST}) scale(${sx},${sy}) translate(-${CX},-${CY_CHEST})`,
    };
  });

  // NOTE — rotate() is deliberately not used in any transform string below.
  // react-native-svg's native <G>/<Ellipse> transform prop expects a raw SVG
  // transform string (unitless rotate, e.g. "rotate(5)"), but Reanimated 4's
  // useAnimatedProps forces every "transform" update through its own
  // CSS-style processor (updateProps.ts — unconditional for isAnimatedProps),
  // which requires a unit suffix ("5deg") or throws "invalidTransform". Once
  // suffixed, the string round-trips back out with that "deg" suffix intact,
  // which react-native-svg's native PEG parser then rejects as invalid SVG
  // syntax ("Expected ... but 'd' found'). There is no rotate() string that
  // survives both parsers in this react-native-reanimated + react-native-svg
  // version combination, so rotation-based motion here is approximated with
  // translate/scale instead — this is what fixed the welcome-screen crash.
  const headProps = useAnimatedProps(() => {
    'worklet';
    const ty = idle.nodY.value;
    return {
      transform: `translate(0,${ty})`,
    };
  });

  const blinkProps = useAnimatedProps(() => {
    'worklet';
    const s = idle.blinkS.value;
    return {
      transform: `translate(${CX},${CY_EYES}) scale(1,${s}) translate(-${CX},-${CY_EYES})`,
    };
  });

  const swayProps = useAnimatedProps(() => {
    'worklet';
    // Was a ±1.6° rotate around the shrub base; substituted with an
    // equally subtle horizontal scale pulse to keep a "breeze" feel.
    return {
      transform: `translate(${CX_SWAY},${CY_SWAY}) scale(${1 + swayR.value / 80},1) translate(-${CX_SWAY},-${CY_SWAY})`,
    };
  });

  // Root cause of the "leaf disconnected near the top-left" bug: this used to
  // return only `translate(${x},${y})` (the animated drift), while the JSX
  // below carried a SEPARATE static `transform="translate(300, 64)"` prop on
  // the same <AnimatedG> to place the leaf at its absolute scene position —
  // unlike every other animated group in this file, the leaf's own path data
  // is authored in LOCAL coordinates near (0,0), so it has no baked-in
  // absolute position of its own and depends entirely on an external offset.
  // Reanimated's `animatedProps` fully owns the native `transform` value for
  // any key it returns: once the worklet starts running (immediately on
  // mount), its `translate(x,y)` — with leafX/leafY both starting at 0 —
  // overwrites the static "translate(300, 64)" outright rather than composing
  // with it. The leaf rendered at the SVG's literal (0,0) origin plus its
  // small ±20/0–196 drift, i.e. pinned near the top-left of the whole scene,
  // regardless of any outer sizing fix. Folding the fixed origin into this
  // same transform string (the only thing driving the prop) fixes it for good.
  const leafProps = useAnimatedProps(() => {
    'worklet';
    const x = LEAF_X + leafX.value, y = LEAF_Y + leafY.value;
    return {
      opacity:   leafOp.value,
      transform: `translate(${x},${y})`,
    };
  });

  function startScenery() {
    const HALF = (ms: number) => Math.round(ms / 2);

    // Sway — shrub rotates ±1.6° from base (330, 244), 6.4s period
    swayR.value = withRepeat(withTiming(1.6, { duration: HALF(ILLUSTRATION.sway), easing: EASING_WORKLET.breathe }), -1, true);

    // Leaf — 13s fall with two drifts and slow turn, fades at both ends
    const T = ILLUSTRATION.leaf;
    const fadeIn  = Math.round(T * 0.10);
    const hold    = Math.round(T * 0.72);
    const fadeOut = T - fadeIn - hold;
    leafX.value  = withDelay(0, withRepeat(withSequence(
      withTiming(-20, { duration: Math.round(T * 0.45), easing: EASING_WORKLET.breathe }),
      withTiming(+12, { duration: Math.round(T * 0.45), easing: EASING_WORKLET.breathe }),
      withTiming(0,   { duration: Math.round(T * 0.10), easing: EASING_WORKLET.breathe }),
    ), -1, false));
    leafY.value  = withRepeat(withTiming(196, { duration: T, easing: Easing.linear }), -1, false);
    leafR.value  = withRepeat(withTiming(-30, { duration: T, easing: Easing.linear }), -1, false);
    leafOp.value = withRepeat(withSequence(
      withTiming(1, { duration: fadeIn }),
      withTiming(1, { duration: hold }),
      withTiming(0, { duration: fadeOut }),
    ), -1, false);
  }

  function stopScenery() {
    cancelAnimation(swayR);  swayR.value  = 0;
    cancelAnimation(leafX);  leafX.value  = 0;
    cancelAnimation(leafY);  leafY.value  = 0;
    cancelAnimation(leafR);  leafR.value  = 0;
    cancelAnimation(leafOp); leafOp.value = 0;
  }

  // Gated on isActive (not just screen focus): useFocusEffect alone fires
  // when the *screen* (e.g. the welcome onboarding route) is focused, not
  // when this particular slide is the one currently on screen. On a
  // multi-slide horizontal pager every slide mounts at once, so without this
  // gate the leaf-fall/breathe/blink loops kept running full-tilt for a
  // slide the user had already swiped away from, burning UI-thread time
  // during the pan gesture on the slide actually being dragged. Passing
  // isActive={false} for an off-screen slide tears the loops down; the
  // default (true) preserves prior behaviour for callers with no concept of
  // "which slide" — you.tsx is the only mount site and is always the whole
  // screen, so the default (true) is always correct there.
  useFocusEffect(useCallback(() => {
    if (!isActive) return;
    idle.start();
    startScenery();
    return () => {
      idle.stop();
      stopScenery();
    };
  }, [isActive]));

  return (
    <Svg viewBox="0 0 400 300" width="100%" preserveAspectRatio="xMidYMid meet" style={style}>
      {/* Lamp post */}
      <G {...STROKE.ink}><Path d="M78 244V88" /></G>
      <Rect fill={ILL_COLOR.sand} x="68" y="72" width="20" height="16" rx="3" transform="translate(3,2)" stroke="none" />
      <G {...STROKE.ink}><Rect x="68" y="72" width="20" height="16" rx="3" /></G>

      {/* Ground line + grass strokes */}
      <G {...STROKE.ink}><Path d="M36 244H364" /></G>
      <G {...STROKE.ink2}><Path d="M110 244l3-8M118 244l1-6" /></G>

      {/* Shrub — sway clock */}
      <AnimatedG animatedProps={swayProps}>
        <Path fill={ILL_COLOR.sage} d="M298 244C294 226 306 212 318 217C322 204 344 204 346 219C358 217 364 234 352 244Z" transform="translate(-2.6,2.4)" stroke="none" />
        <G {...STROKE.ink}><Path d="M298 244C294 226 306 212 318 217C322 204 344 204 346 219C358 217 364 234 352 244Z" /></G>
      </AnimatedG>

      {/* Bench seat top */}
      <Rect fill={ILL_COLOR.sand} x="110" y="150" width="180" height="8" rx="4" transform="translate(2.2,-2.6)" stroke="none" />
      <G {...STROKE.ink}><Rect x="110" y="150" width="180" height="8" rx="4" /><Path d="M130 158V190M270 158V190" /></G>

      {/* Bench seat bottom */}
      <Rect fill={ILL_COLOR.sand} x="110" y="190" width="180" height="10" rx="5" transform="translate(-2.6,2.4)" stroke="none" />
      <G {...STROKE.ink}><Rect x="110" y="190" width="180" height="10" rx="5" /><Path d="M130 200V244M270 200V244" /></G>

      {/* Legs */}
      <G {...STROKE.ink}><Path d="M192 194L184 208V240M208 194L216 208V240" strokeWidth={11} /></G>
      <G stroke={ILL_COLOR.dusk} strokeWidth={7.4} strokeLinecap="round" strokeLinejoin="round" fill="none"><Path d="M192 194L184 208V240M208 194L216 208V240" /></G>

      {/* Shoes */}
      <G {...STROKE.ink}><Path d="M176 243h12M212 243h12" strokeWidth={7} /></G>

      {/* Chest — breathe clock */}
      <AnimatedG animatedProps={chestProps}>
        <Path fill={ILL_COLOR.coral} d="M180 142C180 134 220 134 220 142L216 194C216 199 184 199 184 194Z" transform="translate(3,2)" stroke="none" />
        <G {...STROKE.ink}><Path d="M180 142C180 134 220 134 220 142L216 194C216 199 184 199 184 194Z" /></G>
        <Path d="M180 142C180 134 220 134 220 142L216 194C216 199 184 199 184 194Z" {...STROKE.press} transform="translate(1,1.1)" />
        {/* Neck */}
        <G {...STROKE.ink}><Path d="M200 128V140" strokeWidth={10} /></G>
        <G stroke={ILL_COLOR.skinMd} strokeWidth={6.4} strokeLinecap="round" fill="none"><Path d="M200 128V140" /></G>
        {/* Notebook */}
        <Rect fill={ILL_COLOR.sage} x="184" y="178" width="32" height="10" rx="2" transform="translate(2.2,-2.6)" stroke="none" />
        <G {...STROKE.ink}><Rect x="184" y="178" width="32" height="10" rx="2" /></G>
        <G {...STROKE.ink2}><Path d="M190 183h20" /></G>
        {/* Arms */}
        <G {...STROKE.ink}><Path d="M183 148L190 182M217 148L210 182" strokeWidth={8.5} /></G>
        <G stroke={ILL_COLOR.coral} strokeWidth={4.9} strokeLinecap="round" fill="none"><Path d="M183 148L190 182M217 148L210 182" /></G>
        {/* Hands */}
        <Ellipse fill={ILL_COLOR.skinMd} cx={193} cy={186} rx={4.5} ry={3.6} stroke="none" />
        <Ellipse fill={ILL_COLOR.skinMd} cx={213} cy={186} rx={4.5} ry={3.6} stroke="none" />
        <G {...STROKE.ink2}><Ellipse cx={190} cy={184} rx={4.5} ry={3.6} /><Ellipse cx={210} cy={184} rx={4.5} ry={3.6} /></G>
      </AnimatedG>

      {/* Head — nod clock */}
      <AnimatedG animatedProps={headProps}>
        <Circle fill={ILL_COLOR.skinMd} cx={203} cy={114} r={16} stroke="none" />
        <G {...STROKE.ink}><Circle cx={200} cy={112} r={16} /></G>
        <Circle cx={200} cy={112} r={16} {...STROKE.press} transform="translate(1,1.1)" />
        {/* Hair */}
        <Path fill={ILL_COLOR.ink} d="M184 108C182 96 190 90 196 94C200 88 210 90 212 96C218 94 220 104 216 110C212 102 204 100 200 102C196 98 188 100 184 108Z" transform="translate(-2.6,2.4)" stroke="none" />
        <G {...STROKE.ink}><Path d="M184 108C182 96 190 90 196 94C200 88 210 90 212 96C218 94 220 104 216 110C212 102 204 100 200 102C196 98 188 100 184 108Z" /></G>
        {/* Brows + mouth */}
        <G {...STROKE.ink2}><Path d="M190 107l7-1M203 106l7 1M196 121q4 2 8 0" /></G>
        {/* Eyes — blink clock */}
        <AnimatedG animatedProps={blinkProps}>
          <Circle fill={ILL_COLOR.ink} cx={194} cy={114} r={1.8} stroke="none" />
          <Circle fill={ILL_COLOR.ink} cx={206} cy={114} r={1.8} stroke="none" />
        </AnimatedG>
      </AnimatedG>

      {/* Leaf — falling clock. animatedProps.transform above carries BOTH the
          absolute origin and the animated drift in one string — no separate
          static `transform` prop here, see the leafProps comment. */}
      <AnimatedG animatedProps={leafProps}>
        <Path fill={ILL_COLOR.sage} d="M0 0C6-9 18-9 20 0C18 9 6 9 0 0Z" transform="translate(3,2)" stroke="none" />
        <G {...STROKE.ink2}><Path d="M0 0C6-9 18-9 20 0C18 9 6 9 0 0Z" /><Path d="M3 0H17" /></G>
      </AnimatedG>
    </Svg>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function EmptyBench({ style, isActive = true }: { style?: ViewStyle; isActive?: boolean }) {
  const reduceMotion = useReducedMotion();
  return reduceMotion
    ? <EmptyBenchStill style={style} />
    : <EmptyBenchAnimated style={style} isActive={isActive} />;
}
