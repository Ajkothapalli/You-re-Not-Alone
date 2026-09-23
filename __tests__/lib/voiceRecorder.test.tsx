/**
 * The recorder — the cap, and what happens when things go wrong.
 *
 * This module had no coverage and holds the riskiest logic in the feature:
 * a hard time limit enforced by a timer, a fail-closed rule when the recogniser
 * produces nothing, and cleanup paths that decide whether someone's voice is
 * left sitting in a cache directory.
 *
 * Every test here is about a failure mode, not a happy path. The happy path is
 * the one anybody would notice.
 */

import React from 'react';
import { Text } from 'react-native';
import { render, act } from '@testing-library/react-native';

// ── Native module double ─────────────────────────────────────────────────────
const handlers: Record<string, ((e: unknown) => void)[]> = {};
const mockStart   = jest.fn();
const mockStop    = jest.fn();
const mockAbort   = jest.fn();
const mockRequest = jest.fn().mockResolvedValue({ granted: true });
const mockAvail   = jest.fn().mockReturnValue(true);
const mockOnDev   = jest.fn().mockReturnValue(true);

jest.mock('expo-speech-recognition', () => {
  const R = require('react');
  return {
    ExpoSpeechRecognitionModule: {
      start:                       (o: unknown) => mockStart(o),
      stop:                        () => mockStop(),
      abort:                       () => mockAbort(),
      requestPermissionsAsync:     () => mockRequest(),
      isRecognitionAvailable:      () => mockAvail(),
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

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-GB' }] }));

import {
  useVoiceRecorder, MAX_RECORDING_MS, WARN_REMAINING_MS, formatDuration,
} from '@/lib/voiceRecorder';
import { File } from 'expo-file-system';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __mockFs } = require('expo-file-system') as { __mockFs: Map<string, Uint8Array> };

const URI  = 'file:///cache/rec_a.wav';
const URI2 = 'file:///cache/rec_b.wav';

function emit(name: string, payload?: unknown) {
  (handlers[name] ?? []).forEach((fn) => fn(payload));
}

/** Probe that exposes the hook's value to the test. */
let api: ReturnType<typeof useVoiceRecorder>;
function Probe() {
  api = useVoiceRecorder();
  return <Text testID="s">{api.state}</Text>;
}

async function mount() {
  const utils = await render(<Probe />);
  return utils;
}

/** Drive a complete capture: start → speech → file → end. */
async function capture(uri = URI, transcript = 'i never told anyone') {
  await act(async () => { await api.start(); });
  await act(async () => { emit('result', { isFinal: true, results: [{ transcript }] }); });
  await act(async () => { emit('audioend', { uri }); });
  await act(async () => { emit('end'); });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  for (const k of Object.keys(handlers)) delete handlers[k];
  __mockFs.clear();
  __mockFs.set(URI,  new Uint8Array([1]));
  __mockFs.set(URI2, new Uint8Array([2]));
  mockRequest.mockResolvedValue({ granted: true });
  mockAvail.mockReturnValue(true);
  mockOnDev.mockReturnValue(true);
});

// ── Availability ─────────────────────────────────────────────────────────────

describe('availability', () => {
  it('requires BOTH a recogniser and on-device support', async () => {
    await mount();
    expect(api.available).toBe(true);
  });

  it('is unavailable when on-device recognition is missing', async () => {
    // Falling back to network recognition would ship the recording to a vendor.
    mockOnDev.mockReturnValue(false);
    await mount();
    expect(api.available).toBe(false);
  });

  it('is unavailable when the recogniser is missing', async () => {
    mockAvail.mockReturnValue(false);
    await mount();
    expect(api.available).toBe(false);
  });
});

// ── Permission ───────────────────────────────────────────────────────────────

describe('permission', () => {
  it('is requested on start, not on mount', async () => {
    await mount();
    expect(mockRequest).not.toHaveBeenCalled();
    await act(async () => { await api.start(); });
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('denial starts nothing and leaves the recorder idle', async () => {
    mockRequest.mockResolvedValue({ granted: false });
    await mount();
    await act(async () => { await api.start(); });
    expect(mockStart).not.toHaveBeenCalled();
    expect(api.state).toBe('idle');
  });

  it('a thrown permission request is not a crash', async () => {
    mockRequest.mockRejectedValue(new Error('no native module'));
    await mount();
    await act(async () => { await api.start(); });
    expect(mockStart).not.toHaveBeenCalled();
    expect(api.state).toBe('idle');
  });
});

// ── Recording options ────────────────────────────────────────────────────────

describe('start options', () => {
  it('persists the audio and forces on-device recognition', async () => {
    await mount();
    await act(async () => { await api.start(); });
    const opts = mockStart.mock.calls[0][0];
    expect(opts.recordingOptions).toEqual({ persist: true });
    expect(opts.requiresOnDeviceRecognition).toBe(true);
  });

  it('uses the device locale to pick the acoustic model', async () => {
    await mount();
    await act(async () => { await api.start(); });
    expect(mockStart.mock.calls[0][0].lang).toBe('en-GB');
  });
});

// ── The 180-second cap ───────────────────────────────────────────────────────

describe('the hard cap', () => {
  it('stops itself at exactly 180 seconds', async () => {
    jest.useFakeTimers();
    await mount();
    await act(async () => { await api.start(); });
    expect(mockStop).not.toHaveBeenCalled();

    await act(async () => { jest.advanceTimersByTime(MAX_RECORDING_MS - 1); });
    expect(mockStop).not.toHaveBeenCalled();

    await act(async () => { jest.advanceTimersByTime(2); });
    // stop(), not abort() — stop flushes a final result, abort throws the last
    // sentence away. At the cap the writer has said everything they are going
    // to say and must not lose the end of it.
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockAbort).not.toHaveBeenCalled();
  });

  it('warns in the final 15 seconds and not before', async () => {
    jest.useFakeTimers();
    await mount();
    await act(async () => { await api.start(); });

    await act(async () => { jest.advanceTimersByTime(MAX_RECORDING_MS - WARN_REMAINING_MS - 2000); });
    expect(api.nearlyUp).toBe(false);

    await act(async () => { jest.advanceTimersByTime(3000); });
    expect(api.nearlyUp).toBe(true);
  });

  it('never reports elapsed beyond the cap', async () => {
    jest.useFakeTimers();
    await mount();
    await act(async () => { await api.start(); });
    await act(async () => { jest.advanceTimersByTime(MAX_RECORDING_MS + 30_000); });
    expect(api.elapsedMs).toBeLessThanOrEqual(MAX_RECORDING_MS);
    expect(api.remainingMs).toBe(0);
  });

  it('clamps a captured duration to the cap', async () => {
    // Guards against a clock jump or a late `end` producing a duration the DB
    // CHECK would reject, turning a successful recording into a failed post.
    jest.useFakeTimers();
    await mount();
    await act(async () => { await api.start(); });
    await act(async () => { jest.advanceTimersByTime(MAX_RECORDING_MS + 60_000); });
    await act(async () => { emit('result', { isFinal: true, results: [{ transcript: 'x y z' }] }); });
    await act(async () => { emit('audioend', { uri: URI }); });
    await act(async () => { emit('end'); });
    expect(api.recording?.durationMs).toBeLessThanOrEqual(MAX_RECORDING_MS);
  });
});

// ── Fail closed ──────────────────────────────────────────────────────────────

describe('an unclassifiable recording is never kept', () => {
  it('discards when the transcript is empty', async () => {
    // Same rule as a missing MODERATION_API_KEY: without a transcript there is
    // nothing for the safety gate to read, so publishing the audio would be
    // publishing unscanned content.
    await mount();
    await act(async () => { await api.start(); });
    await act(async () => { emit('audioend', { uri: URI }); });
    await act(async () => { emit('end'); });

    expect(api.recording).toBeNull();
    expect(api.state).toBe('idle');
    expect(new File(URI).exists).toBe(false);
  });

  it('discards when the transcript is only whitespace', async () => {
    await mount();
    await act(async () => { await api.start(); });
    await act(async () => { emit('result', { isFinal: true, results: [{ transcript: '   ' }] }); });
    await act(async () => { emit('audioend', { uri: URI }); });
    await act(async () => { emit('end'); });
    expect(api.recording).toBeNull();
  });

  it('discards when no audio file was written', async () => {
    await mount();
    await act(async () => { await api.start(); });
    await act(async () => { emit('result', { isFinal: true, results: [{ transcript: 'heard this' }] }); });
    await act(async () => { emit('end'); });          // no audioend
    expect(api.recording).toBeNull();
    expect(api.state).toBe('idle');
  });

  it('a recogniser error discards everything captured so far', async () => {
    // A partial transcript alongside complete audio is the dangerous shape:
    // the gate reads the text, so whatever the transcript is missing goes
    // unscanned while still being audible.
    await mount();
    await act(async () => { await api.start(); });
    await act(async () => { emit('result', { isFinal: true, results: [{ transcript: 'half of it' }] }); });
    await act(async () => { emit('audioend', { uri: URI }); });
    await act(async () => { emit('error', { error: 'audio-capture', message: 'mic lost' }); });

    expect(api.recording).toBeNull();
    expect(api.state).toBe('idle');
    expect(new File(URI).exists).toBe(false);
  });
});

// ── Transcript accumulation ──────────────────────────────────────────────────

describe('transcript', () => {
  it('accumulates Android segmented finals rather than replacing', async () => {
    await mount();
    await act(async () => { await api.start(); });
    await act(async () => { emit('result', { isFinal: true, results: [{ transcript: 'i keep smiling' }] }); });
    await act(async () => { emit('result', { isFinal: true, results: [{ transcript: 'so nobody worries' }] }); });
    await act(async () => { emit('audioend', { uri: URI }); });
    await act(async () => { emit('end'); });
    expect(api.recording?.transcript).toBe('i keep smiling so nobody worries');
  });

  it('shows interim text live without banking it', async () => {
    await mount();
    await act(async () => { await api.start(); });
    await act(async () => { emit('result', { isFinal: false, results: [{ transcript: 'i keep' }] }); });
    expect(api.liveText).toBe('i keep');
    await act(async () => { emit('result', { isFinal: false, results: [{ transcript: 'i keep smiling' }] }); });
    expect(api.liveText).toBe('i keep smiling');
  });
});

// ── Cleanup ──────────────────────────────────────────────────────────────────

describe('a recording never outlives its purpose', () => {
  it('re-recording deletes the previous take immediately', async () => {
    // Two files of someone's voice must never coexist on disk.
    await mount();
    await capture(URI);
    expect(new File(URI).exists).toBe(true);

    await act(async () => { await api.start(); });
    expect(new File(URI).exists).toBe(false);
  });

  it('discard deletes the file and resets', async () => {
    await mount();
    await capture(URI);
    await act(async () => { api.discard(); });
    expect(new File(URI).exists).toBe(false);
    expect(api.recording).toBeNull();
    expect(api.state).toBe('idle');
  });

  it('unmounting aborts the recogniser and deletes the file', async () => {
    // Navigating away mid-recording. Both are the writer's voice: one still
    // being captured, one sitting in the cache.
    const { unmount } = await mount();
    await capture(URI);
    await act(async () => { unmount(); });
    expect(mockAbort).toHaveBeenCalled();
    expect(new File(URI).exists).toBe(false);
  });

  it('discard aborts rather than stopping', async () => {
    // Throwing it away should NOT flush a final result — there is nothing to
    // keep, and a late result would repopulate what the user just discarded.
    await mount();
    await act(async () => { await api.start(); });
    await act(async () => { api.discard(); });
    expect(mockAbort).toHaveBeenCalled();
  });
});

describe('formatDuration', () => {
  it('formats m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9_000)).toBe('0:09');
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(MAX_RECORDING_MS)).toBe('3:00');
  });

  it('never renders a negative time', () => {
    expect(formatDuration(-5000)).toBe('0:00');
  });
});
