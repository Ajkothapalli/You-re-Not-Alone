/**
 * The skeleton has to be a skeleton OF SOMETHING.
 *
 * Its whole job is that the real card lands where the placeholder sat. A
 * skeleton with the wrong geometry is worse than a spinner: a spinner
 * promises nothing, a wrong skeleton promises a layout and then moves it
 * under the reader's thumb.
 *
 * It had drifted into a generic card — hairline border, three short lines,
 * a round avatar in a footer — against a real card with a 2px border, a
 * hard offset shadow, a 220 minimum height, 28px padding and the persona at
 * the TOP. So most of this file reads BOTH components' source and asserts
 * the numbers are the same number, because that is the failure: not a
 * crash, just two files quietly disagreeing about one shape.
 */

import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { render } from '@testing-library/react-native';
import FeedSkeleton, { CARD } from '@/components/FeedSkeleton';

const ROOT = path.join(__dirname, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const readCard  = read('components', 'ReadCard.tsx');
const explore   = read('app', '(tabs)', 'explore.tsx');

/** Pull `key: 123` out of a StyleSheet source. */
function num(src: string, key: string): number | null {
  const m = new RegExp(`${key}:\\s*(\\d+)`).exec(src);
  return m ? Number(m[1]) : null;
}

describe('it is shaped like the card it stands in for', () => {
  it('uses the real card\'s hard offset shadow', () => {
    // `const SHADOW = 5`, not a style key — matched on its own.
    const m = /const SHADOW\s*=\s*(\d+)/.exec(readCard);
    expect(m).not.toBeNull();
    expect(CARD.shadow).toBe(Number(m![1]));
  });

  it('reserves the card\'s minimum height, so nothing jumps on arrival', () => {
    // The one number that decides whether the feed shifts when it lands.
    expect(CARD.minHeight).toBe(num(readCard, 'minHeight'));
  });

  it('has the card\'s 2px border, not a hairline', () => {
    expect(CARD.border).toBe(num(readCard, 'borderWidth'));
    const skeleton = read('components', 'FeedSkeleton.tsx');
    expect(skeleton).not.toMatch(/hairlineWidth/);
  });

  it('has the card\'s padding and footer gap', () => {
    const content = readCard.slice(readCard.indexOf('content: {'));
    expect(CARD.padding).toBe(num(content.slice(0, 80), 'padding'));
    const footer = readCard.slice(readCard.indexOf('footer: {'));
    expect(CARD.footerGap).toBe(num(footer.slice(0, 200), 'paddingTop'));
  });

  it('puts the persona at the TOP, where the card puts it', () => {
    // It used to be an avatar in a footer — upside down relative to the
    // thing it was standing in for.
    const skeleton = read('components', 'FeedSkeleton.tsx');
    const persona  = skeleton.indexOf('styles.personaRow');
    const footer   = skeleton.indexOf('styles.footer}');
    expect(persona).toBeGreaterThan(-1);
    expect(persona).toBeLessThan(footer);
    expect(CARD.personaGap).toBe(num(readCard.slice(readCard.indexOf('personaRow: {')), 'marginBottom'));
  });

  it('spaces body lines on the confession\'s own line height', () => {
    // 19 * 1.5 = 28.5 in tokens; the skeleton rounds it.
    const tokens = read('theme', 'tokens.ts');
    const size   = num(tokens, 'confessionSize');
    expect(size).not.toBeNull();
    expect(CARD.lineHeight).toBe(Math.round(size! * 1.5));
  });

  it('sits on the same padding as the list it replaces', () => {
    // If the container padding differs, every card shifts sideways when
    // the real feed renders — the exact jump this is here to prevent.
    const skeleton = read('components', 'FeedSkeleton.tsx');
    const scroll   = explore.slice(explore.indexOf('scroll: {'));
    expect(num(scroll.slice(0, 200), 'paddingTop')).toBe(8);
    expect(skeleton).toMatch(/paddingTop:\s*8/);
    expect(num(scroll.slice(0, 200), 'gap')).toBe(16);
    expect(skeleton).toMatch(/gap:\s*16/);
  });
});

describe('what it draws', () => {
  it('renders, and announces itself as loading rather than as content', async () => {
    const { getByTestId, getByLabelText } = await render(<FeedSkeleton />);
    expect(getByTestId('feed-skeleton')).toBeTruthy();
    expect(getByLabelText('Loading confessions')).toBeTruthy();
  });

  it('shows the shadow in the palette colour that position will really get', async () => {
    // The feed indexes palettes by position too, so the colour under the
    // first card does not change when the real one arrives.
    const { palettes } = require('@/theme/palettes');
    const { toJSON } = await render(<FeedSkeleton />);
    const found: string[] = [];
    const walk = (n: any) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach(walk);
      const bg = [n.props?.style].flat(3).find((s: any) => s && s.backgroundColor);
      if (bg && typeof bg.backgroundColor === 'string') found.push(bg.backgroundColor);
      walk(n.children);
    };
    walk(toJSON());
    expect(found).toContain(palettes[0].you);
    expect(found).toContain(palettes[1].you);
  });

  it('is not the same card three times', async () => {
    // A real feed is ragged. Three identical blocks read as a loading
    // graphic rather than as cards about to arrive.
    const skeleton = read('components', 'FeedSkeleton.tsx');
    const shapes = skeleton.slice(skeleton.indexOf('const SHAPES'), skeleton.indexOf('export default'));
    expect(shapes).toMatch(/headline: true/);
    expect(shapes).toMatch(/headline: false/);
  });
});
