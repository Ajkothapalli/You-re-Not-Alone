/**
 * The look table.
 *
 * These numbers decide what lands in a 1080×1920 PNG that leaves the platform
 * and cannot be recalled, so they are asserted directly rather than through a
 * render tree. The design is specified in 270×480; the card is 360×640; the
 * only thing standing between those two is SCALE, and a mistake there is a
 * whole generation of crooked cards nobody can take back.
 */

import {
  LOOKS, LOOK_IDS, LOOK_COUNT, SCALE, px, DESIGN_W, DESIGN_H, CARD_W, CARD_H,
  textMultiplier, jitterFor, hashSeed, newSeed, JITTER_MAX_DEG,
  mixToWhite, categoryColor, backgroundFor, nextLook, lookIndex,
  cardText, pillText, showPill, INCLUDE_WORDS_CONSENT,
  snippetFor, textFit, wrapLines, TEXT_FLOOR, SNIPPET_MAX_LINES, MORE_CUE,
  INK, PAPER,
} from '@/lib/shareLooks';
import { LOCKUP_GAP_RATIO } from '@/components/brand/SoulyapLogo';
import { CATEGORY_IDS } from '@/lib/categories';

// ─── The two coordinate spaces ───────────────────────────────────────────────

describe('design space scales to capture space', () => {
  it('is exactly 4/3', () => {
    expect(SCALE).toBeCloseTo(4 / 3, 10);
    expect(CARD_W / DESIGN_W).toBeCloseTo(SCALE, 10);
    expect(CARD_H / DESIGN_H).toBeCloseTo(SCALE, 10);
  });

  it('the capture card is 360×640, so a 3× capture is 1080×1920', () => {
    expect([CARD_W, CARD_H]).toEqual([360, 640]);
    expect([CARD_W * 3, CARD_H * 3]).toEqual([1080, 1920]);
  });

  it.each([[0, 0], [20, 26.666], [2.5, 3.333], [270, 360], [480, 640]])(
    'px(%s) = %s', (design, expected) => {
      expect(px(design)).toBeCloseTo(expected, 2);
    });
});

// ─── Every look ──────────────────────────────────────────────────────────────

describe('all six looks exist and are complete', () => {
  it('has exactly six, in a stable order', () => {
    expect(LOOK_IDS).toEqual(['classic', 'midnight', 'sticker', 'stacked', 'hush', 'split']);
    expect(LOOK_COUNT).toBe(6);
  });

  it.each(LOOK_IDS)('%s has both quotes, text and a name', (id) => {
    const l = LOOKS[id];
    expect(l.id).toBe(id);
    expect(l.name.length).toBeGreaterThan(0);
    for (const q of [l.open, l.close]) {
      expect(typeof q.x).toBe('number');
      expect(typeof q.y).toBe('number');
      expect(q.w).toBeGreaterThan(0);
      expect(Number.isFinite(q.r)).toBe(true);
    }
    expect(l.text.w).toBeGreaterThan(0);
    expect(l.text.size).toBeGreaterThan(0);
  });
});

