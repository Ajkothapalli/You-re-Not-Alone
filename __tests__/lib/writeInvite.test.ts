/**
 * When the targeted write invite fires.
 *
 * The distinction this whole feature rests on: three felts in ONE category is
 * someone recognising themselves in something. Three felts spread across three
 * categories is someone browsing. Only the first earns an ask.
 *
 * The suppression rules get more tests than the trigger, because the failure
 * mode that actually costs us is not a missed invite — it is a reader being
 * asked to write twice after saying no once.
 */

import {
  recordFelt, dismissWriteInvite, genericInviteAllowed, markInviteSeen,
  resetWriteInvite, feltCountFor, interstitialAt, INVITE_AFTER_FELTS,
} from '@/lib/writeInvite';
import { STARTERS } from '@/lib/starters';

beforeEach(() => resetWriteInvite());

describe('three in the same category earns the invite', () => {
  it('fires on the third, not the second', () => {
    expect(recordFelt(['grief'])).toBeNull();
    expect(recordFelt(['grief'])).toBeNull();
    const inv = recordFelt(['grief']);
    expect(inv).toEqual({
      category: 'grief',
      label:    'Grief & loss',
      starter:  STARTERS.grief[0],
    });
  });

  it('carries the label a reader would recognise, not the id', () => {
    recordFelt(['work_identity']); recordFelt(['work_identity']);
    expect(recordFelt(['work_identity'])!.label).toBe('Work & identity');
  });

  it('matches the documented threshold', () => {
    expect(INVITE_AFTER_FELTS).toBe(3);
  });
});

describe('three spread across categories earns nothing', () => {
  it('stays silent for one felt in each of three categories', () => {
    expect(recordFelt(['grief'])).toBeNull();
    expect(recordFelt(['secrets'])).toBeNull();
    expect(recordFelt(['relationships'])).toBeNull();
    expect(genericInviteAllowed()).toBe(true);
  });

  it('stays silent at two-and-two', () => {
    for (const c of ['grief', 'secrets', 'grief', 'secrets']) {
      expect(recordFelt([c])).toBeNull();
    }
  });

  it('fires only when one of them reaches three', () => {
    recordFelt(['grief']); recordFelt(['secrets']); recordFelt(['grief']);
    recordFelt(['secrets']);
    expect(recordFelt(['grief'])!.category).toBe('grief');
  });
});

describe('a confession in several categories counts for each', () => {
  it('advances every category it belongs to', () => {
    recordFelt(['grief', 'relationships']);
    recordFelt(['grief', 'relationships']);
    expect(feltCountFor('grief')).toBe(2);
    expect(feltCountFor('relationships')).toBe(2);
  });

  it('keeps counting the rest of the categories on the felt that triggers', () => {
    // A tally that stopped at the first hit would under-count the others and
    // quietly change what a later session would have shown.
    recordFelt(['grief', 'secrets']);
    recordFelt(['grief', 'secrets']);
    recordFelt(['grief', 'secrets']);
    expect(feltCountFor('grief')).toBe(3);
    expect(feltCountFor('secrets')).toBe(3);
  });

  it('ignores categories outside the taxonomy', () => {
    for (let i = 0; i < 5; i++) expect(recordFelt(['bogus', 'crisis'])).toBeNull();
  });

  it('survives a confession with no categories at all', () => {
    expect(() => { recordFelt([]); }).not.toThrow();
    expect(recordFelt([])).toBeNull();
  });
});

describe('at most one ask per session', () => {
  it('never returns a second invite, however many more felts arrive', () => {
    recordFelt(['grief']); recordFelt(['grief']);
    expect(recordFelt(['grief'])).not.toBeNull();

    for (let i = 0; i < 10; i++) {
      expect(recordFelt(['secrets'])).toBeNull();
      expect(recordFelt(['grief'])).toBeNull();
    }
  });

  it('suppresses the generic interstitial once the targeted one has shown', () => {
    expect(genericInviteAllowed()).toBe(true);
    recordFelt(['grief']); recordFelt(['grief']); recordFelt(['grief']);
    expect(genericInviteAllowed()).toBe(false);
  });
});

