/**
 * [N1] The rules that decide whether, when and what to send.
 *
 * The spec asked for Deno tests. This repo has no Deno runner and no Deno
 * config; the established pattern for shared Edge Function modules is to
 * import the .ts straight into Jest, which is how substance.ts and
 * headline.ts are tested and which actually executes here. Same assertions.
 *
 * ── Why these matter more than most ─────────────────────────────────────────
 * A push is the one surface a person has not chosen to look at. It arrives
 * on a lock screen, possibly in front of somebody else, possibly at 3am.
 * Every rule below is about not doing that, and none of them can be checked
 * by looking at a screen afterwards — by the time it is wrong, it has
 * already happened to somebody.
 */

import {
  decidePush, buildMessage, buildData, isQuietHour, nextMorning, hourIn,
  isQuestionHour, isoWeekKey, DAILY_CAP, DISCREET_TITLE,
  type DeviceRow, type OutboxRow,
} from '../../supabase/functions/_shared/pushRules';

const device = (over: Partial<DeviceRow> = {}): DeviceRow => ({
  expo_token: 'ExponentPushToken[x]', tz: 'Asia/Kolkata', discreet: false,
  quiet_hours: true, felt_on: true, question_on: true, disabled_at: null, ...over,
});

const row = (over: Partial<OutboxRow> = {}): OutboxRow => ({
  id: 'o1', account_id: 'a1', kind: 'felt', counts: { n: 1 },
  not_before: '2026-09-30T10:00:00Z', ...over,
});

/** 15:30 UTC = 21:00 IST — inside the day in India, quiet in London. */
const AFTERNOON = new Date('2026-09-30T09:00:00Z');

// ─── Quiet hours, across timezones ───────────────────────────────────────────

describe('quiet hours are 22:00–08:00 where the PERSON is', () => {
  it('reads the hour in the device timezone, not the server', () => {
    // 19:00 UTC is 00:30 in Kolkata — the middle of the night for them and
    // the middle of the evening for a server in London.
    const at = new Date('2026-09-30T19:00:00Z');
    expect(hourIn('Asia/Kolkata', at)).toBe(0);
    expect(hourIn('UTC', at)).toBe(19);
    expect(isQuietHour('Asia/Kolkata', at)).toBe(true);
    expect(isQuietHour('UTC', at)).toBe(false);
  });

  it.each([
    ['Asia/Kolkata', '2026-09-30T17:00:00Z', true],   // 22:30 IST
    ['Asia/Kolkata', '2026-09-30T09:00:00Z', false],  // 14:30 IST
    ['Asia/Kolkata', '2026-09-30T02:00:00Z', true],   // 07:30 IST
    ['Asia/Kolkata', '2026-09-30T03:00:00Z', false],  // 08:30 IST
    ['UTC',          '2026-09-30T22:30:00Z', true],
    ['UTC',          '2026-09-30T07:59:00Z', true],
    ['UTC',          '2026-09-30T08:00:00Z', false],
  ])('%s at %s → quiet=%s', (tz, iso, expected) => {
    expect(isQuietHour(tz, new Date(iso))).toBe(expected);
  });

  it('wraps midnight', () => {
    // The half people get wrong: 23:00 and 01:00 are both quiet, and a
    // naive `h >= 22 && h < 8` returns false for every hour.
    expect(isQuietHour('UTC', new Date('2026-09-30T23:00:00Z'))).toBe(true);
    expect(isQuietHour('UTC', new Date('2026-10-01T01:00:00Z'))).toBe(true);
  });

  it('handles a DST zone on both sides of a transition', () => {
    /**
     * America/New_York moved off DST on 2026-11-01. An offset table gets
     * this wrong twice a year, and twice a year for this feature means
     * waking somebody at 3am.
     */
    const beforeDst = new Date('2026-10-15T02:30:00Z');  // 22:30 EDT (UTC-4)
    const afterDst  = new Date('2026-11-15T02:30:00Z');  // 21:30 EST (UTC-5)
    expect(isQuietHour('America/New_York', beforeDst)).toBe(true);
    expect(isQuietHour('America/New_York', afterDst)).toBe(false);
  });

  it('falls back to UTC on an unknown timezone rather than throwing', () => {
    // A bad tz must not stop the queue. The window is still applied, just
    // in the wrong place — better than not applied at all.
    expect(() => isQuietHour('Mars/Olympus', new Date())).not.toThrow();
  });
});