describe('the spec numbers, at capture scale', () => {
  // Design values from the brief, each × 4/3.
  const EXPECT: Record<string, { open: number[]; close: number[]; text: number[] }> = {
    classic:  { open: [22, 62, 80],    close: [168, 330, 80],  text: [28, 150, 214] },
    midnight: { open: [-58, -30, 220], close: [120, 318, 220], text: [30, 184, 212] },
    sticker:  { open: [4, 60, 96],     close: [168, 318, 96],  text: [44, 152, 184] },
    stacked:  { open: [24, 46, 66],    close: [121, 46, 66],   text: [24, 132, 222] },
    hush:     { open: [40, 124, 42],   close: [188, 356, 42],  text: [36, 176, 198] },
    split:    { open: [20, 40, 84],    close: [166, 376, 84],  text: [44, 162, 182] },
  };

  it.each(LOOK_IDS)('%s places its quotes and text where the design says', (id) => {
    const l = LOOKS[id];
    const e = EXPECT[id];
    expect([px(l.open.x),  px(l.open.y),  px(l.open.w)])
      .toEqual(e.open.map(px));
    expect([px(l.close.x), px(l.close.y), px(l.close.w)])
      .toEqual(e.close.map(px));
    expect([px(l.text.x), px(l.text.y), px(l.text.w)])
      .toEqual(e.text.map(px));
  });

  it('rotations match the design, in degrees', () => {
    expect([LOOKS.classic.open.r,  LOOKS.classic.close.r]).toEqual([-3, 3]);
    expect([LOOKS.midnight.open.r, LOOKS.midnight.close.r]).toEqual([-9, 7]);
    expect([LOOKS.sticker.open.r,  LOOKS.sticker.close.r]).toEqual([-14, 11]);
    expect([LOOKS.stacked.open.r,  LOOKS.stacked.close.r]).toEqual([0, 0]);
    expect([LOOKS.hush.open.r,     LOOKS.hush.close.r]).toEqual([0, 0]);
    expect([LOOKS.split.open.r,    LOOKS.split.close.r]).toEqual([-6, 6]);
  });

  it('Stacked reproduces the logo lockup spacing', () => {
    const { open, close } = LOOKS.stacked;
    expect(close.x - open.x).toBeCloseTo(open.w * LOCKUP_GAP_RATIO, 0);
  });

  it('Midnight\'s quotes are meant to be cropped by the card', () => {
    // Deliberately larger than the card and partly outside it — a "fix" that
    // pulled them inside would quietly destroy the look.
    expect(LOOKS.midnight.open.x).toBeLessThan(0);
    expect(LOOKS.midnight.open.y).toBeLessThan(0);
    expect(px(LOOKS.midnight.open.w)).toBeGreaterThan(CARD_W * 0.7);
  });

  it('the slips are only on Sticker and Split', () => {
    expect(LOOKS.sticker.slip).toBeDefined();
    expect(LOOKS.split.slip).toBeDefined();
    for (const id of ['classic', 'midnight', 'stacked', 'hush'] as const) {
      expect(LOOKS[id].slip).toBeUndefined();
    }
    expect(LOOKS.sticker.slip).toMatchObject({ x: 24, y: 108, w: 222, h: 268, r: -2.2, shadow: 5 });
    expect(LOOKS.split.slip).toMatchObject({ x: 26, y: 122, w: 218, h: 236, r: 1.6 });
  });

  it('Split has the orange field, clipped to the spec polygon', () => {
    expect(LOOKS.split.field).toEqual({
      color: '#FF7A2A',
      points: [[0, 0], [100, 0], [100, 41], [0, 53]],
    });
    expect(LOOKS.split.quoteSolid).toBe(PAPER);
  });

  it('Sticker die-cuts its quotes; nothing else does', () => {
    expect(LOOKS.sticker.quoteDieCut).toBe(true);
    for (const id of LOOK_IDS.filter((i) => i !== 'sticker')) {
      expect(LOOKS[id].quoteDieCut).toBeFalsy();
    }
  });

  it('the dark looks re-tone their chip, pill and brand', () => {
    for (const id of ['midnight', 'hush'] as const) {
      expect(LOOKS[id].chipBg).toBe(PAPER);
      expect(LOOKS[id].pillFg).toBe(PAPER);
      expect(LOOKS[id].brandColor).toBe(PAPER);
    }
  });
});

// ─── Text sizing ─────────────────────────────────────────────────────────────

