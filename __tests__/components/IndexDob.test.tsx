/**
 * DOB step of app/index.tsx — locale placeholder, auto-hyphen masking,
 * invalid-date error, valid adult calls createOrUpdateAccount.
 */

// Pin getDobOrder to DD-MM-YYYY so tests are locale-independent.
jest.mock('@/lib/dobFormat', () => {
  const actual = jest.requireActual('@/lib/dobFormat');
  return {
    ...actual,
    getDobOrder: () => ({ order: ['day', 'month', 'year'], placeholder: 'DD-MM-YYYY' }),
  };
});

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

jest.mock('@/components/GoogleSignInButton', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: () => React.createElement(View, { testID: 'GoogleSignIn' }) };
});

jest.mock('@/lib/a11y', () => ({
  announce:         jest.fn(),
  useReducedMotion: jest.fn(() => false),
}));

jest.mock('@/theme/ThemeProvider', () => ({
  usePalette: () => ({ name: 'test', you: '#F5996E', them: '#FBBF24', bands: ['#4C40A4'] }),
}));

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { createOrUpdateAccount } from '@/lib/api';
import IndexScreen from '../../app/index';

const MOCK_USER = { id: 'u1', app_metadata: { provider: 'email' } };

// Render the screen with a valid session so bootstrap calls routeAfterAuth,
// which finds no account row (maybySingle → null) and sets step='dob'.
async function renderAtDob() {
  const { supabase } = require('@/lib/supabase');

  supabase.auth.getSession.mockResolvedValue({
    data:  { session: { user: MOCK_USER } },
    error: null,
  });
  supabase.auth.getUser.mockResolvedValue({
    data: { user: MOCK_USER },
    error: null,
  });
  supabase.from.mockReturnValue({
    select:      jest.fn().mockReturnThis(),
    eq:          jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  });

  let utils: any;
  await act(async () => {
    utils = await render(<IndexScreen />);
  });
  return utils;
}

describe('DOB step', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('renders the locale placeholder DD-MM-YYYY', async () => {
    const { getByPlaceholderText } = await renderAtDob();
    expect(getByPlaceholderText('DD-MM-YYYY')).toBeTruthy();
  });

  it('typing digits shows auto-hyphens', async () => {
    const { getByPlaceholderText } = await renderAtDob();
    const input = getByPlaceholderText('DD-MM-YYYY');

    await act(async () => { fireEvent.changeText(input, '14'); });
    expect(input.props.value).toBe('14-');

    await act(async () => { fireEvent.changeText(input, '14-07'); });
    expect(input.props.value).toBe('14-07-');

    await act(async () => { fireEvent.changeText(input, '14-07-1999'); });
    expect(input.props.value).toBe('14-07-1999');
  });

  it('invalid date shows placeholder-specific error', async () => {
    const { getByPlaceholderText, getByText } = await renderAtDob();
    const input = getByPlaceholderText('DD-MM-YYYY');

    await act(async () => { fireEvent.changeText(input, '31-02-2000'); });
    await act(async () => { fireEvent.press(getByText('Enter')); });

    expect(getByText('Enter your date of birth as DD-MM-YYYY.')).toBeTruthy();
  });

  it('underage date shows 18+ error', async () => {
    const { getByPlaceholderText, getByText } = await renderAtDob();
    const input = getByPlaceholderText('DD-MM-YYYY');

    const d = new Date();
    d.setFullYear(d.getFullYear() - 17);
    const dd   = String(d.getDate()).padStart(2, '0');
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());

    await act(async () => { fireEvent.changeText(input, `${dd}-${mm}-${yyyy}`); });
    await act(async () => { fireEvent.press(getByText('Enter')); });

    expect(getByText('You must be 18 or older to use this app.')).toBeTruthy();
  });

  it('valid adult date calls createOrUpdateAccount with the correct Date', async () => {
    const { getByPlaceholderText, getByText } = await renderAtDob();
    const input = getByPlaceholderText('DD-MM-YYYY');

    await act(async () => { fireEvent.changeText(input, '14-07-1999'); });
    await act(async () => { fireEvent.press(getByText('Enter')); });

    expect(createOrUpdateAccount).toHaveBeenCalledWith(
      new Date('1999-07-14'),
      expect.any(String),
    );
  });
});
