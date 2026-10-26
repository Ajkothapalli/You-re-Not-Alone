/**
 * The feed clock's tooltip.
 *
 * A pill showing a bare time with a colour that changes is the kind of
 * thing people tap to find out what it is. The tooltip answers that, and
 * the rules it has to keep are: it must not cost the reader their place in
 * the feed, and it must not quietly become a countdown.
 */

import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import FeedClock from '@/components/FeedClock';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { CLOCK_TOOLTIP, CLOCK_TOOLTIP_CTA, TOOLTIP_MS } from '@/lib/timeOfDay';
import { DAILY_ALLOWANCE } from '@/lib/readAllowance';

const ROOT = path.join(__dirname, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

const draw = (onPremium: () => void = jest.fn()) =>
  render(<ThemeProvider><FeedClock onPremium={onPremium} /></ThemeProvider>);

/**
 * The tooltip is deliberately hidden from the accessibility tree (the pill
 * announces instead), and RNTL skips hidden elements by default — so a
 * plain queryByTestId returns null whether it is open or shut, and the
 * "it closed" assertions would pass without the component existing.
 */
const HIDDEN = { includeHiddenElements: true } as const;
const tip = (u: ReturnType<typeof render> extends Promise<infer R> ? R : never) =>
  u.queryByTestId('tooltip', HIDDEN);

describe('tapping the pill explains it', () => {
  it('shows nothing until it is tapped', async () => {
    const u = await draw();
    expect(tip(u)).toBeNull();
  });

  it('opens on a tap', async () => {
    const u = await draw();
    await act(async () => { fireEvent.press(u.getByTestId('feed-clock')); });
    expect(tip(u)).toBeTruthy();
    expect(u.getByText(CLOCK_TOOLTIP, HIDDEN)).toBeTruthy();
  });

  it('closes on a second tap', async () => {
    const u = await draw();
    await act(async () => { fireEvent.press(u.getByTestId('feed-clock')); });
    await act(async () => { fireEvent.press(u.getByTestId('feed-clock')); });
    expect(tip(u)).toBeNull();
  });

  it('closes itself, so nothing is left hanging over the feed', async () => {
    jest.useFakeTimers();
    try {
      const u = await draw();
      await act(async () => { fireEvent.press(u.getByTestId('feed-clock')); });
      expect(tip(u)).toBeTruthy();

      await act(async () => { jest.advanceTimersByTime(TOOLTIP_MS + 10); });
      expect(tip(u)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('re-opening restarts the clock on it', async () => {
    // Open, close, open again: the second one must get its full time, not
    // whatever was left of the first.
    jest.useFakeTimers();
    try {
      const u = await draw();
      const pill = u.getByTestId('feed-clock');
      await act(async () => { fireEvent.press(pill); });
      await act(async () => { jest.advanceTimersByTime(TOOLTIP_MS - 100); });
      await act(async () => { fireEvent.press(pill); });   // close
      await act(async () => { fireEvent.press(pill); });   // open again
      await act(async () => { jest.advanceTimersByTime(TOOLTIP_MS - 100); });
      expect(tip(u)).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('it does not take the feed hostage', () => {
  it('there is no backdrop to dismiss', () => {
    /**
     * A backdrop over the feed would mean tapping a small pill out of
     * curiosity cost you the place you were reading. It closes on a
     * second tap and on its own.
     */
    const src = code(read('components', 'FeedClock.tsx'));
    expect(src).not.toMatch(/Modal|absoluteFill|backdrop/i);
  });

  it('the tooltip never swallows a scroll, even holding a button', async () => {
    // box-none: the card itself is never the touch target, so a reader
    // scrolling the feed through it is not stopped — but the button
    // inside it still works.
    const u = await draw();
    await act(async () => { fireEvent.press(u.getByTestId('feed-clock')); });
    expect(tip(u)!.props.pointerEvents).toBe('box-none');
  });

  it('sits above the list rather than under it', () => {
    // The list is a later sibling of the header and paints on top by
    // default, so the header has to be lifted or the tooltip is invisible.
    const explore = code(read('app', '(tabs)', 'explore.tsx'));
    const topBar  = explore.slice(explore.indexOf('topBar: {'));
    expect(topBar.slice(0, 300)).toMatch(/zIndex:\s*\d+/);
  });

  it('lifts with zIndex, not elevation', () => {
    // elevation would draw a material shadow under the whole header.
    const explore = code(read('app', '(tabs)', 'explore.tsx'));
    const topBar  = explore.slice(explore.indexOf('topBar: {'), explore.indexOf('screenTitle:'));
    expect(topBar).not.toMatch(/elevation/);
  });
});

describe('a screen reader is told the same thing', () => {
  it('the pill is a button that says what tapping does', async () => {
    const u = await draw();
    const pill = u.getByTestId('feed-clock');
    expect(pill.props.accessibilityRole).toBe('button');
    expect(pill.props.accessibilityHint).toBeTruthy();
  });

  it('reports whether it is open', async () => {
    const u = await draw();
    const pill = u.getByTestId('feed-clock');
    expect(pill.props.accessibilityState.expanded).toBe(false);
    await act(async () => { fireEvent.press(pill); });
    expect(u.getByTestId('feed-clock').props.accessibilityState.expanded).toBe(true);
  });

  it('the tooltip is REACHABLE, now that it holds a button', async () => {
    /**
     * It used to be hidden from the tree and announced instead, which was
     * right when it was only a sentence. With an offer inside it, hiding
     * it would mean a button that does not exist for anyone using a
     * screen reader.
     *
     * The disclosure itself is still announced — the pill reports
     * `expanded`, which is what a screen reader speaks on the element
     * already focused.
     */
    const u = await draw();
    await act(async () => { fireEvent.press(u.getByTestId('feed-clock')); });

    // No includeHiddenElements: it must be found in the ordinary tree.
    expect(u.getByTestId('tooltip-action')).toBeTruthy();
    expect(u.getByLabelText(CLOCK_TOOLTIP_CTA)).toBeTruthy();
  });
});

describe('the tooltip is built the way everything else here is', () => {
  const tip = code(read('components', 'Tooltip.tsx'));

  it('has the hard offset edge behind a bordered face', () => {
    // The same two-layer construction as Toast and the buttons.
    expect(tip).toMatch(/edge:/);
    expect(tip).toMatch(/face:/);
    expect(tip).toMatch(/borderWidth:\s*2/);
  });

  it('takes its colours and motion from the tokens', () => {
    expect(tip).toMatch(/useThemeColors/);
    expect(tip).toMatch(/DURATION\./);
    expect(tip).toMatch(/EASING\./);
    expect(tip.match(/duration:\s*\d/g) ?? []).toEqual([]);
  });

  it('stops moving under reduced motion', () => {
    expect(tip).toMatch(/useReducedMotion/);
    expect(tip).toMatch(/if \(reduceMotion\)/);
  });
});

describe('premium readers get no pill at all', () => {
  /**
   * Not a pill with gentler copy — none. A premium reader has no midnight
   * reset, so there is nothing for a clock on this screen to be about,
   * and a tooltip saying their reads come back at midnight would be a
   * straight falsehood told to the people who paid.
   */
  const explore = code(read('app', '(tabs)', 'explore.tsx'));

  it('the feed mounts it only for a reader who has a reset', () => {
    // The guard is the CONDITION, not the exact markup — the element has
    // props now and will grow more.
    expect(explore).toMatch(/dailyLimit !== null && \(\s*<FeedClock/);
    // And there is no second, unconditional one anywhere.
    expect((explore.match(/<FeedClock/g) ?? []).length).toBe(1);
  });

  it('there is no prop that could switch it back on for them', () => {
    // A `capped` flag would be structurally always true at the one call
    // site, which is how a parameter rots into a lie.
    const src = code(read('components', 'FeedClock.tsx'));
    expect(src).not.toMatch(/capped/);
  });

  // "the clock cannot reach the allowance" lives in
  // __tests__/lib/timeOfDay.test.ts, with the rest of the
  // clock-not-countdown policy. One home, so the two cannot drift.
});

describe('the copy says when more arrives', () => {
  it('names midnight, which is when the allowance really resets', () => {
    // readAllowance's today() is built from LOCAL date parts, so the
    // boundary is local midnight rather than UTC.
    expect(CLOCK_TOOLTIP.toLowerCase()).toContain('midnight');
  });

  it('quotes the real allowance, never a typed-in number', () => {
    expect(CLOCK_TOOLTIP).toContain(String(DAILY_ALLOWANCE));
  });

  it('carries no urgency', () => {
    // The mechanic CLAUDE.md rules out needs no code to reintroduce —
    // one sentence would do it, which is why the copy is guarded too.
    for (const w of [/left/i, /hurry/i, /\\bonly\\b/i, /last chance/i, /expires?/i,
                     /runs? out/i, /remaining/i, /before it/i]) {
      expect([w.source, w.test(CLOCK_TOOLTIP)]).toEqual([w.source, false]);
    }
  });

  it('is short enough to be a tooltip', () => {
    expect(CLOCK_TOOLTIP.length).toBeLessThanOrEqual(90);
  });
});

describe('the way out of waiting', () => {
  it('offers premium, where the wait is explained', async () => {
    const u = await draw();
    await act(async () => { fireEvent.press(u.getByTestId('feed-clock')); });
    expect(u.getByText(CLOCK_TOOLTIP_CTA)).toBeTruthy();
  });

  it('tapping it opens plans', async () => {
    const onPremium = jest.fn();
    const u = await draw(onPremium);
    await act(async () => { fireEvent.press(u.getByTestId('feed-clock')); });
    await act(async () => { fireEvent.press(u.getByTestId('tooltip-action')); });
    expect(onPremium).toHaveBeenCalledTimes(1);
  });

  it('and closes the tooltip on the way', async () => {
    // Otherwise it is still hanging over the feed when they come back.
    const u = await draw();
    await act(async () => { fireEvent.press(u.getByTestId('feed-clock')); });
    await act(async () => { fireEvent.press(u.getByTestId('tooltip-action')); });
    expect(tip(u)).toBeNull();
  });

  it('the feed points it at the same place every other premium entry does', () => {
    const explore = code(read('app', '(tabs)', 'explore.tsx'));
    expect(explore).toMatch(/<FeedClock onPremium=\{\(\) => router\.push\('\/plans'\)\} \/>/);
  });

  it('stays long enough to be reached', () => {
    /**
     * Four seconds was enough to read two lines. It is not enough to
     * read them, decide, and land a tap — and a tooltip that closes
     * under a moving thumb is worse than one that never opened.
     */
    expect(TOOLTIP_MS).toBeGreaterThanOrEqual(8_000);
  });

  it('names what you get, not what you lose', () => {
    // An invitation, not pressure. Same rule the rest of the copy keeps.
    for (const w of [/hurry/i, /\bonly\b/i, /last chance/i, /expires?/i,
                     /runs? out/i, /miss/i, /lose/i]) {
      expect([w.source, w.test(CLOCK_TOOLTIP_CTA)]).toEqual([w.source, false]);
    }
  });
});
