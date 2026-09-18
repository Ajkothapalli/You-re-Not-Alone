/**
 * A binary without the native recogniser loses the MIC, never the screen.
 *
 * This is its own file because the thing it reproduces happens at module-load
 * time and cannot be set up from inside the suite that mocks the module
 * normally: `import { ExpoSpeechRecognitionModule } from 'expo-speech-
 * recognition'` THROWS while the module graph is evaluated in any build
 * without the native code — Expo Go, web, and every dev client or store build
 * made before the module was added.
 *
 * Observed on a device on 2026-09-17, as a full red screen on the write
 * screen: "Cannot find native module 'ExpoSpeechRecognition'", thrown from
 * dictation.ts and taking app/write.tsx down with it. A try/catch inside the
 * hook cannot help — evaluation never reaches the hook. Dictation is an
 * addition to writing and must never be a precondition for it, so the module
 * resolves the native side through a guarded require instead.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Exactly what the native module does when its native half is absent.
jest.mock('expo-speech-recognition', () => {
  throw new Error("Cannot find native module 'ExpoSpeechRecognition'");
});

jest.mock('@/lib/api', () => ({ submitConfession: jest.fn() }));
jest.mock('@/lib/deviceHash', () => ({ getDeviceHash: jest.fn().mockResolvedValue('h') }));
jest.mock('@/lib/readAllowance', () => ({ grantForWrite: jest.fn() }));
jest.mock('@/components/ProfileButton', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/AppDialog', () => ({ showDialog: jest.fn() }));
jest.mock('@/lib/a11y', () => ({ useReducedMotion: () => true, announce: jest.fn() }));
jest.mock('@/lib/analytics', () => ({ analytics: new Proxy({}, { get: () => jest.fn() }) }));

import WriteScreen from '../../app/write';
import { DraftProvider } from '@/lib/draftContext';

beforeEach(async () => {
  await AsyncStorage.clear();
});

function renderWrite() {
  return render(
    <DraftProvider>
      <WriteScreen />
    </DraftProvider>,
  );
}

describe('no native recogniser in this binary', () => {
  it('importing the dictation module does not throw', () => {
    expect(() => require('@/lib/dictation')).not.toThrow();
  });

  it('the write screen renders', async () => {
    const { getByLabelText } = await renderWrite();
    expect(getByLabelText('Your confession')).toBeTruthy();
  });

  it('the mic is absent', async () => {
    const { queryByTestId } = await renderWrite();
    expect(queryByTestId('mic-button')).toBeNull();
  });

  it('the keyboard still writes, and the draft still holds', async () => {
    const { getByLabelText } = await renderWrite();
    await act(async () => {
      fireEvent.changeText(getByLabelText('Your confession'), 'typed with no recogniser');
    });
    expect((getByLabelText('Your confession') as any).props.value).toBe('typed with no recogniser');
  });

  it('the submit button is still there and still gated', async () => {
    const { getByText, getByLabelText } = await renderWrite();
    expect(getByText('Let it out')).toBeTruthy();
    await act(async () => { fireEvent.changeText(getByLabelText('Your confession'), 'something'); });
    expect(getByText('Let it out')).toBeTruthy();
  });

  it('the privacy note drops the voice clause rather than promising it', async () => {
    // Claiming "your voice stays on this phone" on a build that cannot take
    // voice at all would be a small lie in the one place that must not lie.
    const { getByText, queryByText } = await renderWrite();
    expect(getByText('Your words never appear with your identity')).toBeTruthy();
    expect(queryByText(/Your voice stays on this phone/)).toBeNull();
  });

  it('unmounting does not throw trying to abort a recogniser that never existed', async () => {
    const { unmount } = await renderWrite();
    expect(() => unmount()).not.toThrow();
  });
});
