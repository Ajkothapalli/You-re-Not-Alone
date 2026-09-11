/**
 * Illustration primitives — soulyap.
 *
 * Low-level building blocks that encode the technique from
 * docs/design/illustration.md §1. Use these in scene components
 * instead of raw SVG props so the drawing language stays consistent.
 */

import React from 'react';
import { G, Path, Ellipse } from 'react-native-svg';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import { ILL_COLOR, OFF, OFF2, OFF3, PRESS_TRANSLATE, STROKE } from '@/theme/illustration';

const AnimatedG = Animated.createAnimatedComponent(G);

type OffKey = 'off' | 'off2' | 'off3';

const OFFSETS: Record<OffKey, readonly [number, number]> = {
  off:  OFF,
  off2: OFF2,
  off3: OFF3,
};

// ─── OffFill ──────────────────────────────────────────────────────────────────

/**
 * A fill shape translated off-register to simulate risograph printing.
 * Renders only the fill (no stroke) at the specified offset.
 */
export function OffFill({
  fill,
  off = 'off',
  children,
}: {
  fill: string;
  off?: OffKey;
  children: React.ReactElement<{ fill?: string; stroke?: string; transform?: string }>;
}) {
  const [dx, dy] = OFFSETS[off];
  return React.cloneElement(children, {
    fill,
    stroke:    'none',
    transform: `translate(${dx}, ${dy})`,
  });
}

// ─── Press ────────────────────────────────────────────────────────────────────

/**
 * Pressure pass: a thin (1.4px) second ink pass on a path, shifted (1, 1.1)
 * toward the shadow side. Apply only to head and torso silhouettes.
 */
export function Press({ d }: { d: string }) {
  return (
    <Path
      d={d}
      {...STROKE.press}
      transform={PRESS_TRANSLATE}
    />
  );
}

// ─── Tube ─────────────────────────────────────────────────────────────────────

/**
 * A limb: ink outer stroke + colour inner stroke, round caps.
 * Spec: legs 11/7.4, arms 8.5/4.9, neck 10/6.4 (ink/colour widths).
 */
export function Tube({
  d,
  inkWidth,
  colour,
  colourWidth,
}: {
  d: string;
  inkWidth: number;
  colour: string;
  colourWidth: number;
}) {
  return (
    <G>
      <Path
        d={d}
        stroke={ILL_COLOR.ink}
        strokeWidth={inkWidth}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d={d}
        stroke={colour}
        strokeWidth={colourWidth}
        strokeLinecap="round"
        fill="none"
      />
    </G>
  );
}

// ─── Hand ─────────────────────────────────────────────────────────────────────

/**
 * Skin ellipse rx=4.5 ry=3.6 with 2px ink contour.
 * Drawn after the arm so it caps it.
 * dx/dy offset the fill copy for off-register.
 */
export function Hand({
  cx, cy, skin,
  dx = OFF[0], dy = OFF[1],
}: {
  cx: number;
  cy: number;
  skin: string;
  dx?: number;
  dy?: number;
}) {
  return (
    <G>
      <Ellipse cx={cx + dx} cy={cy + dy} rx={4.5} ry={3.6} fill={skin} stroke="none" />
      <Ellipse cx={cx} cy={cy} rx={4.5} ry={3.6} {...STROKE.ink2} />
    </G>
  );
}

// ─── Shoe ─────────────────────────────────────────────────────────────────────

/**
 * 7px ink stroke 12px long at the ankle. Left points left, right points right.
 */
export function Shoe({
  x, y, direction,
}: {
  x: number;
  y: number;
  direction: 'left' | 'right';
}) {
  const x2 = direction === 'left' ? x - 12 : x + 12;
  return (
    <Path
      d={`M${x} ${y}L${x2} ${y}`}
      stroke={ILL_COLOR.ink}
      strokeWidth={7}
      strokeLinecap="round"
      fill="none"
    />
  );
}

// ─── Ink wrappers (convenience) ───────────────────────────────────────────────

/** Wraps children with silhouette ink props (3.4px). */
export function Ink({ children }: { children: React.ReactNode }) {
  return <G {...STROKE.ink}>{children}</G>;
}

/** Wraps children with interior detail ink props (2px). */
export function Ink2({ children }: { children: React.ReactNode }) {
  return <G {...STROKE.ink2}>{children}</G>;
}

