/**
 * Threshold — "The Doorway."
 * Onboarding beat 0 hero illustration (app/welcome.tsx, "Welcome" — the
 * app's first impression, setting up "say the things you can't say out
 * loud, and meet the one person who felt the same").
 *
 * Scene: Character A stands at ease in the foreground. To their right, an
 * open archway glows warm — and standing inside that glow, at a distance,
 * a second, unresolved silhouette waits too. Two people about to open up
 * to a stranger who'll understand, not the solitary "waiting" mood of
 * EmptyBench's park bench (which stays reserved for the My Confessions
 * empty state per its own file header).
 *
 * The distant silhouette is a flat ink shape with no face or clock of its
 * own — like Sanctuary's moon, a static prop, not a second breathing
 * figure — so this scene stays a single-clock construction: breathe
 * (chest 5.2s), nod (head 7.0s), blink (eyes 6.1s), all via useIdleLayer's
 * §2 always-on layer (motion-behaviours.md — standing figures in phase-1
 * scenes get the idle layer only, same as Release.tsx; no §3 behaviour).
 *
 * Construction: A's standing proportions (chest/neck/legs/head) are ported
 * 1:1 from Release.tsx's own standing figure (chest 126–180, head centre
 * (200,96)), recoloured to A's palette (coral top, dusk trousers, skinMd,
 * A's own hair silhouette shifted from its usual seated head-centre-112 to
 * head-centre-96 per docs/design/illustration.md §3's "shift y for other
 * heads" note) and given calm resting arms instead of Release's reaching
 * ones. The whole figure is authored at its usual x=200-centred position,
 * then repositioned with ONE static, non-animated `<G transform=
 * "translate(-60,0)">` wrapping it — the animated sub-groups (chest, head)
 * are nested children of that G, not the same element, so this does not
 * hit the EmptyBench leaf bug (a static `transform` prop and `animatedProps`
 * both resolving `transform` on the SAME element): parent-static +
 * child-animated composes correctly in SVG, it's only sibling/same-element
 * static+animated that silently discards the static half.
 */

import React, { useCallback } from 'react';
import { ViewStyle } from 'react-native';
import Animated, {
  useAnimatedProps,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
} from 'react-native-reanimated';
import { Svg, G, Path, Circle, Ellipse } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';

import { useReducedMotion } from '@/lib/a11y';
import { ILL_COLOR, STROKE } from '@/theme/illustration';
import { useIdleLayer } from '@/components/illustrations/behaviours';

const AnimatedG = Animated.createAnimatedComponent(G);

// ─── Geometry constants ────────────────────────────────────────────────────────
// Standing chest origin (bottom-centre): (200, 180) — Release.tsx's own
// standing-torso convention.
const CX = 200, CY_CHEST = 180;
// Head centre for a standing pose: (200, 96) (Release.tsx). Eyes: (194/206, 98).
const CY_EYES = 98;
// The whole standing figure is authored centred on x=200, then shifted left
// with one static wrapping <G>, clear of the doorway on the right.
const FIGURE_SHIFT = -60;

// ─── Shared path data ──────────────────────────────────────────────────────────
// A's hair silhouette, shifted from its usual seated head-centre-112 anchor to
// this scene's standing head-centre-96 (dy = -16, x unchanged) — see the file
// header note and docs/design/illustration.md §3.
const HAIR_D = 'M184 92C182 80 190 74 196 78C200 72 210 74 212 80C218 78 220 88 216 94C212 86 204 84 200 86C196 82 188 84 184 92Z';
// "Waiting" expression (A), same dy=-16 shift applied to the brows/mouth.
const FACE_D  = 'M190 91l7-1M203 90l7 1M196 105q4 2 8 0';
// The open archway — a rounded doorway, 90 wide, ground to y=64.
const ARCH_D  = 'M255 244V130Q255 64 300 64Q345 64 345 130V244Z';
// The distant figure waiting inside the archway's light — a flat silhouette,
// no face, no clock of its own (a static prop, like Sanctuary's moon).
const DISTANT_D = 'M287 196Q300 190 313 196L317 244H283Z';

// ─── Still component (reduced motion) ─────────────────────────────────────────

