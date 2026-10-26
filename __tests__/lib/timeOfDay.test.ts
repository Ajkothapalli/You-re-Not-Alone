/**
 * The feed clock.
 *
 * Asserted against FIXED dates throughout. A clock tested with `new Date()`
 * passes all day and fails at midnight, on somebody else's machine, in CI.
 */

import {
  periodAt, formatClock, msToNextMinute, PERIOD_COLOR, PERIOD_LABEL,
  DAWN_HOUR, DAY_HOUR, DUSK_HOUR, NIGHT_HOUR, type Period,
} from '@/lib/timeOfDay';

/** Local time, which is what the clock reads. */
const at = (h: number, m = 0, s = 0, ms = 0) => new Date(2026, 9, 2, h, m, s, ms);

describe('which part of the day it is', () => {
  it.each<[number, Period]>([
    [0, 'night'], [4, 'night'],
    [5, 'dawn'],  [8, 'dawn'],
    [9, 'day'],   [16, 'day'],
    [17, 'dusk'], [20, 'dusk'],
    [21, 'night'], [23, 'night'],
  ])('%sh → %s', (h, period) => {
    expect(periodAt(at(h))).toBe(period);
  });

  it('every hour of the day lands somewhere', () => {
    // A gap would render a pill with no colour at all.
    for (let h = 0; h < 24; h++) {
      expect(PERIOD_COLOR[periodAt(at(h))]).toBeDefined();
    }
  });

  it('each boundary belongs to the period it opens', () => {
    // Off-by-one here shows as the wrong colour for exactly one hour a day,
    // which nobody would ever report.
    expect(periodAt(at(DAWN_HOUR  - 1, 59))).toBe('night');
    expect(periodAt(at(DAWN_HOUR))).toBe('dawn');
    expect(periodAt(at(DAY_HOUR   - 1, 59))).toBe('dawn');
    expect(periodAt(at(DAY_HOUR))).toBe('day');
    expect(periodAt(at(DUSK_HOUR  - 1, 59))).toBe('day');
    expect(periodAt(at(DUSK_HOUR))).toBe('dusk');
    expect(periodAt(at(NIGHT_HOUR - 1, 59))).toBe('dusk');
    expect(periodAt(at(NIGHT_HOUR))).toBe('night');
  });

  it('night wraps midnight rather than being a range', () => {
    expect(periodAt(at(23, 59))).toBe('night');
    expect(periodAt(at(0, 0))).toBe('night');
  });
});

describe('the colours', () => {
  it('every period has a ground and a legible foreground', () => {
    for (const p of ['dawn', 'day', 'dusk', 'night'] as Period[]) {
      expect(PERIOD_COLOR[p].bg).toMatch(/^#[0-9A-F]{6}$/i);
      expect(PERIOD_COLOR[p].fg).toMatch(/^#[0-9A-F]{6}$/i);
      expect(PERIOD_COLOR[p].bg).not.toBe(PERIOD_COLOR[p].fg);
    }
  });

  it('night is the only one set light-on-dark', () => {
    // The pill keeps its colours in both themes, so contrast is decided
    // here rather than by whatever ground it lands on.
    expect(PERIOD_COLOR.night.fg).not.toBe('#1A1A1A');
    for (const p of ['dawn', 'day', 'dusk'] as Period[]) {
      expect(PERIOD_COLOR[p].fg).toBe('#1A1A1A');
    }
  });

  it('the four grounds are actually different', () => {
    const bgs = (['dawn', 'day', 'dusk', 'night'] as Period[]).map((p) => PERIOD_COLOR[p].bg);
    expect(new Set(bgs).size).toBe(4);
  });

  it('every period is speakable', () => {
    for (const p of ['dawn', 'day', 'dusk', 'night'] as Period[]) {
      expect(PERIOD_LABEL[p].length).toBeGreaterThan(3);
    }
  });
});

describe('the time it prints', () => {
  it.each([
    [at(0, 7),   '12:07'],
    [at(9, 5),   '9:05'],
    [at(11, 48), '11:48'],
    [at(12, 0),  '12:00'],
    [at(13, 30), '1:30'],
    [at(23, 59), '11:59'],
  ])('%s → %s', (d, out) => {
    expect(formatClock(d)).toBe(out);
  });

  it('pads the minute, never the hour', () => {
    expect(formatClock(at(9, 5))).toBe('9:05');
  });

  it('carries no am/pm — the colour is what says which', () => {
    // Deliberate: it keeps the pill short, and 8am against 8pm is exactly
    // the distinction the ground colour exists to make.
    expect(formatClock(at(8, 0))).toBe(formatClock(at(20, 0)));
    expect(periodAt(at(8))).not.toBe(periodAt(at(20)));
  });
});

describe('it ticks on the minute, not every 60 seconds', () => {
  /**
   * A plain 60s interval fires 60s after MOUNT, so it spends most of every
   * minute displaying the minute before. Nobody files that; they just
   * notice the clock is wrong.
   */
  it('waits only as long as is left of this minute', () => {
    expect(msToNextMinute(at(11, 48, 0, 0))).toBe(60_000);
    expect(msToNextMinute(at(11, 48, 30, 0))).toBe(30_000);
    expect(msToNextMinute(at(11, 48, 59, 500))).toBe(500);
  });

  it('never schedules zero, which would spin', () => {
    for (let sec = 0; sec < 60; sec++) {
      expect(msToNextMinute(at(1, 1, sec))).toBeGreaterThan(0);
    }
  });

  it('never schedules more than a minute', () => {
    for (let sec = 0; sec < 60; sec++) {
      expect(msToNextMinute(at(1, 1, sec))).toBeLessThanOrEqual(60_000);
    }
  });
});

describe('it is a clock, and not a countdown', () => {
  /**
   * The brief said "to generate FOMO". The chosen shape was the time of
   * day, which carries no deadline — and this is the guard that keeps it
   * that way, because the other version is one commit away and CLAUDE.md
   * rules out countdowns and scarcity by name.
   */
  const fs   = require('fs');
  const path = require('path');
  const read = (...p: string[]) =>
    fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');

  it('nothing counts down, runs out or expires', () => {
    const src = (read('lib', 'timeOfDay.ts') + read('components', 'FeedClock.tsx'))
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    for (const word of [/countdown/i, /remaining/i, /expires?/i, /\bleft\b/i,
                        /hurry/i, /last chance/i, /running out/i]) {
      expect([word.source, word.test(src)]).toEqual([word.source, false]);
    }
  });

  it('the clock knows nothing about the allowance', () => {
    /**
     * If it could read how many reads were left it would eventually show
     * it. Keeping them unacquainted is the cheapest guarantee available.
     *
     * Comments stripped: that file's header explains WHY it is mounted
     * behind dailyLimit, and naming the thing you are kept away from is
     * not reaching for it.
     */
    const src = read('components', 'FeedClock.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    expect(src).not.toMatch(/readAllowance|dailyLimit|DAILY_ALLOWANCE/);
  });
});
