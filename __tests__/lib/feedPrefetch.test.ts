/**
 * The feed handoff is single-use and short-lived.
 *
 * It exists so the last beat of onboarding can start the feed's fetch a moment
 * before the feed mounts (app/welcome.tsx → app/explore.tsx). Everything here
 * guards the same thing from different angles: a handoff that survived longer
 * than the navigation would be a cache, and a stale cache would eventually
 * hand someone a feed built for categories they no longer have.
 */

import { primeFeed, takePrimedFeed, clearPrimedFeed } from '@/lib/feedPrefetch';
import type { Recommendation } from '@/lib/api';

const rec = (id: string): Recommendation =>
  ({ id, text: 'x', feltCount: 0 } as unknown as Recommendation);

afterEach(() => {
  clearPrimedFeed();
  jest.useRealTimers();
});

describe('feed prefetch', () => {
  it('hands back what was primed', async () => {
    primeFeed(Promise.resolve({ confessions: [rec('a'), rec('b')] }));
    const taken = await takePrimedFeed();
    expect(taken?.map(c => c.id)).toEqual(['a', 'b']);
  });

  it('is null when nothing was primed', async () => {
    expect(await takePrimedFeed()).toBeNull();
  });

  it('can only be taken once', async () => {
    primeFeed(Promise.resolve({ confessions: [rec('a')] }));
    expect(await takePrimedFeed()).not.toBeNull();
    // The second mount of the feed must fetch for itself.
    expect(await takePrimedFeed()).toBeNull();
  });

  it('resolves null instead of rejecting when the prefetch failed', async () => {
    // A failed prefetch must not be the reason the feed shows an error, and
    // must not surface as an unhandled rejection either.
    primeFeed(Promise.reject(new Error('offline')));
    await expect(takePrimedFeed()).resolves.toBeNull();
  });

  it('goes stale rather than serving an old feed', async () => {
    primeFeed(Promise.resolve({ confessions: [rec('a')] }));
    const realNow = Date.now;
    Date.now = () => realNow() + 61_000;
    try {
      expect(await takePrimedFeed()).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });

  it('clearPrimedFeed drops it', async () => {
    primeFeed(Promise.resolve({ confessions: [rec('a')] }));
    clearPrimedFeed();
    expect(await takePrimedFeed()).toBeNull();
  });

  it('a stale take still clears, so it cannot come back later', async () => {
    primeFeed(Promise.resolve({ confessions: [rec('a')] }));
    const realNow = Date.now;
    Date.now = () => realNow() + 61_000;
    await takePrimedFeed();
    Date.now = realNow;
    expect(await takePrimedFeed()).toBeNull();
  });
});
