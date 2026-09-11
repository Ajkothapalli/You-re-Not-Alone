/**
 * Illustration design tokens — soulyap.
 *
 * Single source of truth for illustration palette, stroke weights, and
 * off-register offsets. Every fill/stroke hex in a scene component MUST
 * come from ILL_COLOR — no stray colours.
 *
 * These are print colours: they NEVER invert in dark mode.
 * The card chrome (border, shadow) follows the app theme; the drawing does not.
 *
 * See docs/design/illustration.md for the full system.
 */

export { ILLUSTRATION } from './motion';

// ─── Palette ──────────────────────────────────────────────────────────────────

export const ILL_COLOR = {
  paper:   '#F7F4EF',  // scene background (ground)
  card:    '#FBF8F2',  // IllustrationCard background
  ink:     '#1A1A1A',  // every line, every fill that is dark
  light:   '#FFE500',  // the yap — one yellow object per scene
  coral:   '#E8927C',  // garment (A's top)
  sage:    '#AEC6A4',  // garment (B's top), plants
  dusk:    '#9DB4C8',  // trousers, garment
  sand:    '#E9D8B8',  // bench, shelf, props, trousers
  grey:    '#B9B2A6',  // grey hair (C)
  skin:    '#F1DCC4',  // light skin (C)
  skinMd:  '#D3A57C',  // medium skin (A)
  skinDp:  '#8E5A3C',  // deep skin (B)
} as const;

export type IllColour = (typeof ILL_COLOR)[keyof typeof ILL_COLOR];

// ─── Stroke styles (spread onto SVG elements) ─────────────────────────────────

export const STROKE = {
  /** Silhouette — 3.4px, round caps/joins. Every outer contour. */
  ink: {
    stroke:          ILL_COLOR.ink,
    strokeWidth:     3.4,
    strokeLinecap:   'round',
    strokeLinejoin:  'round',
    fill:            'none',
  },
  /** Interior detail — 2px. Brows, mouths, hands, scribbles, muntins. */
  ink2: {
    stroke:          ILL_COLOR.ink,
    strokeWidth:     2,
    strokeLinecap:   'round',
    strokeLinejoin:  'round',
    fill:            'none',
  },
  /** Pressure pass — 1.4px, translated (1px, 1.1px), shadow side only. */
  press: {
    stroke:          ILL_COLOR.ink,
    strokeWidth:     1.4,
    strokeLinecap:   'round',
    strokeLinejoin:  'round',
    fill:            'none',
  },
} as const;

// ─── Off-register offsets [dx, dy] ───────────────────────────────────────────
// Each fill shape is translated by one of these so the misprint feels real.

export const OFF  = [3,    2]   as const;   // (+3, +2)
export const OFF2 = [-2.6, 2.4] as const;   // (−2.6, +2.4)
export const OFF3 = [2.2, -2.6] as const;   // (+2.2, −2.6)

/** Pressure-pass transform: every press path is shifted by (1, 1.1). */
export const PRESS_TRANSLATE = 'translate(1, 1.1)' as const;

// ─── Joint positions (viewBox 0 0 400 300) ────────────────────────────────────
// Single source of truth for every behaviour hook.  Front view uses L/R;
// profile view (walk) uses a single coordinate.  Nesting: see §1 of
// docs/design/motion-behaviours.md — origin is at the joint, in LOCAL space.

export const JOINTS = {
  front: {
    shoulder: { L: [183, 132] as const, R: [217, 132] as const },
    elbow:    { L: [179, 150] as const, R: [222, 150] as const },
    wrist:    { L: [174, 171] as const, R: [229, 171] as const },
    hip:      { L: [193, 178] as const, R: [207, 178] as const },
    knee:     { L: [193, 209] as const, R: [207, 209] as const },
    ankle:    { L: [186, 240] as const, R: [202, 240] as const },
    neck:     [200, 124] as const,
    head:     [200, 96]  as const,
  },
  profile: {
    shoulder: [200, 140] as const,
    elbow:    [200, 158] as const,
    wrist:    [200, 178] as const,
    hip:      [200, 184] as const,
    knee:     [200, 212] as const,
    ankle:    [200, 240] as const,
    neck:     [200, 130] as const,
    head:     [198, 104] as const,
  },
} as const;

// ─── Behaviour animation constants ────────────────────────────────────────────
// Periods (ms) and delays (ms) for the §3 behaviour hooks.
// Import these instead of inlining magic numbers in components.

export const BEHAVIOUR = {
  period: {
    walk:     1400,  // §3.1
    hop:      6400,  // §3.2
    talk:     4200,  // §3.3
    talkHead: 6300,  // §3.3 head (deliberately not a multiple of talk)
    wave:     5600,  // §3.4
    idle:     14000, // §3.5
    sway:     8300,  // §2 sympathetic sway (non-acting arm)
  },
  delay: {
    forearmLag:      100,  // forearm lags upper arm (80–120 ms)
    handLag:         90,   // hand lags forearm (80–120 ms)
    swayForeOffset: -7900, // sympathetic sway: forearm phase offset
    oppositePhase:  -700,  // half-cycle for opposite-side limb (walk)
    walkForearm:     100,  // walk: forearm delay relative to upper arm
    headBob:          70,  // body starts 70 ms after head (head leads by 70 ms)
    hopForearm:       80,  // hop: forearm delay
    waveHand:         90,  // wave: hand delay relative to forearm
    talkFore:        110,  // talk gesture: forearm delay
    scratchFore:     100,  // idle scratch: forearm delay
  },
} as const;