describe('"Not now" is an answer, not a snooze', () => {
  it('stops the targeted invite for the session', () => {
    recordFelt(['grief']); recordFelt(['grief']);
    dismissWriteInvite();
    expect(recordFelt(['grief'])).toBeNull();
    expect(recordFelt(['grief'])).toBeNull();
  });

  it('also stops the GENERIC invite — the same ask in blander words', () => {
    dismissWriteInvite();
    expect(genericInviteAllowed()).toBe(false);
  });

  it('stops it before any felt has been recorded', () => {
    dismissWriteInvite();
    for (let i = 0; i < 5; i++) expect(recordFelt(['secrets'])).toBeNull();
  });
});

describe('impressions are counted once, not once per render', () => {
  it('returns true the first time and false after', () => {
    expect(markInviteSeen('interstitial')).toBe(true);
    expect(markInviteSeen('interstitial')).toBe(false);
    expect(markInviteSeen('interstitial')).toBe(false);
  });

  it('counts each placement separately', () => {
    expect(markInviteSeen('interstitial')).toBe(true);
    expect(markInviteSeen('footer')).toBe(true);
  });

  it('resets with the session', () => {
    markInviteSeen('footer');
    resetWriteInvite();
    expect(markInviteSeen('footer')).toBe(true);
  });
});

describe('nothing here persists or identifies', () => {
  it('forgets everything on reset — the session is the whole lifetime', () => {
    recordFelt(['grief']); recordFelt(['grief']); recordFelt(['grief']);
    resetWriteInvite();
    expect(feltCountFor('grief')).toBe(0);
    expect(genericInviteAllowed()).toBe(true);
  });

  it('exposes a category and a starter — never a confession id', () => {
    recordFelt(['secrets']); recordFelt(['secrets']);
    const inv = recordFelt(['secrets'])!;
    expect(Object.keys(inv).sort()).toEqual(['category', 'label', 'starter']);
  });
});

describe('the two asks never appear together', () => {
  const EVERY = 10;
  // Every gap in a long feed, so adjacency is checked as a property of the
  // whole sequence rather than at a couple of hand-picked indexes.
  const slots = Array.from({ length: 200 }, (_, i) => interstitialAt(i, EVERY));

  it('puts at most one card in any gap', () => {
    // The shape of the old bug: both cards returned for the same position.
    for (const s of slots) expect(['write', 'premium', null]).toContain(s);
  });

  it('never places write and premium in consecutive interstitials\' order', () => {
    const shown = slots.filter(Boolean);
    for (let i = 1; i < shown.length; i++) {
      expect(shown[i]).not.toBe(shown[i - 1]);
    }
  });

  it('alternates write, premium, write', () => {
    expect(interstitialAt(9,  EVERY)).toBe('write');
    expect(interstitialAt(19, EVERY)).toBe('premium');
    expect(interstitialAt(29, EVERY)).toBe('write');
    expect(interstitialAt(39, EVERY)).toBe('premium');
  });

  it('shows nothing in the gaps between', () => {
    for (const i of [0, 1, 5, 8, 10, 15, 18, 20]) {
      if ((i + 1) % EVERY !== 0) expect(interstitialAt(i, EVERY)).toBeNull();
    }
  });

  it('keeps the rhythm if the interval changes', () => {
    expect(interstitialAt(4, 5)).toBe('write');
    expect(interstitialAt(9, 5)).toBe('premium');
    expect(interstitialAt(14, 5)).toBe('write');
  });

  it('returns nothing for a leading item that is not in the list', () => {
    expect(interstitialAt(-1, EVERY)).toBeNull();
    expect(interstitialAt(5, 0)).toBeNull();
  });

  it('opens with the WRITE ask, not the upsell', () => {
    // If the first thing a reader meets mid-feed is a payment prompt, the
    // ordering decision has been reversed by accident.
    expect(slots.find(Boolean)).toBe('write');
  });
});
