/**
 * expo-audio, behind a guard — because OTA updates reach older binaries.
 *
 * runtimeVersion is {policy: 'appVersion'} and `version` has been 1.0.0 since
 * before voice shipped, so every build from versionCode 32 onward shares one
 * runtime and an OTA is delivered to all of them. expo-audio was added in
 * 5924d5e, AFTER the Play release — so the binary real users are running does
 * not contain it.
 *
 * A static `import … from 'expo-audio'` throws at MODULE SCOPE in a binary
 * without the native half. VoicePlayButton is rendered by ReadCard, which is
 * the feed, which is the first screen after sign-in: an unguarded import there
 * turns an icon update into a white screen on the read surface.
 *
 * This is the same failure that took down the write screen on 2026-09-23
 * ("Cannot find native module 'ExpoSpeechRecognition'"), fixed the same way —
 * see lib/dictation.ts and lib/voiceRecorder.ts, which already do this.
 *
 * The fallbacks are HOOK-SHAPED and the branch is decided once at module load,
 * so the hook count never changes between renders.
 */

type PlayerLike = {
  play:   () => void;
  pause:  () => void;
  seekTo: (s: number) => void;
} | null;

type StatusLike = { didJustFinish?: boolean } | null;

let native: typeof import('expo-audio') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  native = require('expo-audio');
} catch {
  native = null;
}
if (!native || typeof native.useAudioPlayer !== 'function') native = null;

/** False on a binary built before expo-audio was added. Hide playback UI. */
export const AUDIO_AVAILABLE = native !== null;

export const useAudioPlayer: (src: unknown) => PlayerLike =
  native
    ? (native.useAudioPlayer as unknown as (src: unknown) => PlayerLike)
    : () => null;

export const useAudioPlayerStatus: (p: PlayerLike) => StatusLike =
  native
    ? (native.useAudioPlayerStatus as unknown as (p: PlayerLike) => StatusLike)
    : () => null;
