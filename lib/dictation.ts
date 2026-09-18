/**
 * Dictation — speech becomes text in the compose field, and nothing else.
 *
 * THE CORE PROPERTY: this module produces a STRING. It hands that string to
 * whatever owns the draft and then it is done. The confession that leaves the
 * device is plain text, byte-identical in kind to a typed one, so the entire
 * server pipeline — moderation, crisis check, category classification,
 * language detection, matching, storage — is untouched and unaware that
 * anything was spoken. Nothing under supabase/ changes for this feature.
 *
 * ── Why no audio is kept ────────────────────────────────────────────────────
 * A voice is recognisable, and under GDPR/DPDP it is biometric data. Storing
 * one would break the user-facing anonymity guarantee (CLAUDE.md §3) far more
 * completely than any column ever could. So:
 *
 *   - `recordingOptions` is NEVER passed to start(). Its `persist` flag
 *     defaults to false, and that default is the whole guarantee: with it
 *     unset the native module writes no file at all, and the `uri` on the
 *     audiostart/audioend events stays null.
 *   - `requiresOnDeviceRecognition: true` is passed unconditionally. Without
 *     it, both platforms may stream audio to a vendor's servers — Apple's or
 *     Google's — which would make the most sensitive thing anyone will ever
 *     type into this app a third-party processor relationship we would have to
 *     disclose, and would send it off-device. The cost of insisting is real:
 *     see AVAILABILITY below.
 *   - The audioend handler deletes any uri it is ever handed. It should never
 *     be handed one. It exists because "we never set the flag" is a claim
 *     about today's code, and a temp file surviving a confession is not a
 *     failure mode worth trusting a default with.
 *
 * ── AVAILABILITY, and the trade-off it carries ──────────────────────────────
 * The mic is offered only when the device both has a recogniser AND supports
 * on-device recognition. On Android that effectively means API 33+ with the
 * offline model present; on older devices the control is absent entirely
 * rather than disabled, because a dead button on this screen is a small
 * insult. The alternative — falling back to network recognition — is the one
 * thing this module will not do.
 *
 * ── Language ────────────────────────────────────────────────────────────────
 * `lang` here selects which on-device acoustic model listens. It is NOT a
 * claim about the confession's language and it never enters the payload:
 * submit-confession detects BCP-47 from the text itself (index.ts:188),
 * including non-Latin languages written in Roman script, and that is still the
 * only thing that decides matching. Taking the device locale is what lets a
 * Hindi speaker dictate in Hindi at all; asserting a locale to the server is a
 * different act, and this module does not do it.
 *
 * ── NOT WIRED HERE, and it matters: lib/authorship.ts ───────────────────────
 * That module predates this feature and already has `onVoiceInsert(len)`,
 * documented as "call when voice typing inserts a final segment", which sets
 * `dictation_detected` and counts the chars as voice rather than as a PASTE.
 * submit-confession consumes that signal (index.ts:980) and treats dictation
 * as a strong human whitelist (logit -= 3.0).
 *
 * Nothing calls the tracker today — app/write.tsx submits without an
 * `authorship` payload at all — so there is nothing for this module to feed,
 * and wiring the whole authorship subsystem is a different piece of work.
 * But the trap is loaded: dictated text arrives as a large insert with no
 * keystroke history, which is the exact shape of the AI-dump pattern that
 * scores logit += 3.0. Whoever wires authorship MUST call onVoiceInsert on
 * each final segment, or dictated confessions will be scored as pasted ones
 * and quietly lose amplification_eligible.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { getLocales } from 'expo-localization';
import type {
  ExpoSpeechRecognitionNativeEventMap as EventMap,
  ExpoSpeechRecognitionOptions,
} from 'expo-speech-recognition';

/**
 * ── Why this is a guarded require and not an import ─────────────────────────
 *
 * `import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition'`
 * THROWS at module scope — "Cannot find native module 'ExpoSpeechRecognition'"
 * — in any binary that does not contain the native code: Expo Go, web, and
 * every dev client or store build made before this module was added. Because
 * the throw happens while the module graph is being evaluated, it cannot be
 * caught by anything inside the hook below: app/write.tsx imports this file,
 * so the whole write screen dies on a red screen before it renders a single
 * character.
 *
 * That is the exact failure this feature is supposed to be incapable of.
 * Dictation is an addition to writing, never a precondition for it, so a
 * missing recogniser has to mean "no mic", not "no write screen".
 *
 * Resolved once, here, and cached: `native` is null when unavailable, and
 * every call site already branches on that.
 */
type SpeechModule = {
  start:                       (o: ExpoSpeechRecognitionOptions) => void;
  stop:                        () => void;
  abort:                       () => void;
  requestPermissionsAsync:     () => Promise<{ granted: boolean }>;
  isRecognitionAvailable:      () => boolean;
  supportsOnDeviceRecognition: () => boolean;
};
type EventHook = <K extends keyof EventMap>(
  name: K, cb: (event: EventMap[K]) => void,
) => void;

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

// Subscribing to a recogniser that does not exist is a no-op, but it must
// still BE a hook: it is called unconditionally below, and swapping a real
// hook for a bare function would change the hook count. The branch is decided
// once at module load and never flips at runtime, so the order stays stable.
if (!native || typeof useNativeEvent! !== 'function') {
  native = null;
  useNativeEvent = (() => { useEffect(() => undefined, []); }) as EventHook;
}

