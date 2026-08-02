/**
 * Write tab — compose and submit a confession.
 *
 * Full pipeline runs server-side (CLAUDE.md §1).
 * After submit → pushes to /match (formSheet above tabs).
 * Edit flow: arrives with prefillText param from My Confessions.
 */

import ConfessionInput from '@/components/ConfessionInput';
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
      const result = await submitConfession(trimmed, deviceHash, region);

      if (result.type === 'crisis') { router.push('/crisis'); return; }
      if (result.type === 'blocked') {
        analytics.blockedByModeration(result.blockReason);
        router.push('/blocked');
        return;
      }

      clearDraft();

      if (result.type === 'submitted') {
        analytics.confessionSubmitted(result.match?.id ?? '');
        router.replace({ pathname: '/read', params: { from: 'match' } });
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
      router.replace({ pathname: '/read', params: { from: 'match' } });
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

      <ConfessionInput
        value={draft}
        onChangeText={setDraft}
        placeholder="Write it here. It stays private."
        autoFocus={false}
        style={styles.inputArea}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 90 }]}>
        <PrimaryButton
          label="Find who feels this"
          onPress={handleSubmit}
          loading={loading}
          disabled={draft.trim().length < MIN_CHARS}
        />
        <View style={styles.privacyRow}>
          <ScrawlIcon name="lock" size={14} color={color.dim} roughen={false} />
          <Text style={styles.privacyNote}>
            Your words never appear with your identity
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
  });
}
