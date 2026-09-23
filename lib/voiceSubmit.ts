/**
 * Voice confession submission — the order is the safety property.
 *
 * CLAUDE.md invariant 1: the safety gate runs on every submission BEFORE
 * anything is stored. For voice that means the recording stays on the phone
 * until the TEXT has cleared moderation and the crisis check, and the row
 * exists. This module is where that order is kept honest on the client; the
 * server enforces it independently (create-audio-upload refuses any confession
 * id that is not already live), so neither side is trusted alone.
 *
 *   1. record + transcribe locally          — nothing has left the device
 *   2. writer edits the transcript
 *   3. submitConfession(text, rawTranscript) — BOTH are classified server-side
 *   4. crisis?  → upload nothing, delete the file, show resources
 *      blocked?  → upload nothing, delete the file
 *      passed?   → row exists, id in hand
 *   5. encode WAV → MP3
 *   6. create-audio-upload → signed url → PUT
 *   7. delete the local file
 *
 * ── The local file is deleted on EVERY exit ─────────────────────────────────
 * Success, block, crisis, network failure, encode failure, thrown error,
 * cancellation. A recording left in the cache directory is the writer's voice
 * sitting on their own device after they believed they were done with it —
 * and on the crisis path it is a recording of someone at their worst, which
 * invariant 6 says is never stored anywhere. `finally` is not decoration here.
 */

import { File } from 'expo-file-system';
import { supabase } from './supabase';
import { submitConfession, type SubmitResult } from './api';
import { encodeMp3, parseWav, durationMs, MP3_MIME } from './mp3Encode';

const BUCKET = 'confession-audio';

export type VoicePhase =
  | 'submitting'   // text is with the safety gate
  | 'encoding'     // MP3, the slow part on low-end devices
  | 'uploading'
  | 'done';

export interface VoiceSubmitArgs {
  /** What the writer will publish — may differ from what was heard. */
  text:          string;
  /** What the recogniser actually heard. Classified too; an edit cannot launder. */
  rawTranscript: string;
  /** Local WAV/CAF produced alongside the transcript. */
  audioUri:      string;
  deviceHash:    string;
  region:        string;
  onPhase?:      (phase: VoicePhase, progress?: number) => void;
}

/**
 * Best-effort local delete. Never throws: a cleanup failure must not mask the
 * real outcome, and must not stop the rest of the cleanup running.
 */
export function discardLocalRecording(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Nothing useful to do. The OS clears the cache directory eventually, and
    // surfacing this would tell the writer about a file they never knew of.
  }
}

/**
 * Submit a voice confession.
 *
 * Returns the same SubmitResult shape as a typed confession, so callers can
 * treat crisis/blocked/submitted identically. Audio attachment is an internal
 * detail of the success path and never changes the result the writer sees.
 *
 * If the audio fails to attach after the text is stored, this resolves
 * successfully with `audioAttached: false`. The confession is already live and
 * real; failing the whole submission would throw away words that passed the
 * gate, and the feed renders text with no play control perfectly well.
 */
export async function submitVoiceConfession(
  args: VoiceSubmitArgs,
): Promise<SubmitResult & { audioAttached: boolean }> {
  const { text, rawTranscript, audioUri, deviceHash, region, onPhase } = args;

  try {
    // ── 1. TEXT FIRST. Nothing has left the device yet. ──────────────────────
    onPhase?.('submitting');
    const result = await submitConfession(text, deviceHash, region, undefined, {
      rawTranscript,
      audioDurationMs: await safeDurationMs(audioUri),
    });

    // Crisis and blocked both mean: upload nothing.
    //
    // Crisis is the stricter of the two — invariant 6. The `finally` below
    // deletes the file, and there is no branch between here and there that
    // could upload it.
    if (result.type === 'crisis' || result.type === 'blocked') {
      return { ...result, audioAttached: false };
    }

    // submittedId is the AUTHOR'S OWN new row. `match.id` is the confession
    // they were shown in return — somebody else's. Attaching audio to that one
    // would publish this writer's voice under a stranger's words, which is the
    // single worst thing this feature could do.
    const confessionId = result.submittedId;
    if (!confessionId) {
      // Stored but no id returned — cannot attach. The text stands on its own.
      return { ...result, audioAttached: false };
    }

    // ── 2. Encode and upload ──────────────────────────────────────────────
    // Wrapped, because the confession is ALREADY STORED AND LIVE by this point.
    // A corrupt recording, a full disk or a dropped connection must not surface
    // as "your confession failed" when it did not — the writer would try again
    // and post the same words twice, or give up on something that is already
    // published. Audio is the part that failed, and only that part.
    try {
      // Only now: until the gate passed, this was wasted work on a recording
      // that was never going to be stored.
      onPhase?.('encoding', 0);
      const wav = await new File(audioUri).bytes();
      const pcm = parseWav(wav);
      const mp3 = await encodeMp3(pcm, (p) => onPhase?.('encoding', p));
      const ms  = durationMs(pcm);

      // The server re-checks that this confession is live and unattached.
      onPhase?.('uploading');
      const { data: signed, error: signErr } = await supabase.functions.invoke(
        'create-audio-upload',
        { body: { confessionId, durationMs: ms } },
      );
      if (signErr || !signed?.path || !signed?.token) {
        return { ...result, audioAttached: false };
      }

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(signed.path, signed.token, mp3, { contentType: MP3_MIME });

      if (upErr) return { ...result, audioAttached: false };

      onPhase?.('done');
      return { ...result, audioAttached: true };
    } catch {
      return { ...result, audioAttached: false };
    }
  } finally {
    // Every path. Success, failure, crisis, throw.
    discardLocalRecording(audioUri);
  }
}

/** Duration without holding the decoded PCM — used before the encode step. */
async function safeDurationMs(uri: string): Promise<number> {
  try {
    const bytes = await new File(uri).bytes();
    return durationMs(parseWav(bytes));
  } catch {
    return 0;
  }
}