/**
 * Continuous mode lets someone stop, think, and keep going — which is most of
 * how anyone says a hard thing out loud. It is unsupported on Android 12 and
 * below, so those devices get the segmented behaviour instead of an error.
 */
const CONTINUOUS = Platform.OS === 'ios'
  || (typeof Platform.Version === 'number' && Platform.Version >= 33);

/**
 * Join spoken text onto whatever is already in the field.
 *
 * Append, never replace: someone can type, speak, type again, and dictate a
 * second time without losing a word of it. A trailing space or newline the
 * writer put there is theirs and is preserved — only a hard boundary gets a
 * space inserted.
 */
export function joinSpoken(before: string, spoken: string): string {
  if (!before) return spoken;
  if (!spoken) return before;
  return /\s$/.test(before) ? before + spoken : `${before} ${spoken}`;
}

/** The on-device model to listen with. Never sent anywhere. */
function deviceLocale(): string {
  try {
    const tag = getLocales()?.[0]?.languageTag;
    return tag && tag.length >= 2 ? tag : 'en-US';
  } catch {
    return 'en-US';
  }
}

/**
 * Delete a stray audio file if the recogniser ever produces one.
 *
 * Imported lazily so the file-system module is only touched on a path that
 * should never run. Failure is swallowed: a file we could not delete is worth
 * neither a crash nor a dialog in the middle of someone writing.
 */
export function discardAudio(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { File } = require('expo-file-system');
    new File(uri).delete();
  } catch {
    /* nothing audio-shaped is allowed to become an error the writer sees */
  }
}

export interface Dictation {
  /** False when there is no on-device recogniser — hide the control, don't disable it. */
  available: boolean;
  listening:  boolean;
  start:     () => Promise<void>;
  stop:      () => void;
}

export function useDictation({
  value,
  onChangeText,
}: {
  value:        string;
  onChangeText: (next: string) => void;
}): Dictation {
  const [available, setAvailable] = useState(false);
  const [listening, setListening] = useState(false);

  // Refs, not deps: the event handlers below are registered once and must read
  // the CURRENT draft and setter without re-subscribing on every keystroke.
  const valueRef  = useRef(value);
  const changeRef = useRef(onChangeText);
  valueRef.current  = value;
  changeRef.current = onChangeText;

  /** The field's contents when this dictation session began. */
  const baseRef = useRef('');
  /** Final segments accumulated during this session. */
  const finalRef = useRef('');

  useEffect(() => {
    // `native` is null in any binary without the native code — Expo Go, web,
    // or a build made before this module was added. No mic, everything else
    // on the screen unchanged.
    if (!native) { setAvailable(false); return; }
    try {
      setAvailable(
        native.isRecognitionAvailable() === true
        && native.supportsOnDeviceRecognition() === true,
      );
    } catch {
      setAvailable(false);
    }
  }, []);

  // Leaving the screen mid-sentence must not leave a recogniser running.
  useEffect(() => () => {
    try { native?.abort(); } catch { /* never started */ }
  }, []);

  useNativeEvent('start', () => setListening(true));
  useNativeEvent('end',   () => setListening(false));

  useNativeEvent('error', () => {
    // Every failure degrades to the keyboard in silence: no dialog, no toast,
    // no retry prompt. Whatever was already transcribed stays in the field.
    setListening(false);
  });

  useNativeEvent('result', (event) => {
    const transcript = event?.results?.[0]?.transcript ?? '';
    if (!transcript) return;

    if (event.isFinal) {
      // Android runs continuous mode as SEGMENTS: each final result covers new
      // speech, not the whole session, so finals accumulate. iOS delivers one
      // final before stopping, which this handles as a single segment.
      finalRef.current = joinSpoken(finalRef.current, transcript);
      changeRef.current(joinSpoken(baseRef.current, finalRef.current));
      return;
    }

    // Interim: show it live, but never bank it — the next event replaces it.
    changeRef.current(
      joinSpoken(baseRef.current, joinSpoken(finalRef.current, transcript)),
    );
  });

  // Should never carry a uri (persist is left at its false default). If it
  // ever does, the file does not outlive the sentence.
  useNativeEvent('audioend', (event) => discardAudio(event?.uri));

  const start = useCallback(async () => {
    if (listening || !native) return;

    // Asked at the moment of the first tap, never at app start, and never
    // twice in a row if refused: a denial simply leaves the keyboard.
    let granted = false;
    try {
      const res = await native.requestPermissionsAsync();
      granted = res?.granted === true;
    } catch {
      granted = false;
    }
    if (!granted) return;

    baseRef.current  = valueRef.current;
    finalRef.current = '';

    try {
      native.start({
        lang:                        deviceLocale(),
        interimResults:              true,
        continuous:                  CONTINUOUS,
        requiresOnDeviceRecognition: true,
        addsPunctuation:             true,
        // recordingOptions is deliberately absent. See the file header: its
        // `persist` default of false is what guarantees no audio file exists.
      });
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [listening]);

  const stop = useCallback(() => {
    // stop(), not abort(): it returns the final result for what was already
    // said, so tapping the mic closed keeps the sentence in progress.
    try { native?.stop(); } catch { /* not running */ }
    setListening(false);
  }, []);

  return { available, listening, start, stop };
}
