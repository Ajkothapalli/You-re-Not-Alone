/**
 * Voice recording — one mic, transcript and audio together.
 *
 * ── Why the speech module records, rather than expo-audio ───────────────────
 * A voice confession needs BOTH the recording and a transcript, and the
 * transcript is not optional: it is what the safety gate classifies, what the
 * feed shows to anyone who cannot play sound, and what blocks the submission
 * if the recogniser produces nothing. Two separate mic consumers
 * (expo-audio recording + the recogniser listening) is unreliable on Android,
 * which generally refuses the second capture client.
 *
 * expo-speech-recognition's `recordingOptions.persist` taps the stream it is
 * already transcribing and writes it to a file. One consumer, both outputs.
 * The file is WAV/CAF; lib/mp3Encode.ts compresses it after the gate passes.
 *
 * ── Guarded require, not a static import ────────────────────────────────────
 * Same as lib/dictation.ts, and for the same reason: a static import of this
 * native module THROWS at module-scope in any binary without the native half,
 * and app/write.tsx imports this file. That took the entire write screen down
 * on a device once. `native` is null when unavailable and every call site
 * branches on it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, AppState } from 'react-native';
import { getLocales } from 'expo-localization';
import { joinSpoken } from './dictation';
import { discardLocalRecording } from './voiceSubmit';
import type {
  ExpoSpeechRecognitionNativeEventMap as EventMap,
  ExpoSpeechRecognitionOptions,
} from 'expo-speech-recognition';

/** Owner decision 2026-09-23. Enforced here, in the DB CHECK, and in the edge function. */
export const MAX_RECORDING_MS = 180_000;
/** The writer is warned with this long left — enough to finish a sentence. */
export const WARN_REMAINING_MS = 15_000;

type SpeechModule = {
  start:                       (o: ExpoSpeechRecognitionOptions) => void;
  stop:                        () => void;
  abort:                       () => void;
  requestPermissionsAsync:     () => Promise<{ granted: boolean }>;
  isRecognitionAvailable:      () => boolean;
  supportsOnDeviceRecognition: () => boolean;
};
type EventHook = <K extends keyof EventMap>(n: K, cb: (e: EventMap[K]) => void) => void;

let native: SpeechModule | null = null;
let useNativeEvent: EventHook;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('expo-speech-recognition');
  native         = mod.ExpoSpeechRecognitionModule ?? null;
  useNativeEvent = mod.useSpeechRecognitionEvent;
} catch {
  native = null;
}
if (!native || typeof useNativeEvent! !== 'function') {
  native = null;
  // Still a hook: called unconditionally below, so it must keep the hook count
  // stable. The branch is decided once at module load and never flips.
  useNativeEvent = (() => { useEffect(() => undefined, []); }) as EventHook;
}

const CONTINUOUS = Platform.OS === 'ios'
  || (typeof Platform.Version === 'number' && Platform.Version >= 33);

function deviceLocale(): string {
  try {
    const tag = getLocales()?.[0]?.languageTag;
    return tag && tag.length >= 2 ? tag : 'en-US';
  } catch {
    return 'en-US';
  }
}

export type RecorderState = 'idle' | 'recording' | 'stopping' | 'captured';

export interface VoiceRecording {
  /** Local WAV/CAF. Must be deleted by whoever consumes it — see voiceSubmit. */
  uri:        string;
  /** What the recogniser heard. Never mutated; the EDITED copy lives in UI state. */
  transcript: string;
  durationMs: number;
}

export interface VoiceRecorder {
  /** False when there is no on-device recogniser — hide the control, don't disable it. */
  available:   boolean;
  state:       RecorderState;
  elapsedMs:   number;
  remainingMs: number;
  /** True in the last WARN_REMAINING_MS. */
  nearlyUp:    boolean;
  /** Live, partial. The committed value arrives on the recording. */
  liveText:    string;
  recording:   VoiceRecording | null;
  start:       () => Promise<void>;
  stop:        () => void;
  /** Throw the recording away and delete the file immediately. */
  discard:     () => void;
}

