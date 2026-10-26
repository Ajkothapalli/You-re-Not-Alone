/**
 * Arrival — "Someone felt what you wrote."
 *
 * The scene behind the push-permission card (N1 §4e).
 *
 * Scene: character C sits on the floor, back against a wall, knees up, eyes
 * closed — resting and at ease, not asleep and not sad. A small folded note,
 * the scene's one yellow scrap, drifts down toward their open hand. A tiny
 * ink heart is drawn on the note.
 *
 * ── Why there is no phone in it ─────────────────────────────────────────────
 * This card is asking for permission to reach somebody outside the app, and
 * the honest picture of that is a person reaching them — not a device
 * buzzing. A bell or a screen would say "we will interrupt you"; a folded
 * note drifting into an open hand says "something arrived, and it can wait
 * until you look". The second one is what this product actually does:
 * batched, capped at two a day, silent from 10pm.
 *
 * ── Two clocks, and then one beat ───────────────────────────────────────────
 * Idle: the always-on character layer (breathe / nod / blink) plus the note
 * drifting on a slow ~4px vertical sine over 4s. Loops stop when the screen
 * loses focus, like every other scene here.
 *
 * Landing: on the primary tap, the note settles into the hand and the heart
 * does the brand heartbeat. ~900ms, then the card collapses.
 *
 * Reduced motion renders the designed still: note already landed, eyes
 * closed, nothing moving.
 */

import React, { useCallback, useEffect } from 'react';
import { ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  cancelAnimation,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Svg, G, Path, Rect, Circle, Ellipse } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';

import { useReducedMotion } from '@/lib/a11y';
import { ILL_COLOR, STROKE, EASING_WORKLET } from '@/theme/illustration';
import { useIdleLayer } from '@/components/illustrations/behaviours';

const AnimatedG = Animated.createAnimatedComponent(G);

// ─── Geometry ────────────────────────────────────────────────────────────────
// Chest origin: bottom-centre of torso.
const CX = 186, CY_CHEST = 214;
// Neck — the nod pivots here.
const CY_NECK = 150;
// Eye line.
const CY_EYES = 132;
// The note's resting (landed) position, in the open hand.
const NOTE_X = 254, NOTE_Y = 196;
// Where it starts its drift, above the hand.
const NOTE_LIFT = -46;
/** The idle drift: ±4px over 4s, per the brief. */
const DRIFT_PX = 4;
const DRIFT_MS = 4000;
/** The landing beat, start to finish. */
export const LANDING_MS = 900;

// ─── Shared scene body ───────────────────────────────────────────────────────
//
// Drawn once and used by both the still and the animated component, so the
// two cannot drift apart. Only the character's moving groups and the note
// are passed in.

function Wall() {
  return (
    <>
      {/* The wall they are leaning on, and the floor line. */}
      <G {...STROKE.ink}><Path d="M96 40V252" /></G>
      <G {...STROKE.ink}><Path d="M40 252H360" /></G>
    </>
  );
}

function Note({ landed }: { landed?: boolean }) {
  return (
    <>
      {/* The one yellow scrap in the scene. A folded note — the fold is the
          diagonal, and it is what stops it reading as a plain square. */}
      <Path
        d="M0 0 H34 V24 H0 Z"
        fill={ILL_COLOR.light}
        stroke={ILL_COLOR.ink}
        strokeWidth={3.4}
        strokeLinejoin="round"
      />
      <G {...STROKE.ink}><Path d="M0 0 L17 11 L34 0" /></G>
      {/* A tiny ink heart. Two arcs and a point — at this size anything more
          detailed turns to mud. */}
      <Path
        d="M17 20 C 12 16, 9 13, 11 10 C 12.5 8, 15.5 8.5, 17 11
           C 18.5 8.5, 21.5 8, 23 10 C 25 13, 22 16, 17 20 Z"
        fill={ILL_COLOR.ink}
        opacity={landed ? 1 : 0.9}
      />
    </>
  );
}

