/**
 * CounterPill — "{count} felt this too" in a subtle pill surface.
 * Text colour comes from the active palette's `you` accent.
 */

import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { font, fontFamily, radius } from '../theme/tokens';

interface Props {
  count:    number;
  youColor: string;   // palette.you
  style?:   ViewStyle;
}

export default function CounterPill({ count, youColor, style }: Props) {
  return (
    <View style={[styles.pill, style]}>
      <Text style={[styles.label, { color: youColor }]}>
        {count.toLocaleString()} felt this too
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: 'rgba(243,238,232,0.07)',
    borderRadius:    radius.pill,
    paddingHorizontal: 16,
    paddingVertical:   8,
    alignSelf:       'flex-start',
  },
  label: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      font.labelSize,
    letterSpacing: font.labelLetterSpacing,
    textTransform: 'uppercase',
  },
});
