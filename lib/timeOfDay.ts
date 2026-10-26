/**
 * What time it is, and what colour that is.
 *
 * Pure, so the boundaries and the formatting can be asserted against fixed
 * dates rather than against whatever o'clock the test suite happens to run
 * at — a clock tested with `new Date()` passes all day and fails at
 * midnight.
 *
 * ── What this deliberately is NOT ───────────────────────────────────────────
 * It is a clock, not a countdown. Nothing here counts down, nothing warns,
 * nothing runs out. A ticking deadline on a feed of other people's worst
 * days would be false urgency — the mechanic CLAUDE.md already rules out
 * for referral ("no countdowns, no scarcity") and the one India's CCPA
 * dark-pattern guidelines name first.
 *
 * What it is for: this app is opened at 3am more than at any other hour.
 * A reader who sees the feed go deep indigo at night and pale at dawn is
 * being told the app knows when they are here, which is the opposite of
 * being hurried.
 */

import { DAILY_ALLOWANCE } from './readAllowance';

export type Period = 'dawn' | 'day' | 'dusk' | 'night';

/**
 * Boundaries in local hours, each INCLUSIVE of its start.
 *
 * Night wraps midnight and is therefore the fallback rather than a range,
 * which is the usual place this kind of table goes wrong.
 */
export const DAWN_HOUR  = 5;
export const DAY_HOUR   = 9;
export const DUSK_HOUR  = 17;
export const NIGHT_HOUR = 21;

export function periodAt(d: Date): Period {
  const h = d.getHours();
  if (h >= DAWN_HOUR  && h < DAY_HOUR)   return 'dawn';
  if (h >= DAY_HOUR   && h < DUSK_HOUR)  return 'day';
  if (h >= DUSK_HOUR  && h < NIGHT_HOUR) return 'dusk';
  return 'night';
}

/**
 * The four grounds.
 *
 * Every colour is one the app already uses — the category blue, the
 * secrets amber, the accent orange and the brand indigo — so the clock
 * reads as part of this product rather than as a weather widget. `fg` is
 * picked for contrast on its own ground, not from the theme: the pill
 * keeps its colours in light and dark alike, the way the share card does.
 */
export const PERIOD_COLOR: Record<Period, { bg: string; fg: string }> = {
  dawn:  { bg: '#7FA0FF', fg: '#1A1A1A' },
  day:   { bg: '#FBBF24', fg: '#1A1A1A' },
  dusk:  { bg: '#FF7A2A', fg: '#1A1A1A' },
  night: { bg: '#291466', fg: '#F7F4EF' },
};

/** Spoken, not drawn — a screen reader should not read out "◷". */
export const PERIOD_LABEL: Record<Period, string> = {
  dawn:  'early morning',
  day:   'daytime',
  dusk:  'evening',
  night: 'night',
};

/**
 * `h:mm`, and deliberately without am/pm.
 *
 * The COLOUR is what separates 8am from 8pm, which is the whole idea — and
 * it keeps the pill short enough to sit beside the counter without
 * crowding the title. Written out rather than left to toLocaleTimeString
 * so it cannot change shape with the test runner's locale.
 */
export function formatClock(d: Date): string {
  const h  = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, '0');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm}`;
}

/**
 * What the pill says when somebody taps it.
 *
 * Kept here rather than in the component so the "this is a clock, not a
 * countdown" guard covers the COPY too. The mechanic being ruled out is
 * easy to reintroduce in a sentence — "only 4 hours left today" needs no
 * code change at all — and a guard that only watched the logic would not
 * have noticed.
 *
 * ── It can say this flatly, because of who sees the pill ───────────────────
 * The allowance resets at LOCAL midnight (lib/readAllowance.ts `today()`
 * is built from local date parts), so this is a fact rather than a nudge.
 *
 * It is a fact only for a reader who HAS a reset. It briefly took a
 * `capped` flag so premium readers could be told something else — but the
 * right answer for them turned out to be no pill at all, so the clock is
 * mounted behind `dailyLimit !== null` and the copy can be one string
 * again. There is nobody left to mislead.
 *
 * The number comes from DAILY_ALLOWANCE rather than being typed out —
 * __tests__/copy/matchingLanguage.test.ts scans raw source for exactly
 * that, because a stale number in copy is as wrong as one in code.
 */
export const CLOCK_TOOLTIP =
  `The time where you are. Your next ${DAILY_ALLOWANCE} unlock at midnight.`;

/**
 * The way out of waiting, offered where the wait is explained.
 *
 * The daily allowance is a conversion nudge by design (lib/readAllowance.ts
 * says so in those words), and this is the moment a reader is thinking
 * about it — so the offer belongs here rather than only at the end of the
 * feed.
 *
 * It is an invitation, not pressure: no countdown, nothing taken away,
 * and it names what you GET rather than what runs out. The same words the
 * premium card uses, so it is recognisably the same offer.
 */
export const CLOCK_TOOLTIP_CTA = "Don't want to wait? Read without the limit";

/**
 * How long the tooltip stays before closing itself.
 *
 * Longer than it was, because there is now something to reach for.
 * Four seconds was enough to read two lines; it is not enough to read
 * them, decide, and land a tap — and a tooltip that closes under a
 * moving thumb is worse than one that never opened.
 */
export const TOOLTIP_MS = 8_000;

/**
 * Milliseconds until the next whole minute.
 *
 * A clock set on a plain 60s interval drifts: it fires 60s after MOUNT, so
 * it spends most of every minute showing the previous one. Aligning to the
 * boundary is the difference between a clock and a number that changes
 * eventually.
 */
export function msToNextMinute(d: Date): number {
  return 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds());
}
