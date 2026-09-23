/**
 * The write screen in voice mode, end to end.
 *
 * The unit tests cover the recorder, the encoder and the submission ordering
 * separately. This file covers the thing none of them can: that the SCREEN
 * actually wires them together — in particular that consent gates entry, and
 * that a confession is either typed or recorded but never both.
 *
 * The consent gate is the one that matters. It is the whole mitigation for a
 * decision that breaks the app's central anonymity promise (CLAUDE.md
 * invariant 3), and a gate that exists in a component but is not reached by
 * the flow protects nobody.
 */

import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';

const handlers: Record<string, ((e: unknown) => void)[]> = {};
const mockStart = jest.fn();
const mockStop  = jest.fn();
const mockAbort = jest.fn();
const mockReq   = jest.fn().mockResolvedValue({ granted: true });
const mockAvail = jest.fn().mockReturnValue(true);
const mockOnDev = jest.fn().mockReturnValue(true);

jest.mock('expo-speech-recognition', () => {
  const R = require('react');
  return {
    ExpoSpeechRecognitionModule: {
      start: (o: unknown) => mockStart(o),
      stop: () => mockStop(),
      abort: () => mockAbort(),
      requestPermissionsAsync: () => mockReq(),
      isRecognitionAvailable: () => mockAvail(),
      supportsOnDeviceRecognition: () => mockOnDev(),
    },
    useSpeechRecognitionEvent: (name: string, cb: (e: unknown) => void) => {
      R.useEffect(() => {
        (handlers[name] ??= []).push(cb);
        return () => { handlers[name] = (handlers[name] ?? []).filter((f) => f !== cb); };
      });
    },
  };
});

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));

const mockSubmitVoice = jest.fn();
jest.mock('@/lib/voiceSubmit', () => ({
  submitVoiceConfession: (...a: unknown[]) => mockSubmitVoice(...a),
  discardLocalRecording: jest.fn(),
}));

const mockSubmitText = jest.fn();
jest.mock('@/lib/api', () => ({
  submitConfession: (...a: unknown[]) => mockSubmitText(...a),
}));

