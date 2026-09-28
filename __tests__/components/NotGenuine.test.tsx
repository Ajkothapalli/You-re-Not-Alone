/**
 * What the writer sees when [3.6] SUBSTANCE turns their confession away.
 *
 * The dialog says "your words are still here". That sentence has to be TRUE,
 * and it is true only because the not-genuine branch returns before anything
 * clears the draft. Losing what someone just wrote — after telling them it was
 * kept — would be a worse failure than the gate itself misfiring.
 */

jest.mock('@/lib/deviceHash', () => ({ getDeviceHash: jest.fn().mockResolvedValue('hash') }));
jest.mock('@/lib/readAllowance', () => ({ grantForWrite: jest.fn() }));
jest.mock('@/components/ProfileButton', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/a11y', () => ({ useReducedMotion: () => true, announce: jest.fn() }));

const mockShowDialog = jest.fn();
jest.mock('@/components/AppDialog', () => ({ showDialog: (...a: unknown[]) => mockShowDialog(...a) }));

const mockTrack = jest.fn();
jest.mock('@/lib/analytics', () => ({
  analytics: new Proxy({}, { get: (_t, name: string) => (...a: unknown[]) => mockTrack(name, a) }),
}));

const mockSubmit = jest.fn();
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return {
    ...actual,
    submitConfession: (...a: unknown[]) => mockSubmit(...a),
  };
});

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import WriteScreen from '../../app/write';
import { DraftProvider } from '@/lib/draftContext';
import { NotGenuineError, type NotGenuineReason } from '@/lib/api';
import { notGenuineCopy } from '@/lib/notGenuineCopy';

const GENUINE_LOOKING = 'i never told anyone about that night and it still sits with me';

function renderWrite() {
  return render(<DraftProvider><WriteScreen /></DraftProvider>);
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

async function submitAndReject(reason: NotGenuineReason) {
  mockSubmit.mockRejectedValueOnce(new NotGenuineError(reason));
  const u = renderWrite();
  const utils = await u;
  await act(async () => {
    fireEvent.changeText(utils.getByLabelText('Your confession'), GENUINE_LOOKING);
  });
  await act(async () => { fireEvent.press(utils.getByText('Let it out')); });
  await waitFor(() => expect(mockShowDialog).toHaveBeenCalled());
  return utils;
}

describe('a 422 keeps the draft', () => {
  it.each<NotGenuineReason>(
    ['too_short', 'no_letters', 'repetition', 'contact_or_link', 'not_genuine'],
  )('%s leaves the words in the field', async (reason) => {
    const { getByLabelText } = await submitAndReject(reason);
    expect((getByLabelText('Your confession') as any).props.value).toBe(GENUINE_LOOKING);
  });
});

describe('the dialog matches the reason', () => {
  it('contact details get their own message', async () => {
    await submitAndReject('contact_or_link');
    const [title, body] = mockShowDialog.mock.calls[0];
    expect(title).toBe('Keep it anonymous');
    expect(body).toContain('anonymous');
  });

  it('everything else gets the gentle default', async () => {
    for (const reason of ['too_short', 'repetition', 'not_genuine'] as NotGenuineReason[]) {
      mockShowDialog.mockClear();
      await submitAndReject(reason);
      const [title] = mockShowDialog.mock.calls[0];
      expect(title).toBe('Say a little more?');
    }
  });

  it('never blames the writer', async () => {
    // Nothing here may name what we think they did. Someone who just tried to
    // say a hard thing out loud does not need to be told it was gibberish.
    for (const reason of
      ['too_short', 'no_letters', 'repetition', 'contact_or_link', 'not_genuine'] as NotGenuineReason[]) {
      const { title, body } = notGenuineCopy(reason);
      const text = `${title} ${body}`.toLowerCase();
      for (const word of
        ['invalid', 'rejected', 'spam', 'gibberish', 'nonsense', 'junk', 'error', 'failed', 'test']) {
        expect(text).not.toContain(word);
      }
    }
  });

  it('promises the words are kept, which the first test proves is true', () => {
    expect(notGenuineCopy('not_genuine').body).toMatch(/still here/i);
  });
});

describe('analytics carry the code and nothing else', () => {
  it('sends blocked_not_genuine with the reason code only', async () => {
    await submitAndReject('repetition');
    const call = mockTrack.mock.calls.find(([name]) => name === 'blockedNotGenuine');
    expect(call).toBeTruthy();
    expect(call![1]).toEqual(['repetition']);
    // The confession text must not appear anywhere in what was sent.
    expect(JSON.stringify(mockTrack.mock.calls)).not.toContain(GENUINE_LOOKING);
  });

  it('is not treated as a moderation block', () => {
    // A quality rejection is not a policy violation and must not be counted
    // as one — it does not escalate and it is not a strike.
    const names = mockTrack.mock.calls.map(([n]) => n);
    expect(names).not.toContain('blockedByModeration');
  });
});
