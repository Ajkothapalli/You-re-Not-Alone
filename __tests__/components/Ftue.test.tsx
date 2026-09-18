/**
 * The FTUE is four beats, and finishing it lands on the feed.
 *
 * Cut from six on 2026-09-17. "Your persona" and "Appearance" asked a new
 * reader for two preferences before they had seen a single confession, so
 * neither could mean anything yet. The point of this file is that cutting the
 * BEATS did not cut the STATE: a persona is still assigned, reader preferences
 * are still saved, markFtueDone() still fires, and the controls that were on
 * those beats still exist — in the You tab, where they were already.
 */

import React from 'react';
import fs   from 'fs';
import path from 'path';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

// Inline reanimated mock. jest.setup.js's global one loads
// react-native-reanimated/mock, which in this version pulls in
// react-native-worklets and dies on its missing native bindings — the same
// reason __tests__/components/illustrations mocks it inline too.
jest.mock('react-native-reanimated', () => {
  const R = require('react');
  const { View, ScrollView } = require('react-native');
  const identity   = (v: unknown) => v;
  const makeEasing = () => identity;

  const AView = R.forwardRef(({ children, ...p }: any, ref: any) =>
    R.createElement(View, { ...p, ref }, children));
  const AScrollView = R.forwardRef(({ children, ...p }: any, ref: any) =>
    R.createElement(ScrollView, { ...p, ref }, children));

  const api = {
    createAnimatedComponent: (c: unknown) => c,
    View:       AView,
    ScrollView: AScrollView,
  };

  return {
    __esModule: true,
    default:    api,
    ...api,
    Extrapolation:             { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    interpolate:               jest.fn(() => 1),
    runOnJS:                   jest.fn((fn: Function) => fn),
    runOnUI:                   jest.fn((fn: Function) => fn),
    scrollTo:                  jest.fn(),
    useAnimatedRef:            jest.fn(() => ({ current: null })),
    useAnimatedScrollHandler:  jest.fn(() => jest.fn()),
    useAnimatedStyle:          jest.fn(() => ({})),
    useAnimatedProps:          jest.fn((fn: () => unknown) => fn()),
    useSharedValue:            jest.fn((init: number) => ({ value: init })),
    withRepeat:                jest.fn((a: unknown) => a),
    withTiming:                jest.fn((v: unknown) => v),
    withSpring:                jest.fn((v: unknown) => v),
    withDelay:                 jest.fn((_: number, a: unknown) => a),
    withSequence:              jest.fn((...a: unknown[]) => a[a.length - 1]),
    cancelAnimation:           jest.fn(),
    ReduceMotion:              { Never: 'never', Always: 'always', System: 'system' },
    Easing: {
      linear: identity, out: makeEasing, in: makeEasing, inOut: makeEasing,
      sin: identity, cubic: identity, quad: identity,
      bezier: makeEasing, elastic: makeEasing, back: makeEasing,
    },
  };
});

// The two hero scenes are covered by their own suite; here they are noise.
jest.mock('@/components/illustrations', () => ({
  Threshold: () => null,
  Sanctuary: () => null,
}));

jest.mock('@/lib/profile', () => ({
  setProfilePersona: jest.fn().mockResolvedValue(undefined),
  setProfileName:    jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/onboarding', () => ({
  markFtueDone: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/api', () => ({
  saveReaderPreferences: jest.fn().mockResolvedValue(undefined),
  getRecommendations:    jest.fn().mockResolvedValue({ confessions: [] }),
}));

jest.mock('@/lib/a11y', () => ({
  announce:         jest.fn(),
  useReducedMotion: () => true,   // no idle loops in the test renderer
}));

import WelcomeScreen, { BEAT_COUNT } from '../../app/welcome';
import { setProfilePersona } from '@/lib/profile';
import { markFtueDone } from '@/lib/onboarding';
import { saveReaderPreferences, getRecommendations } from '@/lib/api';
import { PERSONAS } from '@/components/Persona';
import { CATEGORIES } from '@/lib/categories';

const mockReplace = router.replace as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('FTUE — four beats', () => {
  it('BEAT_COUNT is 4', () => {
    expect(BEAT_COUNT).toBe(4);
  });

  it('the progress indicator shows exactly 4 dots', async () => {
    const { getByTestId } = await render(<WelcomeScreen />);
    expect(getByTestId('ftue-progress').children).toHaveLength(4);
  });

  it('renders all four beats: welcome, how it works, safety, categories', async () => {
    const { getByText } = await render(<WelcomeScreen />);
    expect(getByText('Begin')).toBeTruthy();                         // 0
    expect(getByText('How it works')).toBeTruthy();                  // 1
    expect(getByText("You're safe here")).toBeTruthy();              // 2
    expect(getByText('What resonates')).toBeTruthy();                // 3
  });

  it('categories is the LAST beat — it ends in the two finish actions', async () => {
    const { getByText } = await render(<WelcomeScreen />);
    expect(getByText('Start reading')).toBeTruthy();
    expect(getByText('Or say your first thing')).toBeTruthy();
    // "Next" was the categories CTA while Appearance followed it.
    expect(() => getByText('Next')).toThrow();
  });

  it('the "how it works" card shows ONE confession, not a pairing', async () => {
    // The card here used to be two panels — "You wrote" above your confession
    // and "They wrote" above a stranger's, both saying nearly the same thing.
    // That is the reciprocal-matching claim drawn instead of written, and it
    // sat directly above copy saying the opposite. Matching is a random pick
    // inside a CATEGORY; nobody is paired with anybody.
    const { queryByText, getByText } = await render(<WelcomeScreen />);
    expect(queryByText('You wrote')).toBeNull();
    expect(queryByText('They wrote')).toBeNull();
    expect(getByText(/everyone thinks i'm fine/)).toBeTruthy();
  });

  it('beat 1 renders exactly one confession quote', async () => {
    // Guards the shape rather than the strings: a second quoted line in this
    // card is a second panel, whatever it gets labelled.
    const { toJSON } = await render(<WelcomeScreen />);
    const quotes = JSON.stringify(toJSON()).match(/\\"[a-z]/g) ?? [];
    expect(quotes.length).toBe(1);
  });

  it('the persona beat is gone', async () => {
    const { queryByText, queryByLabelText } = await render(<WelcomeScreen />);
    expect(queryByText("That's me")).toBeNull();
    expect(queryByText('Shuffle')).toBeNull();
    expect(queryByText('Rename')).toBeNull();
    expect(queryByLabelText('Shuffle to a different persona')).toBeNull();
  });

  it('the appearance beat is gone', async () => {
    const { queryByText, queryByLabelText } = await render(<WelcomeScreen />);
    expect(queryByText(/How do you like/)).toBeNull();
    expect(queryByLabelText('Light mode')).toBeNull();
    expect(queryByLabelText('Dark mode')).toBeNull();
  });
});

describe('FTUE — completing it still writes everything it used to', () => {
  it('assigns a persona, saves preferences, marks the FTUE done, lands on the feed', async () => {
    const { getByText } = await render(<WelcomeScreen />);
    await act(async () => { fireEvent.press(getByText('Start reading')); });

    await waitFor(() => expect(markFtueDone).toHaveBeenCalled());

    // A persona is still assigned even though nobody picked one.
    expect(setProfilePersona).toHaveBeenCalledTimes(1);
    const assigned = (setProfilePersona as jest.Mock).mock.calls[0][0];
    expect(PERSONAS.map(p => p.id)).toContain(assigned);

    expect(saveReaderPreferences).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/explore');
  });

  it('pre-selects a few categories rather than all of them or none', async () => {
    const { getByText } = await render(<WelcomeScreen />);
    await act(async () => { fireEvent.press(getByText('Start reading')); });
    await waitFor(() => expect(saveReaderPreferences).toHaveBeenCalled());

    const cats = (saveReaderPreferences as jest.Mock).mock.calls[0][0];
    // Selecting everything is the same pool as selecting nothing, so a
    // default of "all" personalises exactly as little as an empty one.
    expect(cats.length).toBeGreaterThan(0);
    expect(cats.length).toBeLessThan(CATEGORIES.length);
    cats.forEach((c: string) => expect(CATEGORIES.map(x => x.id)).toContain(c));
  });

  it('unticking a category changes what is saved', async () => {
    const { getByText, getByLabelText } = await render(<WelcomeScreen />);
    await act(async () => { fireEvent.press(getByLabelText('Grief & loss')); });
    await act(async () => { fireEvent.press(getByText('Start reading')); });
    await waitFor(() => expect(saveReaderPreferences).toHaveBeenCalled());
    expect((saveReaderPreferences as jest.Mock).mock.calls[0][0]).not.toContain('grief');
  });

  it('skipping still assigns a persona and still finishes the FTUE', async () => {
    const { getAllByText } = await render(<WelcomeScreen />);
    await act(async () => { fireEvent.press(getAllByText('Skip')[0]); });
    await waitFor(() => expect(markFtueDone).toHaveBeenCalled());

    expect(setProfilePersona).toHaveBeenCalledTimes(1);
    // Choosing nothing means the whole pool, not an empty one.
    expect((saveReaderPreferences as jest.Mock).mock.calls[0][0]).toHaveLength(CATEGORIES.length);
    expect(mockReplace).toHaveBeenCalledWith('/explore');
  });

  it('"Or say your first thing" goes to write, and still saves everything', async () => {
    const { getByText } = await render(<WelcomeScreen />);
    await act(async () => { fireEvent.press(getByText('Or say your first thing')); });
    await waitFor(() => expect(markFtueDone).toHaveBeenCalled());
    expect(setProfilePersona).toHaveBeenCalled();
    expect(saveReaderPreferences).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/write');
  });
});

describe('FTUE — ends on real content, without a second read surface', () => {
  it('starts the feed fetch before navigating, so Read opens on confessions', async () => {
    const { getByText } = await render(<WelcomeScreen />);
    await act(async () => { fireEvent.press(getByText('Start reading')); });
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());

    // Fetched once, and only after the categories were saved — a prefetch
    // that raced saveReaderPreferences would warm the feed with the OLD
    // preferences and hand the reader a feed they did not choose.
    expect(getRecommendations).toHaveBeenCalledTimes(1);
    const saveOrder  = (saveReaderPreferences as jest.Mock).mock.invocationCallOrder[0];
    const fetchOrder = (getRecommendations   as jest.Mock).mock.invocationCallOrder[0];
    expect(fetchOrder).toBeGreaterThan(saveOrder);
  });

  it('does not prefetch the feed when the reader is going to write', async () => {
    const { getByText } = await render(<WelcomeScreen />);
    await act(async () => { fireEvent.press(getByText('Or say your first thing')); });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/write'));
    expect(getRecommendations).not.toHaveBeenCalled();
  });

  it('renders no confession of its own — the feed is still the only read surface', async () => {
    // CLAUDE.md invariant 2. Landing on the feed is allowed; showing a
    // "here is your first confession" card at the end of onboarding is not,
    // and the difference is that welcome.tsx renders nothing it fetched.
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'welcome.tsx'), 'utf8');
    // It may START the feed's fetch; it may not consume the result.
    expect(src).toMatch(/primeFeed\(getRecommendations\(false\)\)/);
    expect(src).not.toMatch(/await getRecommendations/);
    expect(src).not.toMatch(/\.confessions/);
    // Mentions in comments are fine; rendering one is the thing that would
    // make this a second read surface.
    expect(src).not.toMatch(/<ReadCard|<ConfessionCard/);
  });
});

describe('the cut controls still exist, in the You tab', () => {
  /**
   * Asserted against source rather than a render: app/(tabs)/you.tsx pulls in
   * the premium context, the purchases bridge and the confessions list, and a
   * render test of all that would be testing those, not this. What matters
   * here is narrow and structural — the two controls that used to live in the
   * FTUE have somewhere to live now.
   */
  const you = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', '(tabs)', 'you.tsx'), 'utf8',
  );

  it('persona shuffle', () => {
    expect(you).toMatch(/handleShufflePersona/);
    expect(you).toMatch(/setProfilePersona/);
    expect(you).toMatch(/Tap to change/);
  });

  it('rename', () => {
    expect(you).toMatch(/setProfileName/);
    expect(you).toMatch(/<TextInput/);
  });

  it('light/dark picker', () => {
    expect(you).toMatch(/setTheme\(mode\)/);
    expect(you).toMatch(/'light' as const/);
    expect(you).toMatch(/'dark'  as const/);
  });
});
