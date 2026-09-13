/**
 * Writing — "it's your turn."
 *
 * A figure at a desk, pen in hand, mid-sentence. The page is the one yellow
 * object in the scene, because the page is the thing being asked for.
 *
 * DELIBERATELY STATIC (owner decision 2026-09-13). Three attempts at animating
 * the hand all read as mechanical: a straight shoulder-to-hand line stretched
 * the arm like rubber; two-bone IK fixed the geometry but still glided; adding
 * per-letter oscillation and a pen lift made it busier without making it
 * human. A drawing of a hand mid-word says "writing" perfectly well, and a
 * still illustration cannot look robotic. Nothing here animates — no
 * Reanimated, no worklets, no reduced-motion branch to get wrong.
 *
 * House technique (docs/design/illustration.md §1):
 *   - Limbs are a thick ink stroke with a thinner garment stroke laid over,
 *     not an outline.
 *   - Fills are drawn OFF-REGISTER from their outlines (2-3px) for the riso
 *     misprint.
 *   - A pressure pass on the shadow side.
 *
 * Both arms bend at a real elbow, and both hands sit where a hand would: one
 * wrapped round the pen with the thumb over it, one resting flat on the desk.
 */

import React from 'react';
import { ViewStyle } from 'react-native';
import { Svg, G, Path, Circle, Ellipse } from 'react-native-svg';
import { ILL_COLOR, STROKE } from '@/theme/illustration';

export function Writing({ style }: { style?: ViewStyle }) {
  return (
    <Svg viewBox="0 0 400 300" style={style} preserveAspectRatio="xMidYMid meet">
      {/* ground line */}
      <G {...STROKE.ink}><Path d="M40 268L360 268" /></G>

      {/* ── figure ───────────────────────────────────────────────────── */}
      {/* torso */}
      <Path
        fill={ILL_COLOR.sage} stroke="none" transform="translate(-3,2.6)"
        d="M152 152C152 126 168 112 200 112C232 112 248 126 248 152L256 232L144 232Z"
      />
      <G {...STROKE.ink}>
        <Path d="M152 152C152 126 168 112 200 112C232 112 248 126 248 152L256 232L144 232Z" />
      </G>
      <Path {...STROKE.press} transform="translate(1,1.1)" d="M248 152L256 232" />

      {/* neck */}
      <G {...STROKE.ink}><Path d="M200 88V116" strokeWidth={14} /></G>
      <G stroke={ILL_COLOR.skinMd} strokeWidth={9} strokeLinecap="round" fill="none">
        <Path d="M200 88V116" />
      </G>

      {/* head, tipped toward the page */}
      <Circle fill={ILL_COLOR.skinMd} cx={204} cy={68} r={30} stroke="none" />
      <G {...STROKE.ink}><Circle cx={200} cy={66} r={30} /></G>
      <Circle cx={200} cy={66} r={30} {...STROKE.press} transform="translate(1.2,1.3)" />
      <Path
        fill={ILL_COLOR.ink} stroke="none" transform="translate(3,2.2)"
        d="M170 60C170 34 230 34 230 60C220 48 180 48 170 60Z"
      />
      <G {...STROKE.ink}>
        <Path d="M170 60C170 34 230 34 230 60C220 48 180 48 170 60Z" />
      </G>
      {/* eyes down at the page, not at us */}
      <G {...STROKE.ink2}><Path d="M184 74q5 4 10 0M206 74q5 4 10 0" strokeWidth={2.6} /></G>

      {/* ── far arm: shoulder → elbow → hand flat on the desk ────────── */}
      <G {...STROKE.ink}><Path d="M156 154L124 186L96 198" strokeWidth={12} /></G>
      <G stroke={ILL_COLOR.sage} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <Path d="M156 154L124 186L96 198" />
      </G>
      <Ellipse fill={ILL_COLOR.skinMd} cx={84} cy={204} rx={11} ry={8} stroke="none" />
      <G {...STROKE.ink2}><Ellipse cx={87} cy={201} rx={11} ry={8} strokeWidth={2.6} /></G>

      {/* ── desk ─────────────────────────────────────────────────────── */}
      <Path
        fill={ILL_COLOR.sand} stroke="none" transform="translate(-3,2.6)"
        d="M52 212L348 212L348 268L52 268Z"
      />
      <G {...STROKE.ink}><Path d="M52 212L348 212L348 268L52 268Z" /></G>
      <Path {...STROKE.press} transform="translate(1,1.1)" d="M348 212L348 268" />

      {/* ── the page — the one yellow object ─────────────────────────── */}
      <Path
        fill={ILL_COLOR.light} stroke="none" transform="translate(-3,2.4)"
        d="M108 168L286 168L294 212L116 212Z"
      />
      <G {...STROKE.ink}><Path d="M108 168L286 168L294 212L116 212Z" /></G>
      {/* two lines written, a third trailing off where the pen is */}
      <G {...STROKE.ink2}>
        <Path d="M128 180L258 180M128 191L240 191M128 202L196 202" strokeWidth={2.6} />
      </G>

      {/* ── writing arm: shoulder → elbow at the desk edge → forearm
             along the desk → hand on the page ────────────────────────── */}
      <G {...STROKE.ink}><Path d="M244 152L272 196L216 200" strokeWidth={12} /></G>
      <G stroke={ILL_COLOR.sage} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <Path d="M244 152L272 196L216 200" />
      </G>

      {/* the pen — barrel passes through the grip, nib down on the page */}
      <G {...STROKE.ink}><Path d="M199 208L232 170" strokeWidth={4.6} /></G>

      {/* hand wrapped round it */}
      <Ellipse fill={ILL_COLOR.skinMd} cx={211} cy={200} rx={12} ry={8.6} stroke="none" />
      <G {...STROKE.ink2}><Ellipse cx={214} cy={197} rx={12} ry={8.6} strokeWidth={2.6} /></G>
      {/* thumb over the barrel — what makes it read as held rather than
          balanced on top of a blob */}
      <G {...STROKE.ink2}><Path d="M209 190q7 -3 11 3" strokeWidth={2.6} /></G>
      {/* nib, clear of the hand and touching the page */}
      <G {...STROKE.ink}><Path d="M199 208L203 203" strokeWidth={3} /></G>
    </Svg>
  );
}

export default Writing;
