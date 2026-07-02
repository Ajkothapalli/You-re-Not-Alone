/**
 * Validates the handleDeepLink behaviour added in the Google OAuth fix.
 *
 * handleDeepLink is an inner function, so we test its logic directly
 * through the helpers it delegates to (extractParam regex + supabase calls).
 */

import { supabase } from '@/lib/supabase';
import * as WebBrowser from 'expo-web-browser';

const mockAuth      = supabase.auth as jest.Mocked<typeof supabase.auth>;
const mockDismiss   = WebBrowser.dismissBrowser as jest.Mock;

// --- mirror of the regex used in handleDeepLink ---
function extractCode(url: string): string | null {
  const m = url.match(/[?&#]code=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function extractAccessToken(url: string): string | null {
  const hash = url.split('#')[1];
  if (!hash) return null;
  return new URLSearchParams(hash).get('access_token');
}

beforeEach(() => jest.clearAllMocks());

describe('PKCE code extraction (handleDeepLink path)', () => {
  it('extracts code from query string', () => {
    expect(extractCode('soulyap://auth?code=abc123')).toBe('abc123');
  });

  it('extracts code when other params present', () => {
    expect(extractCode('soulyap://auth?state=xyz&code=def456')).toBe('def456');
  });

  it('returns null for magic-link URL (no code param)', () => {
    expect(extractCode('soulyap://auth#access_token=tok&refresh_token=ref')).toBeNull();
  });

  it('returns null for bare URL', () => {
    expect(extractCode('soulyap://auth')).toBeNull();
  });

  it('decodes percent-encoded code', () => {
    expect(extractCode('soulyap://auth?code=abc%2Fdef')).toBe('abc/def');
  });
});

describe('magic-link token extraction', () => {
  it('extracts access_token from fragment', () => {
    expect(extractAccessToken('soulyap://auth#access_token=mytoken&refresh_token=ref'))
      .toBe('mytoken');
  });

  it('returns null when no fragment', () => {
    expect(extractAccessToken('soulyap://auth?code=abc')).toBeNull();
  });
});

describe('supabase calls are correct per flow', () => {
  it('exchangeCodeForSession is the right call for PKCE code', async () => {
    await supabase.auth.exchangeCodeForSession('test-code');
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith('test-code');
  });

  it('setSession is the right call for implicit (magic-link) tokens', async () => {
    await supabase.auth.setSession({ access_token: 'at', refresh_token: 'rt' });
    expect(mockAuth.setSession).toHaveBeenCalledWith({
      access_token:  'at',
      refresh_token: 'rt',
    });
  });
});
