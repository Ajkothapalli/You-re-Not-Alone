/**
 * The voice half of the write screen: record → review → post.
 *
 * A confession is EITHER typed OR recorded (owner decision 2026-09-23), so this
 * replaces the text field rather than sitting beside it. One component, used by
 * both app/write.tsx and app/(tabs)/write.tsx — the dictation feature was built
 * twice into those two near-duplicate screens and drifted immediately.
 *
 * ── Why the review step is not optional ─────────────────────────────────────
 * After recording, the writer sees the transcript AND can play the audio back.
 * Both matter for different reasons:
 *   - the transcript is what the safety gate reads and what the feed shows to
 *     anyone who cannot play sound, so it has to be correct
 *   - the audio is what other people HEAR, and it is raw and recognisable
 *     (invariant 3). Hearing it before committing is the last moment the
 *     writer can change their mind about something they cannot take back.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { IllustrationGround, Speaking } from '@/components/illustrations';
import Waveform from '@/components/Waveform';
import { useAspectFit } from '@/hooks/useAspectFit';
import {
  formatDuration, MAX_RECORDING_MS, WAVEFORM_BARS, type VoiceRecorder,
} from '@/lib/voiceRecorder';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, font, fontFamily, radius } from '@/theme/tokens';

export interface VoiceComposerProps {
  recorder: VoiceRecorder;
  /** The EDITED transcript. Owned by the screen so submit can read it. */
  value:        string;
  onChangeText: (t: string) => void;
  /** Leave voice mode and go back to the keyboard. */
  onExit:       () => void;
  disabled?:    boolean;
}

