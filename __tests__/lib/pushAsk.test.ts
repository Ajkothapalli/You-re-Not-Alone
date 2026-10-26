/**
 * [N1] When to ask for notification permission.
 *
 * The system dialog can be shown once, ever. Neither OS offers a second
 * chance, and a "no" is permanent until somebody walks into their phone
 * settings — which almost nobody does. Every rule here exists to stop that
 * one dialog being spent at a moment when the answer would be no.
 *
 * Two halves, tested differently: `decide()` is pure and takes a snapshot,
 * so every rule is exercised directly against numbers; the persistence is
 * tested for what it does when storage misbehaves, because the safe
 * direction there is silence and the unsafe direction is a spent dialog.
 */

import {
  decide, shouldAsk, isSameLocalDay, localDayKey,
  recordActiveDay, getActiveDays, recordDecline, getDeclines,
  markCardShown, markCrisisOrBlock, resetSession, resetPushAsk,
  COOLDOWN_DAYS, MAX_DECLINES, MIN_ACTIVE_DAYS,
  type AskSnapshot, type AskMoment,
} from '@/lib/pushAsk';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DAY = 24 * 60 * 60 * 1000;
/** A fixed mid-morning instant, so "same local day" is never borderline. */
const NOW = new Date('2026-09-30T10:00:00').getTime();

function snap(over: Partial<AskSnapshot> = {}): AskSnapshot {
  return {
    installedAt:             NOW - 5 * DAY,
    activeDays:              3,
    permission:              'undetermined',
    shownThisSession:        false,
    declineCount:            0,
    lastDeclineAt:           null,
    sessionHadCrisisOrBlock: false,
    otherAskOnScreen:        false,
    available:               ['proof'],
    now:                     NOW,
    ...over,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  resetSession();
});
/**
 * Make AsyncStorage throw for the duration of one test, then put it back.
 *
 * NOT jest.spyOn + restoreAllMocks. Two traps, both hit while writing this:
 *   - a spy left installed does not fall back to the real implementation; it
 *     returns undefined for every later call, silently breaking every test
 *     after it;
 *   - jest.restoreAllMocks() PERMANENTLY breaks the
 *     @react-native-async-storage jest mock, because the "original" it
 *     restores is not a working implementation. Verified: a setItem/getItem
 *     round trip fails for the rest of the file.
 *
 * Swapping the function and putting the exact original back avoids both.
 */
async function withBrokenStorage<T>(fn: () => Promise<T>): Promise<T> {
  const real = AsyncStorage.getItem;
  (AsyncStorage as unknown as Record<string, unknown>).getItem =
    jest.fn().mockRejectedValue(new Error('disk'));
  try { return await fn(); }
  finally { (AsyncStorage as unknown as Record<string, unknown>).getItem = real; }
}

// ─── Eligibility ─────────────────────────────────────────────────────────────

describe('never on the install day', () => {
  it('refuses when installed today', () => {
    // Day one is for finding out what this place is, not for being asked to
    // let it reach you outside itself.
    expect(decide(snap({ installedAt: NOW - 60_000 })))
      .toEqual({ show: false, reason: 'install_day' });
  });

  it('refuses even at the very end of the install day', () => {
    const lateSameDay = new Date('2026-09-30T23:30:00').getTime();
    expect(decide(snap({ installedAt: NOW, now: lateSameDay })).show).toBe(false);
  });

  it('allows the next calendar day, not 24 hours later', () => {
    /**
     * Someone who installs at 11pm and comes back at 9am has arrived on a
     * second day. A 24-hour window would push their first possible ask a
     * whole day later for no reason a person would recognise.
     */
    const installed = new Date('2026-09-29T23:00:00').getTime();
    const nextMorning = new Date('2026-09-30T09:00:00').getTime();
    expect(isSameLocalDay(installed, nextMorning)).toBe(false);
    expect(decide(snap({ installedAt: installed, now: nextMorning })).show).toBe(true);
  });

  it('does not treat a missing install date as the install day', () => {
    // Legacy installs predate markInstall(). Refusing them forever would be
    // worse than the small risk of asking one of them a day early.
    expect(decide(snap({ installedAt: null })).show).toBe(true);
  });
});

describe('at least two days of use', () => {
  it('refuses on one active day', () => {
    expect(decide(snap({ activeDays: 1 })))
      .toEqual({ show: false, reason: 'too_few_days' });
  });

  it('refuses on zero', () => {
    expect(decide(snap({ activeDays: 0 })).show).toBe(false);
  });

  it('allows on two', () => {
    expect(MIN_ACTIVE_DAYS).toBe(2);
    expect(decide(snap({ activeDays: 2 })).show).toBe(true);
  });
});

