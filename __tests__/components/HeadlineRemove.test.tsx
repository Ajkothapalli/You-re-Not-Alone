/**
 * [H1] The writer's veto over their own headline.
 *
 * A model chose which of somebody's words to set in bold above the rest.
 * Even done well and even verbatim, that is a decision made about a person's
 * confession without asking them — so the screen that shows them their own
 * confessions has to show them the headline, say plainly where it came from,
 * and let them take it away.
 *
 * The sealing rule is the constraint that makes this interesting: once a real
 * person has felt a confession, what they felt stops changing. So the veto is
 * available only while the confession is still editable, and the UI must not
 * offer an action the server is going to refuse.
 */

const mockGetMine        = jest.fn();
const mockRemoveHeadline = jest.fn();
const mockShowDialog     = jest.fn();

jest.mock('@/lib/api', () => ({
  getMyConfessions:  (...a: unknown[]) => mockGetMine(...a),
  removeHeadline:    (...a: unknown[]) => mockRemoveHeadline(...a),
  retireConfession:  jest.fn(),
}));
jest.mock('@/components/AppDialog', () => ({ showDialog: (...a: unknown[]) => mockShowDialog(...a) }));
jest.mock('@/components/VoicePlayButton', () => ({ __esModule: true, default: () => null }));

import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import MyConfessions from '../../app/my-confessions';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { OwnConfession } from '@/lib/api';

const BASE: OwnConfession = {
  id:                'c1',
  text:              'I still keep the last voicemail she left me and I have not listened to it in two years.',
  headline:          'I have not listened to it',
  felt_count:        3,
  can_edit:          true,
  updated_at:        null,
  status:            'live',
  created_at:        '2026-09-01T00:00:00Z',
  audio_duration_ms: null,
  audio_waveform:    null,
};

function screenWith(overrides: Partial<OwnConfession> = {}) {
  mockGetMine.mockResolvedValue([{ ...BASE, ...overrides }]);
  return render(<ThemeProvider><MyConfessions /></ThemeProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRemoveHeadline.mockResolvedValue({});
});

describe('the writer sees where the headline came from', () => {
  it('shows the headline on their own confession', async () => {
    const u = await screenWith();
    await waitFor(() => expect(u.getByText(BASE.headline!)).toBeTruthy());
  });

  it('says it was picked from their own words', async () => {
    // Without this line a writer sees bold text they did not choose and
    // reasonably concludes the app wrote a title for their confession —
    // which is the exact thing this feature is built not to do.
    const u = await screenWith();
    await waitFor(() => expect(u.getByText('Picked from your own words')).toBeTruthy());
  });

  it('shows nothing extra when there is no headline', async () => {
    const u = await screenWith({ headline: null });
    await waitFor(() => expect(u.getByText(BASE.text)).toBeTruthy());
    expect(u.queryByText('Picked from your own words')).toBeNull();
    expect(u.queryByTestId('remove-headline-c1')).toBeNull();
  });
});

describe('removing it', () => {
  it('calls the server with that confession', async () => {
    const u = await screenWith();
    await waitFor(() => expect(u.getByTestId('remove-headline-c1')).toBeTruthy());
    await act(async () => { fireEvent.press(u.getByTestId('remove-headline-c1')); });
    expect(mockRemoveHeadline).toHaveBeenCalledWith('c1');
  });

  it('takes it off screen straight away', async () => {
    // Optimistic on purpose: this is someone asking for their own words to
    // stop being singled out, and making them wait on a round trip to see it
    // gone is the wrong way round.
    const u = await screenWith();
    await waitFor(() => expect(u.getByTestId('remove-headline-c1')).toBeTruthy());
    await act(async () => { fireEvent.press(u.getByTestId('remove-headline-c1')); });

    await waitFor(() => expect(u.queryByText(BASE.headline!)).toBeNull());
    expect(u.queryByText('Picked from your own words')).toBeNull();
    // The confession itself is untouched. Only the headline was removed.
    expect(u.getByText(BASE.text)).toBeTruthy();
  });

  it('puts it BACK if the server refused', async () => {
    /**
     * The one direction the optimism must not hold. Leaving it hidden
     * locally while it is still live in the feed would be a lie about the
     * single thing they came to this screen to change.
     */
    mockRemoveHeadline.mockRejectedValue(new Error('offline'));
    const u = await screenWith();
    await waitFor(() => expect(u.getByTestId('remove-headline-c1')).toBeTruthy());
    await act(async () => { fireEvent.press(u.getByTestId('remove-headline-c1')); });

    await waitFor(() => expect(u.getByText(BASE.headline!)).toBeTruthy());
    expect(mockShowDialog).toHaveBeenCalled();
  });

  it('explains a seal rather than calling it an error', async () => {
    // A race: a real felt landed between the screen loading and the tap.
    // "Someone has already felt this" is true and is not the writer's fault;
    // "something went wrong" would read as a bug they should retry.
    mockRemoveHeadline.mockResolvedValue({ sealed: true });
    const u = await screenWith();
    await waitFor(() => expect(u.getByTestId('remove-headline-c1')).toBeTruthy());
    await act(async () => { fireEvent.press(u.getByTestId('remove-headline-c1')); });

    await waitFor(() => expect(mockShowDialog).toHaveBeenCalled());
    expect(String(mockShowDialog.mock.calls[0][0])).toMatch(/already felt/i);
    // And the headline comes back, because it is still there on the server.
    expect(u.getByText(BASE.headline!)).toBeTruthy();
  });
});

describe('the sealing rule', () => {
  it('the action is gone once the confession is sealed', async () => {
    // can_edit is the server's own answer to "is real_felt_count zero".
    // Offering an action the server will refuse is worse than not offering
    // it: the writer taps, nothing happens, and they learn the control lies.
    const u = await screenWith({ can_edit: false });
    await waitFor(() => expect(u.getByText(BASE.headline!)).toBeTruthy());
    expect(u.queryByTestId('remove-headline-c1')).toBeNull();
  });

  it('but the headline itself is still shown', async () => {
    // They can no longer change it; they should still be able to see it.
    // Hiding it would leave them unable to find out what a reader saw.
    const u = await screenWith({ can_edit: false });
    await waitFor(() => expect(u.getByText(BASE.headline!)).toBeTruthy());
    expect(u.getByText('Picked from your own words')).toBeTruthy();
  });

  it('a retired confession offers nothing', async () => {
    const u = await screenWith({ status: 'retired' });
    await waitFor(() => expect(u.getByText(BASE.text)).toBeTruthy());
    expect(u.queryByTestId('remove-headline-c1')).toBeNull();
  });
});
