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
import { StyleSheet } from 'react-native';
import { render, fireEvent, act, waitFor, within } from '@testing-library/react-native';

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

describe('the idle card illustration', () => {
  /**
   * Speaking is a BUST, cropped at the bottom edge of its own viewBox. That
   * only works in an exactly-4:3 box: letterbox it inside a wider one and
   * preserveAspectRatio="xMidYMid meet" leaves paper below the crop, so the
   * shoulders end in mid-air. The box comes from a measurement, so a layout
   * regression would not throw — the scene would just quietly go missing or
   * go wrong. Both are pinned here.
   */
  async function layOutIdle(width: number, height: number) {
    await AsyncStorage.setItem('@yana/voice_consent_v1', '1');
    const utils = await renderWrite();
    await act(async () => { fireEvent.press(utils.getByTestId('switch-to-voice')); });
    await waitFor(() => utils.getByTestId('voice-idle'));
    await act(async () => {
      fireEvent(utils.getByTestId('voice-illustration-box'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width, height } },
      });
    });
    return utils;
  }

  it('mounts the scene on a paper ground once the box is measured', async () => {
    const { getByTestId } = await layOutIdle(320, 176);
    // The ground is what keeps the print-colour ink visible in dark mode, so
    // the scene has to be INSIDE it, not a sibling.
    const ground = getByTestId('voice-illustration');
    expect(within(ground).getAllByTestId('Svg')).toHaveLength(1);
  });

  it('gives the scene an exactly 4:3 box, so the bust is not letterboxed', async () => {
    // 320×176 is wider than 4:3, so height binds and width is derived.
    const { getByTestId } = await layOutIdle(320, 176);
    const { width, height } = StyleSheet.flatten(
      getByTestId('voice-illustration').props.style,
    ) as { width: number; height: number };

    expect(height).toBe(176);
    expect(width / height).toBeCloseTo(4 / 3, 5);
    expect(width).toBeLessThanOrEqual(320);
  });

  it('fits to width instead when the box is narrower than 4:3', async () => {
    const { getByTestId } = await layOutIdle(200, 176);
    const { width, height } = StyleSheet.flatten(
      getByTestId('voice-illustration').props.style,
    ) as { width: number; height: number };

    expect(width).toBe(200);
    expect(width / height).toBeCloseTo(4 / 3, 5);
    expect(height).toBeLessThanOrEqual(176);
  });

  it('gives Record the primary treatment, in the same place Stop appears', async () => {
    // Record used to be an outlined circle floating in the centre, so the one
    // action this screen exists for read as less important than the Stop that
    // replaced it, and the control moved under the user's thumb mid-gesture.
    const { getByTestId, getByText } = await layOutIdle(320, 176);
    const record = StyleSheet.flatten(getByTestId('voice-record').props.style) as {
      backgroundColor: string; borderRadius: number;
    };
    expect(getByText('Record')).toBeTruthy();
    expect(record.backgroundColor).toBe('#FFE500');   // color.accent, both themes

    await act(async () => { fireEvent.press(getByTestId('voice-record')); });
    await waitFor(() => getByTestId('voice-recording'));
    const stop = StyleSheet.flatten(getByTestId('voice-stop').props.style) as {
      backgroundColor: string; borderRadius: number;
    };
    expect(stop.backgroundColor).toBe(record.backgroundColor);
    expect(stop.borderRadius).toBe(record.borderRadius);
  });

  it('is gone while recording — the timer and live transcript need the room', async () => {
    const { getByTestId, queryByTestId } = await layOutIdle(320, 176);
    await act(async () => { fireEvent.press(getByTestId('voice-record')); });
    await waitFor(() => expect(getByTestId('voice-recording')).toBeTruthy());
    expect(queryByTestId('voice-illustration')).toBeNull();
  });
});

describe('after recording, posting is the action', () => {
  async function toReview(u: any) {
    await act(async () => { fireEvent.press(u.getByTestId('switch-to-voice')); });
    await waitFor(() => u.getByTestId('voice-idle'));
    await act(async () => { await capture(u.getByTestId); });
    await waitFor(() => u.getByTestId('voice-review'));
  }

  it('does not offer "Record again" beside the post button', async () => {
    // It used to sit here as an equal-weight button next to "Type instead",
    // with "Let it out" underneath: three competing choices at the moment the
    // writer had already done the hard part.
    await AsyncStorage.setItem('@yana/voice_consent_v1', '1');
    const u = await renderWrite();
    await toReview(u);

    expect(u.queryByText('Record again')).toBeNull();
    expect(u.getByText('Let it out')).toBeTruthy();
  });

  it('still lets someone abandon a recording they regret', async () => {
    // Removing every escape would trap a writer on this screen with a
    // recording they do not want to post. It is a quiet link now, not a button
    // competing with the post action — but it is still here.
    await AsyncStorage.setItem('@yana/voice_consent_v1', '1');
    const u = await renderWrite();
    await toReview(u);

    await act(async () => { fireEvent.press(u.getByTestId('voice-rerecord')); });
    await waitFor(() => expect(u.getByTestId('voice-idle')).toBeTruthy());
  });

  it('returns to the record screen once posted, so nothing can be posted twice', async () => {
    // /match is pushed over this screen rather than replacing it, so the write
    // screen stays mounted. Without the reset it would still be holding the
    // review card for a confession that is already live.
    await AsyncStorage.setItem('@yana/voice_consent_v1', '1');
    const u = await renderWrite();
    await toReview(u);

    await act(async () => { fireEvent.press(u.getByText('Let it out')); });
    await waitFor(() => expect(mockSubmitVoice).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(u.getByTestId('voice-idle')).toBeTruthy());
    expect(u.queryByTestId('voice-review')).toBeNull();
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