describe('a deferred push lands at 09:00 local', () => {
  it('finds the next 9am in the device timezone', () => {
    const at   = new Date('2026-09-30T19:00:00Z');     // 00:30 IST, quiet
    const when = nextMorning('Asia/Kolkata', at);
    expect(hourIn('Asia/Kolkata', when)).toBe(9);
    expect(when.getTime()).toBeGreaterThan(at.getTime());
  });

  it('is the MORNING, not the instant quiet hours end', () => {
    // 08:00 is technically allowed and is still the middle of somebody's
    // commute-or-still-asleep hour. 09:00 is a decision, not an oversight.
    const when = nextMorning('UTC', new Date('2026-09-30T23:00:00Z'));
    expect(hourIn('UTC', when)).toBe(9);
  });

  it('works across a DST transition', () => {
    const when = nextMorning('America/New_York', new Date('2026-11-01T04:00:00Z'));
    expect(hourIn('America/New_York', when)).toBe(9);
  });

  it('always moves forward', () => {
    for (const tz of ['Asia/Kolkata', 'UTC', 'America/New_York', 'Pacific/Auckland']) {
      for (const h of [0, 6, 9, 13, 22, 23]) {
        const at = new Date(`2026-09-30T${String(h).padStart(2, '0')}:00:00Z`);
        expect(nextMorning(tz, at).getTime()).toBeGreaterThan(at.getTime());
      }
    }
  });
});

// ─── The decision ────────────────────────────────────────────────────────────

describe('what happens to a queued push', () => {
  it('sends in the middle of the day', () => {
    const v = decidePush({ row: row(), device: device(), sentToday: 0, now: AFTERNOON });
    expect(v.action).toBe('send');
  });

  it('defers during quiet hours instead of sending', () => {
    const night = new Date('2026-09-30T19:00:00Z');   // 00:30 IST
    const v = decidePush({ row: row(), device: device(), sentToday: 0, now: night });
    expect(v).toMatchObject({ action: 'defer', reason: 'quiet_hours' });
  });

  it('sends at night when the reader turned quiet hours off', () => {
    const night = new Date('2026-09-30T19:00:00Z');
    const v = decidePush({
      row: row(), device: device({ quiet_hours: false }), sentToday: 0, now: night,
    });
    expect(v.action).toBe('send');
  });

  it('skips a device with the kind switched off', () => {
    expect(decidePush({
      row: row({ kind: 'felt' }), device: device({ felt_on: false }), sentToday: 0, now: AFTERNOON,
    })).toEqual({ action: 'skip', reason: 'kind_off' });

    expect(decidePush({
      row: row({ kind: 'question' }), device: device({ question_on: false }),
      sentToday: 0, now: AFTERNOON, questionText: 'q',
    })).toEqual({ action: 'skip', reason: 'kind_off' });
  });

  it('skips a disabled device and one that does not exist', () => {
    expect(decidePush({ row: row(), device: device({ disabled_at: 'x' }), sentToday: 0, now: AFTERNOON }))
      .toEqual({ action: 'skip', reason: 'disabled' });
    expect(decidePush({ row: row(), device: null, sentToday: 0, now: AFTERNOON }))
      .toEqual({ action: 'skip', reason: 'no_device' });
  });
});

describe('the daily cap', () => {
  it('is two', () => {
    expect(DAILY_CAP).toBe(2);
  });

  it('sends the first two and defers the third', () => {
    // Somebody who gets a felt push and the Monday question has had both
    // things this product does. A third is the app talking for its own sake.
    for (const sentToday of [0, 1]) {
      expect(decidePush({ row: row(), device: device(), sentToday, now: AFTERNOON }).action)
        .toBe('send');
    }
    expect(decidePush({ row: row(), device: device(), sentToday: 2, now: AFTERNOON }))
      .toMatchObject({ action: 'defer', reason: 'daily_cap' });
  });

  it('defers to tomorrow morning, so nothing stacks overnight', () => {
    const v = decidePush({ row: row(), device: device(), sentToday: 5, now: AFTERNOON });
    expect(v.action).toBe('defer');
    if (v.action === 'defer') expect(hourIn('Asia/Kolkata', v.notBefore)).toBe(9);
  });

  it('quiet hours are checked BEFORE the cap', () => {
    /**
     * A push deferred to the morning has not been sent, so it must not
     * consume the day's allowance on its way past. Getting this backwards
     * would silently halve the cap for anybody in a timezone where the
     * queue runs at night.
     */
    const night = new Date('2026-09-30T19:00:00Z');
    const v = decidePush({ row: row(), device: device(), sentToday: 9, now: night });
    expect(v).toMatchObject({ action: 'defer', reason: 'quiet_hours' });
  });
});

// ─── Wording ─────────────────────────────────────────────────────────────────