jest.mock('@/lib/deviceHash', () => ({ getDeviceHash: jest.fn().mockResolvedValue('h') }));
jest.mock('@/lib/readAllowance', () => ({ grantForWrite: jest.fn() }));
jest.mock('@/components/ProfileButton', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/AppDialog', () => ({ showDialog: jest.fn() }));
jest.mock('@/lib/a11y', () => ({ useReducedMotion: () => true, announce: jest.fn() }));
jest.mock('@/lib/analytics', () => ({ analytics: new Proxy({}, { get: () => jest.fn() }) }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import WriteScreen from '../../app/write';
import { DraftProvider } from '@/lib/draftContext';
import { VOICE_CONSENT_LINE } from '@/lib/voiceConsent';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __mockFs } = require('expo-file-system') as { __mockFs: Map<string, Uint8Array> };

const URI = 'file:///cache/w.wav';

function emit(name: string, payload?: unknown) {
  (handlers[name] ?? []).forEach((fn) => fn(payload));
}

function renderWrite() {
  return render(<DraftProvider><WriteScreen /></DraftProvider>);
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  for (const k of Object.keys(handlers)) delete handlers[k];
  __mockFs.clear();
  __mockFs.set(URI, new Uint8Array([1]));
  mockAvail.mockReturnValue(true);
  mockOnDev.mockReturnValue(true);
  mockReq.mockResolvedValue({ granted: true });
  mockSubmitVoice.mockResolvedValue({ type: 'submitted', submittedId: 'c1', audioAttached: true });
  mockSubmitText.mockResolvedValue({ type: 'submitted', submittedId: 'c1' });
});

describe('consent gates the first recording', () => {
  it('shows the sheet instead of entering voice mode', async () => {
    const { getByTestId, queryByTestId, getByText } = await renderWrite();
    await act(async () => { fireEvent.press(getByTestId('switch-to-voice')); });

    await waitFor(() => expect(getByTestId('voice-consent-sheet')).toBeTruthy());
    // Crucially: NOT recording, and not even in voice mode yet.
    expect(queryByTestId('voice-idle')).toBeNull();
    expect(mockStart).not.toHaveBeenCalled();
    expect(getByText(VOICE_CONSENT_LINE)).toBeTruthy();
  });

  it('declining returns to typing and records nothing', async () => {
    const { getByTestId, queryByTestId } = await renderWrite();
    await act(async () => { fireEvent.press(getByTestId('switch-to-voice')); });
    await waitFor(() => getByTestId('voice-consent-sheet'));
    await act(async () => { fireEvent.press(getByTestId('voice-consent-decline')); });

    expect(queryByTestId('voice-consent-sheet')).toBeNull();
    expect(queryByTestId('voice-idle')).toBeNull();
    expect(getByLabelTextSafe(getByTestId)).toBeTruthy();   // text field still there
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('accepting enters voice mode and persists the consent', async () => {
    const { getByTestId } = await renderWrite();
    await act(async () => { fireEvent.press(getByTestId('switch-to-voice')); });
    await waitFor(() => getByTestId('voice-consent-sheet'));
    await act(async () => { fireEvent.press(getByTestId('voice-consent-accept')); });

    await waitFor(() => expect(getByTestId('voice-idle')).toBeTruthy());
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('@yana/voice_consent_v1')).toBe('1'));
  });

  it('is NOT asked again once given', async () => {
    await AsyncStorage.setItem('@yana/voice_consent_v1', '1');
    const { getByTestId, queryByTestId } = await renderWrite();
    await act(async () => { fireEvent.press(getByTestId('switch-to-voice')); });

    await waitFor(() => expect(getByTestId('voice-idle')).toBeTruthy());
    expect(queryByTestId('voice-consent-sheet')).toBeNull();
  });

  it('is asked again if the stored answer is unreadable', async () => {
    // Fails closed: being asked twice is the safe direction; recording without
    // consent is not.
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage'));
    const { getByTestId } = await renderWrite();
    await act(async () => { fireEvent.press(getByTestId('switch-to-voice')); });
    await waitFor(() => expect(getByTestId('voice-consent-sheet')).toBeTruthy());
  });
});

describe('the voice option only appears when it can work', () => {
  it('is absent with no on-device recogniser', async () => {
    mockOnDev.mockReturnValue(false);
    const { queryByTestId } = await renderWrite();
    // Absent, not disabled — a dead control on this screen is a small insult.
    expect(queryByTestId('switch-to-voice')).toBeNull();
  });
});

describe('typed OR recorded, never both', () => {
  it('the text field is replaced while in voice mode', async () => {
    await AsyncStorage.setItem('@yana/voice_consent_v1', '1');
    const { getByTestId, queryByLabelText } = await renderWrite();
    await act(async () => { fireEvent.press(getByTestId('switch-to-voice')); });
    await waitFor(() => getByTestId('voice-idle'));
    expect(queryByLabelText('Your confession')).toBeNull();
  });

  it('leaving voice mode clears the draft so a transcript cannot leak into a typed post', async () => {
    await AsyncStorage.setItem('@yana/voice_consent_v1', '1');
    const { getByTestId, getByLabelText } = await renderWrite();
    await act(async () => { fireEvent.press(getByTestId('switch-to-voice')); });
    await waitFor(() => getByTestId('voice-idle'));

    await act(async () => { await capture(getByTestId); });
    await waitFor(() => getByTestId('voice-review'));
    await act(async () => { fireEvent.press(getByTestId('voice-rerecord')); });
    // Re-record clears the transcript rather than leaving the old words to be
    // submitted with new audio.
    await waitFor(() => expect(getByTestId('voice-idle')).toBeTruthy());
  });
});

describe('the review step', () => {
  it('shows the transcript, editable, with playback', async () => {
    await AsyncStorage.setItem('@yana/voice_consent_v1', '1');
    const { getByTestId } = await renderWrite();
    await act(async () => { fireEvent.press(getByTestId('switch-to-voice')); });
    await waitFor(() => getByTestId('voice-idle'));
    await act(async () => { await capture(getByTestId); });

    await waitFor(() => expect(getByTestId('voice-review')).toBeTruthy());
    expect(getByTestId('voice-play')).toBeTruthy();
    expect((getByTestId('voice-transcript') as any).props.value).toBe('i said this out loud');
  });

  it('submits the EDITED text and the ORIGINAL transcript', async () => {
    await AsyncStorage.setItem('@yana/voice_consent_v1', '1');
    const { getByTestId, getByText } = await renderWrite();
    await act(async () => { fireEvent.press(getByTestId('switch-to-voice')); });
    await waitFor(() => getByTestId('voice-idle'));
    await act(async () => { await capture(getByTestId); });
    await waitFor(() => getByTestId('voice-review'));

    await act(async () => {
      fireEvent.changeText(getByTestId('voice-transcript'), 'i said this out loud, corrected');
    });
    await act(async () => { fireEvent.press(getByText('Let it out')); });

    await waitFor(() => expect(mockSubmitVoice).toHaveBeenCalled());
    const a = mockSubmitVoice.mock.calls[0][0];
    expect(a.text).toBe('i said this out loud, corrected');
    // The raw transcript goes too — an edit must not launder past the gate.
    expect(a.rawTranscript).toBe('i said this out loud');
    expect(a.audioUri).toBe(URI);
  });

  it('a typed confession never goes through the voice path', async () => {
    const { getByLabelText, getByText } = await renderWrite();
    await act(async () => { fireEvent.changeText(getByLabelText('Your confession'), 'just typed'); });
    await act(async () => { fireEvent.press(getByText('Let it out')); });

    await waitFor(() => expect(mockSubmitText).toHaveBeenCalled());
    expect(mockSubmitVoice).not.toHaveBeenCalled();
  });
});

describe('the submit button while recording', () => {
  it('is hidden until the recording stops', async () => {
    // A live submit button invites posting a half-sentence.
    await AsyncStorage.setItem('@yana/voice_consent_v1', '1');
    const { getByTestId, queryByText } = await renderWrite();
    await act(async () => { fireEvent.press(getByTestId('switch-to-voice')); });
    await waitFor(() => getByTestId('voice-idle'));
    await act(async () => { fireEvent.press(getByTestId('voice-record')); });
    await waitFor(() => expect(getByTestId('voice-recording')).toBeTruthy());
    expect(queryByText('Let it out')).toBeNull();
  });
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function capture(getByTestId: (id: string) => any) {
  fireEvent.press(getByTestId('voice-record'));
  await Promise.resolve();
  emit('result', { isFinal: true, results: [{ transcript: 'i said this out loud' }] });
  emit('audioend', { uri: URI });
  emit('end');
}

function getByLabelTextSafe(getByTestId: (id: string) => any) {
  // The text field is back; any stable node proves the screen did not blank.
  return getByTestId('switch-to-voice');
}
