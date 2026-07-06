import ConfessionInput from '@/components/ConfessionInput';
import ProfileButton from '@/components/ProfileButton';
import { PrimaryButton } from '@/components/Buttons';
import { analytics } from '@/lib/analytics';
import { submitConfession } from '@/lib/api';
import { useDraft } from '@/lib/draftContext';
import { getDeviceHash } from '@/lib/deviceHash';
import { session } from '@/lib/sessionFlags';
import { usePalette } from '@/theme/ThemeProvider';
import { color, fontFamily, spacing } from '@/theme/tokens';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { showDialog } from '@/components/AppDialog';

const MIN_CHARS = 1;

export default function WriteScreen() {
  const palette                        = usePalette();
  const { draft, setDraft, clearDraft } = useDraft();
  const [loading, setLoading]          = useState(false);

  useEffect(() => {
    if (!session.readShown) router.replace('/read');
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
      const result = await submitConfession(trimmed, deviceHash, region);

      if (result.type === 'crisis')  { router.push('/crisis'); return; }
      if (result.type === 'blocked') { analytics.blockedByModeration(result.blockReason); return; }

      clearDraft();

      if (result.type === 'submitted') {
        analytics.confessionSubmitted(result.match?.id ?? '');
        // Land on the feed first so the sheet opens over it, not over the write screen.
        router.replace({ pathname: '/read', params: { from: 'match' } });
        router.push({ pathname: '/match', params: { youText: trimmed, themText: '', feltCount: '1', confessionId: result.match?.id ?? '', noMatch: '1' } });
        return;
      }

      analytics.confessionSubmitted(result.match!.id);
      router.replace({ pathname: '/read', params: { from: 'match' } });
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
        placeholder="Write or paste it here. It stays private."
        autoFocus
        style={styles.inputArea}
      />

      {/* Footer */}
      <View style={styles.footer}>
        <PrimaryButton
          label="Find who feels this"
          onPress={handleSubmit}
          loading={loading}
          disabled={draft.trim().length < MIN_CHARS}
        />
        <Text style={[styles.privacyNote, { color: palette.them }]}>
          your words never appear with your identity
        </Text>
      </View>
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
  footer: {
    paddingVertical: 20,
    gap:             12,
  },
  privacyNote: {
    fontFamily: fontFamily.sans,
    fontSize:   13,
    textAlign:  'center',
  },
});