function ThresholdStill({ style }: { style?: ViewStyle }) {
  return (
    <Svg viewBox="0 0 400 300" width="100%" preserveAspectRatio="xMidYMid meet" style={style}>
      {/* Ground */}
      <G {...STROKE.ink}><Path d="M36 244H364" /></G>
      <G {...STROKE.ink2}><Path d="M96 244l3-8M104 244l1-6M318 244l3-8M326 244l1-6" /></G>

      {/* Archway — environment object, warm sand glow (matches EmptyBench's
          lamp-glass convention: a light source is `sand`, not yellow — yellow
          is reserved for the confession scrap itself, per Release/Resonance). */}
      <Path fill={ILL_COLOR.sand} d={ARCH_D} transform="translate(3,2)" stroke="none" />
      <G {...STROKE.ink}><Path d={ARCH_D} /></G>

      {/* The one waiting on the other side */}
      <Path fill={ILL_COLOR.ink} d={DISTANT_D} stroke="none" />
      <Circle fill={ILL_COLOR.ink} cx={300} cy={188} r={7} stroke="none" />

      {/* Character A — standing at rest */}
      <G transform={`translate(${FIGURE_SHIFT},0)`}>
        {/* Legs */}
        <G {...STROKE.ink}><Path d="M193 178V240M207 178V240" strokeWidth={11} /></G>
        <G stroke={ILL_COLOR.dusk} strokeWidth={7.4} strokeLinecap="round" fill="none"><Path d="M193 178V240M207 178V240" /></G>
        <G {...STROKE.ink}><Path d="M186 243h12M202 243h12" strokeWidth={7} /></G>

        {/* Chest — at rest */}
        <Path fill={ILL_COLOR.coral} d="M180 126C180 118 220 118 220 126L216 180C216 185 184 185 184 180Z" transform="translate(3,2)" stroke="none" />
        <G {...STROKE.ink}><Path d="M180 126C180 118 220 118 220 126L216 180C216 185 184 185 184 180Z" /></G>
        <Path d="M180 126C180 118 220 118 220 126L216 180C216 185 184 185 184 180Z" {...STROKE.press} transform="translate(1,1.1)" />
        {/* Neck */}
        <G {...STROKE.ink}><Path d="M200 112V124" strokeWidth={10} /></G>
        <G stroke={ILL_COLOR.skinMd} strokeWidth={6.4} strokeLinecap="round" fill="none"><Path d="M200 112V124" /></G>
        {/* Arms — relaxed at sides */}
        <G {...STROKE.ink}><Path d="M183 132L178 172M217 132L222 172" strokeWidth={8.5} /></G>
        <G stroke={ILL_COLOR.coral} strokeWidth={4.9} strokeLinecap="round" fill="none"><Path d="M183 132L178 172M217 132L222 172" /></G>
        <Ellipse fill={ILL_COLOR.skinMd} cx={181} cy={174} rx={4.5} ry={3.6} stroke="none" />
        <Ellipse fill={ILL_COLOR.skinMd} cx={225} cy={174} rx={4.5} ry={3.6} stroke="none" />
        <G {...STROKE.ink2}><Ellipse cx={178} cy={172} rx={4.5} ry={3.6} /><Ellipse cx={222} cy={172} rx={4.5} ry={3.6} /></G>

        {/* Head — at rest */}
        <Circle fill={ILL_COLOR.skinMd} cx={203} cy={98} r={16} stroke="none" />
        <G {...STROKE.ink}><Circle cx={200} cy={96} r={16} /></G>
        <Circle cx={200} cy={96} r={16} {...STROKE.press} transform="translate(1,1.1)" />
        <Path fill={ILL_COLOR.ink} d={HAIR_D} transform="translate(-2.6,2.4)" stroke="none" />
        <G {...STROKE.ink}><Path d={HAIR_D} /></G>
        <G {...STROKE.ink2}><Path d={FACE_D} /></G>
        {/* Eyes — open (no blink in still) */}
        <Circle fill={ILL_COLOR.ink} cx={194} cy={98} r={1.8} stroke="none" />
        <Circle fill={ILL_COLOR.ink} cx={206} cy={98} r={1.8} stroke="none" />
      </G>
    </Svg>
  );
}

// ─── Animated component ───────────────────────────────────────────────────────

