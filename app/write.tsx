import ConfessionInput from '@/components/ConfessionInput';
import { PrimaryButton } from '@/components/Buttons';
import { analytics } from '@/lib/analytics';
import { submitConfession } from '@/lib/api';
import { getDeviceHash } from '@/lib/deviceHash';
import { usePalette } from '@/theme/ThemeProvider';
import { color, fontFamily, spacing } from '@/theme/tokens';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const MIN_CHARS = 10;

export default function WriteScreen() {
  const palette = usePalette();
  const [text,    setText]    = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const trimmed = text.trim();
    if (trimmed.length < MIN_CHARS) {
      Alert.alert('Too short', 'Write a little more — at least a sentence or two.');
      return;
    }
    setLoading(true);
    try {
      const deviceHash = await getDeviceHash();

      const region = Intl.DateTimeFormat().resolvedOptions().timeZone.startsWith('Asia/Kolkata')
        ? 'IN'
        : 'US';

      const result = await submitConfession(trimmed, deviceHash, region);

      if (result.type === 'crisis') {
        router.push('/crisis');
        return;
      }

      if (result.type === 'blocked') {
        analytics.blockedByModeration(result.blockReason);
        return;
      }

      if (result.type === 'submitted') {
        analytics.confessionSubmitted(result.match?.id ?? '');
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

      // type === 'matched'
      analytics.confessionSubmitted(result.match!.id);
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

      if (msg.includes('moderation_unavailable')) {
        Alert.alert('Not available', 'The service is not ready yet. Please try again later.');
      } else if (
        err?.status === 429 ||
        msg.includes('429') ||
        msg.toLowerCase().includes('rate')
      ) {
        Alert.alert('Slow down', "You've shared a lot today. Come back tomorrow.");
      } else if (
        err?.status === 403 ||
        msg.includes('403') ||
        msg.toLowerCase().includes('banned') ||
        msg.toLowerCase().includes('suspended')
      ) {
        Alert.alert('Account suspended', 'Your account has been suspended.');
      } else {
        Alert.alert('Something went wrong', msg || 'Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <Text style={styles.prompt}>What do you carry that you've never said out loud?</Text>

        <ConfessionInput
          value={text}
          onChangeText={setText}
          placeholder="Write it here. It stays private."
          autoFocus
        />

        <PrimaryButton
          label="Find who feels this"
          onPress={handleSubmit}
          loading={loading}
          disabled={text.trim().length < MIN_CHARS}
        />

        <Text style={[styles.privacyNote, { color: palette.them }]}>
          your words are never linked to your identity
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: color.ink,
  },
  scroll: {
    flexGrow:   1,
    padding:    spacing.screenPadding,
    paddingTop: 60,
    gap:        20,
  },
  prompt: {
    fontFamily:   fontFamily.serifItalic,
    fontSize:     22,
    color:        color.paper,
    lineHeight:   32,
    marginBottom: 8,
  },
  privacyNote: {
    fontFamily: fontFamily.sans,
    fontSize:   13,
    textAlign:  'center',
  },
});
