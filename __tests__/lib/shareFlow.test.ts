/**
 * The share flow's failure paths, which are the ones that matter.
 *
 * A share must go out even when everything optional around it fails: no
 * session, no network, a capped account, a missing native module, a clipboard
 * that throws. The card is the thing the writer asked for; the token, the
 * tappable link and the clipboard copy are all conveniences layered on top,
 * and not one of them may cost someone their share.
 *
 * The other half is the OTA case. `react-native-share` and `expo-clipboard`
 * are in no binary shipped so far, so the guarded-require fallback is not a
 * theoretical branch — it is what every existing install runs today.
 */

const mockCapture = jest.fn().mockResolvedValue('file:///tmp/card.png');
jest.mock('react-native-view-shot', () => ({ captureRef: (...a: unknown[]) => mockCapture(...a) }));

const mockExpoShare  = jest.fn().mockResolvedValue(undefined);
const mockAvailable  = jest.fn().mockResolvedValue(true);
jest.mock('expo-sharing', () => ({
  shareAsync:        (...a: unknown[]) => mockExpoShare(...a),
  isAvailableAsync:  () => mockAvailable(),
}));

const mockNativeOpen = jest.fn().mockResolvedValue({ success: true });
const mockSetString  = jest.fn().mockResolvedValue(undefined);
const mockToken      = jest.fn();
jest.mock('@/lib/api', () => ({ createShareToken: (...a: unknown[]) => mockToken(...a) }));

const REF = { current: {} } as never;

/**
 * shareCard.ts resolves both native modules once, at import time. Each variant
 * therefore needs its own module registry — otherwise the first import wins and
 * every later test silently exercises that same branch.
 */
function loadShareCard(opts: { share?: boolean; clipboard?: boolean } = {}) {
  const { share = true, clipboard = true } = opts;
  let mod!: typeof import('@/lib/shareCard');
  jest.isolateModules(() => {
    if (share) {
      jest.doMock('react-native-share', () => ({
        __esModule: true,
        default: { open: (...a: unknown[]) => mockNativeOpen(...a) },
      }));
    } else {
      jest.doMock('react-native-share', () => { throw new Error('native module missing'); });
    }
    if (clipboard) {
      jest.doMock('expo-clipboard', () => ({ setStringAsync: (...a: unknown[]) => mockSetString(...a) }));
    } else {
      jest.doMock('expo-clipboard', () => { throw new Error('native module missing'); });
    }
    mod = require('@/lib/shareCard');
  });
  return mod;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCapture.mockResolvedValue('file:///tmp/card.png');
  mockAvailable.mockResolvedValue(true);
  mockToken.mockResolvedValue('aB3xY9zQ7m');
});

// ─── The happy path ──────────────────────────────────────────────────────────

describe('with the native module present, the link is tappable', () => {
  it('sends the image and a message carrying the tokenised link', async () => {
    const { shareConfessionCard } = loadShareCard();
    const r = await shareConfessionCard(REF, 'match');

    expect(r).toEqual({
      link: 'https://soulyap.me/s?c=match&t=aB3xY9zQ7m',
      tappableLink: true,
      linkCopied: true,
      // { success: true } with no message names no app, so it does not count
      // as a chosen target — see didChooseTarget.
      choseTarget: false,
    });
    const opts = mockNativeOpen.mock.calls[0][0];
    expect(opts.url).toBe('file:///tmp/card.png');
    expect(opts.type).toBe('image/png');
    expect(opts.message).toContain('https://soulyap.me/s?c=match&t=aB3xY9zQ7m');
    expect(mockExpoShare).not.toHaveBeenCalled();
  });

  it('backing out of the sheet is not an error', async () => {
    const { shareConfessionCard } = loadShareCard();
    await shareConfessionCard(REF, 'read');
    expect(mockNativeOpen.mock.calls[0][0].failOnCancel).toBe(false);
  });

  it('copies the link so it can be pasted into an Instagram Stories sticker', async () => {
    const { shareConfessionCard } = loadShareCard();
    await shareConfessionCard(REF, 'rtue');
    expect(mockSetString).toHaveBeenCalledWith('https://soulyap.me/s?c=rtue&t=aB3xY9zQ7m');
  });

  it('never attaches audio — a recognisable voice must not leave with the card', async () => {
    const { shareConfessionCard } = loadShareCard();
    await shareConfessionCard(REF, 'match');
    const sent = JSON.stringify(mockNativeOpen.mock.calls[0][0]);
    expect(sent).not.toMatch(/\.m4a\b|\.wav\b|\.mp3\b|audio/i);
  });
});