export function useVoiceRecorder(): VoiceRecorder {
  const [available, setAvailable] = useState(false);
  const [state,     setState]     = useState<RecorderState>('idle');
  const [elapsedMs, setElapsed]   = useState(0);
  const [liveText,  setLiveText]  = useState('');
  const [recording, setRecording] = useState<VoiceRecording | null>(null);

  const finalRef   = useRef('');
  const startedRef = useRef(0);
  const uriRef     = useRef<string | null>(null);
  const tickRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const capRef     = useRef<ReturnType<typeof setTimeout>  | null>(null);

  useEffect(() => {
    try {
      setAvailable(
        native?.isRecognitionAvailable() === true
        && native?.supportsOnDeviceRecognition() === true,
      );
    } catch {
      setAvailable(false);
    }
  }, []);

  const clearTimers = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    if (capRef.current)  { clearTimeout(capRef.current);   capRef.current  = null; }
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    setState((s) => (s === 'recording' ? 'stopping' : s));
    // stop() flushes a final result; abort() would throw the last sentence away.
    try { native?.stop(); } catch { /* not running */ }
  }, [clearTimers]);

  const discard = useCallback(() => {
    clearTimers();
    try { native?.abort(); } catch { /* not running */ }
    discardLocalRecording(uriRef.current);
    uriRef.current = null;
    finalRef.current = '';
    setLiveText('');
    setElapsed(0);
    setRecording(null);
    setState('idle');
  }, [clearTimers]);

  // Leaving the screen must not leave the mic open or the file behind. Both are
  // the writer's voice: one still being captured, one sitting in the cache.
  useEffect(() => () => {
    clearTimers();
    try { native?.abort(); } catch {}
    discardLocalRecording(uriRef.current);
  }, [clearTimers]);

  // Backgrounding mid-recording. Android may kill the mic anyway; stopping
  // deliberately means we keep whatever was said instead of a truncated file
  // in an unknown state.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') stop();
    });
    return () => sub.remove();
  }, [stop]);

  useNativeEvent('result', (event) => {
    const t = event?.results?.[0]?.transcript ?? '';
    if (!t) return;
    if (event.isFinal) {
      // Android delivers continuous mode as SEGMENTS — each final covers new
      // speech, so they accumulate. iOS sends one final at the end.
      finalRef.current = joinSpoken(finalRef.current, t);
      setLiveText(finalRef.current);
    } else {
      setLiveText(joinSpoken(finalRef.current, t));
    }
  });

  // Where the audio file actually arrives.
  useNativeEvent('audioend', (event) => {
    if (event?.uri) uriRef.current = event.uri;
  });

  useNativeEvent('error', () => {
    // Degrade to typing. Anything already captured is discarded rather than
    // offered half-complete: a transcript missing its middle would be posted
    // alongside audio that contains it, and the gate only reads the text.
    discard();
  });

  useNativeEvent('end', () => {
    clearTimers();
    const ms = startedRef.current ? Date.now() - startedRef.current : 0;
    const text = finalRef.current.trim();
    const uri  = uriRef.current;

    // STT produced nothing, or no file was written → BLOCK. An unclassifiable
    // recording is never stored (same rule as a missing MODERATION_API_KEY:
    // fail closed). Without a transcript there is nothing for the safety gate
    // to read, and posting the audio anyway would be publishing unscanned
    // content.
    if (!uri || !text) {
      discardLocalRecording(uri);
      uriRef.current = null;
      setState('idle');
      setRecording(null);
      return;
    }

    setRecording({ uri, transcript: text, durationMs: Math.min(ms, MAX_RECORDING_MS) });
    setState('captured');
  });

  const start = useCallback(async () => {
    if (!native || state === 'recording') return;

    // Any previous take goes now, not when the next one finishes — two files
    // of someone's voice should never coexist on disk.
    discardLocalRecording(uriRef.current);
    uriRef.current   = null;
    finalRef.current = '';
    setLiveText('');
    setRecording(null);
    setElapsed(0);

    // Asked at the tap, never at app start. Denial degrades to typing.
    let granted = false;
    try {
      granted = (await native.requestPermissionsAsync())?.granted === true;
    } catch {
      granted = false;
    }
    if (!granted) return;

    try {
      native.start({
        lang:                        deviceLocale(),
        interimResults:              true,
        continuous:                  CONTINUOUS,
        requiresOnDeviceRecognition: true,
        addsPunctuation:             true,
        // THE difference from dictation: here we DO want the file.
        recordingOptions: { persist: true },
      });
    } catch {
      setState('idle');
      return;
    }

    startedRef.current = Date.now();
    setState('recording');

    tickRef.current = setInterval(() => {
      setElapsed(Date.now() - startedRef.current);
    }, 200);

    // Hard cap. A timeout rather than a check inside the tick, so the stop
    // happens at the cap regardless of interval drift or a throttled timer —
    // and via stop(), which flushes cleanly instead of truncating the file.
    capRef.current = setTimeout(() => stop(), MAX_RECORDING_MS);
  }, [state, stop]);

  const clamped     = Math.min(elapsedMs, MAX_RECORDING_MS);
  const remainingMs = Math.max(0, MAX_RECORDING_MS - clamped);

  return {
    available,
    state,
    elapsedMs: clamped,
    remainingMs,
    nearlyUp: state === 'recording' && remainingMs <= WARN_REMAINING_MS,
    liveText,
    recording,
    start,
    stop,
    discard,
  };
}

/** m:ss for the timer. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
