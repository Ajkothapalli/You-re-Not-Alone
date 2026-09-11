/**
 * Sanctuary — "nothing here can reach you."
 * Onboarding beat 2 ("You're safe here") hero illustration.
 *
 * Scene: Character A cross-legged, wrapped to the chin in a large soft
 * blanket/cloak — only the face and two hands (holding the blanket closed)
 * visible. A small moon rests in the upper corner (the one environment
 * object, per §1 of docs/design/illustration.md). Communicates "wrapped up,
 * protected, anonymous, nothing can get in" without a shield/lock glyph.
 *
 * Three clocks, all §2 always-on layer (this is a seated scene — no §3
 * behaviour per motion-behaviours.md §4 "Seated scenes keep the §2 layer
 * only"): breathe (blanket, chest-equivalent, 5.2s), nod (head, 7.0s),
 * blink (eyes, 6.1s). The moon does not move — a static prop, like
 * EmptyBench's lamp post.
 *
 * Built for docs/design/illustration.md's construction rules: 400×300
 * viewBox, ground at y=244, head r16 at (200,112) with A's established hair
 * silhouette and skinMd tone, neck 10/6.4 tube, hands rx4.5/ry3.6 ellipses.
 * ILL_COLOR only.
 */

import React, { useCallback } from 'react';
import { ViewStyle } from 'react-native';
import Animated, {
  useAnimatedProps,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { Svg, G, Path, Circle, Ellipse } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';

import { useReducedMotion } from '@/lib/a11y';
import { ILL_COLOR, STROKE } from '@/theme/illustration';
import { useIdleLayer } from '@/components/illustrations/behaviours';

const AnimatedG = Animated.createAnimatedComponent(G);

// ─── Geometry constants ────────────────────────────────────────────────────────
// Blanket origin (bottom-centre, the "chest" equivalent for this scene): the
// whole cloak breathes as one shape, same as a torso group in the other scenes.
const CX = 200, CY_CHEST = 240;
// Head origin: neck (200, 128) — the nod pivots here. Head centre (200, 112).
const CY_EYES = 114;

// ─── Shared path data ──────────────────────────────────────────────────────────
const HAIR_D = 'M184 108C182 96 190 90 196 94C200 88 210 90 212 96C218 94 220 104 216 110C212 102 204 100 200 102C196 98 188 100 184 108Z';
// Blanket/cloak: a soft dome from the ground up to shoulder width at the collar.
const BLANKET_D = 'M150 242C140 200 160 150 182 140C190 136 210 136 218 140C240 150 260 200 250 242Z';

// ─── Still component (reduced motion) ─────────────────────────────────────────

function SanctuaryStill({ style }: { style?: ViewStyle }) {
  return (
    <Svg viewBox="0 0 400 300" width="100%" preserveAspectRatio="xMidYMid meet" style={style}>
      {/* Ground */}
      <G {...STROKE.ink}><Path d="M36 244H364" /></G>
      <G {...STROKE.ink2}><Path d="M110 244l3-8M118 244l1-6" /></G>

      {/* Moon — the one environment object, upper-right, static */}
      <Circle fill={ILL_COLOR.sand} cx={330} cy={58} r={13} stroke="none" />
      <G {...STROKE.ink}><Circle cx={330} cy={58} r={13} /></G>
      <G {...STROKE.ink2}><Path d="M325 48q8 10 0 20" /></G>

      {/* Blanket — at rest, no breathing */}
      <Path fill={ILL_COLOR.sage} d={BLANKET_D} transform="translate(-2.6,2.4)" stroke="none" />
      <G {...STROKE.ink}><Path d={BLANKET_D} /></G>
      <Path d={BLANKET_D} {...STROKE.press} transform="translate(1,1.1)" />
      {/* Collar gather */}
      <G {...STROKE.ink2}><Path d="M186 142Q200 150 214 142" /></G>
      {/* Neck */}
      <G {...STROKE.ink}><Path d="M200 128V140" strokeWidth={10} /></G>
      <G stroke={ILL_COLOR.skinMd} strokeWidth={6.4} strokeLinecap="round" fill="none"><Path d="M200 128V140" /></G>
      {/* Hands holding the blanket closed, right at the collar */}
      <Ellipse fill={ILL_COLOR.skinMd} cx={196} cy={162} rx={4.5} ry={3.6} stroke="none" />
      <Ellipse fill={ILL_COLOR.skinMd} cx={207} cy={162} rx={4.5} ry={3.6} stroke="none" />
      <G {...STROKE.ink2}><Ellipse cx={193} cy={160} rx={4.5} ry={3.6} /><Ellipse cx={204} cy={160} rx={4.5} ry={3.6} /></G>

      {/* Head — at rest */}
      <Circle fill={ILL_COLOR.skinMd} cx={203} cy={114} r={16} stroke="none" />
      <G {...STROKE.ink}><Circle cx={200} cy={112} r={16} /></G>
      <Circle cx={200} cy={112} r={16} {...STROKE.press} transform="translate(1,1.1)" />
      {/* Hair */}
      <Path fill={ILL_COLOR.ink} d={HAIR_D} transform="translate(-2.6,2.4)" stroke="none" />
      <G {...STROKE.ink}><Path d={HAIR_D} /></G>
      {/* Face — waiting expression */}
      <G {...STROKE.ink2}><Path d="M190 107l7-1M203 106l7 1M196 121q4 2 8 0" /></G>
      {/* Eyes — open (no blink in still) */}
      <Circle fill={ILL_COLOR.ink} cx={194} cy={114} r={1.8} stroke="none" />
      <Circle fill={ILL_COLOR.ink} cx={206} cy={114} r={1.8} stroke="none" />
    </Svg>
  );
}

// ─── Animated component ───────────────────────────────────────────────────────

function SanctuaryAnimated({ style, isActive = true }: { style?: ViewStyle; isActive?: boolean }) {
  // §2 always-on layer only — this is a seated scene (motion-behaviours.md §4:
  // "Seated scenes keep the §2 layer only"), same as EmptyBench/NotificationsEmpty.
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

  // Gated on isActive, same reasoning as EmptyBench: all six welcome.tsx beats
  // mount at once in an unvirtualized horizontal pager, so without this gate
  // the breathe/nod/blink loops keep ticking on the UI thread for a slide the
  // user has already swiped away from.
  useFocusEffect(useCallback(() => {
    if (!isActive) return;
    idle.start();
    return () => { idle.stop(); };
  }, [isActive]));

  return (
    <Svg viewBox="0 0 400 300" width="100%" preserveAspectRatio="xMidYMid meet" style={style}>
      {/* Ground */}
      <G {...STROKE.ink}><Path d="M36 244H364" /></G>
      <G {...STROKE.ink2}><Path d="M110 244l3-8M118 244l1-6" /></G>

      {/* Moon — static prop */}
      <Circle fill={ILL_COLOR.sand} cx={330} cy={58} r={13} stroke="none" />
      <G {...STROKE.ink}><Circle cx={330} cy={58} r={13} /></G>
      <G {...STROKE.ink2}><Path d="M325 48q8 10 0 20" /></G>

      {/* Blanket + neck + hands — breathe clock */}
      <AnimatedG animatedProps={chestProps}>
        <Path fill={ILL_COLOR.sage} d={BLANKET_D} transform="translate(-2.6,2.4)" stroke="none" />
        <G {...STROKE.ink}><Path d={BLANKET_D} /></G>
        <Path d={BLANKET_D} {...STROKE.press} transform="translate(1,1.1)" />
        <G {...STROKE.ink2}><Path d="M186 142Q200 150 214 142" /></G>
        <G {...STROKE.ink}><Path d="M200 128V140" strokeWidth={10} /></G>
        <G stroke={ILL_COLOR.skinMd} strokeWidth={6.4} strokeLinecap="round" fill="none"><Path d="M200 128V140" /></G>
        <Ellipse fill={ILL_COLOR.skinMd} cx={196} cy={162} rx={4.5} ry={3.6} stroke="none" />
        <Ellipse fill={ILL_COLOR.skinMd} cx={207} cy={162} rx={4.5} ry={3.6} stroke="none" />
        <G {...STROKE.ink2}><Ellipse cx={193} cy={160} rx={4.5} ry={3.6} /><Ellipse cx={204} cy={160} rx={4.5} ry={3.6} /></G>
      </AnimatedG>

      {/* Head — nod clock */}
      <AnimatedG animatedProps={headProps}>
        <Circle fill={ILL_COLOR.skinMd} cx={203} cy={114} r={16} stroke="none" />
        <G {...STROKE.ink}><Circle cx={200} cy={112} r={16} /></G>
        <Circle cx={200} cy={112} r={16} {...STROKE.press} transform="translate(1,1.1)" />
        <Path fill={ILL_COLOR.ink} d={HAIR_D} transform="translate(-2.6,2.4)" stroke="none" />
        <G {...STROKE.ink}><Path d={HAIR_D} /></G>
        <G {...STROKE.ink2}><Path d="M190 107l7-1M203 106l7 1M196 121q4 2 8 0" /></G>
        {/* Eyes — blink clock */}
        <AnimatedG animatedProps={blinkProps}>
          <Circle fill={ILL_COLOR.ink} cx={194} cy={114} r={1.8} stroke="none" />
          <Circle fill={ILL_COLOR.ink} cx={206} cy={114} r={1.8} stroke="none" />
        </AnimatedG>
      </AnimatedG>
    </Svg>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function Sanctuary({ style, isActive = true }: { style?: ViewStyle; isActive?: boolean }) {
  const reduceMotion = useReducedMotion();
  return reduceMotion
    ? <SanctuaryStill style={style} />
    : <SanctuaryAnimated style={style} isActive={isActive} />;
}