describe('the OS has already been asked', () => {
  it.each(['granted', 'denied'] as const)('refuses when %s', (permission) => {
    expect(decide(snap({ permission }))).toEqual({ show: false, reason: 'already_answered' });
  });

  it('refuses forever once blocked', () => {
    /**
     * The OS will not show the dialog again. A card offering to ask would be
     * a button that does nothing — worse than no button. Only the Settings
     * toggle remains, and it opens the phone's own settings.
     */
    expect(decide(snap({ permission: 'blocked' })))
      .toEqual({ show: false, reason: 'blocked_forever' });
  });

  it('blocked outranks every temporary reason', () => {
    // So the caller can tell "never again" from "not right now".
    const d = decide(snap({ permission: 'blocked', activeDays: 1, installedAt: NOW }));
    expect(d).toEqual({ show: false, reason: 'blocked_forever' });
  });
});

describe('one card per session', () => {
  it('refuses a second', () => {
    expect(decide(snap({ shownThisSession: true })))
      .toEqual({ show: false, reason: 'already_shown' });
  });
});

describe('declining', () => {
  it('starts a 14-day cooldown', () => {
    expect(COOLDOWN_DAYS).toBe(14);
    expect(decide(snap({ declineCount: 1, lastDeclineAt: NOW - 13 * DAY })))
      .toEqual({ show: false, reason: 'cooling_off' });
  });

  it('lets the card come back after it', () => {
    expect(decide(snap({ declineCount: 1, lastDeclineAt: NOW - 15 * DAY })).show).toBe(true);
  });

  it('stops asking for good after the third', () => {
    // Three noes is an answer. The Settings toggle still works for anyone
    // who changes their mind.
    expect(MAX_DECLINES).toBe(3);
    expect(decide(snap({ declineCount: 3, lastDeclineAt: NOW - 400 * DAY })))
      .toEqual({ show: false, reason: 'declined_enough' });
  });

  it('is still allowed on the second, once cooled off', () => {
    expect(decide(snap({ declineCount: 2, lastDeclineAt: NOW - 15 * DAY })).show).toBe(true);
  });
});

describe('never after crisis or a block', () => {
  it('refuses for the rest of the session', () => {
    /**
     * Nothing may follow either of those with a request for anything. A
     * person who just saw crisis resources, or who was just told their words
     * were refused, is not somebody to ask a favour of. CLAUDE.md #6 puts
     * nothing on the crisis path; this is the same rule one step out.
     */
    expect(decide(snap({ sessionHadCrisisOrBlock: true })))
      .toEqual({ show: false, reason: 'crisis_or_block' });
  });
});

describe('one ask on screen at a time', () => {
  it('refuses beside another ask', () => {
    // The write invite, the premium card and the referral invite are all
    // asks. Two at once is an ad break.
    expect(decide(snap({ otherAskOnScreen: true })))
      .toEqual({ show: false, reason: 'other_ask' });
  });
});

// ─── Priority ────────────────────────────────────────────────────────────────

describe('which moment wins', () => {
  it('is A > B > C', () => {
    const all: AskMoment[] = ['question', 'just_posted', 'proof'];
    expect(decide(snap({ available: all }))).toEqual({ show: true, moment: 'proof' });
    expect(decide(snap({ available: ['question', 'just_posted'] })))
      .toEqual({ show: true, moment: 'just_posted' });
    expect(decide(snap({ available: ['question'] })))
      .toEqual({ show: true, moment: 'question' });
  });

  it('does not depend on the order they are offered in', () => {
    for (const order of [
      ['proof', 'just_posted', 'question'],
      ['question', 'proof', 'just_posted'],
      ['just_posted', 'question', 'proof'],
    ] as AskMoment[][]) {
      expect(decide(snap({ available: order })).show && decide(snap({ available: order })))
        .toEqual({ show: true, moment: 'proof' });
    }
  });

  it('shows nothing when no moment is available', () => {
    expect(decide(snap({ available: [] }))).toEqual({ show: false, reason: 'no_moment' });
  });
});

// ─── Active days ─────────────────────────────────────────────────────────────

describe('counting active days', () => {
  it('counts a day once, however many times the app opens', () => {
    // Stores day KEYS rather than a counter, so a double call cannot inflate
    // eligibility into existence.
    return (async () => {
      await recordActiveDay(NOW);
      await recordActiveDay(NOW + 60_000);
      await recordActiveDay(NOW + 3 * 60 * 60 * 1000);
      expect(await getActiveDays()).toBe(1);
    })();
  });

  it('counts separate local days separately', async () => {
    await recordActiveDay(NOW);
    await recordActiveDay(NOW + DAY);
    expect(await getActiveDays()).toBe(2);
  });

  it('uses the phone\'s day boundary', () => {
    expect(localDayKey(new Date('2026-09-30T23:59:00').getTime())).toBe('2026-09-30');
    expect(localDayKey(new Date('2026-10-01T00:01:00').getTime())).toBe('2026-10-01');
  });

  it('does not grow without bound', async () => {
    for (let i = 0; i < 20; i++) await recordActiveDay(NOW + i * DAY);
    const raw = await AsyncStorage.getItem('@yana/push_active_days');
    expect(JSON.parse(raw!).length).toBeLessThanOrEqual(5);
  });
});

