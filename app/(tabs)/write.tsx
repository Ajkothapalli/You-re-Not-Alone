/**
 * Write tab — compose and submit a confession.
 *
 * Full pipeline runs server-side (CLAUDE.md §1).
 * After submit → pushes to /match (formSheet above tabs).
 * Edit flow: arrives with prefillText param from My Confessions.
 */

import ConfessionInput from '@/components/ConfessionInput';
import MicButton from '@/components/MicButton';
import VoiceComposer, { VoiceProgress } from '@/components/VoiceComposer';
import VoiceConsentSheet from '@/components/VoiceConsentSheet';
import { useDictation } from '@/lib/dictation';
import { useVoiceRecorder } from '@/lib/voiceRecorder';
import { acceptVoiceConsent, hasAcceptedVoiceConsent } from '@/lib/voiceConsent';
import { submitVoiceConfession, type VoicePhase } from '@/lib/voiceSubmit';
import { grantForWrite } from '@/lib/readAllowance';
import { PrimaryButton } from '@/components/Buttons';
import { analytics } from '@/lib/analytics';
import { submitConfession } from '@/lib/api';
import { useDraft } from '@/lib/draftContext';
import { getDeviceHash } from '@/lib/deviceHash';
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
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrawlIcon } from '@/components/ScrawlIcon';
import { BackgroundPattern } from '@/components/BackgroundPattern';
import { showDialog } from '@/components/AppDialog';

const MIN_CHARS = 1;

export default function WriteTabScreen() {
  const color                          = useThemeColors();
  const insets                         = useSafeAreaInsets();
  const styles                         = useMemo(() => createStyles(color), [color]);
  const { draft, setDraft, clearDraft } = useDraft();
  const [loading, setLoading]          = useState(false);
  const { prefillText }                = useLocalSearchParams<{ prefillText?: string }>();

  // Same draft state the keyboard writes to — see lib/dictation.ts. Kept in
  // step with app/write.tsx, which is the same screen reached without the tab
  // bar; a mic that appeared on only one of the two would be worse than none.
  const dictation = useDictation({ value: draft, onChangeText: setDraft });

  // Voice mode. Kept identical to app/write.tsx on purpose — these two screens
  // are near-duplicates and the dictation feature drifted between them within a
  // day of being added to only one.
  const recorder = useVoiceRecorder();
  const [voiceMode,   setVoiceMode]   = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [phase,       setPhase]       = useState<VoicePhase | null>(null);
  const [phasePct,    setPhasePct]    = useState(0);

  async function enterVoiceMode() {
    if (await hasAcceptedVoiceConsent()) { setVoiceMode(true); return; }
    setConsentOpen(true);
  }

  function exitVoiceMode() {
    recorder.discard();
    setVoiceMode(false);
    setDraft('');
  }

  useEffect(() => {
    if (prefillText && !draft) setDraft(prefillText);
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

      if (result.type === 'crisis') { router.push('/crisis'); return; }
      if (result.type === 'blocked') {
        analytics.blockedByModeration(result.blockReason);
        router.push('/blocked');
        return;
      }

      clearDraft();

      if (result.type === 'submitted') {
        analytics.confessionSubmitted(result.match?.id ?? '');
        void grantForWrite();
        router.replace('/explore');
        router.push({
          pathname: '/match',
          params: {
            youText:      trimmed,
            themText:     '',
            feltCount:    '1',
            confessionId: result.match?.id ?? '',
            noMatch:      '1',
          },
        });
        return;
      }

      analytics.confessionSubmitted(result.match!.id);
      void grantForWrite();
        router.replace('/explore');
      router.push({
        pathname: '/match',
        params: {
          youText:      trimmed,
          themText:     result.match!.text,
          feltCount:    String(result.match!.feltCount),
          confessionId: result.match!.id,
          noMatch:      '0',
        },
      });
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if      (msg.includes('moderation_unavailable'))                                             showDialog('Not available', 'The service is not ready yet. Please try again later.');
      else if (err?.status === 429 || msg.includes('429') || msg.toLowerCase().includes('rate'))   showDialog('Slow down', "You've shared a lot today. Come back tomorrow.");
      else if (err?.status === 403 || msg.includes('403') || msg.toLowerCase().includes('banned')) showDialog('Account suspended', 'Your account has been suspended.');
      else                                                                                          showDialog('Something went wrong', msg || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <BackgroundPattern />
      <View style={styles.header}>
        <Text style={styles.prompt} accessibilityRole="header">
          What do you carry that you've never said out loud?
        </Text>
      </View>

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
          autoFocus={false}
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

      <View style={[styles.footer, { paddingBottom: insets.bottom + 90 }]}>
        {/* The old label promised the app would locate a person who felt this.
            It locates nobody: the server picks a confession sharing a CATEGORY,
            at random within it (owner decision 2026-09-13). */}
        {loading && phase ? <VoiceProgress phase={phase} progress={phasePct} /> : null}
        {recorder.state !== 'recording' && recorder.state !== 'stopping' && (
          <PrimaryButton
            label="Let it out"
            onPress={handleSubmit}
            loading={loading}
            disabled={draft.trim().length < MIN_CHARS}
          />
        )}
        <View style={styles.privacyRow}>
          <ScrawlIcon name="lock" size={14} color={color.dim} roughen={false} />
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
    },
    header:    { marginTop: 20, marginBottom: 16 },
    prompt: {
      fontFamily: fontFamily.serifItalic,
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
