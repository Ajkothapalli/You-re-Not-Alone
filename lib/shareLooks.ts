/**
 * The six looks of the Quoted share card.
 *
 * Pure data and arithmetic, deliberately kept out of the component. The card is
 * rasterised to a 1080×1920 PNG that travels off-platform and cannot be
 * recalled or corrected, so every number that decides what lands in those
 * pixels is worth asserting directly rather than through a render tree.
 *
 * ── Two coordinate spaces ───────────────────────────────────────────────────
 * The design is specified in a 270×480 space; the capture card is 360×640
 * (3× → 1080×1920). Everything below is stored in DESIGN space and scaled by
 * SCALE (4/3) on the way out, so the design numbers stay readable against the
 * spec and there is exactly one place the conversion happens.
 */

import { CATEGORIES, type CategoryId } from './categories';

export const DESIGN_W = 270;
export const DESIGN_H = 480;
export const CARD_W   = 360;
export const CARD_H   = 640;
/** Design space → capture space. */
export const SCALE = CARD_W / DESIGN_W; // 4/3

export const px = (design: number): number => design * SCALE;

// ─── Palette ─────────────────────────────────────────────────────────────────

export const INK    = '#1A1A1A';
export const PAPER  = '#FBF8F2';
export const CREAM  = '#F7F4EF';
export const YELLOW = '#FFE500';
export const INDIGO = '#291466';
export const MIDNIGHT = '#141414';

export const LOOK_IDS = [
  'classic', 'midnight', 'sticker', 'stacked', 'hush', 'split',
] as const;
export type LookId = typeof LOOK_IDS[number];

export interface QuotePlacement {
  /** Design-space left/top of the quote's box, and its width. */
  x: number;
  y: number;
  w: number;
  /** Degrees, before per-share jitter. */
  r: number;
}

export interface SlipSpec {
  x: number; y: number; w: number; h: number; r: number;
  bg: string; radius: number; border: number; shadow: number;
}

export interface TextSpec {
  /** Design-space left/top of the text block, and its width. */
  x: number; y: number; w: number;
  /** Base size and line-height MULTIPLE, before the length multiplier. */
  size: number; lineHeight: number;
  weight: '400' | '600' | '700';
  italic?: boolean;
  align?: 'left' | 'center';
  color: string;
}

export interface Look {
  id:    LookId;
  name:  string;
  /** null → derived from the confession's category at render time. */
  bg:    string | null;
  text:  TextSpec;
  open:  QuotePlacement;
  close: QuotePlacement;
  slip?: SlipSpec;
  /** Flat cut-out colour for the quotes instead of the gradient artwork. */
  quoteSolid?: string;
  /** A white die-cut outline + hard ink offset behind each quote. */
  quoteDieCut?: boolean;
  /** Chip / pill / brand treatment, where it differs from the default. */
  chipBg?:     string;
  pillBg?:     string;
  pillFg?:     string;
  brandColor?: string;
  /** The orange field of the Split look, as polygon percentages. */
  field?: { color: string; points: [number, number][] };
}

export const LOOKS: Record<LookId, Look> = {
  classic: {
    id: 'classic', name: 'Classic', bg: PAPER,
    text:  { x: 28, y: 150, w: 214, size: 25, lineHeight: 1.22, weight: '600', color: INK },
    open:  { x: 22, y: 62,  w: 80, r: -3 },
    close: { x: 168, y: 330, w: 80, r: 3 },
  },

  midnight: {
    id: 'midnight', name: 'Midnight', bg: MIDNIGHT,
    // The quotes are far larger than the card and deliberately cropped by it:
    // the words sit inside a quotation too big to see the whole of.
    text:  { x: 30, y: 184, w: 212, size: 24, lineHeight: 1.3, weight: '400', italic: true, color: CREAM },
    open:  { x: -58, y: -30, w: 220, r: -9 },
    close: { x: 120, y: 318, w: 220, r: 7 },
    chipBg: PAPER, pillBg: MIDNIGHT, pillFg: PAPER, brandColor: PAPER,
  },

  sticker: {
    id: 'sticker', name: 'Sticker', bg: YELLOW,
    text:  { x: 44, y: 152, w: 184, size: 21, lineHeight: 1.26, weight: '600', color: INK },
    open:  { x: 4,   y: 60,  w: 96, r: -14 },
    close: { x: 168, y: 318, w: 96, r: 11 },
    slip:  { x: 24, y: 108, w: 222, h: 268, r: -2.2, bg: PAPER, radius: 6, border: 2.5, shadow: 5 },
    quoteDieCut: true,
  },

  stacked: {
    // bg is the confession's category colour, mixed 72% toward white.
    id: 'stacked', name: 'Stacked', bg: null,
    text:  { x: 24, y: 132, w: 222, size: 28, lineHeight: 1.12, weight: '700', color: INK },
    // Lockup spacing: 24 + 66 × (510/346) ≈ 121.
    open:  { x: 24,  y: 46, w: 66, r: 0 },
    close: { x: 121, y: 46, w: 66, r: 0 },
  },

  hush: {
    id: 'hush', name: 'Hush', bg: INDIGO,
    text:  { x: 36, y: 176, w: 198, size: 21, lineHeight: 1.42, weight: '400', italic: true, align: 'center', color: CREAM },
    open:  { x: 40,  y: 124, w: 42, r: 0 },
    close: { x: 188, y: 356, w: 42, r: 0 },
    chipBg: PAPER, pillBg: INDIGO, pillFg: PAPER, brandColor: PAPER,
  },

  split: {
    id: 'split', name: 'Split', bg: '#9A78E6',
    field: { color: '#FF7A2A', points: [[0, 0], [100, 0], [100, 41], [0, 53]] },
    text:  { x: 44, y: 162, w: 182, size: 20, lineHeight: 1.28, weight: '600', color: INK },
    open:  { x: 20,  y: 40,  w: 84, r: -6 },
    close: { x: 166, y: 376, w: 84, r: 6 },
    slip:  { x: 26, y: 122, w: 218, h: 236, r: 1.6, bg: PAPER, radius: 6, border: 2.5, shadow: 0 },
    quoteSolid: PAPER,
    brandColor: PAPER,
  },
};