describe('longer text gets smaller', () => {
  it.each([
    [10, 1], [69, 1], [70, 0.9], [99, 0.9],
    // Floored at 0.8 on 2026-10-02. It used to drop to 0.72, which was the
    // only thing standing between a long confession and the bottom edge of
    // the card — and it lost. snippetFor CUTS the text now, so the type no
    // longer has to shrink past readable to make a wall of grey fit.
    [100, 0.8], [139, 0.8], [140, 0.8], [400, 0.8],
  ])('%s characters → ×%s', (len, mult) => {
    expect(textMultiplier('x'.repeat(len))).toBe(mult);
  });

  it('never shrinks past readable, however long the confession', () => {
    for (const n of [140, 400, 2000]) {
      expect(textMultiplier('x'.repeat(n))).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('never grows text, only shrinks it', () => {
    for (let n = 0; n < 400; n += 7) {
      expect(textMultiplier('x'.repeat(n))).toBeLessThanOrEqual(1);
    }
  });

  it('is monotonic — a longer confession is never set larger', () => {
    let prev = Infinity;
    for (let n = 0; n < 400; n++) {
      const m = textMultiplier('x'.repeat(n));
      expect(m).toBeLessThanOrEqual(prev);
      prev = m;
    }
  });
});

// ─── Jitter ──────────────────────────────────────────────────────────────────

describe('per-share rotation jitter', () => {
  const seeds = Array.from({ length: 500 }, (_, i) => `seed-${i}`);

  it('never exceeds ±2.2°', () => {
    expect(JITTER_MAX_DEG).toBe(2.2);
    for (const s of seeds) {
      for (const slot of ['open', 'close'] as const) {
        expect(Math.abs(jitterFor(s, slot))).toBeLessThanOrEqual(JITTER_MAX_DEG);
      }
    }
  });

  it('is deterministic — the preview and the capture must match exactly', () => {
    for (const s of seeds.slice(0, 50)) {
      expect(jitterFor(s, 'open')).toBe(jitterFor(s, 'open'));
    }
  });

  it('gives the two quotes independent angles', () => {
    const differ = seeds.filter((s) => jitterFor(s, 'open') !== jitterFor(s, 'close'));
    expect(differ.length).toBe(seeds.length);
  });

  it('actually varies between seeds', () => {
    const vals = new Set(seeds.map((s) => jitterFor(s, 'open').toFixed(4)));
    expect(vals.size).toBeGreaterThan(400);
  });

  it('uses both directions, not just one', () => {
    const vals = seeds.map((s) => jitterFor(s, 'open'));
    expect(vals.some((v) => v > 0.5)).toBe(true);
    expect(vals.some((v) => v < -0.5)).toBe(true);
  });

  it('hashSeed is stable and unsigned', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).toBeGreaterThanOrEqual(0);
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
  });

  it('newSeed produces distinct seeds', () => {
    const s = new Set(Array.from({ length: 200 }, newSeed));
    expect(s.size).toBeGreaterThan(190);
  });
});

// ─── Colour ──────────────────────────────────────────────────────────────────

describe('Stacked tints from the confession category', () => {
  it('mixes 72% toward white', () => {
    expect(mixToWhite('#000000', 0)).toBe('#000000');
    expect(mixToWhite('#000000', 1)).toBe('#FFFFFF');
    expect(mixToWhite('#000000', 0.72)).toBe('#B8B8B8');
  });

  it('never returns an unreadable near-black ground', () => {
    for (const id of CATEGORY_IDS) {
      const bg = backgroundFor(LOOKS.stacked, id);
      const n = parseInt(bg.slice(1), 16);
      const lum = ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
      // Stacked sets ink-coloured text on this, so it has to stay light.
      expect(lum).toBeGreaterThan(180);
    }
  });

  it('falls back rather than throwing on an unknown category', () => {
    expect(() => backgroundFor(LOOKS.stacked, 'nonsense')).not.toThrow();
    expect(backgroundFor(LOOKS.stacked, null)).toMatch(/^#[0-9A-F]{6}$/);
    expect(mixToWhite('not-a-colour', 0.5)).toBe('not-a-colour');
  });

  it('every other look has a fixed background', () => {
    for (const id of LOOK_IDS.filter((i) => i !== 'stacked')) {
      expect(LOOKS[id].bg).not.toBeNull();
      expect(backgroundFor(LOOKS[id], 'grief')).toBe(LOOKS[id].bg);
    }
  });

  it('categoryColor knows every category', () => {
    for (const id of CATEGORY_IDS) expect(categoryColor(id)).toMatch(/^#[0-9A-F]{6}$/i);
  });
});

// ─── Rotation across shares ──────────────────────────────────────────────────

describe('each share opens on a different look', () => {
  it('advances by one and wraps', () => {
    expect(nextLook(0)).toBe('midnight');
    expect(nextLook(4)).toBe('split');
    expect(nextLook(5)).toBe('classic');
  });

  it('starts at the first look when nothing is stored', () => {
    expect(nextLook(null)).toBe('classic');
  });

  it('survives a corrupted stored value', () => {
    expect(nextLook(NaN as number)).toBe('classic');
    expect(nextLook(-1)).toBe('classic');
    expect(LOOK_IDS).toContain(nextLook(9999));
  });

  it('visits every look before repeating', () => {
    const seen: string[] = [];
    let i = 0;
    for (let n = 0; n < LOOK_COUNT; n++) {
      const l = nextLook(i);
      seen.push(l);
      i = lookIndex(l);
    }
    expect(new Set(seen).size).toBe(LOOK_COUNT);
  });
});

// ─── What the card says ──────────────────────────────────────────────────────

describe('own confessions are sealed by default', () => {
  const own = { text: 'the real words', own: true, feltCount: 217 };

  it('says the milestone, not the confession', () => {
    expect(cardText({ ...own, includeWords: false }))
      .toBe('Something I wrote was felt by 217 strangers.');
    expect(cardText({ ...own, includeWords: false })).not.toContain('the real words');
  });

  it('shows the words only when explicitly included', () => {
    expect(cardText({ ...own, includeWords: true })).toBe('the real words');
  });

  it('pills match', () => {
    expect(pillText({ own: true, includeWords: false, feltCount: 217 }))
      .toBe('felt by 217 strangers');
    expect(pillText({ own: true, includeWords: true, feltCount: 217 }))
      .toBe('217 felt this too');
    expect(pillText({ own: false, includeWords: false, feltCount: 217 }))
      .toBe('217 felt this too');
  });

  it('says "stranger" in the singular', () => {
    expect(cardText({ ...own, feltCount: 1, includeWords: false }))
      .toBe('Something I wrote was felt by 1 stranger.');
    expect(pillText({ own: true, includeWords: false, feltCount: 1 }))
      .toBe('felt by 1 stranger');
  });

  it('someone else\'s confession always shows their words', () => {
    expect(cardText({ text: 'their words', own: false, includeWords: false, feltCount: 3 }))
      .toBe('their words');
  });

  it('the consent line is present and names recognition', () => {
    expect(INCLUDE_WORDS_CONSENT).toBe('People who know you may recognise what you wrote.');
  });
});

describe('the felt pill at zero', () => {
  it('is hidden', () => {
    expect(showPill(0)).toBe(false);
  });

  it('is shown for any real count', () => {
    for (const n of [1, 2, 217, 10_000]) expect(showPill(n)).toBe(true);
  });

  it('is hidden for a missing or nonsense count', () => {
    // getOwnRealFeltCount returns null when it cannot establish a real number;
    // callers pass 0, and the card must then claim nothing.
    for (const n of [-1, NaN, Infinity]) expect(showPill(n)).toBe(false);
  });
});

// ─── The snippet ─────────────────────────────────────────────────────────────

/**
 * The card is a fixed 1080×1920 PNG that goes to strangers and cannot be
 * recalled. Text running off the bottom of it — through the felt pill, the
 * brand and out of the picture — is not a layout nit; it is the product
 * arriving broken on someone else's phone, forever.
 *
 * There was no line limit at all. Shrinking the type was the only defence
 * and it ran out long before the text did.
 */

/** A real confession, the length that was overflowing. */
const LONG = [
  'everyone said the first christmas would be the hard one so i braced for months',
  '',
  "it was fine. we were all braced together, that's the thing, everyone was watching everyone",
  '',
  "it was the second one, when the bracing stopped and they'd all gone back to normal, that flattened me",
].join('\n');

describe('nothing can run off the bottom of the card', () => {
  it.each(LOOK_IDS)('%s keeps the words above its floor', (id) => {
    const look = LOOKS[id];
    const mult = textMultiplier(LONG);
    const { body, maxLines } = snippetFor(LONG, look, mult);
    const { lineHeight, charsPerLine } = textFit(look, mult);

    const lines = wrapLines(body, charsPerLine).length;
    expect(lines).toBeLessThanOrEqual(maxLines);

    const bottom = look.text.y + lines * lineHeight;
    const floor  = look.text.maxY ?? TEXT_FLOOR;
    expect([id, bottom <= floor]).toEqual([id, true]);
  });

  it('the floor clears the felt pill', () => {
    // pill: bottom 18, about 28 tall → starts at 434.
    expect(TEXT_FLOOR).toBeLessThan(DESIGN_H - 18 - 28);
  });

  it.each(['sticker', 'split'] as const)('%s stays inside its paper slip', (id) => {
    // Overflowing a slip is visible long before the words reach the pill.
    const look = LOOKS[id];
    expect(look.slip).toBeDefined();
    expect(look.text.maxY).toBeDefined();
    expect(look.text.maxY!).toBeLessThanOrEqual(look.slip!.y + look.slip!.h);
  });

  it('survives a confession far longer than anything realistic', () => {
    const wall = 'word '.repeat(600);
    for (const id of LOOK_IDS) {
      const look = LOOKS[id];
      const mult = textMultiplier(wall);
      const { body, maxLines } = snippetFor(wall, look, mult);
      const { charsPerLine } = textFit(look, mult);
      expect([id, wrapLines(body, charsPerLine).length <= maxLines]).toEqual([id, true]);
    }
  });
});

describe('it is a snippet, not the whole confession', () => {
  it('cuts a long one and says so', () => {
    const { body, truncated } = snippetFor(LONG, LOOKS.classic, textMultiplier(LONG));
    expect(truncated).toBe(true);
    expect(body.endsWith('…')).toBe(true);
    expect(body.length).toBeLessThan(LONG.length);
  });

  it('leaves a short one completely alone', () => {
    // Most confessions are short. They must look exactly as they did.
    const short = 'i still check his profile every night.';
    const { body, truncated } = snippetFor(short, LOOKS.classic, textMultiplier(short));
    expect(truncated).toBe(false);
    expect(body).toBe(short);
  });

  it('cuts on a word, never mid-word', () => {
    const { body } = snippetFor(LONG, LOOKS.split, textMultiplier(LONG));
    const stem = body.slice(0, -1);
    // Every word kept is a word the writer actually wrote.
    for (const w of stem.split(/\s+/).filter(Boolean)) {
      expect(LONG).toContain(w);
    }
  });

  it('does not leave dangling punctuation before the ellipsis', () => {
    const { body } = snippetFor(LONG, LOOKS.classic, textMultiplier(LONG));
    expect(body).not.toMatch(/[\s,;:—-]…$/);
  });

  it('gives a line back to the cue, so the cue cannot be what overflows', () => {
    const look = LOOKS.classic;
    const mult = textMultiplier(LONG);
    const full = textFit(look, mult);
    const { maxLines } = snippetFor(LONG, look, mult);
    expect(maxLines).toBe(full.maxLines - 1);
  });

  it('the cue names where the rest is, and promises no tap', () => {
    // It is printed into a PNG. "Read more" on a still image is a button
    // that does not exist.
    expect(MORE_CUE).toMatch(/soulyap/i);
    expect(MORE_CUE.toLowerCase()).not.toContain('tap');
    expect(MORE_CUE.toLowerCase()).not.toContain('click');
  });
});

describe('wrapping respects what the writer typed', () => {
  it('spends a line on a blank line', () => {
    // Paragraph breaks are why the old character-count sizing underestimated
    // the height by exactly the amount that was overflowing.
    expect(wrapLines('a\n\nb', 40)).toEqual(['a', '', 'b']);
  });

  it('breaks a long paragraph at the width', () => {
    expect(wrapLines('aaa bbb ccc ddd', 7)).toEqual(['aaa bbb', 'ccc ddd']);
  });

  it('never splits a word that is longer than the line', () => {
    expect(wrapLines('supercalifragilistic', 5)).toEqual(['supercalifragilistic']);
  });
});

describe('the line cap', () => {
  it('is whichever is smaller: what fits, or the snippet limit', () => {
    for (const id of LOOK_IDS) {
      const f = textFit(LOOKS[id], 1);
      expect(f.maxLines).toBe(Math.min(f.fits, SNIPPET_MAX_LINES));
    }
  });

  it('always leaves at least one line, however cramped', () => {
    const cramped = { ...LOOKS.classic, text: { ...LOOKS.classic.text, y: 420 } };
    expect(textFit(cramped, 1).maxLines).toBeGreaterThanOrEqual(1);
  });
});
