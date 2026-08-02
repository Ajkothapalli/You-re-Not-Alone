/**
 * soulyap — Motion Language
 *
 * Single source of truth for how things move in the app.
 * Every animated surface imports from here — never inline magic numbers.
 *
 * Gate all motion with useReducedMotion() from lib/a11y.ts:
 *   - reduced-motion → instant end-state (DURATION.instant = 0) or plain opacity fade
 *   - crisis screen → no motion whatsoever (see CLAUDE.md §6)
 *
 * The arc: Release (yap lifts + dissolves) → Travel (soft drifting light) →
 * Resonance (match arrives + ripple + heartbeat). Everything else is chrome-quiet.
 */

import { Easing } from 'react-native';

// ─── Durations (ms) ───────────────────────────────────────────────────────────

export const DURATION = {
  /** Reduced-motion end-states — jump to final value immediately. */
  instant:  0,
  /** Button press-in, taps — near-invisible acknowledgment. */
  press:    80,
  /** Tab cross-fade, micro state changes. */
  quick:    120,
  /** Default UI transitions, toggles, in-place state changes. */
  base:     220,
  /** Content reveal — rise + fade for confession cards and text. */
  gentle:   320,
  /** Stack push / sheet present. */
  screen:   280,
  /** The tender card arrival — confession / match entrance. This is the exhale. */
  entrance: 600,
  /** Felt-count count-up animation — give it room to breathe. */
  count:    1400,
  /** Ambient loops — one full pulse/shimmer cycle (the Travel, loading states). */
  breath:   900,
} as const;

export type DurationToken = keyof typeof DURATION;

// ─── Easings (React Native Easing) ───────────────────────────────────────────
// CSS mirrors for the website/store: see the motion doc.

export const EASING = {
  /** Entrances, reveals, arrivals. The default for anything coming in. */
  enter:    Easing.out(Easing.cubic),
  /** Most in-place transitions and UI state changes. */
  standard: Easing.out(Easing.quad),
  /** Dismissals — things leaving the screen. */
  exit:     Easing.in(Easing.quad),
  /** Ambient loops only — the Travel, loading pulse. */
  breathe:  Easing.inOut(Easing.sin),
  /** Shimmer / marquee — genuinely linear. */
  linear:   Easing.linear,
} as const;

export type EasingToken = keyof typeof EASING;

// ─── Springs (reserved — the "alive" moments) ────────────────────────────────
// Use sparingly: pressSpring on button release, pop for badges/pills mounting,
// meeting ONLY for the splash "two souls yapping and meeting" moment.

export const SPRING = {
  /** Button release — snappy but not bouncy. */
  pressSpring: { speed: 22, bounciness: 7 },
  /** Mount pop — pills, badges, new notification dot. */
  pop:         { speed: 14, bounciness: 12 },
  /** The splash meeting — the one big intentional overshoot in the whole app. */
  meeting:     { speed: 9,  bounciness: 16 },
} as const;

// Reanimated equivalents (for withSpring):
export const SPRING_REANIMATED = {
  pressSpring: { damping: 18, stiffness: 180 },
  pop:         { damping: 14, stiffness: 200 },
  meeting:     { damping: 9,  stiffness: 120 },
} as const;

export type SpringToken = keyof typeof SPRING;

// ─── Heartbeat (the felt-count lub-dub) ──────────────────────────────────────
// A scripted sequence — not a spring. Each step: [toValue, durationMs, easing].
// Use with Animated.sequence() and impactAsync(Medium) at the first beat.

export const HEARTBEAT: [number, number, typeof EASING[keyof typeof EASING]][] = [
  [1.40, 100, EASING.enter],   // lub — fast swell
  [0.88,  80, EASING.exit],    // dub — quick pull back
  [1.20,  90, EASING.enter],   // secondary beat
  [1.00, 150, EASING.standard],// settle
];

// ─── Distances (translateY on entrance) ──────────────────────────────────────

export const RISE = {
  /** Subtle micro-rise for chrome reveals. */
  sm: 8,
  /** Standard content reveal — confession cards, list items. */
  md: 16,
  /** Hero entrances — match card, the Release lift origin. */
  lg: 24,
  /** The Release — words lifting and dissolving upward (much larger travel). */
  release: 64,
} as const;

// ─── Scale ────────────────────────────────────────────────────────────────────

export const SCALE = {
  /** Confession / match card entrance — arrives from slightly smaller. */
  card:  0.97,
  /** Mount pop — fast scale-in for pills and badges. */
  pop:   0.80,
  /** Button press-in — subtle shrink. */
  press: 0.97,
} as const;

// ─── Stagger (gap between sibling entrances, ms) ─────────────────────────────

export const STAGGER = {
  tight:    60,
  standard: 80,
  loose:    90,
} as const;

// ─── Opacity ──────────────────────────────────────────────────────────────────

export const OPACITY = {
  /** Resting opacity for inactive / dim items. */
  dim:     0.5,
  /** Button press feedback. */
  press:   0.90,
  /** Loading pulse range — low end. */
  breathLo: 0.60,
  /** Loading pulse range — high end. */
  breathHi: 1.00,
} as const;
