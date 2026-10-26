/**
 * [NAV] Params that arrive while the Write tab is ALREADY MOUNTED.
 *
 * Before Phase NAV every trip to Write mounted a fresh screen, so a
 * mount-only effect was enough to read prefillText/starter/questionId. Now
 * the tab stays alive for the whole session: tapping "Write about this" on a
 * feed invite sets params on a screen that is already on screen, and a
 * mount-only effect would ignore them entirely — the writer would land on
 * Write with an empty box and no sign the tap did anything.
 *
 * The other half is the risk that creates: an effect that re-runs must never
 * paste over words somebody is in the middle of writing.
 */

const mockTrack  = jest.fn();
const mockSubmit = jest.fn();

jest.mock('@/lib/analytics', () => ({
  analytics: new Proxy({}, { get: (_t, name: string) => (...a: unknown[]) => mockTrack(name, a) }),
}));
jest.mock('@/lib/api', () => ({
  submitConfession:     (...a: unknown[]) => mockSubmit(...a),
  getReaderPreferences: jest.fn().mockResolvedValue({ categories: ['grief'] }),
  isNotGenuine:         jest.requireActual('@/lib/api').isNotGenuine,
}));
jest.mock('@/lib/deviceHash', () => ({ getDeviceHash: jest.fn().mockResolvedValue('hash') }));
jest.mock('@/lib/readAllowance', () => ({ grantForWrite: jest.fn() }));
jest.mock('@/components/AppDialog', () => ({ showDialog: jest.fn() }));

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import WriteScreen from '../../app/(tabs)/write';
import { DraftProvider } from '@/lib/draftContext';
import { ThemeProvider } from '@/theme/ThemeProvider';

jest.useFakeTimers();

const STARTER = 'The thing I keep not saying is';

/**
 * Render Write with a mutable params object, and hand back a setter that
 * changes them WITHOUT remounting — which is exactly what router.setParams
 * does to a tab that is already alive.
 */
async function writeScreen(initial: Record<string, string> = {}) {
  const expoRouter = require('expo-router');
  let params = initial;
  const spy = jest.spyOn(expoRouter, 'useLocalSearchParams')
    .mockImplementation(() => params);

  const u = await render(
    <ThemeProvider><DraftProvider><WriteScreen /></DraftProvider></ThemeProvider>,
  );

  return {
    ...u,
    async setParams(next: Record<string, string>) {
      params = next;
      // A re-render, not a remount: the same fiber, new param values.
      await act(async () => {
        u.rerender(
          <ThemeProvider><DraftProvider><WriteScreen /></DraftProvider></ThemeProvider>,
        );
      });
    },
    spy,
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});
afterEach(() => jest.clearAllTimers());

describe('a starter arriving at an already-mounted Write tab', () => {
  it('fills an empty draft', async () => {
    const u = await writeScreen({});
    const field = u.getByLabelText('Your confession');
    expect(field.props.value).toBe('');

    await u.setParams({ starter: STARTER });

    await waitFor(() => {
      expect(u.getByLabelText('Your confession').props.value).toBe(STARTER);
    });
  });

  it('NEVER overwrites words already typed', async () => {
    /**
     * The failure this exists to stop is unrecoverable from the writer's
     * side: they are mid-confession, they tap something in the feed, and the
     * sentence they were writing is replaced by a prompt. There is no undo
     * on a text field, and this app's whole subject is things that are hard
     * to say once.
     */
    const u = await writeScreen({});
    const typed = 'i have been pretending for about four years now';
    await act(async () => {
      fireEvent.changeText(u.getByLabelText('Your confession'), typed);
    });

    await u.setParams({ starter: STARTER });

    expect(u.getByLabelText('Your confession').props.value).toBe(typed);
  });

  it('prefillText wins over a starter when both arrive', async () => {
    // prefillText is an EDIT of something already written; a starter is a
    // suggestion. Losing an edit to a suggestion would lose real words.
    const u = await writeScreen({});
    await u.setParams({ starter: STARTER, prefillText: 'the original confession' });

    await waitFor(() => {
      expect(u.getByLabelText('Your confession').props.value).toBe('the original confession');
    });
  });

  it('clears the one-shot params after a successful submit', async () => {
    /**
     * The tab stays mounted holding whatever params it was given. Without
     * clearing them, the NEXT visit re-seeds the confession that was just
     * sent — the writer opens Write and finds their last post sitting in the
     * box as though it had not gone.
     */
    mockSubmit.mockResolvedValue({ type: 'match', match: { id: 'x', text: 'y', feltCount: 1 } });
    const expoRouter = require('expo-router');

    const u = await writeScreen({ starter: STARTER });
    await waitFor(() => {
      expect(u.getByLabelText('Your confession').props.value).toBe(STARTER);
    });
    await act(async () => {
      fireEvent.changeText(u.getByLabelText('Your confession'),
        'i never sent the message i wrote out three times that night');
    });
    await act(async () => { fireEvent.press(u.getByText('Let it out')); });
    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());

    const cleared = (expoRouter.router.setParams as jest.Mock).mock.calls.at(-1)?.[0];
    expect(cleared).toBeDefined();
    expect(cleared.starter).toBeUndefined();
    expect(cleared.prefillText).toBeUndefined();
    expect(cleared.questionId).toBeUndefined();
    // Every one-shot param is named. A partial clear leaves the other two to
    // re-seed on the next visit, which is the same bug with fewer symptoms.
    expect(Object.keys(cleared).sort()).toEqual(['prefillText', 'questionId', 'starter']);
  });
});
