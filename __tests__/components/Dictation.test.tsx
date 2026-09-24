/**
 * Dictation produces TEXT and nothing else.
 *
 * That sentence is the whole feature, and most of this file exists to keep it
 * true under change: spoken words land in the same `draft` the keyboard writes
 * to, stay editable, append rather than replace, and reach the server as the
 * plain string a typed confession already was. Nothing audio-shaped is stored,
 * uploaded, or survives the screen — a voice is recognisable, and storing one
 * would break the anonymity guarantee (CLAUDE.md §3) more completely than any
 * column could.
 *
 * The native module is mocked here because it is native; what is NOT mocked is
 * the options object we hand it, which several tests assert against directly.
 */

import React from 'react';
import fs   from 'fs';
import path from 'path';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';

// ─── Native module double ─────────────────────────────────────────────────────
// Handlers registered through useSpeechRecognitionEvent are captured so tests
// can drive real recogniser events rather than poking component internals.

const mockHandlers: Record<string, ((e: unknown) => void)[]> = {};
const mockStart   = jest.fn();
const mockStop    = jest.fn();
const mockAbort   = jest.fn();
const mockRequest = jest.fn().mockResolvedValue({ granted: true });
const mockAvailable        = jest.fn().mockReturnValue(true);
const mockSupportsOnDevice = jest.fn().mockReturnValue(true);

jest.mock('expo-speech-recognition', () => {
  const R = require('react');
  return {
    ExpoSpeechRecognitionModule: {
      start:                       (o: unknown) => mockStart(o),
      stop:                        () => mockStop(),
      abort:                       () => mockAbort(),
      requestPermissionsAsync:     () => mockRequest(),
      isRecognitionAvailable:      () => mockAvailable(),
      supportsOnDeviceRecognition: () => mockSupportsOnDevice(),
    },
    useSpeechRecognitionEvent: (name: string, cb: (e: unknown) => void) => {
      R.useEffect(() => {
        (mockHandlers[name] ??= []).push(cb);
        return () => {
          mockHandlers[name] = (mockHandlers[name] ?? []).filter(f => f !== cb);
        };
      });
    },
  };
});

const mockDelete = jest.fn();
jest.mock('expo-file-system', () => ({
  // Written without a TS parameter property: babel treats the generated
  // `uri` binding as an out-of-scope reference inside a jest.mock factory.
  File: class MockFile {
    path: string;
    constructor(uri: string) { this.path = uri; }
    delete() { mockDelete(this.path); }
  },
}));

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'hi-IN' }],
}));

// submitConfession is the boundary this feature must not change: every test
// that submits inspects exactly what crossed it.
const mockSubmit = jest.fn().mockResolvedValue({ type: 'submitted', match: { id: 'c1' } });
jest.mock('@/lib/api', () => ({
  submitConfession: (...a: unknown[]) => mockSubmit(...a),
}));

