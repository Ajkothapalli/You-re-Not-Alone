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
  /**
   * Design-space Y the words must stop above.
   *
   * Defaults to TEXT_FLOOR — just above the felt pill. Looks that set the
   * words inside a paper slip override it with the slip's inner edge,
   * because overflowing a slip is visible long before it reaches the pill.
   */
  maxY?: number;
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
    // slip 108 + 268 = 376; the words stop a touch inside its edge.
    text:  { x: 44, y: 152, w: 184, size: 21, lineHeight: 1.26, weight: '600', color: INK, maxY: 366 },
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
    // slip 122 + 236 = 358; the words stop a touch inside its edge.
    text:  { x: 44, y: 162, w: 182, size: 20, lineHeight: 1.28, weight: '600', color: INK, maxY: 348 },
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
  // Floor at 0.8. Below that a long confession became a wall of grey that
  // nobody reads — and shrinking type was only ever a way to make the whole
  // thing fit, which snippetFor now does properly by CUTTING it.
  return 0.8;
}

// ─── The snippet ─────────────────────────────────────────────────────────────

/**
 * Design-space Y the words must stop above, when a look does not say.
 *
 * The felt pill sits at bottom 18 and stands about 28 high, so it starts at
 * 480 − 18 − 28 = 434. Ten below that is the gutter.
 */
export const TEXT_FLOOR = 424;

/**
 * The most lines a card will show, however much room there is.
 *
 * Shrinking the type was the only defence before, and it is the wrong one
 * past a point: a confession set small enough to fit entirely is a wall of
 * grey nobody reads, and the card stops being an invitation and becomes the
 * whole thing — there is then no reason to open the app at all.
 *
 * Nine is a backstop rather than the usual limit: most looks run out of
 * room first (see textFit), and this only catches the tall, small-type
 * compositions where geometry alone would allow a dozen lines.
 */
export const SNIPPET_MAX_LINES = 9;

/** Average glyph advance as a fraction of font size, for the serif faces. */
const CHAR_EM = 0.52;

/**
 * How the words are fitted, for one look at one size.
 *
 * Returns the hard line cap (geometry) and the snippet cap (editorial),
 * which is the smaller of the two.
 */
export function textFit(look: Look, mult: number): {
  lineHeight: number; charsPerLine: number; fits: number; maxLines: number;
} {
  const size       = look.text.size * mult;
  const lineHeight = size * look.text.lineHeight;
  const floor      = look.text.maxY ?? TEXT_FLOOR;
  const fits       = Math.max(1, Math.floor((floor - look.text.y) / lineHeight));
  return {
    lineHeight,
    charsPerLine: Math.max(8, Math.floor(look.text.w / (size * CHAR_EM))),
    fits,
    maxLines: Math.min(fits, SNIPPET_MAX_LINES),
  };
}

/**
 * Greedy wrap, respecting the writer's own line breaks.
 *
 * Paragraph breaks matter here: a confession with two blank lines in it
 * spends those lines whether or not any words are on them, and a character
 * count that ignores them underestimates the height by exactly the amount
 * that was overflowing the card.
 */
export function wrapLines(text: string, charsPerLine: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) { out.push(''); continue; }
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (next.length <= charsPerLine) { line = next; continue; }
      if (line) out.push(line);
      line = w;
    }
    out.push(line);
  }
  return out;
}

/**
 * The words that actually go on the card.
 *
 * Cut at a LINE boundary rather than a character count, so the snippet ends
 * on a whole word and the ellipsis reads as "there is more" rather than as a
 * rendering accident.
 *
 * `numberOfLines` on the Text is still set from this, as a backstop: this is
 * an estimate of glyph widths, and the one thing that must not happen is
 * words spilling past the card. If the estimate is generous, the renderer
 * clips; if it is tight, the string was already cut. Either way nothing
 * overflows, which is the property that matters.
 */
export function snippetFor(text: string, look: Look, mult: number): {
  body: string; truncated: boolean; maxLines: number;
} {
  const { charsPerLine, maxLines } = textFit(look, mult);
  const lines = wrapLines(text, charsPerLine);
  if (lines.length <= maxLines) {
    return { body: text, truncated: false, maxLines };
  }
  // One line is given back to the "there is more" cue that will be drawn
  // underneath, so the cue cannot be what pushes the card over.
  const keep = Math.max(1, maxLines - 1);
  const kept = lines.slice(0, keep);

  /**
   * The ellipsis has to fit on the last line too.
   *
   * Appending it to a line already at the full width wraps that line in
   * two, so the snippet quietly came out one line taller than it asked
   * for — which on the tightest look is the difference between sitting
   * inside the paper slip and sitting on its edge. Drop words from the
   * last line until the character fits.
   */
  let last = kept[kept.length - 1] ?? '';
  while (last.length + 1 > charsPerLine && last.includes(' ')) {
    last = last.slice(0, last.lastIndexOf(' '));
  }
  kept[kept.length - 1] = last.replace(/[\s.,;:—-]+$/, '');

  return { body: `${kept.join('\n')}…`, truncated: true, maxLines: keep };
}

/**
 * What the card says when it is only holding part of a confession.
 *
 * Not "read more" — there is nothing to tap on a PNG. It names where the
 * rest is, which is the only thing a still image can honestly offer.
 */
export const MORE_CUE = 'The rest is on soulyap';

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