function ThresholdAnimated({ style, isActive = true }: { style?: ViewStyle; isActive?: boolean }) {
  // §2 always-on layer only — standing figure in a phase-1 scene, same
  // treatment as Release.tsx's own standing chest/head clocks.
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

  useFocusEffect(useCallback(() => {
    if (!isActive) return;
    idle.start();
    return () => { idle.stop(); };
  }, [isActive]));

  return (
    <Svg viewBox="0 0 400 300" width="100%" preserveAspectRatio="xMidYMid meet" style={style}>
      {/* Ground */}
      <G {...STROKE.ink}><Path d="M36 244H364" /></G>
      <G {...STROKE.ink2}><Path d="M96 244l3-8M104 244l1-6M318 244l3-8M326 244l1-6" /></G>

      {/* Archway — static prop */}
      <Path fill={ILL_COLOR.sand} d={ARCH_D} transform="translate(3,2)" stroke="none" />
      <G {...STROKE.ink}><Path d={ARCH_D} /></G>

      {/* The one waiting on the other side — static prop, no clock */}
      <Path fill={ILL_COLOR.ink} d={DISTANT_D} stroke="none" />
      <Circle fill={ILL_COLOR.ink} cx={300} cy={188} r={7} stroke="none" />

      {/* Character A — static positioning wrapper (see file header: this G
          carries ONLY the fixed placement translate, never an animatedProps
          transform, so nesting AnimatedG children below is safe). */}
      <G transform={`translate(${FIGURE_SHIFT},0)`}>
        {/* Legs */}
        <G {...STROKE.ink}><Path d="M193 178V240M207 178V240" strokeWidth={11} /></G>
        <G stroke={ILL_COLOR.dusk} strokeWidth={7.4} strokeLinecap="round" fill="none"><Path d="M193 178V240M207 178V240" /></G>
        <G {...STROKE.ink}><Path d="M186 243h12M202 243h12" strokeWidth={7} /></G>

        {/* Chest — breathe clock */}
        <AnimatedG animatedProps={chestProps}>
          <Path fill={ILL_COLOR.coral} d="M180 126C180 118 220 118 220 126L216 180C216 185 184 185 184 180Z" transform="translate(3,2)" stroke="none" />
          <G {...STROKE.ink}><Path d="M180 126C180 118 220 118 220 126L216 180C216 185 184 185 184 180Z" /></G>
          <Path d="M180 126C180 118 220 118 220 126L216 180C216 185 184 185 184 180Z" {...STROKE.press} transform="translate(1,1.1)" />
          {/* Neck */}
          <G {...STROKE.ink}><Path d="M200 112V124" strokeWidth={10} /></G>
          <G stroke={ILL_COLOR.skinMd} strokeWidth={6.4} strokeLinecap="round" fill="none"><Path d="M200 112V124" /></G>
          {/* Arms — relaxed at sides */}
          <G {...STROKE.ink}><Path d="M183 132L178 172M217 132L222 172" strokeWidth={8.5} /></G>
          <G stroke={ILL_COLOR.coral} strokeWidth={4.9} strokeLinecap="round" fill="none"><Path d="M183 132L178 172M217 132L222 172" /></G>
          <Ellipse fill={ILL_COLOR.skinMd} cx={181} cy={174} rx={4.5} ry={3.6} stroke="none" />
          <Ellipse fill={ILL_COLOR.skinMd} cx={225} cy={174} rx={4.5} ry={3.6} stroke="none" />
          <G {...STROKE.ink2}><Ellipse cx={178} cy={172} rx={4.5} ry={3.6} /><Ellipse cx={222} cy={172} rx={4.5} ry={3.6} /></G>
        </AnimatedG>

        {/* Head — nod clock */}
        <AnimatedG animatedProps={headProps}>
          <Circle fill={ILL_COLOR.skinMd} cx={203} cy={98} r={16} stroke="none" />
          <G {...STROKE.ink}><Circle cx={200} cy={96} r={16} /></G>
          <Circle cx={200} cy={96} r={16} {...STROKE.press} transform="translate(1,1.1)" />
          <Path fill={ILL_COLOR.ink} d={HAIR_D} transform="translate(-2.6,2.4)" stroke="none" />
          <G {...STROKE.ink}><Path d={HAIR_D} /></G>
          <G {...STROKE.ink2}><Path d={FACE_D} /></G>
          {/* Eyes — blink clock */}
          <AnimatedG animatedProps={blinkProps}>
            <Circle fill={ILL_COLOR.ink} cx={194} cy={98} r={1.8} stroke="none" />
            <Circle fill={ILL_COLOR.ink} cx={206} cy={98} r={1.8} stroke="none" />
          </AnimatedG>
        </AnimatedG>
      </G>
    </Svg>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function Threshold({ style, isActive = true }: { style?: ViewStyle; isActive?: boolean }) {
  const reduceMotion = useReducedMotion();
  return reduceMotion
    ? <ThresholdStill style={style} />
    : <ThresholdAnimated style={style} isActive={isActive} />;
}
