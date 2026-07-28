/**
 * ConfessionCard — neo-brutalist matched confession card.
 *
 * Layout (top → bottom), ink background, 4px radius, 2px white border,
 * hard offset shadow in palette.you color:
 *   1. "you wrote" label (palette.you)
 *   2. Your confession in Fraunces
 *   3. Seam: palette.you solid line + centered label
 *   4. "they wrote" label (palette.them)
 *   5. Matched confession in Fraunces
 *   6. Footer: hairline ─ left: felt count ─ right: "you're not alone" italic
 *
 * Entrance: fades + rises + scales in on mount (700ms, Easing.out cubic).
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { Palette } from '../theme/palettes';
import { useThemeColors } from '../theme/ThemeProvider';
import { type ColorSet, font, fontFamily, radius, spacing } from '../theme/tokens';
import { useReducedMotion } from '../lib/a11y';

const SHADOW = 5;

interface Props {
  youText:   string;
  themText:  string;
  feltCount: number;
  palette:   Palette;
  style?:    ViewStyle;
}

// WaveBackground — exported for test-mock compat, renders nothing.
export function WaveBackground(_: { bands: Palette['bands'] }) {
  return null;
}

// ─── Seam ─────────────────────────────────────────────────────────────────────
// Solid palette.you line with "someone, at the same moment" label below.

function Seam({ you }: { you: string }) {
  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);
  return (
    <View style={styles.seamContainer}>
      <View style={[styles.seamLine, { backgroundColor: you }]} />
      <Text style={styles.seamLabel}>someone, at the same moment</Text>
    </View>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export default function ConfessionCard({ youText, themText, feltCount, palette, style }: Props) {
  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);
  const anim = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) { anim.setValue(1); return; }
    Animated.timing(anim, {
      toValue:         1,
      duration:        700,
      easing:          Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reduceMotion]);

  const a11yLabel =
    `You wrote: ${youText}. ` +
    `Someone, at the same moment, wrote: ${themText}. ` +
    `${feltCount.toLocaleString()} people felt this too. You're not alone.`;

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  const scale      = anim.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] });

  return (
    <Animated.View
      style={[
        style,
        {
          opacity:   anim,
          transform: [{ translateY }, { scale }],
        },
      ]}
    >
      {/* Neo-brutalist shadow wrapper */}
      <View style={styles.outerShell}>
        {/* Hard offset shadow block */}
        <View style={[styles.shadowBlock, { backgroundColor: palette.you }]} />

        {/* Card */}
        <View style={styles.card}>
          <View style={styles.content} accessible accessibilityLabel={a11yLabel}>

            {/* ── You wrote ── */}
            <Text style={[styles.label, { color: palette.you }]}>you wrote</Text>
            <Text style={styles.confessionText}>{youText}</Text>

            {/* ── Seam ── */}
            <Seam you={palette.you} />

            {/* ── They wrote ── */}
            <Text style={[styles.label, { color: palette.them }]}>they wrote</Text>
            <Text style={styles.confessionText}>{themText}</Text>

            {/* Push footer to bottom */}
            <View style={{ flex: 1 }} />

            {/* ── Footer ── */}
            <View style={styles.footer}>
              <Text style={styles.footerFelt}>
                {feltCount.toLocaleString()} felt this too
              </Text>
              <Text style={styles.footerYNA}>you're not alone</Text>
            </View>

          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    outerShell: {
      width:         340,
      paddingRight:  SHADOW,
      paddingBottom: SHADOW,
      position:      'relative',
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
      width:           340 - SHADOW,
      minHeight:       472,
      backgroundColor: color.ink,
      borderRadius:    radius.card,
      borderWidth:     2,
      borderColor:     color.border,
      overflow:        'hidden',
    },
    content: {
      flex:    1,
      padding: spacing.cardPadding,
      minHeight: 472,
    },
    label: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      font.labelSize,
      letterSpacing: font.labelLetterSpacing,
      textTransform: 'uppercase',
      marginBottom:  6,
    },
    confessionText: {
      fontFamily:   fontFamily.serif,
      fontSize:     font.confessionSize,
      lineHeight:   font.confessionLineHeight,
      color:        color.paper,
      marginBottom: 4,
    },
    seamContainer: {
      marginVertical: 20,
      gap:            8,
      alignItems:     'center',
    },
    seamLine: {
      width:  '100%',
      height: 2,
    },
    seamLabel: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      font.labelSize,
      letterSpacing: font.labelLetterSpacing,
      textTransform: 'uppercase',
      color:         color.dim,
    },
    footer: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'center',
      paddingTop:     12,
      borderTopWidth: 2,
      borderTopColor: color.line,
    },
    footerFelt: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      font.labelSize,
      letterSpacing: font.labelLetterSpacing,
      textTransform: 'uppercase',
      color:         color.feltText,
    },
    footerYNA: {
      fontFamily: fontFamily.serifItalic,
      fontSize:   13,
      color:      color.youreNotAlone,
    },
  });
}