// ─── Everything optional failing ─────────────────────────────────────────────

describe('the share survives every optional failure', () => {
  it.each([
    ['no session or network', () => mockToken.mockResolvedValue(null)],
    ['a thrown token request', () => mockToken.mockRejectedValue(new Error('offline'))],
    ['a capped account',       () => mockToken.mockResolvedValue(null)],
    ['a malformed token',      () => mockToken.mockResolvedValue('not-a-valid-token')],
    ['a token of the wrong type', () => mockToken.mockResolvedValue(42)],
  ])('%s still shares, with a bucket-only link', async (_label, arrange) => {
    arrange();
    const { shareConfessionCard } = loadShareCard();
    const r = await shareConfessionCard(REF, 'read');

    expect(r.link).toBe('https://soulyap.me/s?c=read');
    expect(mockNativeOpen).toHaveBeenCalled();
  });

  it('a clipboard that throws does not fail the share', async () => {
    mockSetString.mockRejectedValueOnce(new Error('clipboard denied'));
    const { shareConfessionCard } = loadShareCard();
    const r = await shareConfessionCard(REF, 'match');

    expect(r.linkCopied).toBe(false);
    expect(mockNativeOpen).toHaveBeenCalled();
  });

  it('a missing clipboard module reports it rather than pretending', async () => {
    const { shareConfessionCard } = loadShareCard({ clipboard: false });
    const r = await shareConfessionCard(REF, 'match');
    expect(r.linkCopied).toBe(false);
    expect(mockSetString).not.toHaveBeenCalled();
  });
});

// ─── The OTA case: the module is not in the binary ───────────────────────────

describe('without the native module, today\'s behaviour is unchanged', () => {
  it('falls back to expo-sharing instead of crashing', async () => {
    const { shareConfessionCard, LINK_SHARE_AVAILABLE } = loadShareCard({ share: false });

    expect(LINK_SHARE_AVAILABLE).toBe(false);
    const r = await shareConfessionCard(REF, 'read');

    expect(r.tappableLink).toBe(false);
    expect(mockExpoShare).toHaveBeenCalledWith(
      'file:///tmp/card.png',
      expect.objectContaining({ mimeType: 'image/png' }),
    );
    expect(mockNativeOpen).not.toHaveBeenCalled();
  });

  it('importing the module does not throw when the native side is absent', () => {
    // The actual OTA crash mode: a static import resolves before any guard runs.
    expect(() => loadShareCard({ share: false, clipboard: false })).not.toThrow();
  });

  it('still reports the link, so the printed one in the card stays correct', async () => {
    const { shareConfessionCard } = loadShareCard({ share: false });
    const r = await shareConfessionCard(REF, 'rtue');
    expect(r.link).toBe('https://soulyap.me/s?c=rtue&t=aB3xY9zQ7m');
  });
});

// ─── Guards ──────────────────────────────────────────────────────────────────

describe('what the share refuses to do', () => {
  it.each(['crisis', 'confession_id', '../evil', '', 'MATCH'])(
    'rejects %j as a bucket', async (bad) => {
      const { shareConfessionCard } = loadShareCard();
      await expect(shareConfessionCard(REF, bad as never)).rejects.toThrow(/Invalid share source/);
      expect(mockToken).not.toHaveBeenCalled();
      expect(mockNativeOpen).not.toHaveBeenCalled();
    });

  it('mints no token when there is no card to share', async () => {
    // A token spent on a failed capture still counts against the daily cap.
    mockCapture.mockRejectedValueOnce(new Error('capture failed'));
    const { shareConfessionCard } = loadShareCard();
    await expect(shareConfessionCard(REF, 'match')).rejects.toThrow();
    expect(mockToken).not.toHaveBeenCalled();
  });

  it('throws before anything else when the ref is not attached', async () => {
    const { shareConfessionCard } = loadShareCard();
    await expect(shareConfessionCard({ current: null } as never, 'match'))
      .rejects.toThrow(/ref is not attached/);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('asks for the token with the bucket only — never an id', async () => {
    const { shareConfessionCard } = loadShareCard();
    await shareConfessionCard(REF, 'read');
    expect(mockToken).toHaveBeenCalledWith('read');
    expect(mockToken.mock.calls[0]).toHaveLength(1);
  });
});
