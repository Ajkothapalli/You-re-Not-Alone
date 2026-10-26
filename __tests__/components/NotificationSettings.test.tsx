/**
 * [N1] Settings → Notifications.
 *
 * The master switch is the interesting one: it means three different
 * things depending on what the OS currently thinks, and a settings screen
 * that shows a working toggle over a permission the OS has permanently
 * refused is a screen that lies to somebody.
 */

const mockCurrent   = jest.fn();
const mockRequest   = jest.fn();
const mockExisting  = jest.fn();
const mockRegister  = jest.fn();
const mockUnregister = jest.fn();
const mockPrefs     = jest.fn();
const mockToast     = jest.fn();
const mockOpenSettings = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/pushPermission', () => ({
  currentPermission:  (...a: unknown[]) => mockCurrent(...a),
  requestAndRegister: (...a: unknown[]) => mockRequest(...a),
  existingToken:      (...a: unknown[]) => mockExisting(...a),
  ensureChannel:      jest.fn(),
  CHANNEL_ID: 'soulyap',
}));
jest.mock('@/lib/pushRegistration', () => ({
  registerPushToken:   (...a: unknown[]) => mockRegister(...a),
  unregisterPushToken: (...a: unknown[]) => mockUnregister(...a),
  updatePushPrefs:     (...a: unknown[]) => mockPrefs(...a),
  deviceTimezone:      () => 'Asia/Kolkata',
  touchPushDevice:     jest.fn(),
}));
jest.mock('@/components/Toast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }));

import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import NotificationSettings, { BLOCKED_LINE } from '@/components/NotificationSettings';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { TOAST_GRANTED, TOAST_DENIED } from '@/components/PushAskCard';

const screen = () => render(<ThemeProvider><NotificationSettings /></ThemeProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  // Swapped directly rather than via jest.spyOn: the internal module path
  // react-native re-exports from is not what the `Linking` import resolves
  // to, so mocking that path silently does nothing.
  (Linking as unknown as Record<string, unknown>).openSettings = mockOpenSettings;
  mockCurrent.mockResolvedValue('undetermined');
  mockExisting.mockResolvedValue('ExponentPushToken[x]');
  mockPrefs.mockResolvedValue(true);
  mockRegister.mockResolvedValue(true);
  mockUnregister.mockResolvedValue(true);
});

