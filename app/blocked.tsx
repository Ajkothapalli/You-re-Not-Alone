/**
 * Blocked screen — shown when the moderation gate rejects a submission.
 * Gentle, non-shaming, no details about why.
 */
import { color as colors, font, fontFamily, radius, spacing } from '@/theme/tokens';
const typography = {
  body:     { fontFamily: fontFamily.sans, fontSize: 15, lineHeight: 22 },
  footnote: { fontFamily: fontFamily.sans, fontSize: 13, lineHeight: 18 },
};
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function BlockedScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.heading}>We couldn't post that</Text>
      <Text style={styles.body}>
        Some confessions can't go through. This space is meant to be a safe place for
        everyone — including you.
      </Text>
      <Text style={styles.body}>
        If you're going through something difficult right now, you deserve real support.
      </Text>
      <Pressable style={styles.primaryBtn} onPress={() => router.replace('/write')}>
        <Text style={styles.primaryBtnText}>Write something else</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.ink,
    padding: spacing.screenPadding,
    justifyContent: 'center',
    gap: 20,
  },
  heading: {
    fontFamily: 'Fraunces_400Regular',
    fontSize: 26,
    color: colors.paper,
    lineHeight: 34,
  },
  body: {
    ...typography.body,
    color: colors.dim,
  },
  primaryBtn: {
    backgroundColor: colors.paper,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.ink,
  },
});