export const LOOK_COUNT = LOOK_IDS.length;

// ─── Text sizing ─────────────────────────────────────────────────────────────

/**
 * Longer confessions get smaller type so they still fit the fixed card.
 *
 * Stepped rather than continuous: a smooth function would make two similar
 * confessions render at two slightly different sizes for no reason a reader
 * could perceive, and the steps are where the text actually starts to overflow
 * its block at each look's width.
 */
export function textMultiplier(text: string): number {
  const n = text.length;
  if (n < 70)  return 1;
  if (n < 100) return 0.9;
  if (n < 140) return 0.8;
  return 0.72;
}

// ─── Per-share jitter ────────────────────────────────────────────────────────

/** Maximum absolute rotation added to a quote, in degrees. */
export const JITTER_MAX_DEG = 2.2;

/**
 * A small deterministic hash. Not cryptographic and does not need to be: it
 * exists so the same seed redraws the same card (a preview and its capture must
 * match exactly), and so two shares of the same confession look different.
 */
export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A stable value in [0, 1) for a seed and a named slot. */
function unit(seed: string, slot: string): number {
  return (hashSeed(`${seed}:${slot}`) % 100000) / 100000;
}

/** Rotation jitter in degrees, always within ±JITTER_MAX_DEG. */
export function jitterFor(seed: string, slot: 'open' | 'close'): number {
  return (unit(seed, slot) * 2 - 1) * JITTER_MAX_DEG;
}

/** A fresh seed for one share. */
export function newSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Derived colours ─────────────────────────────────────────────────────────

/** Mix a hex colour toward white by `amount` (0..1). */
export function mixToWhite(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((c) => Math.round(c + (255 - c) * amount));
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function categoryColor(category: string | null | undefined): string {
  return CATEGORIES.find((c) => c.id === category)?.color ?? '#9C8BF6';
}

export function categoryLabel(category: string | null | undefined): string {
  return CATEGORIES.find((c) => c.id === category)?.label ?? '';
}

/** The card background for a look, resolving Stacked's category tint. */
export function backgroundFor(look: Look, category: string | null | undefined): string {
  return look.bg ?? mixToWhite(categoryColor(category), 0.72);
}

// ─── Look rotation ───────────────────────────────────────────────────────────

/** The look after `last`, wrapping. A fresh share never repeats the last one. */
export function nextLook(lastIndex: number | null): LookId {
  if (lastIndex === null || !Number.isInteger(lastIndex)) return LOOK_IDS[0];
  const i = (((lastIndex + 1) % LOOK_COUNT) + LOOK_COUNT) % LOOK_COUNT;
  return LOOK_IDS[i];
}

export function lookIndex(id: LookId): number {
  return LOOK_IDS.indexOf(id);
}

// ─── Card copy ───────────────────────────────────────────────────────────────

/**
 * What the card says, given whose confession it is.
 *
 * An own confession is SEALED by default: the milestone is that strangers felt
 * it, and the words themselves are only included if the writer explicitly asks
 * for that. The consent line is not softenable — it is the voice-consent rule's
 * sibling (CLAUDE.md #3), applied to text a person may not want traced back.
 */
export const INCLUDE_WORDS_CONSENT =
  'People who know you may recognise what you wrote.';

export function cardText(opts: {
  text: string;
  own: boolean;
  includeWords: boolean;
  feltCount: number;
}): string {
  if (opts.own && !opts.includeWords) {
    const n = opts.feltCount;
    return `Something I wrote was felt by ${n} ${n === 1 ? 'stranger' : 'strangers'}.`;
  }
  return opts.text;
}

export function pillText(opts: {
  own: boolean;
  includeWords: boolean;
  feltCount: number;
}): string {
  const n = opts.feltCount;
  if (opts.own && !opts.includeWords) {
    return `felt by ${n} ${n === 1 ? 'stranger' : 'strangers'}`;
  }
  return `${n} felt this too`;
}

/** The pill is hidden at zero — "0 felt this too" is a sad, useless sentence. */
export function showPill(feltCount: number): boolean {
  return Number.isFinite(feltCount) && feltCount > 0;
}