describe('it never asks just by being opened', () => {
  it('reads the permission and prompts nothing', async () => {
    // Opening a settings screen is not consent to be asked.
    const u = await screen();
    await waitFor(() => expect(mockCurrent).toHaveBeenCalled());
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

describe('when the OS has permanently refused', () => {
  it('shows the exact line and an Open settings button, not a toggle', async () => {
    /**
     * A toggle here would do nothing at all — the OS will not show the
     * dialog again. Silently doing nothing is worse than not offering it,
     * because the person concludes the app is broken rather than that
     * their phone settings are where the switch lives.
     */
    mockCurrent.mockResolvedValue('blocked');
    const u = await screen();

    await waitFor(() => expect(u.getByTestId('push-settings-blocked')).toBeTruthy());
    expect(u.getByText(BLOCKED_LINE)).toBeTruthy();
    expect(BLOCKED_LINE).toBe('Notifications are off for soulyap in your phone settings.');
    expect(u.queryByTestId('push-master')).toBeNull();
  });

  it('the button opens the phone settings', async () => {
    mockCurrent.mockResolvedValue('blocked');
    const u = await screen();
    await waitFor(() => expect(u.getByLabelText('Open settings')).toBeTruthy());
    await act(async () => { fireEvent.press(u.getByLabelText('Open settings')); });
    expect(mockOpenSettings).toHaveBeenCalled();
  });
});

describe('the master switch', () => {
  it('runs the same flow as the card when permission is undetermined', async () => {
    // The second and last place allowed to trigger the dialog — and it
    // goes through the same wrapper, so the invariant test still holds.
    mockRequest.mockResolvedValue({ granted: true, token: 'ExponentPushToken[y]' });
    const u = await screen();
    await waitFor(() => expect(u.getByTestId('push-master')).toBeTruthy());

    await act(async () => { fireEvent(u.getByTestId('push-master'), 'valueChange', true); });

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRegister).toHaveBeenCalledWith('ExponentPushToken[y]');
    expect(mockToast).toHaveBeenCalledWith(TOAST_GRANTED);
  });

  it('shows the same denial copy as the card, with no guilt', async () => {
    mockRequest.mockResolvedValue({ granted: false, token: null });
    const u = await screen();
    await waitFor(() => expect(u.getByTestId('push-master')).toBeTruthy());

    await act(async () => { fireEvent(u.getByTestId('push-master'), 'valueChange', true); });
    expect(mockToast).toHaveBeenCalledWith(TOAST_DENIED);
  });

  it('turning it off REMOVES the token, it does not set a flag', async () => {
    /**
     * A boolean would leave a live registration on a device belonging to
     * somebody who has just said no — one bug away from being used. The
     * server-side master also deletes rows rather than flagging them.
     */
    mockCurrent.mockResolvedValue('granted');
    const u = await screen();
    await waitFor(() => expect(u.getByTestId('push-master')).toBeTruthy());

    await act(async () => { fireEvent(u.getByTestId('push-master'), 'valueChange', false); });

    expect(mockUnregister).toHaveBeenCalledWith('ExponentPushToken[x]');
    expect(mockPrefs).toHaveBeenCalledWith({ master: false });
  });
});

describe('the four preference switches', () => {
  beforeEach(() => { mockCurrent.mockResolvedValue('granted'); });

  it.each([
    ['push-felt',     'felt_on'],
    ['push-question', 'question_on'],
    ['push-quiet',    'quiet_hours'],
    ['push-discreet', 'discreet'],
  ])('%s writes %s through the edge function', async (testID, key) => {
    const u = await screen();
    await waitFor(() => expect(u.getByTestId(testID)).toBeTruthy());

    const current = u.getByTestId(testID).props.value;
    await act(async () => { fireEvent(u.getByTestId(testID), 'valueChange', !current); });

    expect(mockPrefs).toHaveBeenCalledWith({ [key]: !current });
  });

  it('puts a switch back when the server refuses', async () => {
    // A switch left showing the new value after a failed write is a
    // settings screen lying about what the server holds.
    mockPrefs.mockResolvedValue(false);
    const u = await screen();
    await waitFor(() => expect(u.getByTestId('push-discreet')).toBeTruthy());

    await act(async () => { fireEvent(u.getByTestId('push-discreet'), 'valueChange', true); });

    await waitFor(() => expect(u.getByTestId('push-discreet').props.value).toBe(false));
    expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/could not save/i), 'error');
  });

  it('hides them entirely when notifications are off', async () => {
    // Four switches under a master that is off are four controls that do
    // nothing.
    mockCurrent.mockResolvedValue('undetermined');
    const u = await screen();
    await waitFor(() => expect(u.getByTestId('push-master')).toBeTruthy());
    expect(u.queryByTestId('push-felt')).toBeNull();
    expect(u.queryByTestId('push-discreet')).toBeNull();
  });
});

describe('the copy', () => {
  it('describes quiet hours without promising speed', async () => {
    mockCurrent.mockResolvedValue('granted');
    const u = await screen();
    await waitFor(() => expect(u.getByTestId('push-quiet')).toBeTruthy());
    const json = JSON.stringify(u.toJSON());

    expect(json).toMatch(/10pm and 8am/);
    // Batched, capped and deferred — nothing may imply otherwise.
    for (const forbidden of [/instant/i, /immediat/i, /the moment/i, /real.?time/i]) {
      expect(json).not.toMatch(forbidden);
    }
  });

  it('says what discreet actually does', async () => {
    mockCurrent.mockResolvedValue('granted');
    const u = await screen();
    await waitFor(() => expect(u.getByTestId('push-discreet')).toBeTruthy());
    expect(JSON.stringify(u.toJSON())).toMatch(/Something new for you/);
  });
});