export default function VoiceComposer({
  recorder, value, onChangeText, onExit, disabled,
}: VoiceComposerProps) {
  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);
  const [playing, setPlaying] = useState(false);

  // Only the idle state draws the scene, but the idle state is the LAST branch
  // here — the hook has to run before the early returns above it.
  const illFit = useAspectFit(4 / 3);

  const uri    = recorder.recording?.uri ?? null;
  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);

  // Seed the editable transcript once, when a recording lands. Not on every
  // render: the writer's edits must survive re-renders, and overwriting them
  // with the raw transcript would silently undo their corrections.
  useEffect(() => {
    if (recorder.recording) onChangeText(recorder.recording.transcript);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.recording?.uri]);

  useEffect(() => {
    if (status?.didJustFinish) setPlaying(false);
  }, [status?.didJustFinish]);

  // Nothing keeps playing after this screen goes away.
  useEffect(() => () => { try { player?.pause(); } catch {} }, [player]);

  function togglePlay() {
    if (!player) return;
    try {
      if (playing) { player.pause(); setPlaying(false); }
      else         { player.seekTo(0); player.play(); setPlaying(true); }
    } catch { setPlaying(false); }
  }

  // ── Recording ──────────────────────────────────────────────────────────────
  if (recorder.state === 'recording' || recorder.state === 'stopping') {
    const pct = Math.min(1, recorder.elapsedMs / MAX_RECORDING_MS);
    return (
      <View style={styles.root} testID="voice-recording">
        <View style={styles.center}>
          <Text
            style={[styles.timer, recorder.nearlyUp && styles.timerWarn]}
            accessibilityLiveRegion="polite"
          >
            {formatDuration(recorder.elapsedMs)}
          </Text>
          <Text style={styles.remaining}>
            {recorder.nearlyUp
              ? `${formatDuration(recorder.remainingMs)} left`
              : `up to ${formatDuration(MAX_RECORDING_MS)}`}
          </Text>

          <View style={styles.track}>
            <View style={[
              styles.fill,
              { width: `${pct * 100}%` },
              recorder.nearlyUp && { backgroundColor: color.paper },
            ]} />
          </View>

          {/* Loudness as it arrives. Padded to a full strip so the bars do not
              stretch from two to forty-eight in the first five seconds. */}
          <Waveform
            levels={recorder.levels}
            minBars={WAVEFORM_BARS}
            height={36}
            style={styles.wave}
            testID="voice-live-waveform"
          />

          {/* The live transcript, so the writer can see it is hearing them.
              Not editable yet — editing a moving target is worse than useless. */}
          <ScrollView style={styles.liveBox} contentContainerStyle={{ padding: 14 }}>
            <Text style={styles.liveText}>
              {recorder.liveText || 'Listening…'}
            </Text>
          </ScrollView>
        </View>

        <Pressable
          onPress={() => { Haptics.selectionAsync().catch(() => {}); recorder.stop(); }}
          disabled={recorder.state === 'stopping'}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Stop recording"
          testID="voice-stop"
        >
          <Text style={styles.primaryBtnText}>
            {recorder.state === 'stopping' ? 'Finishing…' : 'Stop'}
          </Text>
        </Pressable>
      </View>
    );
  }

  // ── Captured: play it back, fix the words ──────────────────────────────────
  if (recorder.state === 'captured' && recorder.recording) {
    return (
      <View style={styles.root} testID="voice-review">
        <View style={styles.playerRow}>
          <Pressable
            onPress={togglePlay}
            style={({ pressed }) => [styles.playBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play your recording'}
            testID="voice-play"
          >
            <Text style={styles.playGlyph}>{playing ? '❙❙' : '▶'}</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.playLabel}>Your recording</Text>
            <Text style={styles.playMeta}>
              {formatDuration(recorder.recording.durationMs)} · this is what others will hear
            </Text>
            {recorder.recording.waveform.length > 0 && (
              <Waveform
                levels={recorder.recording.waveform}
                height={22}
                style={{ marginTop: 8 }}
                testID="voice-review-waveform"
              />
            )}
          </View>
        </View>

        <Text style={styles.editLabel}>Transcript</Text>
        <TextInput
          style={styles.transcript}
          value={value}
          onChangeText={onChangeText}
          multiline
          textAlignVertical="top"
          editable={!disabled}
          placeholder="What you said"
          placeholderTextColor={color.dim}
          accessibilityLabel="Your confession transcript"
          accessibilityHint="Edit any words the recogniser got wrong. The audio does not change."
          testID="voice-transcript"
        />
        {/* Said plainly, because it is the surprising part: fixing a typo does
            not fix the recording, and the recording is what people hear. */}
        <Text style={styles.editNote}>
          Editing this fixes the text only — the audio stays as you said it.
        </Text>

        <View style={styles.row}>
          <Pressable
            onPress={() => { recorder.discard(); onChangeText(''); }}
            disabled={disabled}
            style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Record again"
            testID="voice-rerecord"
          >
            <Text style={styles.ghostBtnText}>Record again</Text>
          </Pressable>
          <Pressable
            onPress={() => { recorder.discard(); onChangeText(''); onExit(); }}
            disabled={disabled}
            style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Type instead"
          >
            <Text style={styles.ghostBtnText}>Type instead</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Idle ───────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root} testID="voice-idle">
      <View style={styles.center}>
        {/* The scene is a BUST cropped at the bottom of its own viewBox, so it
            only works in an exact 4:3 box — letterboxed inside a wider ground,
            the shoulders would end in mid-air with paper below them. That is
            what useAspectFit's "contain" flavour returns, and why the ground
            and the SVG are both given the same measured pixel box. */}
        <View style={styles.illBox} onLayout={illFit.onLayout} testID="voice-illustration-box">
          {illFit.ready && (
            <IllustrationGround
              style={{ width: illFit.width, height: illFit.height }}
              testID="voice-illustration"
            >
              <Speaking style={{ width: illFit.width, height: illFit.height }} />
            </IllustrationGround>
          )}
        </View>

        <Text style={styles.idleHint}>
          Say it out loud. Up to {formatDuration(MAX_RECORDING_MS)}.
        </Text>
      </View>

      {/* Record is the primary action and sits where Stop sits, in the same
          treatment. It used to be an outlined circle in the middle of the
          screen, which made it read as secondary to nothing, and meant the
          control JUMPED from the centre to the bottom the moment you pressed
          it. One button, one place, Record → Stop. */}
      <Pressable
        onPress={() => { Haptics.selectionAsync().catch(() => {}); recorder.start(); }}
        disabled={disabled}
        style={({ pressed }) => [styles.primaryBtn, styles.recordBtn, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Start recording"
        testID="voice-record"
      >
        <View style={styles.recordDot} />
        <Text style={styles.primaryBtnText}>Record</Text>
      </Pressable>

      <Pressable
        onPress={onExit}
        disabled={disabled}
        hitSlop={10}
        style={{ alignSelf: 'center' }}
        accessibilityRole="button"
      >
        <Text style={styles.ghostLink}>Type instead</Text>
      </Pressable>
    </View>
  );
}

/** Shown while the submission runs — the encode is genuinely slow on low-end devices. */
export function VoiceProgress({ phase, progress }: { phase: string; progress?: number }) {
  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);
  const label =
    phase === 'encoding'  ? `Preparing audio… ${Math.round((progress ?? 0) * 100)}%`
  : phase === 'uploading' ? 'Uploading…'
  : 'Checking…';
  return (
    <View style={styles.progressRow} testID="voice-progress">
      <ActivityIndicator color={color.dim} />
      <Text style={styles.playMeta}>{label}</Text>
    </View>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    root:   { flex: 1, gap: 16, paddingVertical: 8 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, width: '100%' },

    timer: {
      fontFamily: fontFamily.sansBold,
      fontSize:   46,
      color:      color.paper,
      fontVariant: ['tabular-nums'],
    },
    timerWarn: { color: color.accent },
    remaining: { fontFamily: fontFamily.sans, fontSize: 13, color: color.dim },

    wave: { width: '100%', marginTop: 14 },

    track: {
      width: '100%', height: 4, borderRadius: 2,
      backgroundColor: color.line, overflow: 'hidden', marginTop: 4,
    },
    fill: { height: 4, backgroundColor: color.dim },

    liveBox: {
      width: '100%', maxHeight: 160, marginTop: 14,
      backgroundColor: color.ink, borderRadius: radius.input,
      borderWidth: 2, borderColor: color.border,
    },
    liveText: {
      fontFamily: fontFamily.serif, fontSize: 15, lineHeight: 23, color: color.paper,
    },

    // An explicit height so the box measures non-zero on the first layout pass
    // (an empty View reports 0 and the contain-fit would deadlock at 0×0);
    // flexShrink so a short screen takes it out of the illustration rather than
    // pushing the record button off the bottom.
    illBox: {
      width: '100%', height: 200, flexShrink: 1,
      alignItems: 'center', justifyContent: 'center',
    },

    // Layered over primaryBtn: same pill, plus room for the dot beside the word.
    recordBtn: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
    // Red carries "record" the way nothing else does, and it is never load-
    // bearing — the label says Record, so the dot is reinforcement, not the
    // only signal (its contrast on the accent pill would not carry meaning).
    recordDot: { width: 13, height: 13, borderRadius: 7, backgroundColor: '#E5484D' },
    idleHint:  { fontFamily: fontFamily.sans, fontSize: 14, color: color.dim, textAlign: 'center' },

    playerRow: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      backgroundColor: color.ink, borderRadius: radius.input,
      borderWidth: 2, borderColor: color.border, padding: 14,
    },
    playBtn: {
      width: 44, height: 44, borderRadius: 22,
      borderWidth: 2, borderColor: color.border,
      alignItems: 'center', justifyContent: 'center',
    },
    playGlyph: { fontSize: 15, color: color.paper },
    playLabel: { fontFamily: fontFamily.sansBold, fontSize: 14, color: color.paper },
    playMeta:  { fontFamily: fontFamily.sans, fontSize: 12, color: color.dim, marginTop: 2 },

    editLabel: {
      fontFamily: fontFamily.sansBold, fontSize: font.labelSize,
      letterSpacing: font.labelLetterSpacing, textTransform: 'uppercase',
      color: color.dim,
    },
    transcript: {
      flex: 1, minHeight: 120,
      backgroundColor: color.ink, borderRadius: radius.input,
      borderWidth: 2, borderColor: color.border, padding: 14,
      fontFamily: fontFamily.serif, fontSize: font.confessionSize,
      lineHeight: font.confessionLineHeight, color: color.paper,
    },
    editNote: { fontFamily: fontFamily.sans, fontSize: 12, color: color.dim },

    row: { flexDirection: 'row', gap: 10 },
    ghostBtn: {
      flex: 1, borderRadius: radius.pill, borderWidth: 2, borderColor: color.border,
      paddingVertical: 12, alignItems: 'center',
    },
    ghostBtnText: { fontFamily: fontFamily.sansBold, fontSize: 13, color: color.paper },
    ghostLink:    { fontFamily: fontFamily.sansBold, fontSize: 13, color: color.dim },

    primaryBtn: {
      borderRadius: radius.pill, borderWidth: 2, borderColor: color.border,
      backgroundColor: color.accent, paddingVertical: 16, alignItems: 'center',
    },
    primaryBtnText: {
      fontFamily: fontFamily.sansBold, fontSize: 14,
      letterSpacing: 0.18 * 14, textTransform: 'uppercase', color: '#1A1A1A',
    },
    pressed: { opacity: 0.75 },

    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center' },
  });
}