function Figure({ eyesClosed = true }: { eyesClosed?: boolean }) {
  return (
    <>
      {/* Legs — knees up, the shape of sitting on a floor. */}
      <G {...STROKE.ink}>
        <Path d="M172 250 L206 250 L214 214" fill="none" />
        <Path d="M150 250 L178 250 L186 218" fill="none" />
      </G>
      {/* The far arm, resting along the knee. */}
      <G {...STROKE.ink}><Path d="M168 196 L196 212" fill="none" /></G>
      {/* The near arm, reaching out, palm open and up. The note falls to it. */}
      <G {...STROKE.ink}>
        <Path d="M204 190 L238 202" fill="none" />
        {/* The open hand: a shallow cup, not a fist. */}
        <Path d="M238 202 C 246 198, 258 200, 262 208" fill="none" />
      </G>
    </>
  );
}

// ─── Still (reduced motion) ──────────────────────────────────────────────────

function ArrivalStill({ style }: { style?: ViewStyle }) {
  return (
    <Svg viewBox="0 0 400 300" width="100%" preserveAspectRatio="xMidYMid meet" style={style}>
      <Wall />
      {/* Torso */}
      <G>
        <Rect x={160} y={150} width={52} height={66} rx={14}
              fill={ILL_COLOR.sage} stroke={ILL_COLOR.ink} strokeWidth={3.4} />
      </G>
      <Figure />
      {/* Head, tipped back against the wall. */}
      <G>
        <Circle cx={CX} cy={126} r={26}
                fill={ILL_COLOR.skin} stroke={ILL_COLOR.ink} strokeWidth={3.4} />
        {/* Grey hair — character C. */}
        <Path d="M162 118 C 166 100, 206 100, 210 118"
              fill={ILL_COLOR.grey} stroke={ILL_COLOR.ink} strokeWidth={3.4} />
        {/* Closed eyes: two short arcs. At rest, not asleep. */}
        <G {...STROKE.ink}>
          <Path d="M174 132 C 177 135, 182 135, 185 132" fill="none" />
          <Path d="M191 132 C 194 135, 199 135, 202 132" fill="none" />
        </G>
      </G>
      {/* The note, already landed in the hand — the designed still. */}
      <G transform={`translate(${NOTE_X}, ${NOTE_Y})`}><Note landed /></G>
    </Svg>
  );
}

// ─── Animated ────────────────────────────────────────────────────────────────

export interface ArrivalProps {
  style?: ViewStyle;
  /**
   * Flip to true on the primary tap. The note settles into the hand and the
   * heart beats once. Calls onLanded when the beat finishes so the card can
   * collapse on the same frame the motion ends.
   */
  landing?:  boolean;
  onLanded?: () => void;
}

export default function Arrival({ style, landing = false, onLanded }: ArrivalProps) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) {
    // The still IS the reduced-motion design. The landing beat is skipped
    // entirely, so the caller is told immediately rather than waiting for a
    // callback that will never fire.
    return <ArrivalStillWithCallback style={style} landing={landing} onLanded={onLanded} />;
  }
  return <ArrivalAnimated style={style} landing={landing} onLanded={onLanded} />;
}

function ArrivalStillWithCallback({ style, landing, onLanded }: ArrivalProps) {
  useEffect(() => {
    if (landing) onLanded?.();
  }, [landing, onLanded]);
  return <ArrivalStill style={style} />;
}

