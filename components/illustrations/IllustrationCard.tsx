/**
 * IllustrationCard — the neo-brutal paper frame that wraps a scene.
 *
 * - Background: ILL_COLOR.card (#FBF8F2) — always warm paper, never inverts.
 * - Border: theme border colour (adapts to light/dark).
 * - Shadow: hard 4px offset block — no blur, no radius on the shadow itself.
 * - Radius: radius.card on the card and its shadow block.
 *
 * See docs/design/illustration.md §6 ("It lives inside the neo-brutal frame").
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useThemeColors } from '@/theme/ThemeContext';
import { radius } from '@/theme/tokens';
import { ILL_COLOR } from '@/theme/illustration';

const SHADOW = 4; // hard offset, no blur — neo-brutal

interface IllustrationCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}

export function IllustrationCard({ children, style, testID }: IllustrationCardProps) {
  const color = useThemeColors();

  return (
    <View style={[styles.shell, style]} testID={testID ?? 'IllustrationCard'}>
      {/* Hard offset shadow block — same radius as the card, no blur */}
      <View
        style={[styles.shadowBlock, { backgroundColor: color.border }]}
        testID="IllustrationCard-shadow"
      />

      {/* Paper card */}
      <View
        style={[styles.card, { borderColor: color.border }]}
        testID="IllustrationCard-card"
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position:      'relative',
    paddingRight:  SHADOW,
    paddingBottom: SHADOW,
    alignSelf:     'stretch',
  },
  shadowBlock: {
    position:     'absolute',
    top:          SHADOW,
    left:         SHADOW,
    right:        0,
    bottom:       0,
    borderRadius: radius.card,
  },
  card: {
    backgroundColor: ILL_COLOR.card,
    borderRadius:    radius.card,
    borderWidth:     1.5,
    overflow:        'hidden',
  },
});
