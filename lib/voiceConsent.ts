/**
 * The one thing a writer must understand before recording.
 *
 * Voice confessions are RAW — no pitch or formant modulation (owner decision
 * 2026-09-23, CLAUDE.md invariant 3). That decision knowingly breaks the app's
 * central promise that no user can ever tie a confession to a person, and the
 * only thing standing between a writer and a consequence they cannot take back
 * is whether they understood it BEFORE they spoke.
 *
 * So the wording is fixed, and it is fixed here rather than inline in a
 * component so that changing it is a deliberate act with a diff:
 *
 *     "People who know you may recognise your voice."
 *
 * Rules this module exists to enforce, from the owner decision:
 *   - shown in the FLOW, before the first recording — not a settings page,
 *     not a policy link
 *   - explicit acknowledgement, persisted
 *   - no pre-ticked box, nothing behind a "Learn more"
 *   - the wording is not softened
 *
 * Someone confessing about an abusive partner needs this sentence in the
 * moment. Not in a privacy policy they will never open.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@yana/voice_consent_v1';

/**
 * The sentence. Exported so the consent UI and the copy guard test read the
 * same string — a component that renders its own softer wording should fail a
 * test, not ship.
 */
export const VOICE_CONSENT_LINE = 'People who know you may recognise your voice.';

/**
 * The supporting lines. Deliberately concrete about consequence rather than
 * reassuring about policy: "stored securely" is true and useless to someone
 * deciding whether their brother will recognise them.
 */
export const VOICE_CONSENT_POINTS = [
  'Your recording is played exactly as you said it. It is not disguised or altered.',
  'Anyone reading your confession can play it.',
  'You can delete it later — but not un-hear it.',
] as const;

/** Versioned: if the wording ever changes materially, bump the key and re-ask. */
export async function hasAcceptedVoiceConsent(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    // Storage unreadable — ask again. Failing CLOSED here means the worst case
    // is being asked twice; failing open means recording without consent.
    return false;
  }
}

export async function acceptVoiceConsent(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, '1');
  } catch {
    // If this throws the user is asked again next time, which is the safe
    // direction. Never swallow into a "probably fine" in-memory flag.
  }
}

/** Dev/test helper — re-surfaces the consent sheet on next record attempt. */
export async function resetVoiceConsent(): Promise<void> {
  try { await AsyncStorage.removeItem(KEY); } catch {}
}