// ─── AnimatedArm ──────────────────────────────────────────────────────────────
// Two-segment rigged arm: upper arm → forearm → hand.
// Each segment is an AnimatedG that rotates around its joint (in local space).
// When upperRot=0 and foreRot=0, the arm draws at its natural rest position.
// Use with a behaviour hook that provides the SharedValue angles (degrees).

export function AnimatedArm({
  shoulder, elbow, wrist,
  colour, skin,
  upperRot, foreRot, handRot,
}: {
  shoulder: readonly [number, number];
  elbow:    readonly [number, number];
  wrist:    readonly [number, number];
  colour:   string;
  skin:     string;
  upperRot: SharedValue<number>;
  foreRot:  SharedValue<number>;
  handRot:  SharedValue<number>;
}) {
  const dx1 = elbow[0] - shoulder[0];
  const dy1 = elbow[1] - shoulder[1];
  const dx2 = wrist[0] - elbow[0];
  const dy2 = wrist[1] - elbow[1];

  const upperProps = useAnimatedProps(() => {
    'worklet';
    return { transform: `rotate(${upperRot.value})` };
  });
  const foreProps = useAnimatedProps(() => {
    'worklet';
    return { transform: `rotate(${foreRot.value})` };
  });
  const handProps = useAnimatedProps(() => {
    'worklet';
    return { transform: `rotate(${handRot.value})` };
  });

  return (
    <G testID="arm-upper-pivot" transform={`translate(${shoulder[0]},${shoulder[1]})`}>
      <AnimatedG testID="arm-upper-seg" animatedProps={upperProps}>
        <Tube
          d={`M0 0L${dx1} ${dy1}`}
          inkWidth={8.5} colour={colour} colourWidth={4.9}
        />
        <G testID="arm-fore-pivot" transform={`translate(${dx1},${dy1})`}>
          <AnimatedG testID="arm-fore-seg" animatedProps={foreProps}>
            <Tube
              d={`M0 0L${dx2} ${dy2}`}
              inkWidth={8.5} colour={colour} colourWidth={4.9}
            />
            <G testID="arm-hand-pivot" transform={`translate(${dx2},${dy2})`}>
              <AnimatedG testID="arm-hand-seg" animatedProps={handProps}>
                <Hand cx={0} cy={0} skin={skin} />
              </AnimatedG>
            </G>
          </AnimatedG>
        </G>
      </AnimatedG>
    </G>
  );
}

// ─── AnimatedLeg ──────────────────────────────────────────────────────────────
// Two-segment rigged leg: thigh → shin → foot (Shoe).
// Same nesting convention as AnimatedArm.

export function AnimatedLeg({
  hip, knee, ankle,
  colour, footDir,
  thighRot, shinRot,
}: {
  hip:      readonly [number, number];
  knee:     readonly [number, number];
  ankle:    readonly [number, number];
  colour:   string;
  footDir:  'left' | 'right';
  thighRot: SharedValue<number>;
  shinRot:  SharedValue<number>;
}) {
  const dx1 = knee[0] - hip[0];
  const dy1 = knee[1] - hip[1];
  const dx2 = ankle[0] - knee[0];
  const dy2 = ankle[1] - knee[1];

  const thighProps = useAnimatedProps(() => {
    'worklet';
    return { transform: `rotate(${thighRot.value})` };
  });
  const shinProps = useAnimatedProps(() => {
    'worklet';
    return { transform: `rotate(${shinRot.value})` };
  });

  return (
    <G testID="leg-thigh-pivot" transform={`translate(${hip[0]},${hip[1]})`}>
      <AnimatedG testID="leg-thigh-seg" animatedProps={thighProps}>
        <Tube
          d={`M0 0L${dx1} ${dy1}`}
          inkWidth={11} colour={colour} colourWidth={7.4}
        />
        <G testID="leg-knee-pivot" transform={`translate(${dx1},${dy1})`}>
          <AnimatedG testID="leg-shin-seg" animatedProps={shinProps}>
            <Tube
              d={`M0 0L${dx2} ${dy2}`}
              inkWidth={11} colour={colour} colourWidth={7.4}
            />
            <G transform={`translate(${dx2},${dy2})`}>
              <Shoe x={0} y={0} direction={footDir} />
            </G>
          </AnimatedG>
        </G>
      </AnimatedG>
    </G>
  );
}
