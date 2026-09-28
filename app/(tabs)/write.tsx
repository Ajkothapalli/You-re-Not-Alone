/**
 * Write tab — compose and submit a confession.
 *
 * Full pipeline runs server-side (CLAUDE.md §1).
 * After submit → pushes to /match (formSheet above tabs).
 * Edit flow: arrives with prefillText param from My Confessions.
 */

import ConfessionInput from '@/components/ConfessionInput';
import { shouldNudge, markNudged, resetNudge, NUDGE_TITLE, NUDGE_BODY, NUDGE_POST, NUDGE_MORE } from '@/lib/shortDraftNudge';
import { isDraftReady } from '@/lib/draftReady';
import StarterChips from '@/components/StarterChips';
import { useStarters } from '@/lib/useStarters';
import { getCurrentQuestion, type LiveQuestion } from '@/lib/question';
import type { ConfessionInputHandle } from '@/components/ConfessionInput';
import { notGenuineCopy } from '@/lib/notGenuineCopy';
import { Icon } from '@/components/Icon';
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
import { submitConfession, isNotGenuine } from '@/lib/api';
import { useDraft } from '@/lib/draftContext';
import { getDeviceHash } from '@/lib/deviceHash';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, font, fontFamily, radius, spacing } from '@/theme/tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackgroundPattern } from '@/components/BackgroundPattern';
import { showDialog } from '@/components/AppDialog';

// The server's floor is 10 characters / 3 words (8 letters for a script
// written without spaces). isDraftReady mirrors it so the button is visibly
// not-ready-yet rather than tapping through to a round trip that says so.
// MIN_CHARS stays only for the length counter; the gate is isDraftReady.
const MIN_CHARS = 1;

export default function WriteTabScreen() {
  const color                          = useThemeColors();
  const insets                         = useSafeAreaInsets();
  const styles                         = useMemo(() => createStyles(color), [color]);
  const { draft, setDraft, clearDraft } = useDraft();
  const [loading, setLoading]          = useState(false);
  const inputRef                       = useRef<ConfessionInputHandle>(null);

  /**
   * [W2] Answering the weekly question.
   *
   * Held in state rather than read straight from the param so that detaching
   * is possible: the writer can decide mid-sentence that this is not an answer
   * after all, and their words stay exactly where they are.
   */
  const [question, setQuestion] = useState<LiveQuestion | null>(null);
  const [attached, setAttached] = useState(false);
  const { prefillText, starter, questionId } =
    useLocalSearchParams<{ prefillText?: string; starter?: string; questionId?: string }>();

  // Same draft state the keyboard writes to — see lib/dictation.ts. Kept in
  // step with app/write.tsx, which is the same screen reached without the tab
  // bar; a mic that appeared on only one of the two would be worse than none.
  const dictation = useDictation({ value: draft, onChangeText: setDraft });

  const { starters, visible: startersVisible } = useStarters(draft);

  useEffect(() => {
    if (!questionId) return;
    getCurrentQuestion()
      .then((q) => {
        // Only attach if the id is still the live one. A week can turn over
        // between opening the feed and opening this screen.
        if (q && q.id === questionId) { setQuestion(q); setAttached(true); }
      })
      .catch(() => {});
  }, [questionId]);

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
    else if (starter && !draft) setDraft(starter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The nudge sits between the tap and the send, and never blocks.
   *
   * It runs BEFORE submit, so the crisis check has not happened and cannot be
   * consulted here. That is safe only because every path ends in doSubmit:
   * a crisis message typed in four words is delayed by one tap, never stopped.
   */
  async function handleSubmit() {
    const trimmed = draft.trim();
    if (!isDraftReady(trimmed)) {
      // Not "Too short". The floor already refuses their words; naming it that
      // way tells someone the hardest sentence they ever typed does not count.
      showDialog('Say a little more?', 'Even a few words is enough.');
      return;
    }
    if (shouldNudge(trimmed)) {
      markNudged(trimmed);
      showDialog(NUDGE_TITLE, NUDGE_BODY, [
        // "Add more" simply returns: the draft and the cursor are untouched.
        { text: NUDGE_MORE, style: 'cancel' },
        { text: NUDGE_POST, onPress: () => { void doSubmit(trimmed); } },
      ]);
      return;
    }
    await doSubmit(trimmed);
  }

  async function doSubmit(trimmed: string) {
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
        : await submitConfession(
            trimmed, deviceHash, region, undefined, undefined,
            attached ? question?.id ?? null : null,
          );

      if (result.type === 'crisis') { router.push('/crisis'); return; }
      if (result.type === 'blocked') {
        analytics.blockedByModeration(result.blockReason);
        router.push('/blocked');
        return;
      }

      clearDraft();
      resetNudge();

      // Posted. Clear the recorder so coming back to this screen starts at the
      // record button, not at a review card holding a confession that is
      // already live — which is also how the same recording could be posted
      // twice. The screen stays mounted under /match (push, not replace), so
      // nothing else resets it.
      if (voiceMode) recorder.discard();
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
      // [3.6] SUBSTANCE. Nothing was stored, this is not a violation, and the
      // draft is deliberately NOT cleared — clearDraft() only runs on the
      // success path above, so returning here leaves the words in the field,
      // which is what the dialog promises.
      if (isNotGenuine(err)) {
        analytics.blockedNotGenuine(err.reason);
        const copy = notGenuineCopy(err.reason);
        showDialog(copy.title, copy.body);
        return;
      }
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


      {/* [W2] The question being answered. The ✕ detaches it without touching
          a word of what they have already written. */}
      {attached && question && (
        <View style={styles.questionBanner} testID="write-question-banner">
          <View style={{ flex: 1 }}>
            <Text style={styles.questionEyebrow}>This week’s question</Text>
            <Text style={styles.questionText}>{question.text}</Text>
          </View>
          <Pressable
            onPress={() => { analytics.questionDetached(); setAttached(false); }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Write about something else"
            testID="write-question-detach"
          >
            <Icon name="close" size={16} />
          </Pressable>
        </View>
      )}
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
          ref={inputRef}
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

      {/* Never in voice mode: a recording has no cursor to insert into, and a
          row of written prompts under a mic is the wrong instrument entirely. */}
      {!voiceMode && (
        <StarterChips
          starters={starters}
          // The question is the starter. Offering both is two prompts for one
          // blank page, and the chips would quietly compete with the question
          // the writer came here to answer.
          visible={startersVisible && !(attached && !!question)}
          onPick={(s) => inputRef.current?.insertText(s)}
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
            disabled={!isDraftReady(draft)}
          />
        )}
        <View style={styles.privacyRow}>
          <Icon name="lock" size={14} />
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
    questionBanner: {
      flexDirection:   'row',
      alignItems:      'flex-start',
      gap:             12,
      padding:         14,
      marginBottom:    14,
      borderRadius:    radius.input,
      borderWidth:     StyleSheet.hairlineWidth,
      borderColor:     color.line,
      backgroundColor: color.ink,
    },
    questionEyebrow: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      font.labelSize,
      letterSpacing: font.labelLetterSpacing,
      textTransform: 'uppercase',
      color:         color.dim,
      marginBottom:  4,
    },
    questionText: {
      fontFamily: fontFamily.serif,
      fontSize:   16,
      lineHeight: 22,
      color:      color.paper,
    },
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
