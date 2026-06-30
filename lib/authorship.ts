/**
 * Client-side behavioral feature extractor for authorship scoring.
 *
 * Signals are ADVISORY ONLY. They are sent with the submission and combined
 * server-side with content signals and account trust before any action is taken.
 * No raw keystroke logs are stored or transmitted — only aggregate statistics.
 *
 * Whitelists:
 *   - Speech-to-text / dictation → detected as bulk insert with no typing history
 *   - Swipe / autocomplete → small delta (< PASTE_DELTA_MIN chars) → no penalty
 *   - Paste of own notes → paste alone is never punitive; server combines with content
 *
 * Privacy:
 *   - No inter-keystroke timing sequences stored
 *   - Composition time is rounded to the nearest second on the server
 *   - No biometric data
 */

export interface AuthorshipPayload {
  keystroke_count:    number;  // individual key presses (not paste/dictation)
  edit_entropy:       number;  // backspace events / total key events (0–1)
  paste_count:        number;  // paste events detected
  paste_chars:        number;  // total chars inserted via paste
  dictation_detected: boolean; // true = speech-to-text / OS bulk insert
  voice_chars:        number;  // chars inserted via on-device voice typing
  think_pause_count:  number;  // gaps > THINK_PAUSE_MS between events
  composition_ms:     number;  // ms from first event to getPayload() call
  typed_chars:        number;  // chars added keystroke-by-keystroke
}

export interface AuthorshipTracker {
  /** Call from TextInput onKeyPress with the key name ("a", "Backspace", etc.). */
  onKeyPress: (key: string) => void;
  /** Call from TextInput onChangeText with both old and new values. */
  onTextChange: (prev: string, next: string) => void;
  /**
   * Call when voice typing inserts a final segment. Sets dictation_detected
   * and counts chars as voice. NEVER increments paste_count, even if called
   * mid-composition after prior keystrokes.
   */
  onVoiceInsert: (len: number) => void;
  /** Snapshot payload for submission. Safe to call multiple times. */
  getPayload: () => AuthorshipPayload;
}

const PASTE_DELTA_MIN    = 20;   // chars: delta ≥ this without a recent keystroke = paste
const DICTATION_DELTA_MIN = 10;  // chars: bulk insert with zero prior typing = dictation candidate
const THINK_PAUSE_MS     = 800;  // ms: gap > this counted as a think pause
const KEYSTROKE_WINDOW   = 150;  // ms: keystroke within this window → delta is not a paste

export function createAuthorshipTracker(): AuthorshipTracker {
  let keystroke_count   = 0;
  let backspace_count   = 0;
  let paste_count       = 0;
  let paste_chars       = 0;
  let dictation         = false;
  let voice_chars       = 0;
  let think_pause_count = 0;
  let typed_chars       = 0;

  let first_event_at:     number | null = null;
  let last_keystroke_at:  number | null = null;
  let last_event_at:      number | null = null;

  function markEvent(): void {
    const now = Date.now();
    if (first_event_at === null) first_event_at = now;
    if (last_event_at !== null && now - last_event_at > THINK_PAUSE_MS) {
      think_pause_count++;
    }
    last_event_at = now;
  }

  function onKeyPress(key: string): void {
    markEvent();
    last_keystroke_at = Date.now();
    if (key === 'Backspace' || key === 'Delete') {
      backspace_count++;
    } else {
      keystroke_count++;
      typed_chars++;
    }
  }

  function onTextChange(prev: string, next: string): void {
    const delta = next.length - prev.length;
    if (delta <= 1) return; // single char insert or delete — handled by onKeyPress

    const now = Date.now();
    const msSinceKey = last_keystroke_at !== null ? now - last_keystroke_at : Infinity;

    if (delta >= PASTE_DELTA_MIN && msSinceKey > KEYSTROKE_WINDOW) {
      if (first_event_at === null) {
        // Bulk insert with zero prior typing history → dictation / speech-to-text
        dictation = true;
      } else {
        paste_count++;
        paste_chars += delta;
      }
      markEvent();
    } else if (delta >= DICTATION_DELTA_MIN && first_event_at === null) {
      // Moderate bulk insert with no typing history → likely dictation
      dictation = true;
      markEvent();
    }
    // Small deltas from swipe/autocomplete (< PASTE_DELTA_MIN) are normal typing.
  }

  function onVoiceInsert(len: number): void {
    dictation = true;
    voice_chars += len;
    markEvent();
  }

  function getPayload(): AuthorshipPayload {
    const total = keystroke_count + backspace_count;
    return {
      keystroke_count,
      edit_entropy:       total > 0 ? backspace_count / total : 0,
      paste_count,
      paste_chars,
      dictation_detected: dictation,
      voice_chars,
      think_pause_count,
      composition_ms:     first_event_at !== null ? Date.now() - first_event_at : 0,
      typed_chars,
    };
  }

  return { onKeyPress, onTextChange, onVoiceInsert, getPayload };
}
