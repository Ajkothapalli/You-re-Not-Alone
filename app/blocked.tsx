/**
 * Blocked screen — shown when the moderation gate rejects a submission.
 * Gentle, non-shaming, no details about why.
 */
import { useMemo } from 'react';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily, radius, spacing } from '@/theme/tokens';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const typography = {
  body:     { fontFamily: fontFamily.sans, fontSize: 15, lineHeight: 22 },
  footnote: { fontFamily: fontFamily.sans, fontSize: 13, lineHeight: 18 },
};

export default function BlockedScreen() {
  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);

  return (
    <View style={styles.root}>
      <Text style={styles.heading} accessibilityRole="header">We couldn't post that</Text>
      <Text style={styles.body}>
        Some confessions can't go through. This space is meant to be a safe place for
        everyone — including you.
      </Text>
      <Text style={styles.body}>
        If you're going through something difficult right now, you deserve real support.
      </Text>
      <Pressable
        style={styles.primaryBtn}
        onPress={() => router.replace('/write')}
        accessibilityRole="button"
        accessibilityLabel="Write something else"
      >
        <Text style={styles.primaryBtnText}>Write something else</Text>
      </Pressable>
    </View>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: color.ink,
      padding: spacing.screenPadding,
      justifyContent: 'center',
      gap: 20,
    },
    heading: {
      fontFamily: fontFamily.sansBold,
      fontSize: 26,
      color: color.paper,
      lineHeight: 34,
    },
    body: {
      ...typography.body,
      color: color.dim,
    },
    primaryBtn: {
      backgroundColor: color.paper,
      borderRadius: radius.pill,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 12,
    },
    primaryBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 15,
      color: color.ink,
    },
  });
}
