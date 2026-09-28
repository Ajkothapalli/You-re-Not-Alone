/**
 * Install attribution.
 *
 * The assertion that matters most is negative: the invite TOKEN must never
 * reach analytics. A token in an analytics payload would tie a share — and so,
 * server-side, an account — to a device and a moment, which is exactly the
 * link the per-share token design exists to prevent (CLAUDE.md #3).
 */

const mockTrack = jest.fn();
jest.mock('@/lib/analytics', () => ({
  analytics: new Proxy({}, { get: (_t, name: string) => (...a: unknown[]) => mockTrack(name, a) }),
}));

const mockGetReferrer = jest.fn();
jest.mock('expo-application', () => ({ getInstallReferrerAsync: () => mockGetReferrer() }));

const secureStore: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  setItemAsync:    jest.fn(async (k: string, v: string) => { secureStore[k] = v; }),
  getItemAsync:    jest.fn(async (k: string) => secureStore[k] ?? null),
  deleteItemAsync: jest.fn(async (k: string) => { delete secureStore[k]; }),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  parseReferrer, attributeInstallOnce,
  getPendingInvite, setPendingInvite, clearPendingInvite,
} from '@/lib/installReferrer';

const TOKEN = 'aB3xY9zQ7m';
const SHARE = `utm_source=share&utm_campaign=read&utm_content=${TOKEN}`;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  for (const k of Object.keys(secureStore)) delete secureStore[k];
  (Platform as { OS: string }).OS = 'android';
});

// ─── The parse ───────────────────────────────────────────────────────────────

describe('parsing a Play referrer', () => {
  it('reads the bucket and the token', () => {
    expect(parseReferrer(SHARE)).toEqual({ bucket: 'read', token: TOKEN });
  });

  it.each(['match', 'rtue', 'read', 'question', 'invite'])(
    'accepts the %s bucket', (b) => {
      expect(parseReferrer(`utm_source=share&utm_campaign=${b}`)?.bucket).toBe(b);
    });

  it('falls back to "share" for an unknown campaign', () => {
    expect(parseReferrer('utm_source=share&utm_campaign=nonsense')?.bucket).toBe('share');
  });

  it('ignores a referrer that is not ours', () => {
    // An organic install carries a referrer too; attributing it would be
    // inventing data.
    for (const r of [
      'utm_source=google-play&utm_medium=organic',
      'utm_source=adwords&utm_campaign=read',
      'not-a-query-string',
      '', null, undefined,
    ]) expect(parseReferrer(r as string)).toBeNull();
  });

  it('drops a malformed token rather than forwarding it', () => {
    for (const t of [
      'short', 'waytoolongtoken', 'has-dash-x', '',
      'aB3xY9zQ7', 'aB3xY9zQ7mm',        // nine and eleven
      encodeURIComponent('aB3xY9zQ7m x'), // a space, encoded
    ]) {
      expect(parseReferrer(`utm_source=share&utm_campaign=read&utm_content=${t}`)?.token)
        .toBeNull();
    }
  });

  it('a trailing extra parameter is a separate param, not a bad token', () => {
    // `utm_content=aB3xY9zQ7m&x=1` parses as a VALID token plus x=1 — the & is
    // a separator. Harmless: an appended parameter cannot forge a token, since
    // the value still has to exist in share_tokens server-side.
    const p = parseReferrer('utm_source=share&utm_campaign=read&utm_content=aB3xY9zQ7m&x=1');
    expect(p?.token).toBe('aB3xY9zQ7m');
  });

  it('keeps the bucket even when the token is junk', () => {
    const p = parseReferrer('utm_source=share&utm_campaign=rtue&utm_content=bad');
    expect(p).toEqual({ bucket: 'rtue', token: null });
  });
});

// ─── Reading it once ─────────────────────────────────────────────────────────

describe('attribution happens exactly once', () => {
  it('reports the bucket and stores the token on a first launch', async () => {
    mockGetReferrer.mockResolvedValue(SHARE);
    const r = await attributeInstallOnce();

    expect(r).toEqual({ bucket: 'read', token: TOKEN });
    expect(mockTrack).toHaveBeenCalledWith('installAttributed', ['read']);
    expect(await getPendingInvite()).toBe(TOKEN);
  });

  it('does nothing on a second launch', async () => {
    mockGetReferrer.mockResolvedValue(SHARE);
    await attributeInstallOnce();
    mockTrack.mockClear();

    // The referrer is readable forever, so without the persisted flag every
    // cold start would re-attribute the same install.
    expect(await attributeInstallOnce()).toBeNull();
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('marks itself done even for a non-share referrer', async () => {
    mockGetReferrer.mockResolvedValue('utm_source=google-play');
    expect(await attributeInstallOnce()).toBeNull();
    expect(mockTrack).not.toHaveBeenCalled();
    // And does not ask again.
    mockGetReferrer.mockResolvedValue(SHARE);
    expect(await attributeInstallOnce()).toBeNull();
  });

  it('is a no-op off Android', async () => {
    (Platform as { OS: string }).OS = 'ios';
    expect(await attributeInstallOnce()).toBeNull();
    expect(mockGetReferrer).not.toHaveBeenCalled();

    (Platform as { OS: string }).OS = 'web';
    expect(await attributeInstallOnce()).toBeNull();
    expect(mockGetReferrer).not.toHaveBeenCalled();
  });

  it('never throws when the referrer API fails', async () => {
    mockGetReferrer.mockRejectedValue(new Error('not available'));
    await expect(attributeInstallOnce()).resolves.toBeNull();
  });

  it('attributes the bucket even when there is no token', async () => {
    mockGetReferrer.mockResolvedValue('utm_source=share&utm_campaign=match');
    const r = await attributeInstallOnce();
    expect(r).toEqual({ bucket: 'match', token: null });
    expect(mockTrack).toHaveBeenCalledWith('installAttributed', ['match']);
    expect(await getPendingInvite()).toBeNull();
  });
});

// ─── The token never reaches analytics ───────────────────────────────────────

describe('the token is not analytics data', () => {
  it('no event payload contains it', async () => {
    mockGetReferrer.mockResolvedValue(SHARE);
    await attributeInstallOnce();
    expect(JSON.stringify(mockTrack.mock.calls)).not.toContain(TOKEN);
  });

  it('installAttributed is called with the bucket alone', async () => {
    mockGetReferrer.mockResolvedValue(SHARE);
    await attributeInstallOnce();
    const call = mockTrack.mock.calls.find(([n]) => n === 'installAttributed');
    expect(call![1]).toEqual(['read']);
    expect(call![1]).toHaveLength(1);
  });
});

// ─── The pending token ───────────────────────────────────────────────────────

describe('the pending invite lives in secure storage', () => {
  it('round-trips a valid token', async () => {
    await setPendingInvite(TOKEN);
    expect(await getPendingInvite()).toBe(TOKEN);
  });

  it('refuses to store a malformed one', async () => {
    await setPendingInvite('nope');
    expect(await getPendingInvite()).toBeNull();
  });

  it('clears', async () => {
    await setPendingInvite(TOKEN);
    await clearPendingInvite();
    expect(await getPendingInvite()).toBeNull();
  });

  it('is stored in SecureStore, not AsyncStorage', async () => {
    // It is a claimable credential until spent; AsyncStorage is not encrypted.
    await setPendingInvite(TOKEN);
    const dump = JSON.stringify(await AsyncStorage.getAllKeys());
    expect(dump).not.toContain('invite');
    expect(require('expo-secure-store').setItemAsync).toHaveBeenCalled();
  });
});
