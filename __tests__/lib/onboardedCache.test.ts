/**
 * The local "already onboarded" flag.
 *
 * It decides which screen opens first and nothing else. The tests that matter
 * are the ones about NOT taking the fast path: a partial state, a corrupt
 * value, or another account's leftovers must all fall back to proving it over
 * the network, because opening the feed for someone who has not onboarded
 * shows them a hole and then bounces them.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  readOnboarded, writeOnboarded, clearOnboarded, canSkipToFeed,
} from '@/lib/onboardedCache';

beforeEach(async () => { await AsyncStorage.clear(); });

describe('the fast path needs BOTH halves', () => {
  it('takes it for a fully onboarded person', () => {
    expect(canSkipToFeed({ hasAccount: true, hasCategories: true })).toBe(true);
  });

  it.each([
    [{ hasAccount: true,  hasCategories: false }, 'account but no categories'],
    [{ hasAccount: false, hasCategories: true  }, 'categories but no account'],
    [{ hasAccount: false, hasCategories: false }, 'neither'],
  ])('refuses it with %j (%s)', (state) => {
    expect(canSkipToFeed(state)).toBe(false);
  });

  it('refuses it when nothing is cached', () => {
    // A miss must look exactly like a first launch.
    expect(canSkipToFeed(null)).toBe(false);
  });
});

describe('reading and writing', () => {
  it('round-trips', async () => {
    await writeOnboarded({ hasAccount: true, hasCategories: true });
    expect(await readOnboarded()).toEqual({ hasAccount: true, hasCategories: true });
  });

  it('is null before anything is written', async () => {
    expect(await readOnboarded()).toBeNull();
  });

  it('treats corrupt or partial values as a miss', async () => {
    for (const bad of ['{not json', '{}', '{"hasAccount":true}', 'null', '[]',
                       '{"hasAccount":"yes","hasCategories":true}']) {
      await AsyncStorage.setItem('@yana/onboarded_v1', bad);
      expect(await readOnboarded()).toBeNull();
    }
  });

  it('clears, so the next person on this device is not mistaken for them', async () => {
    await writeOnboarded({ hasAccount: true, hasCategories: true });
    await clearOnboarded();
    expect(await readOnboarded()).toBeNull();
  });

  it('never throws when storage fails', async () => {
    const g = jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('nope'));
    await expect(readOnboarded()).resolves.toBeNull();
    g.mockRestore();

    const s = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('nope'));
    await expect(writeOnboarded({ hasAccount: true, hasCategories: true }))
      .resolves.toBeUndefined();
    s.mockRestore();
  });
});

describe('what it is deliberately not used for', () => {
  it('carries no entitlement, age or ban state', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'lib', 'onboardedCache.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    // Whole words: a bare 'age' substring matches AsyncStorage, which is the
    // module this file is built on.
    for (const w of [/\bpremium\b/i, /\bisPremium\b/, /\bbanned\b/i,
                     /\bdob\b/i, /\bage\b/i, /\bentitlement/i]) {
      expect(code).not.toMatch(w);
    }
  });
});