// ─── Storage failures fail to silence ────────────────────────────────────────

describe('when storage misbehaves', () => {
  it('reports zero active days rather than inventing eligibility', async () => {
    await withBrokenStorage(async () => {
      expect(await getActiveDays()).toBe(0);
    });
  });

  it('reports the maximum declines rather than inventing eligibility', async () => {
    /**
     * The asymmetry that matters. Not asking costs one delayed session;
     * asking wrongly costs a dialog that cannot be shown again, and
     * possibly a permanent no. A storage error must fall to silence.
     */
    await withBrokenStorage(async () => {
      const d = await getDeclines();
      expect(d.count).toBe(MAX_DECLINES);
    });
  });

  it('shouldAsk refuses when storage is unreadable', async () => {
    await withBrokenStorage(async () => {
      const d = await shouldAsk({ permission: 'undetermined', available: ['proof'], now: NOW });
      expect(d.show).toBe(false);
    });
  });
});

// ─── The whole thing, through storage ────────────────────────────────────────

describe('shouldAsk, end to end', () => {
  it('says yes for a returning reader with a reason', async () => {
    await AsyncStorage.setItem('@yana/install_ts', String(NOW - 5 * DAY));
    await recordActiveDay(NOW - DAY);
    await recordActiveDay(NOW);

    expect(await shouldAsk({ permission: 'undetermined', available: ['proof'], now: NOW }))
      .toEqual({ show: true, moment: 'proof' });
  });

  it('says no on day one, even with a perfect moment', async () => {
    await AsyncStorage.setItem('@yana/install_ts', String(NOW));
    await recordActiveDay(NOW);
    expect((await shouldAsk({ permission: 'undetermined', available: ['proof'], now: NOW })).show)
      .toBe(false);
  });

  it('honours a decline recorded through the real store', async () => {
    await AsyncStorage.setItem('@yana/install_ts', String(NOW - 5 * DAY));
    await recordActiveDay(NOW - DAY);
    await recordActiveDay(NOW);
    await recordDecline(NOW - DAY);

    expect((await shouldAsk({ permission: 'undetermined', available: ['proof'], now: NOW })).show)
      .toBe(false);
    // …and comes back after the cooldown.
    expect((await shouldAsk({
      permission: 'undetermined', available: ['proof'], now: NOW + 15 * DAY,
    })).show).toBe(true);
  });

  it('honours a card already shown this session', async () => {
    await AsyncStorage.setItem('@yana/install_ts', String(NOW - 5 * DAY));
    await recordActiveDay(NOW - DAY);
    await recordActiveDay(NOW);
    markCardShown();
    expect((await shouldAsk({ permission: 'undetermined', available: ['proof'], now: NOW })).show)
      .toBe(false);
  });

  it('honours a crisis seen this session', async () => {
    await AsyncStorage.setItem('@yana/install_ts', String(NOW - 5 * DAY));
    await recordActiveDay(NOW - DAY);
    await recordActiveDay(NOW);
    markCrisisOrBlock();
    expect((await shouldAsk({ permission: 'undetermined', available: ['proof'], now: NOW })).show)
      .toBe(false);
  });

  it('forgets everything on sign-out', async () => {
    await recordActiveDay(NOW);
    await recordDecline(NOW);
    markCardShown();

    await resetPushAsk();

    expect(await getActiveDays()).toBe(0);
    expect((await getDeclines()).count).toBe(0);
  });
});

// ─── It must never touch the permission API ──────────────────────────────────

describe('deciding is not asking', () => {
  it('the module imports no notifications API at all', () => {
    /**
     * The entire point of the pre-permission card is that a person reads a
     * plain-language explanation and taps a button BEFORE the OS dialog
     * appears. An eligibility check that could trigger the dialog would
     * defeat that by existing — so the import is banned, not just the call.
     */
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'lib', 'pushAsk.ts'), 'utf8');
    // Comments stripped first: the header EXPLAINS that this must never call
    // requestPermissionsAsync, and an unstripped scan finds the explanation
    // rather than a call — the comment-vs-code trap this repo keeps hitting.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    expect(code).not.toMatch(/expo-notifications|requestPermissionsAsync|getPermissionsAsync/);
  });
});
