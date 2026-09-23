/**
 * Speaking — "say it out loud."
 *
 * The voice counterpart to Writing.tsx, and DELIBERATELY the same person: same
 * head (r30 at 200,66), same hair path, same sage top, same skin. Typing and
 * recording are two ways to do one thing, and the two screens should not look
 * like two different products.
 *
 * ── Why a bust rather than a full figure ────────────────────────────────────
 * Every other scene is a full figure on a ground line at 4:3. This one renders
 * inside the composer at roughly 160px tall — at that size a full figure's head
 * is 17px and the face is gone, and the face is the whole point here: eyes
 * closed, mouth open. So the figure is drawn at Writing's scale and the group
 * is SCALED UP, which crops it to head-and-shoulders. Scaling the group scales
 * the strokes with it, so the line is still 3.4/2 relative to the drawing —
 * this is a zoom, not a second set of stroke weights.
 *
 * ── There is no arm, and that was the third attempt ─────────────────────────
 * A hand on the sternum is the right gesture for this screen, and it failed
 * three ways inside this crop. Sage tube on a sage chest: the ink outline read
 * as a seam, not a limb (Writing gets away with sage on sage only because its
 * arms extend out over the desk). Skin forearm with the elbow outside the
 * silhouette: better separated, but a straight tube capped by a small ellipse
 * read as a spoon. Elbow off-frame entirely: a diagonal stick across the chest.
 * What the scene actually needs is §0's "generous quiet" — one subject, one
 * environment object — so the gesture is gone and nothing is missing.
 *
 * ── What carries "voice" ────────────────────────────────────────────────────
 * Eyes closed and head barely tipped. Someone saying a hard thing out loud is
 * not looking at anybody, and an upward-tilted face with an open mouth reads as
 * singing or yawning, so the tilt stays at a few degrees.
 *
 * The one yellow object is the SCRAP, not the sound — the same scrap B lets go
 * of in Release, here already out of the mouth and on its way. §2 says the
 * yellow is always the yap itself, so drawing the sound waves yellow would make
 * it decoration. The sound is two thin ink arcs, concentric about the mouth.
 *
 * DELIBERATELY STATIC, following Writing's owner decision 2026-09-13. The
 * recording state already has a running timer and a progress track, and both
 * say "it is listening" more precisely than a breathing figure would; a third
 * moving thing competes with them. A still illustration also cannot look
 * robotic — which is what killed three attempts at animating Writing.
 *
 * House technique (docs/design/illustration.md §1): limbs are a thick ink
 * stroke with a thinner colour stroke over it, fills sit off-register under the
 * line, and a pressure pass runs down the shadow side of head and torso.
 */

import React from 'react';
import { ViewStyle } from 'react-native';
import { Svg, G, Path, Circle, Ellipse } from 'react-native-svg';
import { ILL_COLOR, STROKE } from '@/theme/illustration';

/**
 * Head centre (200,66) maps to (150,118) at 1.8×, which puts the crop line
 * (local y=167) on the bottom edge of the 400×300 box and leaves the right
 * third of the frame for the sound and the scrap. Cropping this high keeps the
 * body to shoulders — any more of it and a large blank sage mass competes with
 * the head, which is the only part that has to read at 160px.
 */
const ZOOM = 'translate(-210, -0.8) scale(1.8)';

/**
 * Shoulders, cropped by the frame. Closed for the fill, open for the line.
 *
 * The trapezius slopes out of the neck and TURNS at the deltoid — a single
 * unbroken dome from collar to crop read as a rock, not a person. The `q` in
 * the middle is a crew neckline: the neck is drawn BEFORE this so the fill
 * covers it below the collar, and without the dip the shoulder line ran dead
 * straight across the throat and read as a shelf the head was resting on.
 */
const CHEST = 'M138 167L142 146C143 138 152 130 168 124C180 119 186 117 190 117'
            + 'q10 9 20 0C214 118 220 119 232 124C248 130 257 138 258 146L262 167';

export function Speaking({ style }: { style?: ViewStyle }) {
  return (
    <Svg viewBox="0 0 400 300" style={style} preserveAspectRatio="xMidYMid meet">
      <G transform={ZOOM}>
        {/* ── neck, drawn BEFORE the chest so the collar cuts it ─────────── */}
        <G {...STROKE.ink}><Path d="M200 84V125" strokeWidth={18} /></G>
        <G stroke={ILL_COLOR.skinMd} strokeWidth={12} strokeLinecap="round" fill="none">
          <Path d="M200 84V125" />
        </G>

        {/* ── chest, cropped by the bottom of the frame ─────────────────── */}
        <Path fill={ILL_COLOR.sage} stroke="none" transform="translate(-3,2.6)" d={`${CHEST}Z`} />
        <G {...STROKE.ink}><Path d={CHEST} /></G>
        <Path {...STROKE.press} transform="translate(1,1.1)" d="M258 146L262 167" />

        {/* ── head, barely tipped back ──────────────────────────────────── */}
        <G transform="rotate(-4 200 96)">
          <Circle fill={ILL_COLOR.skinMd} cx={204} cy={68} r={30} stroke="none" />
          <G {...STROKE.ink}><Circle cx={200} cy={66} r={30} /></G>
          <Circle cx={200} cy={66} r={30} {...STROKE.press} transform="translate(1.2,1.3)" />

          {/* Writing's hair path, unchanged — this is how you know it is them */}
          <Path
            fill={ILL_COLOR.ink} stroke="none" transform="translate(3,2.2)"
            d="M170 60C170 34 230 34 230 60C220 48 180 48 170 60Z"
          />
          <G {...STROKE.ink}>
            <Path d="M170 60C170 34 230 34 230 60C220 48 180 48 170 60Z" />
          </G>

          {/* eyes closed */}
          <G {...STROKE.ink2}><Path d="M184 74q5 4 10 0M206 74q5 4 10 0" strokeWidth={2.6} /></G>

          {/* mouth, mid-word */}
          <Ellipse fill={ILL_COLOR.ink} cx={200} cy={87} rx={5.5} ry={6} stroke="none" />
          <G {...STROKE.ink2}><Ellipse cx={200} cy={87} rx={5.5} ry={6} strokeWidth={2.6} /></G>
        </G>

        {/* ── the sound: two thin arcs about the mouth ───────────────────── */}
        <G {...STROKE.ink2}>
          <Path d="M234 53A48 48 0 0 1 248 91" strokeWidth={2.6} />
          <Path d="M244 43A62 62 0 0 1 262 92" strokeWidth={2.6} />
        </G>

        {/* ── the scrap — the ONE yellow object ───────────────────────────
            Release's torn scrap (its 7-sided path, ×1.8, rotated -8°, baked
            into the coordinates rather than nested in another <G scale>, which
            would have multiplied the stroke weights on top of ZOOM's). A clean
            rectangle read as a UI toast floating next to someone's head. */}
        <Path
          fill={ILL_COLOR.light} stroke="none" transform="translate(3,2)"
          d="M272.8 30L277.4 23.9L309.5 19.4L319.7 27L321.4 52.3L279.1 61.8L273.5 48.1Z"
        />
        <G {...STROKE.ink}>
          <Path d="M272.8 30L277.4 23.9L309.5 19.4L319.7 27L321.4 52.3L279.1 61.8L273.5 48.1Z" />
        </G>
        {/* what is written on it, unreadable on purpose */}
        <G {...STROKE.ink2}>
          <Path d="M281 38L306 34M283 50L301 47" strokeWidth={2.6} />
        </G>
      </G>
    </Svg>
  );
}

export default Speaking;
