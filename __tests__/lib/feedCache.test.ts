/**
 * The feed cache.
 *
 * It exists so returning to Read shows content instead of a spinner. The
 * tests that matter are the ones about NOT showing the wrong thing: stale
 * beyond a few hours, corrupt, or another account's feed.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as feedCache from '@/lib/feedCache';
import type { Recommendation } from '@/lib/api';

const FEED: Recommendation[] = [
  { id: 'a', text: 'one',   feltCount: 3, categories: ['grief'] },
  { id: 'b', text: 'two',   feltCount: 5, categories: ['secrets'] },
  { id: 'c', text: 'three', feltCount: 1, categories: ['grief'] },
];

const T0 = 1_000_000_000;

beforeEach(async () => {
  await AsyncStorage.clear();
  await feedCache.clear();
});

describe('memory: instant on a tab switch', () => {
  it('returns what was saved', () => {
    feedCache.save(FEED, T0);
    expect(feedCache.readMemory(T0 + 1000)).toEqual(FEED);
  });

  it('is empty before anything is saved', () => {
    expect(feedCache.readMemory(T0)).toBeNull();
  });

  it('expires rather than showing a stale feed', () => {
    // A day-old feed is not "instant", it is wrong: counts have moved and
    // some of it may have been moderated away.
    feedCache.save(FEED, T0);
    expect(feedCache.readMemory(T0 + feedCache.MAX_AGE_MS + 1)).toBeNull();
  });

  it('is still good just inside the window', () => {
    feedCache.save(FEED, T0);
    expect(feedCache.readMemory(T0 + feedCache.MAX_AGE_MS - 1)).toEqual(FEED);
  });
});

describe('disk: something on screen at cold start', () => {
  it('round-trips', async () => {
    feedCache.save(FEED, T0);
    await feedCache.clear();
    // clear() wipes disk too, so re-save and read it back fresh.
    feedCache.save(FEED, T0);
    expect(await feedCache.readDisk(T0 + 1000)).toEqual(FEED);
  });

  it('is a miss, not an error, when empty', async () => {
    await expect(feedCache.readDisk(T0)).resolves.toBeNull();
  });

  it('refuses a stale entry', async () => {
    feedCache.save(FEED, T0);
    expect(await feedCache.readDisk(T0 + feedCache.MAX_AGE_MS + 1)).toBeNull();
  });

  it('treats corrupt JSON as a miss rather than crashing the feed', async () => {
    await AsyncStorage.setItem('@yana/feed_cache_v1', '{not json');
    await expect(feedCache.readDisk(T0)).resolves.toBeNull();
  });

  it('rejects entries missing the fields the card renders', async () => {
    // These would crash the list rather than degrade.
    for (const bad of [
      { confessions: [{ id: 'a' }], savedAt: T0 },
      { confessions: [{ text: 'no id' }], savedAt: T0 },
      { confessions: 'not an array', savedAt: T0 },
      { confessions: [], savedAt: 'not a number' },
    ]) {
      await AsyncStorage.setItem('@yana/feed_cache_v1', JSON.stringify(bad));
      expect(await feedCache.readDisk(T0)).toBeNull();
    }
  });

  it('caps what it persists', async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      ...FEED[0], id: `id-${i}`,
    }));
    feedCache.save(many, T0);
    const back = await feedCache.readDisk(T0 + 1);
    expect(back).toHaveLength(feedCache.MAX_CACHED);
  });
});

describe('what it refuses to store', () => {
  it('never caches an empty feed over a good one', () => {
    // Otherwise one failed refresh would replace a working feed with nothing.
    feedCache.save(FEED, T0);
    feedCache.save([], T0 + 10);
    expect(feedCache.readMemory(T0 + 20)).toEqual(FEED);
  });

  it('ignores a non-array', () => {
    feedCache.save(FEED, T0);
    feedCache.save(null as unknown as Recommendation[], T0 + 10);
    expect(feedCache.readMemory(T0 + 20)).toEqual(FEED);
  });
});

describe('clearing', () => {
  it('drops both layers, so no one inherits another account\'s feed', async () => {
    feedCache.save(FEED, T0);
    await feedCache.clear();
    expect(feedCache.readMemory(T0)).toBeNull();
    expect(await feedCache.readDisk(T0)).toBeNull();
  });

  it('survives a storage failure', async () => {
    const spy = jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('nope'));
    await expect(feedCache.clear()).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe('the window is short enough to be honest', () => {
  it('is at most a few hours', () => {
    expect(feedCache.MAX_AGE_MS).toBeLessThanOrEqual(12 * 60 * 60 * 1000);
  });
});
