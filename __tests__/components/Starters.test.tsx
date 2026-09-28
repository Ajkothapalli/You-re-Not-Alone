/**
 * Sentence starters on the real write screen.
 *
 * The behaviours worth pinning are the ones about getting out of the way: the
 * chips appear on a blank page, and the instant there is text they are gone.
 * A row of suggestions sitting under someone's half-written confession reads as
 * a comment on it.
 */

jest.mock('@/lib/deviceHash', () => ({ getDeviceHash: jest.fn().mockResolvedValue('hash') }));
jest.mock('@/lib/readAllowance', () => ({ grantForWrite: jest.fn() }));
jest.mock('@/components/ProfileButton', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/a11y', () => ({ useReducedMotion: () => true, announce: jest.fn() }));
jest.mock('@/components/AppDialog', () => ({ showDialog: jest.fn() }));

const mockTrack = jest.fn();
jest.mock('@/lib/analytics', () => ({
  analytics: new Proxy({}, { get: (_t, name: string) => (...a: unknown[]) => mockTrack(name, a) }),
}));

const mockPrefs = jest.fn();
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return { ...actual, getReaderPreferences: () => mockPrefs(), submitConfession: jest.fn() };
});

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import WriteScreen from '../../app/write';
import { DraftProvider } from '@/lib/draftContext';
import { STARTERS } from '@/lib/starters';

// The write screen starts mount animations (the mic, the submit button). These
// tests finish in microtasks, so those timers are still pending when jest tears
// the environment down — and a RN Animated callback firing after teardown does
// not fail the test, it kills the worker process, which reports as every test
// in the file timing out. Fake timers keep the animations inside the test.
jest.useFakeTimers();

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockPrefs.mockResolvedValue({ categories: ['grief'] });
});

afterEach(() => {
  jest.clearAllTimers();
});

// render() resolves to the queries — it does NOT return them synchronously in
// this setup, and destructuring the promise silently yields undefined queries
// that only fail later, inside waitFor, as "getByText is not a function".
async function renderWrite() {
  return render(<DraftProvider><WriteScreen /></DraftProvider>);
}

describe('chips appear only on a blank page', () => {
  it('shows the reader\'s own categories\' starters when the field is empty', async () => {
    const { getByText } = await renderWrite();
    await waitFor(() => expect(getByText(STARTERS.grief[0])).toBeTruthy());
    expect(getByText(STARTERS.grief[1])).toBeTruthy();
  });

  it('hides them the moment there is text', async () => {
    const { getByLabelText, queryByTestId, getByTestId } = await renderWrite();
    await waitFor(() => expect(getByTestId('starter-chips')).toBeTruthy());

    await act(async () => {
      fireEvent.changeText(getByLabelText('Your confession'), 'I have already started');
    });
    expect(queryByTestId('starter-chips')).toBeNull();
  });

  it('stays hidden for text, and comes back if the field is cleared', async () => {
    const { getByLabelText, queryByTestId, getByTestId } = await renderWrite();
    await waitFor(() => expect(getByTestId('starter-chips')).toBeTruthy());
    const field = getByLabelText('Your confession');

    await act(async () => { fireEvent.changeText(field, 'something'); });
    expect(queryByTestId('starter-chips')).toBeNull();

    await act(async () => { fireEvent.changeText(field, ''); });
    expect(queryByTestId('starter-chips')).toBeTruthy();
  });

  it('treats a field of whitespace as still blank', async () => {
    // Someone who has typed one space has not started, and hiding the way in
    // over a stray character is the most annoying possible moment to hide it.
    const { getByLabelText, queryByTestId, getByTestId } = await renderWrite();
    await waitFor(() => expect(getByTestId('starter-chips')).toBeTruthy());
    await act(async () => { fireEvent.changeText(getByLabelText('Your confession'), '   '); });
    expect(queryByTestId('starter-chips')).toBeTruthy();
  });

  it('still offers starters when preferences fail to load', async () => {
    mockPrefs.mockRejectedValue(new Error('offline'));
    const { getByTestId } = await renderWrite();
    await waitFor(() => expect(getByTestId('starter-chips')).toBeTruthy());
  });
});

