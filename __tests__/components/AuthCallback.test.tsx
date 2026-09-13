/**
 * app/auth.tsx — the OAuth callback route must never be a dead end.
 *
 * FOURTH "stuck on the loading screen after Google sign-in" report, and the
 * one that was actually the cause. The previous three fixes all went into
 * app/index.tsx (a de-duped deep-link handler, a re-arming watchdog, bounded
 * timeouts on the routing queries) and all of them were fixes to real bugs —
 * but none of them could have fixed this one, because the screen the user was
 * staring at was not index at all.
 *
 * app/auth.tsx was a bare <ActivityIndicator /> with a comment saying it
 * existed "only to prevent Unmatched Route — the actual code exchange is
 * handled by Linking.addEventListener in index.tsx". Expo Router NAVIGATES to
 * this route when soulyap://auth?code=… arrives, so it was not a placeholder:
 * it was the top of the stack, and it had no code path that ever left.
 *
 * Why only the FIRST sign-in:
 *   - returning user → routeAfterAuth ends in router.replace('/explore'),
 *     which replaces the current route — /auth included. Escapes by accident.
 *   - new user → routeAfterAuth ends in setStep('dob'), pure local state on
 *     IndexScreen, which is mounted UNDERNEATH. The DOB form rendered
 *     perfectly, invisibly, below a spinner that never went away.
 *
 * The invariant these tests hold: whatever the callback carries — a code, a
 * magic-link fragment, a cancelled consent screen, or nothing at all — this
 * route hands off and replaces itself. It must never render and stay put.
 */

jest.mock('@/theme/ThemeProvider', () => ({
  useThemeColors: () => ({
    bg: '#0A0A0A', ink: '#141414', paper: '#F5F5F5', dim: '#888888',
    line: '#2A2A2A', border: '#3A3A3A', accent: '#9C8BF6',
    feltText: '#A3A3A3', youreNotAlone: '#606060',
  }),
  usePalette: () => ({ name: 'test', you: '#F5996E', them: '#FBBF24', bands: ['#4C40A4'] }),
  useTheme:   () => ({ isDark: true, theme: 'dark', setTheme: jest.fn(), colors: {} }),
}));

import React from 'react';
import { act, render } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import AuthCallbackScreen from '../../app/auth';

const mockReplace = router.replace as jest.Mock;
const mockParams  = useLocalSearchParams as unknown as jest.Mock;

describe('app/auth.tsx — the callback route always hands off', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams.mockReturnValue({});
    (Linking.getInitialURL as jest.Mock).mockResolvedValue(null);
  });

  it('THE REGRESSION: never renders without navigating away', async () => {
    // The single assertion that would have caught the original bug. The old
    // implementation rendered a spinner and called nothing at all.
    mockParams.mockReturnValue({ code: 'abc123' });

    await act(async () => { render(<AuthCallbackScreen />); });

    expect(mockReplace).toHaveBeenCalled();
  });

  it('hands the code to "/" so index owns the exchange and the routing', async () => {
    mockParams.mockReturnValue({ code: 'abc123' });

    await act(async () => { render(<AuthCallbackScreen />); });

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/',
      params:   { authUrl: 'soulyap://auth?code=abc123' },
    });
  });

  it('prefers the full initial URL, which is the only thing carrying a #fragment', async () => {
    // Magic-link (implicit flow) tokens live in the fragment, and a fragment
    // is not part of the path or query — so the router's parsed params can
    // never see it. Rebuilding from params alone would silently drop it.
    const full = 'soulyap://auth#access_token=tok&refresh_token=ref';
    (Linking.getInitialURL as jest.Mock).mockResolvedValue(full);

    await act(async () => { render(<AuthCallbackScreen />); });

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/',
      params:   { authUrl: full },
    });
  });

  it('ignores a stale launch URL that is not a callback, and uses the param', async () => {
    // On a WARM deep link Android can still report the intent that originally
    // launched the activity. That URL is not a callback, so it must not be
    // mistaken for one.
    (Linking.getInitialURL as jest.Mock).mockResolvedValue('soulyap://');
    mockParams.mockReturnValue({ code: 'warm-code' });

    await act(async () => { render(<AuthCallbackScreen />); });

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/',
      params:   { authUrl: 'soulyap://auth?code=warm-code' },
    });
  });

  it('percent-encodes the code it rebuilds', async () => {
    mockParams.mockReturnValue({ code: 'abc/def' });

    await act(async () => { render(<AuthCallbackScreen />); });

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/',
      params:   { authUrl: 'soulyap://auth?code=abc%2Fdef' },
    });
  });

  it('still leaves when the user backs out of Google (no credential at all)', async () => {
    // ?error=access_denied. There is nothing to exchange, but staying here
    // would be the same dead end by another route — go to "/" with no param
    // and let runBoot land on the email step.
    (Linking.getInitialURL as jest.Mock).mockResolvedValue('soulyap://auth?error=access_denied');

    await act(async () => { render(<AuthCallbackScreen />); });

    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('still leaves when getInitialURL rejects outright', async () => {
    (Linking.getInitialURL as jest.Mock).mockRejectedValue(new Error('native bridge said no'));

    await act(async () => { render(<AuthCallbackScreen />); });

    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
