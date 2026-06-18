/**
 * ConfessionCard — the locked design.
 *
 * Layout (top → bottom), ink background, 26 px radius, 30 px padding:
 *   1. "you wrote" label (palette.you)
 *   2. Your confession in Fraunces
 *   3. Seam: SVG horizontal gradient hairline + centered label
 *   4. "they wrote" label (palette.them)
 *   5. Matched confession in Fraunces
 *   6. Footer: hairline ─ left: felt count ─ right: "you're not alone" italic
 *
 * Background: three wave Path elements each filled with a vertical
 * LinearGradient that fades from 0% opacity at the top to full colour
 * at the bottom — the colour "melts up" from the dark base.
 *
 * Entrance: fades + rises + scales in on mount (700ms, Easing.out cubic).
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import type { Palette } from '../theme/palettes';
import { color, font, fontFamily, radius, spacing } from '../theme/tokens';
import { useReducedMotion } from '../lib/a11y';

// ─── Wave path data (viewBox 0 0 340 472, preserveAspectRatio="none") ─────────
const WAVE_BACK  = 'M0,300 C95,262 250,338 340,296 L340,472 L0,472 Z';
const WAVE_MID   = 'M0,350 C105,318 245,384 340,346 L340,472 L0,472 Z';
const WAVE_FRONT = 'M0,400 C115,376 235,432 340,398 L340,472 L0,472 Z';

interface Props {
  youText:   string;
  themText:  string;
  feltCount: number;
  palette:   Palette;
  style?:    ViewStyle;
}

// ─── Wave background ──────────────────────────────────────────────────────────

export function WaveBackground({ bands }: { bands: Palette['bands'] }) {
  const [back, mid, front] = bands;

  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      viewBox="0 0 340 472"
      preserveAspectRatio="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <LinearGradient id="waveBack" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={back}  stopOpacity="0" />
          <Stop offset="1" stopColor={back}  stopOpacity="1" />
        </LinearGradient>
        <LinearGradient id="waveMid" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={mid}   stopOpacity="0" />
          <Stop offset="1" stopColor={mid}   stopOpacity="1" />
        </LinearGradient>
        <LinearGradient id="waveFront" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={front} stopOpacity="0" />
          <Stop offset="1" stopColor={front} stopOpacity="1" />
        </LinearGradient>
      </Defs>

      <Path d={WAVE_BACK}  fill="url(#waveBack)"  />
      <Path d={WAVE_MID}   fill="url(#waveMid)"   />
      <Path d={WAVE_FRONT} fill="url(#waveFront)" />
    </Svg>
  );
}

// ─── Seam ─────────────────────────────────────────────────────────────────────
// Thin horizontal SVG gradient line: transparent → you → them → transparent
// Label "someone, at the same moment" centred below it.

function Seam({ you, them }: { you: string; them: string }) {
  return (
    <View style={styles.seamContainer}>
      <Svg width="100%" height={1}>
        <Defs>
          <LinearGradient id="seamGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0"    stopColor={you}  stopOpacity="0" />
            <Stop offset="0.3"  stopColor={you}  stopOpacity="1" />
            <Stop offset="0.7"  stopColor={them} stopOpacity="1" />
            <Stop offset="1"    stopColor={them} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="1" fill="url(#seamGrad)" />
      </Svg>
      <Text style={styles.seamLabel}>someone, at the same moment</Text>
    </View>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export default function ConfessionCard({ youText, themText, feltCount, palette, style }: Props) {
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
        styles.shadow,
        style,
        {
          backgroundColor: color.ink,
          shadowColor:     palette.bands[1],
          shadowOpacity:   0.55,
          shadowRadius:    26,
          shadowOffset:    { width: 0, height: 10 },
          elevation:       16,
          opacity:         anim,
          transform:       [{ translateY }, { scale }],
        },
      ]}
    >
      <View style={styles.card}>
        <WaveBackground bands={palette.bands} />

        <View style={styles.content} accessible accessibilityLabel={a11yLabel}>

          {/* ── You wrote ── */}
          <Text style={[styles.label, { color: palette.you }]}>you wrote</Text>
          <Text style={styles.confessionText}>{youText}</Text>

          {/* ── Seam ── */}
          <Seam you={palette.you} them={palette.them} />

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
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  shadow: {
    width:        340,
    borderRadius: radius.card,
    // shadowColor / shadowOpacity / shadowRadius / elevation set inline (palette-tinted)
  },
  card: {
    width:           340,
    minHeight:       472,
    backgroundColor: color.ink,
    borderRadius:    radius.card,
    overflow:        'hidden',
  },
  content: {
    flex:    1,
    padding: spacing.cardPadding,
    // minHeight keeps the card tall enough for the waves to show.
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
    fontFamily: fontFamily.serif,
    fontSize:   font.confessionSize,
    lineHeight: font.confessionLineHeight,
    color:      color.paper,
    marginBottom: 4,
  },
  seamContainer: {
    marginVertical: 20,
    gap:            8,
    alignItems:     'center',
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
    borderTopWidth: StyleSheet.hairlineWidth,
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