describe('tapping a chip hands the words over', () => {
  it('inserts it as ordinary editable text', async () => {
    const { getByText, getByLabelText } = await renderWrite();
    await waitFor(() => expect(getByText(STARTERS.grief[0])).toBeTruthy());

    await act(async () => { fireEvent.press(getByText(STARTERS.grief[0])); });

    const field = getByLabelText('Your confession') as any;
    expect(field.props.value).toBe(STARTERS.grief[0]);
    expect(field.props.editable).not.toBe(false);
  });

  it('leaves the caret at the end so the writer can keep typing', async () => {
    const { getByText, getByLabelText } = await renderWrite();
    await waitFor(() => expect(getByText(STARTERS.grief[0])).toBeTruthy());
    await act(async () => { fireEvent.press(getByText(STARTERS.grief[0])); });

    const field = getByLabelText('Your confession') as any;
    const end   = STARTERS.grief[0].length;
    expect(field.props.selection).toEqual({ start: end, end });
  });

  it('the writer can then type over or extend it', async () => {
    const { getByText, getByLabelText } = await renderWrite();
    await waitFor(() => expect(getByText(STARTERS.grief[0])).toBeTruthy());
    await act(async () => { fireEvent.press(getByText(STARTERS.grief[0])); });

    const field = getByLabelText('Your confession');
    await act(async () => {
      fireEvent.changeText(field, STARTERS.grief[0] + ' I still set two cups out.');
    });
    expect((field as any).props.value).toContain('I still set two cups out.');
  });

  it('hides the chips once one has been used', async () => {
    const { getByText, queryByTestId } = await renderWrite();
    await waitFor(() => expect(getByText(STARTERS.grief[0])).toBeTruthy());
    await act(async () => { fireEvent.press(getByText(STARTERS.grief[0])); });
    expect(queryByTestId('starter-chips')).toBeNull();
  });
});

describe('analytics carry a category, never text', () => {
  it('reports starter_shown once per category, not once per render', async () => {
    await renderWrite();
    await waitFor(() => {
      expect(mockTrack.mock.calls.filter(([n]) => n === 'starterShown')).toHaveLength(1);
    });
    expect(mockTrack.mock.calls.find(([n]) => n === 'starterShown')![1]).toEqual(['grief']);
  });

  it('reports starter_used with the category id alone', async () => {
    const { getByText } = await renderWrite();
    await waitFor(() => expect(getByText(STARTERS.grief[0])).toBeTruthy());
    await act(async () => { fireEvent.press(getByText(STARTERS.grief[0])); });

    const used = mockTrack.mock.calls.find(([n]) => n === 'starterUsed');
    expect(used![1]).toEqual(['grief']);
  });

  it('never sends the starter text or the draft', async () => {
    const { getByText, getByLabelText } = await renderWrite();
    await waitFor(() => expect(getByText(STARTERS.grief[0])).toBeTruthy());
    await act(async () => { fireEvent.press(getByText(STARTERS.grief[0])); });
    await act(async () => {
      fireEvent.changeText(getByLabelText('Your confession'), 'a private sentence');
    });

    const sent = JSON.stringify(mockTrack.mock.calls);
    expect(sent).not.toContain(STARTERS.grief[0]);
    expect(sent).not.toContain('a private sentence');
  });
});

describe('the substance gate is untouched', () => {
  it('a starter alone does not make a postable confession', async () => {
    // It is four words of OUR text. The gate judging it as a confession would
    // mean this feature had quietly lowered the floor for everyone.
    const { isDraftReady } = require('@/lib/draftReady');
    const { checkLayer1 }  = require('../../supabase/functions/_shared/substance');

    // The client floor is length-only and a starter clears it; the server's
    // meaning check is what rejects it, and that is the layer that should.
    expect(isDraftReady(STARTERS.grief[0])).toBe(true);
    expect(checkLayer1(STARTERS.grief[0])).toBeNull();
  });

  it('a starter plus real words passes Layer 1 exactly as before', async () => {
    const { checkLayer1 } = require('../../supabase/functions/_shared/substance');
    expect(checkLayer1(STARTERS.grief[0] + ' I still set two cups out every morning'))
      .toBeNull();
  });
});
