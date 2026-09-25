import ConfessionInput from '@/components/ConfessionInput';
import { Icon } from '@/components/Icon';
import MicButton from '@/components/MicButton';
import VoiceComposer, { VoiceProgress } from '@/components/VoiceComposer';
import VoiceConsentSheet from '@/components/VoiceConsentSheet';
import { useDictation } from '@/lib/dictation';
import { useVoiceRecorder } from '@/lib/voiceRecorder';
import { acceptVoiceConsent, hasAcceptedVoiceConsent } from '@/lib/voiceConsent';
import { submitVoiceConfession, type VoicePhase } from '@/lib/voiceSubmit';
import { grantForWrite } from '@/lib/readAllowance';
import ProfileButton from '@/components/ProfileButton';
import { PrimaryButton } from '@/components/Buttons';
import { analytics } from '@/lib/analytics';
import { submitConfession } from '@/lib/api';
import { useDraft } from '@/lib/draftContext';
import { getDeviceHash } from '@/lib/deviceHash';
import { session } from '@/lib/sessionFlags';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily, spacing } from '@/theme/tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { showDialog } from '@/components/AppDialog';

const MIN_CHARS = 1;

export default function WriteScreen() {
  const color                          = useThemeColors();
  const styles                         = useMemo(() => createStyles(color), [color]);
  const { draft, setDraft, clearDraft } = useDraft();
  const [loading, setLoading]          = useState(false);
  const { prefillText }                = useLocalSearchParams<{ prefillText?: string }>();

  // Dictation writes into the SAME draft state as the keyboard, so spoken text
  // persists through the existing draft system with no parallel storage path,
  // stays fully editable, and submits as the plain string it already was.
  const dictation = useDictation({ value: draft, onChangeText: setDraft });

  // ── Voice mode ──────────────────────────────────────────────────────────────
  // A confession is EITHER typed OR recorded (owner decision 2026-09-23), so
  // this is a mode switch, not an extra affordance on the text field.
  const recorder = useVoiceRecorder();
  const [voiceMode,   setVoiceMode]   = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [phase,       setPhase]       = useState<VoicePhase | null>(null);
  const [phasePct,    setPhasePct]    = useState(0);

  /**
   * Entering voice mode is gated on consent the FIRST time, every time it has
   * not been given. The sheet is shown here — in the flow, before any recording
   * — because that is the only moment the warning can still change a decision
   * (CLAUDE.md invariant 3).
   */
  async function enterVoiceMode() {
    if (await hasAcceptedVoiceConsent()) {
      setVoiceMode(true);
      return;
    }
    setConsentOpen(true);
  }

  function exitVoiceMode() {
    recorder.discard();
    setVoiceMode(false);
    setDraft('');
  }

  useEffect(() => {
    // Read-before-write gate removed (owner decision 2026-09-13): reading is
    // never withheld, and the 2-card screen it pointed at no longer exists.
  }, []);

  // Seed the draft when arriving from an Edit flow in My Confessions
  useEffect(() => {
    if (prefillText && !draft) {
      setDraft(prefillText);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit() {
    const trimmed = draft.trim();
    if (trimmed.length < MIN_CHARS) {
      showDialog('Too short', 'Write a little more — at least a sentence or two.');
      return;
    }
    setLoading(true);
    try {
      const deviceHash = await getDeviceHash();
      const region = Intl.DateTimeFormat().resolvedOptions().timeZone.startsWith('Asia/Kolkata')
        ? 'IN' : 'US';

      // Voice: the TEXT goes first and the audio only follows if it passes.
      // submitVoiceConfession owns that order and deletes the local file on
      // every exit — see lib/voiceSubmit.ts.
      const rec = recorder.recording;
      const result = (voiceMode && rec)
        ? await submitVoiceConfession({
            text:          trimmed,
            rawTranscript: rec.transcript,
            audioUri:      rec.uri,
            waveform:      rec.waveform,
            deviceHash,
            region,
            onPhase: (p, pct) => { setPhase(p); setPhasePct(pct ?? 0); },
          })
        : await submitConfession(trimmed, deviceHash, region);

      if (result.type === 'crisis')  { router.push('/crisis'); return; }
      if (result.type === 'blocked') { analytics.blockedByModeration(result.blockReason); return; }

      clearDraft();

      // Posted. Clear the recorder so coming back to this screen starts at the
      // record button, not at a review card holding a confession that is
      // already live — which is also how the same recording could be posted
      // twice. The screen stays mounted under /match (push, not replace), so
      // nothing else resets it.
      if (voiceMode) recorder.discard();
      if (result.type === 'submitted') {
        analytics.confessionSubmitted(result.match?.id ?? '');
        // Land on the feed first so the sheet opens over it, not over the write screen.
        void grantForWrite();
        router.replace('/explore');
        router.push({ pathname: '/match', params: { youText: trimmed, themText: '', feltCount: '1', confessionId: result.match?.id ?? '', noMatch: '1' } });
        return;
      }

      analytics.confessionSubmitted(result.match!.id);
      void grantForWrite();
        router.replace('/explore');
      router.push({ pathname: '/match', params: { youText: trimmed, themText: result.match!.text, feltCount: String(result.match!.feltCount), confessionId: result.match!.id, noMatch: '0' } });
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if      (msg.includes('moderation_unavailable'))                                              showDialog('Not available', 'The service is not ready yet. Please try again later.');
      else if (err?.status === 429 || msg.includes('429') || msg.toLowerCase().includes('rate'))    showDialog('Slow down', "You've shared a lot today. Come back tomorrow.");
      else if (err?.status === 403 || msg.includes('403') || msg.toLowerCase().includes('banned'))  showDialog('Account suspended', 'Your account has been suspended.');
      else                                                                                           showDialog('Something went wrong', msg || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.replace('/explore')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Icon name="arrow_left" size={18} />
        </TouchableOpacity>
        <ProfileButton />
      </View>

      {/* Prompt */}
      <View style={styles.header}>
        <Text style={styles.prompt} accessibilityRole="header">What do you carry that you've never said out loud?</Text>
      </View>

      {/* Input — text OR voice, never both at once */}
      {voiceMode ? (
        <View style={styles.inputArea}>
          <VoiceComposer
            recorder={recorder}
            value={draft}
            onChangeText={setDraft}
            onExit={exitVoiceMode}
            disabled={loading}
          />
        </View>
      ) : (
        <ConfessionInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Write it here, or say it out loud. It stays private."
          autoFocus
          style={styles.inputArea}
          accessory={
            <MicButton
              available={dictation.available}
              listening={dictation.listening}
              onStart={dictation.start}
              onStop={dictation.stop}
            />
          }
        />
      )}

      {/* Offered only when there is an on-device recogniser — absent, not
          disabled, exactly as the dictation mic is (CLAUDE.md invariant 3's
          consent gate is upstream of this in enterVoiceMode). */}
      {!voiceMode && recorder.available && (
        <Pressable
          onPress={enterVoiceMode}
          disabled={loading}
          hitSlop={10}
          style={{ alignSelf: 'center', paddingVertical: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Record your voice instead"
          testID="switch-to-voice"
        >
          <Text style={styles.voiceSwitch}>Or record your voice</Text>
        </Pressable>
      )}

      <VoiceConsentSheet
        visible={consentOpen}
        onAccept={async () => {
          await acceptVoiceConsent();
          setConsentOpen(false);
          setVoiceMode(true);
        }}
        onCancel={() => setConsentOpen(false)}
      />

      {/* Footer */}
      <View style={styles.footer}>
        {/* The old label promised the app would locate a person who felt this.
            It locates nobody: the server picks a confession sharing a CATEGORY,
            at random within it (owner decision 2026-09-13). The button names
            the act, not a result it cannot promise. */}
        {loading && phase ? (
          <VoiceProgress phase={phase} progress={phasePct} />
        ) : null}
        {/* Hidden mid-recording: there is nothing to post until the writer
            stops, and a live submit button invites posting a half-sentence. */}
        {recorder.state !== 'recording' && recorder.state !== 'stopping' && (
          <PrimaryButton
            label="Let it out"
            onPress={handleSubmit}
            loading={loading}
            disabled={draft.trim().length < MIN_CHARS}
          />
        )}
        <View style={styles.privacyRow}>
          <Icon name="lock" size={14} />
          {/* Three different truths, and saying the wrong one here would be
              the worst place in the app to be wrong.

              "Your voice stays on this phone" is TRUE of dictation — that
              transcribes on-device and stores no audio. It is FALSE of a voice
              confession, where the recording is uploaded and played, raw, by
              strangers. Left unconditional, this line would have reassured
              exactly the person the consent sheet exists to warn. */}
          <Text style={styles.privacyNote}>
            {voiceMode
              ? 'Your recording is shared as you said it. Your name is never attached.'
              : dictation.available
                ? 'Your words never appear with your identity. Dictation stays on this phone.'
                : 'Your words never appear with your identity'}
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    root: {
      flex:              1,
      backgroundColor:   color.bg,
      paddingHorizontal: spacing.screenPadding,
      paddingTop:        60,
    },
    topBar: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:           12,
      marginBottom:  14,
    },
    backLabel: {
      fontFamily: fontFamily.sansBold,
      fontSize:   18,
      color:      color.dim,
      lineHeight: 22,
    },
    header:    { marginBottom: 16 },
    prompt: {
      fontFamily: fontFamily.sansBold,
      fontSize:   22,
      color:      color.paper,
      lineHeight: 32,
    },
    inputArea: { flex: 1 },
    footer: {
      paddingVertical: 20,
      gap:             12,
    },
    privacyRow: {
      flexDirection:  'row',
      alignItems:     'center',
      justifyContent: 'center',
      gap:            6,
    },
    privacyNote: {
      fontFamily: fontFamily.sans,
      fontSize:   13,
      textAlign:  'center',
      color:      color.dim,
    },
    voiceSwitch: {
      fontFamily:         fontFamily.sansBold,
      fontSize:           13,
      color:              color.dim,
      textDecorationLine: 'underline',
    },
  });
}
