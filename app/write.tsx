import { useScreenCaptureGuard } from '@/hooks';
import ConfessionInput from '@/components/ConfessionInput';
import ProfileButton from '@/components/ProfileButton';
import { PrimaryButton, GhostButton } from '@/components/Buttons';
import { analytics } from '@/lib/analytics';
import { improveWriting, submitConfession } from '@/lib/api';
import { type AuthorshipPayload } from '@/lib/authorship';
import { useDraft } from '@/lib/draftContext';
import { getDeviceHash } from '@/lib/deviceHash';
import { session } from '@/lib/sessionFlags';
import { usePalette } from '@/theme/ThemeProvider';
import { color, fontFamily, radius, spacing } from '@/theme/tokens';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const MIN_CHARS         = 1;
const IMPROVE_MIN_CHARS = 15;

export default function WriteScreen() {
  useScreenCaptureGuard(); // prevent screenshots while composing a confession
  const palette                        = usePalette();
  const { draft, setDraft, clearDraft } = useDraft();
  const [loading,   setLoading]        = useState(false);
  const [improving, setImproving]      = useState(false);
  const [original,  setOriginal]       = useState<string | null>(null);
  const [rewritten, setRewritten]      = useState<string | null>(null);
  const authorshipRef = useRef<AuthorshipPayload | null>(null);

  useEffect(() => {
    if (!session.readShown) router.replace('/read');
  }, []);

  async function handleImprove() {
    const trimmed = draft.trim();
    if (trimmed.length < IMPROVE_MIN_CHARS || improving) return;
    setImproving(true);
    try {
      const result = await improveWriting(trimmed);
      if (result.type === 'crisis')  { router.push('/crisis'); return; }
      if (result.type === 'blocked') {
        Alert.alert('Couldn\'t do that', 'This text can\'t be processed. If you\'re going through something difficult, support is available.');
        return;
      }
      setOriginal(trimmed);
      setRewritten(result.text);
    } catch {
      Alert.alert('Not available', 'Couldn\'t improve the writing right now. Your words are still here.');
    } finally {
      setImproving(false);
    }
  }

  function useRewritten() {
    if (rewritten) setDraft(rewritten);
    setOriginal(null);
    setRewritten(null);
  }

  function keepOriginal() {
    setOriginal(null);
    setRewritten(null);
  }

  async function handleSubmit() {
    const trimmed = draft.trim();
    if (trimmed.length < MIN_CHARS) {
      Alert.alert('Too short', 'Write a little more — at least a sentence or two.');
      return;
    }
    setLoading(true);
    try {
      const deviceHash = await getDeviceHash();
      const region = Intl.DateTimeFormat().resolvedOptions().timeZone.startsWith('Asia/Kolkata')
        ? 'IN' : 'US';
      const result = await submitConfession(trimmed, deviceHash, region, authorshipRef.current ?? undefined);

      if (result.type === 'crisis')  { router.push('/crisis'); return; }
      if (result.type === 'blocked') { analytics.blockedByModeration(result.blockReason); return; }

      clearDraft();

      if (result.type === 'submitted') {
        analytics.confessionSubmitted(result.match?.id ?? '');
        router.push({ pathname: '/match', params: { youText: trimmed, themText: '', feltCount: '1', confessionId: result.match?.id ?? '', noMatch: '1' } });
        return;
      }

      analytics.confessionSubmitted(result.match!.id);
      router.push({ pathname: '/match', params: { youText: trimmed, themText: result.match!.text, feltCount: String(result.match!.feltCount), confessionId: result.match!.id, noMatch: '0' } });
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if      (msg.includes('moderation_unavailable'))                                              Alert.alert('Not available', 'The service is not ready yet. Please try again later.');
      else if (err?.status === 429 || msg.includes('429') || msg.toLowerCase().includes('rate'))    Alert.alert('Slow down', "You've shared a lot today. Come back tomorrow.");
      else if (err?.status === 403 || msg.includes('403') || msg.toLowerCase().includes('banned'))  Alert.alert('Account suspended', 'Your account has been suspended.');
      else                                                                                           Alert.alert('Something went wrong', msg || 'Please try again.');
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
        <TouchableOpacity onPress={() => router.replace('/read')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.backLabel}>←</Text>
        </TouchableOpacity>
        <ProfileButton />
      </View>

      {/* Prompt */}
      <View style={styles.header}>
        <Text style={styles.prompt} accessibilityRole="header">What do you carry that you've never said out loud?</Text>
      </View>

      {/* Input */}
      <ConfessionInput
        value={draft}
        onChangeText={setDraft}
        onAuthorshipChange={(p) => { authorshipRef.current = p; }}
        placeholder="Write or paste it here. It stays private."
        autoFocus
        style={styles.inputArea}
      />

      {/* Rewrite button */}
      {draft.trim().length >= IMPROVE_MIN_CHARS && (
        <Pressable
          onPress={handleImprove}
          disabled={improving}
          hitSlop={8}
          style={styles.improveRow}
          accessibilityRole="button"
          accessibilityLabel="Rewrite with AI"
          accessibilityHint="Shows your original and an AI rewrite side by side. You pick which to keep."
        >
          {improving
            ? <ActivityIndicator color={palette.them} size="small" />
            : <Text style={[styles.improveStar, { color: palette.them }]}>✦</Text>}
          <Text style={[styles.improveLabel, { color: palette.them }]}>
            {improving ? 'Rewriting…' : 'Rewrite with AI'}
          </Text>
        </Pressable>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <PrimaryButton
          label="Find who feels this"
          onPress={handleSubmit}
          loading={loading}
          disabled={draft.trim().length < MIN_CHARS}
        />
        <Text style={[styles.privacyNote, { color: palette.them }]}>
          your words are never linked to your identity
        </Text>
      </View>

      {/* Compare sheet — both versions visible, user picks one */}
      <Modal
        visible={rewritten !== null}
        transparent
        animationType="slide"
        onRequestClose={keepOriginal}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetHeading}>pick your version</Text>

            <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
              {/* Original */}
              <View style={styles.versionBlock}>
                <Text style={styles.versionTag}>yours</Text>
                <Text style={styles.versionText}>{original}</Text>
              </View>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerStar}>✦</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Rewritten */}
              <View style={styles.versionBlock}>
                <Text style={[styles.versionTag, styles.versionTagAccent]}>rewritten</Text>
                <Text style={[styles.versionText, styles.versionTextAccent]}>{rewritten}</Text>
              </View>
            </ScrollView>

            <View style={styles.sheetActions}>
              <PrimaryButton label="Use rewritten" onPress={useRewritten} />
              <GhostButton   label="Keep mine"     onPress={keepOriginal} />
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
    fontFamily: fontFamily.serifItalic,
    fontSize:   22,
    color:      color.paper,
    lineHeight: 32,
  },
  inputArea: { flex: 1 },

  improveRow: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             7,
    paddingVertical: 12,
  },
  improveStar:  { fontSize: 15, lineHeight: 18 },
  improveLabel: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      13,
    letterSpacing: 0.4,
  },

  footer: {
    paddingVertical: 20,
    gap:             12,
  },
  privacyNote: {
    fontFamily: fontFamily.sans,
    fontSize:   13,
    textAlign:  'center',
  },

  // ── compare sheet ──
  backdrop: {
    flex:            1,
    backgroundColor: 'rgba(8,7,11,0.75)',
    justifyContent:  'flex-end',
  },
  sheet: {
    backgroundColor:      color.bg,
    borderTopLeftRadius:  radius.card,
    borderTopRightRadius: radius.card,
    padding:              24,
    paddingBottom:        40,
    gap:                  16,
    maxHeight:            '88%',
  },
  sheetHeading: {
    fontFamily: fontFamily.serifItalic,
    fontSize:   22,
    color:      color.paper,
  },
  scroll: { flexGrow: 0 },

  versionBlock: { gap: 10 },
  versionTag: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color:         color.dim,
  },
  versionTagAccent: { color: '#6E96FF' },
  versionText: {
    fontFamily: fontFamily.serif,
    fontSize:   16,
    lineHeight: 26,
    color:      color.dim,      // original is visually quieter
  },
  versionTextAccent: {
    color: color.paper,         // rewritten stands out
  },

  divider: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
    marginVertical: 18,
  },
  dividerLine: {
    flex:            1,
    height:          StyleSheet.hairlineWidth,
    backgroundColor: color.line,
  },
  dividerStar: {
    color:    color.dim,
    fontSize: 12,
    opacity:  0.5,
  },

  sheetActions: { gap: 10, marginTop: 4 },
});