jest.mock('@/lib/deviceHash', () => ({ getDeviceHash: jest.fn().mockResolvedValue('hash') }));
jest.mock('@/lib/readAllowance', () => ({ grantForWrite: jest.fn() }));
jest.mock('@/components/ProfileButton', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/AppDialog', () => ({ showDialog: jest.fn() }));

const mockTrack = jest.fn();
jest.mock('@/lib/analytics', () => ({
  analytics: new Proxy({}, {
    get: (_t, name: string) => (...args: unknown[]) => mockTrack(name, args),
  }),
}));

jest.mock('@/lib/a11y', () => ({ useReducedMotion: () => true, announce: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import WriteScreen from '../../app/write';
import { DraftProvider } from '@/lib/draftContext';
import { joinSpoken, discardAudio } from '@/lib/dictation';

function emit(event: string, payload?: unknown) {
  (mockHandlers[event] ?? []).forEach(fn => fn(payload));
}

function renderWrite() {
  return render(
    <DraftProvider>
      <WriteScreen />
    </DraftProvider>,
  );
}

/** Tap the mic, resolving the permission request it awaits. */
async function tapMic(getByTestId: (id: string) => unknown) {
  await act(async () => {
    fireEvent.press(getByTestId('mic-button') as never);
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  // DraftProvider persists to AsyncStorage and rehydrates on mount, so without
  // this every test inherits the previous test's confession.
  await AsyncStorage.clear();
  for (const k of Object.keys(mockHandlers)) delete mockHandlers[k];
  mockRequest.mockResolvedValue({ granted: true });
  mockAvailable.mockReturnValue(true);
  mockSupportsOnDevice.mockReturnValue(true);
  mockSubmit.mockResolvedValue({ type: 'submitted', match: { id: 'c1' } });
});

// ─── Text in, text only ───────────────────────────────────────────────────────

describe('dictated speech becomes editable draft text', () => {
  it('a final result lands in the compose field', async () => {
    const { getByTestId, getByLabelText } = await renderWrite();
    await tapMic(getByTestId);

    await act(async () => {
      emit('result', { isFinal: true, results: [{ transcript: 'i never told anyone' }] });
    });

    expect((getByLabelText('Your confession') as any).props.value).toBe('i never told anyone');
  });

  it('interim results show live and are replaced, not banked', async () => {
    const { getByTestId, getByLabelText } = await renderWrite();
    await tapMic(getByTestId);

    await act(async () => { emit('result', { isFinal: false, results: [{ transcript: 'i never' }] }); });
    expect((getByLabelText('Your confession') as any).props.value).toBe('i never');

    // The recogniser revises as it hears more — the interim must not stack.
    await act(async () => { emit('result', { isFinal: false, results: [{ transcript: 'i never told' }] }); });
    expect((getByLabelText('Your confession') as any).props.value).toBe('i never told');

    await act(async () => { emit('result', { isFinal: true, results: [{ transcript: 'i never told anyone' }] }); });
    expect((getByLabelText('Your confession') as any).props.value).toBe('i never told anyone');
  });

  it('the text is fully editable afterwards', async () => {
    // Mandatory, not optional: recognisers misfire, and being unable to fix a
    // misheard sentence about your own grief would be its own small cruelty.
    const { getByTestId, getByLabelText } = await renderWrite();
    await tapMic(getByTestId);
    await act(async () => {
      emit('result', { isFinal: true, results: [{ transcript: 'i never told anyoen' }] });
    });

    await act(async () => {
      fireEvent.changeText(getByLabelText('Your confession'), 'i never told anyone');
    });
    expect((getByLabelText('Your confession') as any).props.value).toBe('i never told anyone');
  });

  it('dictation APPENDS to text already typed', async () => {
    const { getByTestId, getByLabelText } = await renderWrite();
    await act(async () => { fireEvent.changeText(getByLabelText('Your confession'), 'I typed this.'); });

    await tapMic(getByTestId);
    await act(async () => {
      emit('result', { isFinal: true, results: [{ transcript: 'And I said this.' }] });
    });

    expect((getByLabelText('Your confession') as any).props.value).toBe('I typed this. And I said this.');
  });

  it('a second dictation appends rather than overwriting the first', async () => {
    const { getByTestId, getByLabelText } = await renderWrite();

    await tapMic(getByTestId);
    await act(async () => { emit('result', { isFinal: true, results: [{ transcript: 'first thing' }] }); });
    await act(async () => { emit('end'); });

    await tapMic(getByTestId);
    await act(async () => { emit('result', { isFinal: true, results: [{ transcript: 'second thing' }] }); });

    expect((getByLabelText('Your confession') as any).props.value).toBe('first thing second thing');
  });

  it('Android segmented finals accumulate instead of replacing each other', async () => {
    // Android runs continuous mode as segments: each final covers NEW speech.
    // Treating the newest final as the whole transcript would silently delete
    // everything said before the last pause.
    const { getByTestId, getByLabelText } = await renderWrite();
    await tapMic(getByTestId);

    await act(async () => { emit('result', { isFinal: true, results: [{ transcript: 'i keep smiling' }] }); });
    await act(async () => { emit('result', { isFinal: true, results: [{ transcript: 'so nobody worries' }] }); });

    expect((getByLabelText('Your confession') as any).props.value).toBe('i keep smiling so nobody worries');
  });
});

// ─── Permissions and availability ─────────────────────────────────────────────

describe('permission and availability degrade quietly', () => {
  it('permission is requested on the first tap, never before', async () => {
    const { getByTestId } = await renderWrite();
    expect(mockRequest).not.toHaveBeenCalled();
    await tapMic(getByTestId);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('denial keeps the screen working and starts nothing', async () => {
    mockRequest.mockResolvedValue({ granted: false });
    const { getByTestId, getByLabelText, queryByText } = await renderWrite();

    await tapMic(getByTestId);

    expect(mockStart).not.toHaveBeenCalled();
    expect(queryByText('Listening')).toBeNull();
    // The keyboard still writes, and nothing threw.
    await act(async () => { fireEvent.changeText(getByLabelText('Your confession'), 'typed anyway'); });
    expect((getByLabelText('Your confession') as any).props.value).toBe('typed anyway');
  });

  it('a thrown permission request is not an error the writer sees', async () => {
    mockRequest.mockRejectedValue(new Error('no native module'));
    const { getByTestId, getByLabelText } = await renderWrite();
    await tapMic(getByTestId);
    expect(mockStart).not.toHaveBeenCalled();
    await act(async () => { fireEvent.changeText(getByLabelText('Your confession'), 'still fine'); });
    expect((getByLabelText('Your confession') as any).props.value).toBe('still fine');
  });

  it('no recogniser → the mic is ABSENT, not disabled', async () => {
    mockAvailable.mockReturnValue(false);
    const { queryByTestId, getByLabelText } = await renderWrite();
    expect(queryByTestId('mic-button')).toBeNull();
    await act(async () => { fireEvent.changeText(getByLabelText('Your confession'), 'typed'); });
    expect((getByLabelText('Your confession') as any).props.value).toBe('typed');
  });

  it('no ON-DEVICE recogniser → the mic is absent too', async () => {
    // Falling back to network recognition would ship the most sensitive thing
    // anyone writes here to a vendor's servers. Absent is the correct answer.
    mockSupportsOnDevice.mockReturnValue(false);
    const { queryByTestId } = await renderWrite();
    expect(queryByTestId('mic-button')).toBeNull();
  });

  it('shows it is listening, and stops on a second tap', async () => {
    const { getByTestId, getByText, queryByText } = await renderWrite();
    await tapMic(getByTestId);
    await act(async () => { emit('start'); });
    expect(getByText('Listening')).toBeTruthy();

    await act(async () => { fireEvent.press(getByTestId('mic-button')); });
    expect(mockStop).toHaveBeenCalled();
    await act(async () => { emit('end'); });
    expect(queryByText('Listening')).toBeNull();
  });

  it('a recogniser error stops listening and keeps what was already said', async () => {
    const { getByTestId, getByLabelText, queryByText } = await renderWrite();
    await tapMic(getByTestId);
    await act(async () => { emit('result', { isFinal: true, results: [{ transcript: 'half a sentence' }] }); });
    await act(async () => { emit('error', { error: 'language-not-supported', message: 'no model' }); });

    expect(queryByText('Listening')).toBeNull();
    expect((getByLabelText('Your confession') as any).props.value).toBe('half a sentence');
  });

  it('leaving the screen mid-sentence aborts the recogniser', async () => {
    const { getByTestId, unmount } = await renderWrite();
    await tapMic(getByTestId);
    await act(async () => { unmount(); });
    expect(mockAbort).toHaveBeenCalled();
  });
});

// ─── No audio, anywhere ───────────────────────────────────────────────────────

describe('no audio is stored, uploaded, or kept', () => {
  it('start() never asks for a persisted recording', async () => {
    const { getByTestId } = await renderWrite();
    await tapMic(getByTestId);

    const opts = mockStart.mock.calls[0][0];
    // The absent `recordingOptions` IS the guarantee: persist defaults to
    // false, so the native module writes no file and the event uris stay null.
    expect(opts.recordingOptions).toBeUndefined();
    expect(JSON.stringify(opts)).not.toMatch(/persist|outputDirectory|outputFileName/);
  });

  it('start() forces on-device recognition', async () => {
    const { getByTestId } = await renderWrite();
    await tapMic(getByTestId);
    expect(mockStart.mock.calls[0][0].requiresOnDeviceRecognition).toBe(true);
  });

  it('a stray audio file would be deleted the moment capture ends', async () => {
    const { getByTestId } = await renderWrite();
    await tapMic(getByTestId);
    await act(async () => { emit('audioend', { uri: 'file:///cache/recording_1.wav' }); });
    expect(mockDelete).toHaveBeenCalledWith('file:///cache/recording_1.wav');
  });

  it('a null uri is not treated as a file', async () => {
    const { getByTestId } = await renderWrite();
    await tapMic(getByTestId);
    await act(async () => { emit('audioend', { uri: null }); });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('discardAudio swallows a failed delete rather than surfacing it', () => {
    mockDelete.mockImplementationOnce(() => { throw new Error('EPERM'); });
    expect(() => discardAudio('file:///cache/x.wav')).not.toThrow();
  });

  it('the submitted payload is a string and carries no file path', async () => {
    const { getByTestId, getByText } = await renderWrite();
    await tapMic(getByTestId);
    await act(async () => {
      emit('result', { isFinal: true, results: [{ transcript: 'i said this out loud' }] });
    });
    await act(async () => { fireEvent.press(getByText('Let it out')); });
    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());

    const [text, ...rest] = mockSubmit.mock.calls[0];
    expect(typeof text).toBe('string');
    expect(text).toBe('i said this out loud');
    // Same arity a typed confession always had: text, device hash, region.
    expect(JSON.stringify([text, ...rest])).not.toMatch(/file:\/\/|\.wav|\.m4a|\.caf|audio/i);
  });

  it('DICTATION never uploads audio — only voice confessions may', () => {
    // This assertion used to be blanket: no storage.from( and no audio file
    // extensions anywhere in app/, lib/ or components/. That was correct when
    // dictation was the only audio feature and nothing was ever stored.
    //
    // Voice confessions (owner decision 2026-09-23) deliberately DO upload, so
    // a blanket ban would now be a test asserting the product does not do what
    // it does. Re-scoped instead of deleted: exactly ONE module may touch the
    // bucket, and the dictation path is not it. Dictation still produces text
    // and nothing else.
    const root = path.join(__dirname, '..', '..');
    const walk = (p: string): string[] =>
      fs.readdirSync(p, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(p, e.name);
        if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(full);
        return /\.tsx?$/.test(e.name) ? [full] : [];
      });
    const sources = ['app', 'lib', 'components'].flatMap(d => walk(path.join(root, d)));

    // The only module permitted to reach the audio bucket.
    const ALLOWED = ['lib/voiceSubmit.ts'];

    for (const file of sources) {
      const rel = path.relative(root, file);
      if (ALLOWED.includes(rel)) continue;
      const src = fs.readFileSync(file, 'utf8');
      expect([rel, /storage\s*\.\s*from\(/.test(src)]).toEqual([rel, false]);
    }
  });

  it('the dictation module itself stores nothing', () => {
    // The specific guarantee dictation makes: recordingOptions is never passed,
    // so persist stays at its false default and no file is ever written.
    // Matches the PROPERTY (with its colon), not the word: the file's header
    // explains at length that recordingOptions is never passed, and a guard
    // that bans the explanation along with the thing is a guard that gets
    // deleted the first time it is inconvenient.
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'dictation.ts'), 'utf8');
    expect(src).not.toMatch(/recordingOptions\s*:/);
    expect(src).not.toMatch(/storage\s*\.\s*from\(/);
  });

  it('the voice recorder is the one that DOES persist, and only it', () => {
    // Guards the other direction: if recordingOptions ever migrates into
    // dictation.ts, the test above catches it; this one catches the recorder
    // silently losing its file.
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'voiceRecorder.ts'), 'utf8');
    expect(src).toMatch(/recordingOptions:\s*\{\s*persist:\s*true\s*\}/);
  });});

// ─── The pipeline is untouched ────────────────────────────────────────────────

describe('the server pipeline is unchanged', () => {
  it('no client locale is sent with the confession', async () => {
    // expo-localization reports hi-IN in this suite. That locale may pick the
    // on-device acoustic model, but asserting a language to the server is a
    // different act: submit-confession detects BCP-47 from the text itself.
    const { getByTestId, getByText } = await renderWrite();
    await tapMic(getByTestId);
    expect(mockStart.mock.calls[0][0].lang).toBe('hi-IN');

    await act(async () => { emit('result', { isFinal: true, results: [{ transcript: 'maine kisi ko nahi bataya' }] }); });
    await act(async () => { fireEvent.press(getByText('Let it out')); });
    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());

    expect(JSON.stringify(mockSubmit.mock.calls[0])).not.toMatch(/hi-IN|languageTag|locale/i);
  });

  it('the client sends no audio-shaped field to the edge function', async () => {
    // The submit boundary is the only place this feature could have changed
    // the server contract. It did not: text, device hash, region, exactly as
    // a typed confession has always sent.
    //
    // NOT asserted here: that supabase/functions/*/index.ts is free of the
    // word "dictation". submit-confession has carried a `dictation_detected`
    // authorship signal since long before this feature — see the note in
    // lib/dictation.ts. Pretending otherwise would make this test a lie that
    // happens to pass.
    const { getByTestId, getByText } = await renderWrite();
    await tapMic(getByTestId);
    await act(async () => { emit('result', { isFinal: true, results: [{ transcript: 'spoken' }] }); });
    await act(async () => { fireEvent.press(getByText('Let it out')); });
    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());

    const args = mockSubmit.mock.calls[0];
    expect(args[0]).toBe('spoken');
    expect(JSON.stringify(args)).not.toMatch(/audio|recording|uri|transcript|locale/i);
  });

  it('MIN_CHARS still gates submit', async () => {
    const { getByLabelText, getByText } = await renderWrite();
    await act(async () => { fireEvent.changeText(getByLabelText('Your confession'), '   '); });
    // The gate is the button's disabled state, which is where it already was;
    // dictation does not add a second way past it.
    expect((getByText('Let it out') as any).props.accessibilityState?.disabled ?? true).toBeTruthy();
    await act(async () => { fireEvent.press(getByText('Let it out')); });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('a dictated confession below MIN_CHARS cannot submit either', async () => {
    const { getByTestId, getByText } = await renderWrite();
    await tapMic(getByTestId);
    await act(async () => { emit('result', { isFinal: true, results: [{ transcript: '  ' }] }); });
    await act(async () => { fireEvent.press(getByText('Let it out')); });
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});

// ─── Analytics ────────────────────────────────────────────────────────────────

describe('analytics never carry a transcript', () => {
  it('no event payload contains the dictated words', async () => {
    const { getByTestId, getByText } = await renderWrite();
    await tapMic(getByTestId);
    await act(async () => {
      emit('result', { isFinal: true, results: [{ transcript: 'the words i said out loud' }] });
    });
    await act(async () => { fireEvent.press(getByText('Let it out')); });
    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());

    expect(JSON.stringify(mockTrack.mock.calls)).not.toMatch(/the words i said out loud/);
  });

  it('the analytics module declares no transcript-shaped event', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'analytics.ts'), 'utf8');
    expect(src).not.toMatch(/transcript|dictated_text|speech_text/i);
  });
});

// ─── Crisis path (CLAUDE.md §6) ───────────────────────────────────────────────

describe('no mic anywhere on the crisis path', () => {
  it('crisis.tsx imports no dictation or mic', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'crisis.tsx'), 'utf8');
    expect(src).not.toMatch(/MicButton|useDictation|speech-recognition/i);
  });
});