function ArrivalAnimated({ style, landing, onLanded }: ArrivalProps) {
  const idle = useIdleLayer();

  /** The note's own vertical offset, above its landed position. */
  const noteY  = useSharedValue(NOTE_LIFT);
  const noteR  = useSharedValue(-6);
  const heartS = useSharedValue(1);

  useFocusEffect(useCallback(() => {
    idle.start();
    // The drift: a slow vertical sine, ±DRIFT_PX around the lifted position.
    noteY.value = withRepeat(
      withTiming(NOTE_LIFT + DRIFT_PX, {
        duration: DRIFT_MS / 2, easing: Easing.inOut(Easing.sin),
      }), -1, true,
    );
    noteR.value = withRepeat(
      withTiming(6, { duration: DRIFT_MS / 2, easing: Easing.inOut(Easing.sin) }),
      -1, true,
    );
    return () => {
      idle.stop();
      cancelAnimation(noteY);
      cancelAnimation(noteR);
    };
  }, []));

  useEffect(() => {
    if (!landing) return;

    // Stop the drift before the settle, or the two fight over the value.
    cancelAnimation(noteY);
    cancelAnimation(noteR);

    // 1. The note settles into the hand.
    noteY.value = withTiming(0, { duration: 340, easing: EASING_WORKLET.enter });
    noteR.value = withTiming(0, { duration: 340, easing: EASING_WORKLET.enter });

    // 2. Then the heart beats once — the brand beat, 1 → 1.14 → .97 → 1.05 → 1.
    heartS.value = withDelay(340, withSequence(
      withTiming(1.14, { duration: 130, easing: EASING_WORKLET.enter }),
      withTiming(0.97, { duration: 110, easing: EASING_WORKLET.exit }),
      withTiming(1.05, { duration: 120, easing: EASING_WORKLET.enter }),
      withTiming(1.00, { duration: 200, easing: EASING_WORKLET.exit },
        (finished) => { if (finished && onLanded) runOnJS(onLanded)(); }),
    ));
  }, [landing]);

  const chestProps = useAnimatedProps(() => ({
    transform: `translate(${CX} ${CY_CHEST}) scale(${idle.breathX.value} ${idle.breathY.value}) translate(${-CX} ${-CY_CHEST})`,
  }));
  const headProps = useAnimatedProps(() => ({
    transform: `translate(${CX} ${CY_NECK}) rotate(${idle.nodR.value}) translate(${-CX} ${-CY_NECK}) translate(0 ${idle.nodY.value})`,
  }));
  const eyeProps = useAnimatedProps(() => ({
    transform: `translate(${CX} ${CY_EYES}) scale(1 ${idle.blinkS.value}) translate(${-CX} ${-CY_EYES})`,
  }));
  const noteProps = useAnimatedProps(() => ({
    transform: `translate(${NOTE_X} ${NOTE_Y + noteY.value}) rotate(${noteR.value})`,
  }));
  const heartProps = useAnimatedProps(() => ({
    transform: `translate(17 14) scale(${heartS.value}) translate(-17 -14)`,
  }));

  return (
    <Svg viewBox="0 0 400 300" width="100%" preserveAspectRatio="xMidYMid meet" style={style}>
      <Wall />

      <AnimatedG animatedProps={chestProps}>
        <Rect x={160} y={150} width={52} height={66} rx={14}
              fill={ILL_COLOR.sage} stroke={ILL_COLOR.ink} strokeWidth={3.4} />
      </AnimatedG>

      <Figure />

      <AnimatedG animatedProps={headProps}>
        <Circle cx={CX} cy={126} r={26}
                fill={ILL_COLOR.skin} stroke={ILL_COLOR.ink} strokeWidth={3.4} />
        <Path d="M162 118 C 166 100, 206 100, 210 118"
              fill={ILL_COLOR.grey} stroke={ILL_COLOR.ink} strokeWidth={3.4} />
        {/* The blink scales the eye group. They are drawn closed, so the
            blink reads as a settling rather than an opening — which is the
            difference between resting and asleep. */}
        <AnimatedG animatedProps={eyeProps}>
          <G {...STROKE.ink}>
            <Path d="M174 132 C 177 135, 182 135, 185 132" fill="none" />
            <Path d="M191 132 C 194 135, 199 135, 202 132" fill="none" />
          </G>
        </AnimatedG>
      </AnimatedG>

      <AnimatedG animatedProps={noteProps}>
        <Path
          d="M0 0 H34 V24 H0 Z"
          fill={ILL_COLOR.light}
          stroke={ILL_COLOR.ink}
          strokeWidth={3.4}
          strokeLinejoin="round"
        />
        <G {...STROKE.ink}><Path d="M0 0 L17 11 L34 0" /></G>
        <AnimatedG animatedProps={heartProps}>
          <Path
            d="M17 20 C 12 16, 9 13, 11 10 C 12.5 8, 15.5 8.5, 17 11
               C 18.5 8.5, 21.5 8, 23 10 C 25 13, 22 16, 17 20 Z"
            fill={ILL_COLOR.ink}
          />
        </AnimatedG>
      </AnimatedG>
    </Svg>
  );
}

export { ArrivalStill };
