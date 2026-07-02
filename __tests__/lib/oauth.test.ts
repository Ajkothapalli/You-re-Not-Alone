import * as WebBrowser from 'expo-web-browser';
import { signInWithGoogle } from '@/lib/oauth';
import { supabase } from '@/lib/supabase';

const mockWebBrowser   = WebBrowser as jest.Mocked<typeof WebBrowser>;
const mockAuth         = supabase.auth as jest.Mocked<typeof supabase.auth>;
const MOCK_USER        = { id: 'user-123' };
const PKCE_REDIRECT    = 'soulyap://auth?code=test-code-abc';

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.signInWithOAuth.mockResolvedValue({
    data: { url: 'https://oauth.example.com/google', provider: 'google' as any },
    error: null,
  } as any);
  mockAuth.exchangeCodeForSession.mockResolvedValue({ data: {} as any, error: null });
  mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null } as any);
});

describe('signInWithGoogle', () => {
  it('returns false when user cancels the browser', async () => {
    mockWebBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'cancel' as any });
    // no existing session
    mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null } as any);

    const result = await signInWithGoogle();
    expect(result).toBe(false);
    expect(mockAuth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('returns true and exchanges code when browser succeeds with PKCE code', async () => {
    mockWebBrowser.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url:  PKCE_REDIRECT,
    });

    const result = await signInWithGoogle();
    expect(result).toBe(true);
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith('test-code-abc');
  });

  // Android scenario: browser always returns 'dismiss' (polyfill race).
  // signInWithGoogle returns false immediately; handleDeepLink (index.tsx)
  // owns the exchange and routing — no waiting inside oauth.ts.
  it('returns false when browser is dismissed (Android deep-link path)', async () => {
    mockWebBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'dismiss' as any });

    const result = await signInWithGoogle();
    expect(result).toBe(false);
    expect(mockAuth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(mockAuth.onAuthStateChange).not.toHaveBeenCalled();
  });

  it('throws when signInWithOAuth itself errors', async () => {
    // Supabase AuthErrors are proper Error subclasses; simulate that here.
    // Using mockRejectedValue tests that signInWithGoogle() propagates the
    // rejection, which is the invariant we care about.
    mockAuth.signInWithOAuth.mockRejectedValue(new Error('provider disabled'));

    await expect(signInWithGoogle()).rejects.toThrow('provider disabled');
  });

  it('handles code-already-used gracefully when session exists (race: both paths ran)', async () => {
    mockWebBrowser.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url:  PKCE_REDIRECT,
    });
    // Code already exchanged by Linking path → error
    mockAuth.exchangeCodeForSession.mockResolvedValue({
      data: {} as any,
      error: { message: 'code already used' } as any,
    });
    // But session is already established
    mockAuth.getSession.mockResolvedValue({
      data:  { session: { user: MOCK_USER } as any },
      error: null,
    } as any);

    const result = await signInWithGoogle();
    expect(result).toBe(true);
  });
});