// ─── Both write screens ───────────────────────────────────────────────────────

describe('the tab write screen has dictation too', () => {
  /**
   * There are two compose screens: app/write.tsx and app/(tabs)/write.tsx,
   * near-duplicates of each other that predate this feature. Whichever one a
   * reader lands on, the mic and the button label must be the same — a mic
   * that appeared only when you arrived by one route would read as a bug.
   *
   * Source-level rather than a second render suite: the behaviour is proven
   * above against the same hook and the same component, and what can actually
   * drift between these two files is whether they still use them at all.
   */
  const tab = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', '(tabs)', 'write.tsx'), 'utf8',
  );

  it('renders the mic, wired to the shared draft state', () => {
    expect(tab).toMatch(/useDictation\(\{\s*value:\s*draft,\s*onChangeText:\s*setDraft\s*\}\)/);
    expect(tab).toMatch(/<MicButton/);
  });

  it('carries the corrected submit label', () => {
    expect(tab).toMatch(/label="Let it out"/);
  });

  it('stores no audio of its own', () => {
    // `\.wav\b` not `\.wav`: the screen legitimately forwards `rec.waveform`
    // (a loudness envelope, an array of integers) to the voice path, and the
    // unbounded pattern matched that property name. The guard is about this
    // screen never handling a WAV FILE or setting the recorder's persist flag
    // — both of those still fail it.
    expect(tab).not.toMatch(/recordingOptions|persist|\.wav\b/i);
  });
});

// ─── joinSpoken ───────────────────────────────────────────────────────────────

describe('joinSpoken', () => {
  it('returns the spoken text when the field is empty', () => {
    expect(joinSpoken('', 'hello')).toBe('hello');
  });
  it('separates with a single space at a hard boundary', () => {
    expect(joinSpoken('one', 'two')).toBe('one two');
  });
  it("preserves the writer's own trailing whitespace", () => {
    expect(joinSpoken('one ',   'two')).toBe('one two');
    expect(joinSpoken('one\n',  'two')).toBe('one\ntwo');
    expect(joinSpoken('one\n\n','two')).toBe('one\n\ntwo');
  });
  it('never drops existing text for an empty transcript', () => {
    expect(joinSpoken('kept', '')).toBe('kept');
  });
});
