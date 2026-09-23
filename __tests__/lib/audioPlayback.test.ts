/**
 * The playback registry — one voice at a time.
 *
 * Cards do not know about each other, so this module is the only thing that
 * can stop two strangers' confessions playing over one another. It is pure
 * logic with no React in it, which makes the failure modes cheap to write down
 * and expensive to notice in an app.
 */

const mockInvoke = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => mockInvoke(...a) } },
}));

import {
  claimPlayback, releasePlayback, stopAllPlayback, currentlyPlaying,
  subscribePlayback, getAudioUrl, clearAudioUrlCache,
} from '@/lib/audioPlayback';

beforeEach(() => {
  jest.clearAllMocks();
  stopAllPlayback();
  clearAudioUrlCache();
  mockInvoke.mockResolvedValue({ data: { url: 'https://signed/a.mp3' }, error: null });
});

describe('one at a time', () => {
  it('starting a second card stops the first', () => {
    const stopA = jest.fn();
    const stopB = jest.fn();

    claimPlayback('a', stopA);
    expect(currentlyPlaying()).toBe('a');

    claimPlayback('b', stopB);
    expect(stopA).toHaveBeenCalledTimes(1);
    expect(stopB).not.toHaveBeenCalled();
    expect(currentlyPlaying()).toBe('b');
  });

  it('re-claiming the same card does not stop itself', () => {
    // A double tap, or a re-render re-claiming, must not kill playback.
    const stop = jest.fn();
    claimPlayback('a', stop);
    claimPlayback('a', stop);
    expect(stop).not.toHaveBeenCalled();
    expect(currentlyPlaying()).toBe('a');
  });

  it('survives a stopper that throws', () => {
    // The previous card may already be unmounted; its stopper can reference a
    // dead player. That must not prevent the new card from playing.
    const boom = jest.fn(() => { throw new Error('unmounted'); });
    claimPlayback('a', boom);
    expect(() => claimPlayback('b', jest.fn())).not.toThrow();
    expect(currentlyPlaying()).toBe('b');
  });
});

describe('release', () => {
  it('clears the current card', () => {
    claimPlayback('a', jest.fn());
    releasePlayback('a');
    expect(currentlyPlaying()).toBeNull();
  });

  it('a STALE card cannot clear a newer one', () => {
    // Card A unmounts after card B started. If release were unconditional, B
    // would be shown as stopped while still playing — and nothing would stop it.
    claimPlayback('a', jest.fn());
    claimPlayback('b', jest.fn());
    releasePlayback('a');
    expect(currentlyPlaying()).toBe('b');
  });
});

describe('stopAllPlayback', () => {
  it('stops and clears', () => {
    const stop = jest.fn();
    claimPlayback('a', stop);
    stopAllPlayback();
    expect(stop).toHaveBeenCalled();
    expect(currentlyPlaying()).toBeNull();
  });

  it('is safe when nothing is playing', () => {
    expect(() => stopAllPlayback()).not.toThrow();
  });

  it('survives a throwing stopper', () => {
    claimPlayback('a', () => { throw new Error('gone'); });
    expect(() => stopAllPlayback()).not.toThrow();
    expect(currentlyPlaying()).toBeNull();
  });
});

describe('subscribers', () => {
  it('receive the current state immediately on subscribe', () => {
    claimPlayback('a', jest.fn());
    const seen: (string | null)[] = [];
    const un = subscribePlayback((id) => seen.push(id));
    expect(seen).toEqual(['a']);
    un();
  });

  it('are notified on claim, release and stop', () => {
    const seen: (string | null)[] = [];
    const un = subscribePlayback((id) => seen.push(id));
    claimPlayback('a', jest.fn());
    claimPlayback('b', jest.fn());
    releasePlayback('b');
    un();
    expect(seen).toEqual([null, 'a', 'b', null]);
  });

  it('stop receiving after unsubscribing', () => {
    const seen: (string | null)[] = [];
    const un = subscribePlayback((id) => seen.push(id));
    un();
    claimPlayback('a', jest.fn());
    expect(seen).toEqual([null]);
  });
});

describe('signed urls', () => {
  it('fetches through the edge function, never by building a path', () => {
    // The object key is revoked at column level — there is no path to build.
    return getAudioUrl('c1').then((url) => {
      expect(url).toBe('https://signed/a.mp3');
      expect(mockInvoke).toHaveBeenCalledWith('get-audio-url', { body: { confessionId: 'c1' } });
    });
  });

  it('caches within the TTL so a replay costs no round trip', async () => {
    await getAudioUrl('c1');
    await getAudioUrl('c1');
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('expires the cache BEFORE the server-side signature does', async () => {
    // Ours is 8 minutes against the server's 10. If it were the other way the
    // app would confidently hand the player a dead URL and show a failure the
    // user cannot act on.
    await getAudioUrl('c1');
    const real = Date.now;
    Date.now = () => real() + 9 * 60 * 1000;
    try {
      await getAudioUrl('c1');
      expect(mockInvoke).toHaveBeenCalledTimes(2);
    } finally {
      Date.now = real;
    }
  });

  it('does not cache a failure', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('404') });
    expect(await getAudioUrl('c1')).toBeNull();
    mockInvoke.mockResolvedValue({ data: { url: 'https://signed/later.mp3' }, error: null });
    expect(await getAudioUrl('c1')).toBe('https://signed/later.mp3');
  });

  it('returns null rather than throwing when the call rejects', async () => {
    mockInvoke.mockRejectedValue(new Error('offline'));
    await expect(getAudioUrl('c1')).resolves.toBeNull();
  });

  it('keeps urls per confession', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { url: 'https://signed/a.mp3' }, error: null });
    mockInvoke.mockResolvedValueOnce({ data: { url: 'https://signed/b.mp3' }, error: null });
    expect(await getAudioUrl('a')).toBe('https://signed/a.mp3');
    expect(await getAudioUrl('b')).toBe('https://signed/b.mp3');
  });

  it('clearAudioUrlCache drops everything', async () => {
    // Sign-out must not leave resolvable links to anyone's voice in memory.
    await getAudioUrl('c1');
    clearAudioUrlCache();
    await getAudioUrl('c1');
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });
});