describe('what a lock screen says', () => {
  it('one felt', () => {
    expect(buildMessage('felt', { n: 1 }, false, null).body)
      .toBe('Someone felt what you wrote.');
  });

  it('more than one', () => {
    // "n more people", not "n people": they have already been told about
    // the first, and a total would read as the same push arriving twice.
    expect(buildMessage('felt', { n: 3 }, false, null).body)
      .toBe('3 more people felt what you wrote.');
  });

  it('treats a missing or nonsense count as one', () => {
    expect(buildMessage('felt', {}, false, null).body).toBe('Someone felt what you wrote.');
    expect(buildMessage('felt', { n: 0 }, false, null).body).toBe('Someone felt what you wrote.');
    expect(buildMessage('felt', { n: -4 }, false, null).body).toBe('Someone felt what you wrote.');
  });

  it('the question carries the owner-approved text and nothing else', () => {
    const m = buildMessage('question', {}, false, 'What are you not saying?');
    expect(m.title).toBe("This week's question is here.");
    expect(m.body).toBe('What are you not saying?');
  });

  it('discreet says one thing, for every kind', () => {
    // For a shared or visible phone: the difference between a lock screen
    // that says somebody felt what you wrote and one that says nothing.
    for (const kind of ['felt', 'question'] as const) {
      const m = buildMessage(kind, { n: 7 }, true, 'What are you not saying?');
      expect(m.title).toBe(DISCREET_TITLE);
      expect(m.body).toBe('');
      expect(JSON.stringify(m)).not.toMatch(/felt|question|What are you/i);
    }
  });

  it('cannot see a confession, because it is not given one', () => {
    // The type signature is the enforcement: counts are numbers, and the
    // only string it accepts is the owner-approved question.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'supabase', 'functions', '_shared', 'pushRules.ts'),
      'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    const fn = code.slice(code.indexOf('export function buildMessage'));
    expect(fn.slice(0, fn.indexOf('\n}'))).not.toMatch(/\.text|headline|confession/i);
  });
});

// ─── The payload ─────────────────────────────────────────────────────────────

describe('the data payload', () => {
  it('is a route and nothing else', () => {
    expect(buildData('felt')).toEqual({ route: '/notifications' });
    expect(buildData('question')).toEqual({ route: '/explore' });
  });

  it('has exactly one key, whitelisted rather than filtered', () => {
    // Built from scratch, so a field added upstream cannot ride along.
    for (const kind of ['felt', 'question'] as const) {
      expect(Object.keys(buildData(kind))).toEqual(['route']);
    }
  });
});

// ─── The weekly question ─────────────────────────────────────────────────────

describe('the Monday question window', () => {
  it('is Monday 19:00–19:59 local', () => {
    // 2026-10-05 is a Monday. 13:30 UTC = 19:00 IST.
    expect(isQuestionHour('Asia/Kolkata', new Date('2026-10-05T13:30:00Z'))).toBe(true);
    expect(isQuestionHour('Asia/Kolkata', new Date('2026-10-05T14:30:00Z'))).toBe(false);
    expect(isQuestionHour('UTC',          new Date('2026-10-05T19:30:00Z'))).toBe(true);
  });

  it('is not any other day', () => {
    expect(isQuestionHour('UTC', new Date('2026-10-06T19:30:00Z'))).toBe(false);
    expect(isQuestionHour('UTC', new Date('2026-10-04T19:30:00Z'))).toBe(false);
  });

  it('is Monday where the PERSON is, not on the server', () => {
    // 2026-10-05 18:00 UTC is Monday 23:30 IST — already past their window,
    // and Tuesday 07:00 in Auckland.
    const at = new Date('2026-10-05T18:00:00Z');
    expect(isQuestionHour('Asia/Kolkata', at)).toBe(false);
    expect(isQuestionHour('Pacific/Auckland', at)).toBe(false);
  });

  it('gives one key per calendar week, so a week sends once', () => {
    const mon = isoWeekKey(new Date('2026-10-05T19:00:00Z'));
    const wed = isoWeekKey(new Date('2026-10-07T19:00:00Z'));
    const next = isoWeekKey(new Date('2026-10-12T19:00:00Z'));
    expect(mon).toBe(wed);
    expect(mon).not.toBe(next);
  });

  it('sends nothing when there is no live question', () => {
    // current_question() returning nothing means the bank has run out. An
    // empty push would be worse than silence.
    expect(decidePush({
      row: row({ kind: 'question', counts: {} }), device: device(),
      sentToday: 0, now: AFTERNOON, questionText: null,
    })).toEqual({ action: 'skip', reason: 'empty' });
  });
});
