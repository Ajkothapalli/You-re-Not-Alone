/**
 * Regression coverage for the mount-time "boot watchdog" in app/index.tsx.
 *
 * THIRD "stuck on Google login spinner" report — root cause: the watchdog
 * used to be a ONE-SHOT setTimeout created once at mount. It fired exactly
 * once, 10s after first render, and was then permanently spent: any hang
 * that started later (e.g. the user idling on the email screen for >10s
 * before tapping "Continue with Google", then hitting a hang with no
 * timeout of its own such as exchangeCodeForSession) had zero recovery path.
 *
 * The fix re-arms the watchdog on every transition INTO step === 'loading'
 * via a useEffect keyed on [step], instead of a single mount-time timer.
 *
 * These tests prove both:
 *  1. The original mount-time case (e.g. Linking.getInitialURL wedging)
 *     still recovers — this must not regress.
 *  2. A hang that only begins well after the first 10s window (idling on
 *     the email screen, then a second, unprotected hang in
 *     exchangeCodeForSession) now ALSO recovers within 10s of re-entering
 *     'loading' — which the old one-shot timer could never do.
 */

jest.mock('@/lib/api', () => ({
  createOrUpdateAccount: jest.fn().mockResolvedValue(undefined),
  getReaderPreferences:  jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/onboarding', () => ({
  resetFtue:    jest.fn().mockResolvedValue(undefined),
  getFtueFlags: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/lib/profile', () => ({
  hydrateProfile: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/rtue', () => ({
  evaluateRtue: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/oauth', () => ({
  signInWithGoogle: jest.fn(),
}));

jest.mock('@/lib/a11y', () => ({
  announce:         jest.fn(),
  useReducedMotion: jest.fn(() => false),
}));

jest.mock('@/theme/ThemeProvider', () => ({
  usePalette:     () => ({ name: 'test', you: '#F5996E', them: '#FBBF24', bands: ['#4C40A4'] }),
  useThemeColors: () => ({ bg: '#0A0A0A', ink: '#141414', paper: '#F5F5F5', dim: '#888888', line: '#2A2A2A', border: '#3A3A3A', accent: '#9C8BF6', feltText: '#A3A3A3', youreNotAlone: '#606060' }),
  useTheme:       () => ({ isDark: true, theme: 'dark', setTheme: jest.fn(), colors: {} }),
}));

jest.mock('@/components/GoogleSignInButton', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ onPress, disabled }: any) =>
      React.createElement(
        Pressable,
        { testID: 'GoogleSignIn', onPress, disabled },
        React.createElement(Text, null, 'Continue with Google'),
      ),
  };
});

// EmptyBench (added to the email step's header — see app/index.tsx) pulls in
// real react-native-reanimated, which the global jest.setup.js mock can't
// initialize outside a native runtime (see illustrations.test.tsx's own
// inline reanimated mock for the same reason). This suite only cares about
// the boot watchdog's timing/step logic, so stub the illustration out
// entirely rather than duplicating that reanimated workaround here.
jest.mock('@/components/illustrations', () => ({
  EmptyBench: () => null,
}));

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { signInWithGoogle } from '@/lib/oauth';
import IndexScreen from '../../app/index';

const ORIGINAL_PLATFORM_OS = Platform.OS;

function getUrlListener(): (e: { url: string }) => void {
  const calls = (Linking.addEventListener as jest.Mock).mock.calls;
  const call = calls.find(([event]) => event === 'url');
  if (!call) throw new Error('Linking.addEventListener("url", ...) was never registered');
  return call[1];
}

describe('app/index.tsx boot watchdog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (Linking.getInitialURL as jest.Mock).mockResolvedValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
    (Platform as any).OS = ORIGINAL_PLATFORM_OS;
  });

  it('regression: still recovers a hang at initial mount (e.g. getInitialURL wedging)', async () => {
    // Nothing ever resolves this — simulates the "unforeseen Expo API freeze"
    // case the watchdog comment has always called out.
    (Linking.getInitialURL as jest.Mock).mockReturnValue(new Promise(() => {}));

    const { getByText } = await act(async () => render(<IndexScreen />));

    // Still loading — the hang hasn't been caught yet.
    expect(() => getByText('Taking longer than usual')).toThrow();

    await act(async () => { jest.advanceTimersByTime(10_001); });

    expect(getByText('Taking longer than usual')).toBeTruthy();
  });

  it('fix: re-arms on re-entry into loading, catching a hang that only starts after the user idles past the old one-shot window', async () => {
    const { supabase } = require('@/lib/supabase');
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    const { getByTestId, getByText, queryByText } = await act(async () => render(<IndexScreen />));

    // Boot resolved quickly (no session) → email step. The mount-time watchdog
    // armed at t=0 is still ticking in the background.
    expect(getByTestId('GoogleSignIn')).toBeTruthy();

    // User reads the screen for 15s — well past the OLD code's one-shot 10s
    // window. With the fix, the effect cleanup already cleared that timer
    // the moment step left 'loading', so nothing fires here.
    await act(async () => { jest.advanceTimersByTime(15_000); });
    expect(queryByText('Taking longer than usual')).toBeNull();
    expect(getByTestId('GoogleSignIn')).toBeTruthy();

    // User taps "Continue with Google". Force the Android polyfill-dismiss
    // path: signInWithGoogle resolves false, index.tsx sets step='loading'
    // and waits for the deep link to complete the exchange.
    (Platform as any).OS = 'android';
    (signInWithGoogle as jest.Mock).mockResolvedValue(false);

    await act(async () => { fireEvent.press(getByTestId('GoogleSignIn')); });

    // The redirect arrives via the 'url' event listener. exchangeCodeForSession
    // has no timeout of its own anywhere in the codebase — simulate it hanging
    // forever (e.g. a wedged network request).
    supabase.auth.exchangeCodeForSession.mockReturnValue(new Promise(() => {}));
    const urlListener = getUrlListener();
    await act(async () => { urlListener({ url: 'soulyap://auth?code=abc123' }); });

    // Just under 10s since THIS entry into loading: no recovery yet.
    await act(async () => { jest.advanceTimersByTime(9_000); });
    expect(queryByText('Taking longer than usual')).toBeNull();

    // Just past 10s since re-entering loading: the re-armed watchdog fires
    // even though exchangeCodeForSession is still hung and unresolved.
    await act(async () => { jest.advanceTimersByTime(1_500); });
    expect(getByText('Taking longer than usual')).toBeTruthy();
  });
});
