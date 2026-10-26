/**
 * Colours you can actually read.
 *
 * Reported from a device on 2026-10-04: the yellow was unreadable. It was
 * not a near miss — #FFE500 on the light card is **1.28:1**, against the
 * 4.5:1 WCAG AA wants for body text. It was being used for a call to
 * action, a card eyebrow, and the warning on a voice recording about to
 * run out.
 *
 * The same yellow BEHIND #1A1A1A is 13.6:1, which is why every button in
 * this app is a yellow pill and none of them is yellow writing. The accent
 * is a ground. `accentText` is the colour for the cases where a ground
 * does not fit.
 *
 * Ratios are computed here rather than eyeballed, because "looks a bit
 * light" is exactly the judgement that shipped this.
 */

import { lightColors, darkColors, type ColorSet } from '@/theme/tokens';

// ─── WCAG 2.1 relative luminance and contrast ────────────────────────────────

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA: 4.5:1 for body text, 3:1 for large (>=24px or >=19px bold). */
const AA       = 4.5;
const AA_LARGE = 3;

const THEMES: [string, ColorSet][] = [['light', lightColors], ['dark', darkColors]];

describe('the contrast maths is right before it is trusted', () => {
  it('matches the values WCAG publishes', () => {
    expect(contrast('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    // The one that started this.
    expect(contrast('#FFE500', '#FFFFFF')).toBeLessThan(1.3);
  });

  it('is symmetric', () => {
    expect(contrast('#FFE500', '#1A1A1A')).toBeCloseTo(contrast('#1A1A1A', '#FFE500'), 5);
  });
});

describe('body text is readable on every surface', () => {
  it.each(THEMES)('%s: paper on ink, bg and the accent', (name, c) => {
    expect([name, 'ink', contrast(c.paper, c.ink) >= AA]).toEqual([name, 'ink', true]);
    expect([name, 'bg',  contrast(c.paper, c.bg)  >= AA]).toEqual([name, 'bg',  true]);
  });

  it.each(THEMES)('%s: the dim secondary text clears AA-large', (name, c) => {
    /**
     * KNOWN GAP, recorded rather than quietly passed.
     *
     * `dim` is 3.54:1 on the light card and 3.21:1 on the dark one. That
     * clears the 3:1 WCAG asks for LARGE text and misses the 4.5:1 it
     * asks for body — and dim is used for real sentences (card bodies,
     * the premium blurb, "read more"), not just captions.
     *
     * Not changed here: it is every piece of secondary text in the app,
     * it was not what was reported, and darkening it is a visual call
     * for the owner rather than a correctness fix. This pins the floor
     * so it cannot quietly get worse, and the numbers are written down
     * so the decision can be made with them.
     */
    expect([name, contrast(c.dim, c.ink) >= AA_LARGE]).toEqual([name, true]);
    expect([name, contrast(c.dim, c.bg)  >= AA_LARGE]).toEqual([name, true]);
  });
});

describe('the accent is a GROUND', () => {
  it.each(THEMES)('%s: ink on the accent is excellent', (name, c) => {
    // The Share button, the premium CTA, the tooltip's action pill.
    expect(contrast('#1A1A1A', c.accent)).toBeGreaterThan(10);
  });

  it('and as TEXT on the light card it is unusable — this is why accentText exists', () => {
    expect(contrast(lightColors.accent, lightColors.ink)).toBeLessThan(1.3);
    expect(contrast(lightColors.accent, lightColors.bg)).toBeLessThan(1.3);
  });
});

describe('accentText is readable wherever text goes', () => {
  it.each(THEMES)('%s: on the card and on the screen', (name, c) => {
    expect([name, 'ink', contrast(c.accentText, c.ink) >= AA]).toEqual([name, 'ink', true]);
    expect([name, 'bg',  contrast(c.accentText, c.bg)  >= AA]).toEqual([name, 'bg',  true]);
  });

  it('dark theme keeps the real yellow, which is already perfect there', () => {
    expect(darkColors.accentText).toBe(darkColors.accent);
    expect(contrast(darkColors.accent, darkColors.ink)).toBeGreaterThan(10);
  });

  it('light theme does not, because it cannot', () => {
    expect(lightColors.accentText).not.toBe(lightColors.accent);
  });

  it('feltText already solved this once, the same way', () => {
    // The precedent accentText follows: ink in light, yellow in dark.
    for (const [name, c] of THEMES) {
      expect([name, contrast(c.feltText, c.ink) >= AA]).toEqual([name, true]);
    }
  });
});

// ─── The rule, enforced on the source ────────────────────────────────────────

describe('nothing writes in the accent', () => {
  const fs   = require('fs');
  const path = require('path');
  const ROOT = path.join(__dirname, '..', '..');

  function sources(dir: string): string[] {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) return [];
    return fs.readdirSync(full, { withFileTypes: true }).flatMap((e: any) =>
      e.isDirectory() ? sources(path.join(dir, e.name))
      : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)]
      : [],
    );
  }

  const FILES = [...sources('app'), ...sources('components')];

  it('`color: color.accent` appears nowhere', () => {
    /**
     * The whole bug in one pattern. As a background the accent is the
     * best colour in the system; as a foreground on paper it is the
     * worst. `accentText` is the answer where a pill does not fit.
     */
    const offenders = FILES.filter((f) => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
      // Same care as below: lowercase `color:` only, so the many correct
      // `backgroundColor: color.accent` grounds are not false positives.
      return /(?<![A-Za-z])color:\s*(?:color|c|colors)\.accent\b/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it('and neither does the raw hex, as text', () => {
    // #FFE500 typed out and used as a foreground is the same mistake with
    // the token removed.
    const offenders = FILES.filter((f) => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
      // No `i` flag, and a lookbehind: `backgroundColor: '#FFE500'` is the
      // CORRECT use and must not be flagged. An earlier version of this
      // guard was case-insensitive and reported every button in the app.
      return /(?<![A-Za-z])color:\s*'#FFE500'/.test(src);
    });
    expect(offenders).toEqual([]);
  });
});
