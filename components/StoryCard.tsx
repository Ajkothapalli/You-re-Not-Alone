/**
 * StoryCard — off-screen 9:16 canvas for sharing.
 *
 * Fixed 360×640 logical pixels, captured at device pixel ratio
 * (3× on modern iPhones → 1080×1920 PNG, story-friendly).
 *
 * Positioned at left:-9999 so it renders but never appears on screen.
 * Parent must have position:'relative' (any View with explicit dimensions works).
 *
 * Modes:
 *   match  — youText + themText side-by-side, match layout (default when themText given)
 *   single — one confession + feltCount headline (RTUE / read share; omit themText)
 *
 * Privacy: carries no account_id, no author_token — only anonymous matched text,
 * a felt count, and the brand lockup.
 *
 * Usage:
 *   const storyRef = useRef<View>(null);
 *   <StoryCard ref={storyRef} youText themText feltCount palette source />
 *   await shareConfessionCard(storyRef, 'match');
 */

import React, { forwardRef, useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import type { Palette } from '../theme/palettes';
import { useTheme } from '../theme/ThemeProvider';
import { type ColorSet, fontFamily } from '../theme/tokens';

export const STORY_W = 360;
export const STORY_H = 640;

const CARD_W    = 310;
const CARD_H    = 470;
const CARD_LEFT = (STORY_W - CARD_W) / 2;
const CARD_TOP  = 90;

export type ShareSource = 'match' | 'rtue' | 'read';

// Outer canvas waves (lower ~37%)
const OUTER_BACK  = 'M0,440 C96,394 264,462 360,420 L360,640 L0,640 Z';
const OUTER_MID   = 'M0,500 C110,462 248,526 360,480 L360,640 L0,640 Z';
const OUTER_FRONT = 'M0,560 C120,530 240,584 360,548 L360,640 L0,640 Z';

// Inner card waves (coordinate system 340×472, scaled to 310×470)
const INNER_BACK  = 'M0,300 C95,262 250,338 340,296 L340,472 L0,472 Z';
const INNER_MID   = 'M0,350 C105,318 245,384 340,346 L340,472 L0,472 Z';
const INNER_FRONT = 'M0,400 C115,376 235,432 340,398 L340,472 L0,472 Z';

interface Props {
  youText:   string;
  themText?: string;    // absent → single mode
  feltCount: number;
  palette:   Palette;
  source:    ShareSource;
}

export const StoryCard = forwardRef<View, Props>(function StoryCard(
  { youText, themText, feltCount, palette, source },
  ref,
) {
  const { colors: color, isDark } = useTheme();
  const styles = useMemo(() => createStyles(color), [color]);
  const [back, mid, front] = palette.bands;
  const isSingle = !themText;

  return (
    <View
      ref={ref}
      collapsable={false}
      style={styles.canvas}
      accessibilityElementsHidden={true}
      importantForAccessibility="no-hide-descendants"
    >
      {/* ── Outer wave background ── */}
      <Svg
        style={StyleSheet.absoluteFill}
        width={STORY_W}
        height={STORY_H}
        viewBox={`0 0 ${STORY_W} ${STORY_H}`}
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id="sOuterBack"  x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={back}  stopOpacity="0" />
            <Stop offset="1" stopColor={back}  stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="sOuterMid"   x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={mid}   stopOpacity="0" />
            <Stop offset="1" stopColor={mid}   stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="sOuterFront" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={front} stopOpacity="0" />
            <Stop offset="1" stopColor={front} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Path d={OUTER_BACK}  fill="url(#sOuterBack)"  />
        <Path d={OUTER_MID}   fill="url(#sOuterMid)"   />
        <Path d={OUTER_FRONT} fill="url(#sOuterFront)" />
      </Svg>

      {/* ── Brand lockup — logo + domain ── */}
      <View style={styles.brand}>
        <Image
          source={require('../assets/splash-icon.png')}
          style={styles.brandIcon}
          resizeMode="contain"
        />
        <Text style={styles.brandDomain}>soulyap.me</Text>
      </View>

      {/* ── Inner card ── */}
      <View style={styles.card}>

        {/* Inner card wave background */}
        <Svg
          style={StyleSheet.absoluteFill}
          width={CARD_W}
          height={CARD_H}
          viewBox="0 0 340 472"
          preserveAspectRatio="none"
        >
          <Defs>
            <LinearGradient id="sInnerBack"  x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={back}  stopOpacity="0" />
              <Stop offset="1" stopColor={back}  stopOpacity="1" />
            </LinearGradient>
            <LinearGradient id="sInnerMid"   x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={mid}   stopOpacity="0" />
              <Stop offset="1" stopColor={mid}   stopOpacity="1" />
            </LinearGradient>
            <LinearGradient id="sInnerFront" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={front} stopOpacity="0" />
              <Stop offset="1" stopColor={front} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Path d={INNER_BACK}  fill="url(#sInnerBack)"  />
          <Path d={INNER_MID}   fill="url(#sInnerMid)"   />
          <Path d={INNER_FRONT} fill="url(#sInnerFront)" />
        </Svg>

        <View style={styles.cardContent}>
          {isSingle ? (
            // ── Single mode: one confession + felt count ──────────────────────
            <>
              <Text style={styles.singleText} numberOfLines={7}>{youText}</Text>
              <View style={{ flex: 1 }} />
              <View style={styles.singleCountRow}>
                <Text style={[styles.singleCount, { color: palette.them }]}>
                  {feltCount.toLocaleString()}
                </Text>
                <Text style={styles.singleCountLabel}>felt this</Text>
              </View>
              <View style={styles.footer}>
                <View style={{ flex: 1 }} />
                <Text style={styles.footerUrl}>soulyap.me/s?c={source}</Text>
              </View>
            </>
          ) : (
            // ── Match mode: you / them pair ───────────────────────────────────
            <>
              <Text style={[styles.label, { color: isDark ? palette.you : color.paper }]}>You wrote</Text>
              <Text style={styles.confessionText} numberOfLines={6}>{youText}</Text>

              <View style={styles.seamContainer}>
                <Svg width="100%" height={1}>
                  <Defs>
                    <LinearGradient id="sSeam" x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0"   stopColor={palette.you}  stopOpacity="0" />
                      <Stop offset="0.3" stopColor={palette.you}  stopOpacity="1" />
                      <Stop offset="0.7" stopColor={palette.them} stopOpacity="1" />
                      <Stop offset="1"   stopColor={palette.them} stopOpacity="0" />
                    </LinearGradient>
                  </Defs>
                  <Rect x="0" y="0" width="100%" height="1" fill="url(#sSeam)" />
                </Svg>
                <Text style={styles.seamLabel}>Someone, at the same moment</Text>
              </View>

              <Text style={[styles.label, { color: isDark ? palette.them : color.paper }]}>They wrote</Text>
              <Text style={styles.confessionText} numberOfLines={6}>{themText}</Text>

              <View style={{ flex: 1 }} />

              <View style={styles.footer}>
                <Text style={styles.footerFelt}>
                  {feltCount.toLocaleString()} felt this too
                </Text>
                <Text style={styles.footerUrl}>soulyap.me/s?c={source}</Text>
              </View>
            </>
          )}
        </View>
      </View>

      {/* ── CTA line below card, above waves ── */}
      <Text style={styles.cta}>say what you can't — someone will feel it too.</Text>

    </View>
  );
});

const LABEL_SIZE = 9;

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    canvas: {
      position:        'absolute',
      left:            -9999,
      top:             0,
      width:           STORY_W,
      height:          STORY_H,
      backgroundColor: color.ink,
      overflow:        'hidden',
    },
    brand: {
      flexDirection:  'row',
      alignItems:     'center',
      justifyContent: 'center',
      gap:            7,
      marginTop:      28,
    },
    brandIcon: {
      width:  20,
      height: 20,
    },
    brandDomain: {
      fontFamily: fontFamily.sansBold,
      fontSize:   13,
      color:      color.paper,
      opacity:    0.9,
    },
    card: {
      position:        'absolute',
      left:            CARD_LEFT,
      top:             CARD_TOP,
      width:           CARD_W,
      height:          CARD_H,
      backgroundColor: color.ink,
      borderRadius:    26,
      overflow:        'hidden',
    },
    cardContent: {
      flex:    1,
      padding: 24,
    },
    label: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      LABEL_SIZE,
      letterSpacing: LABEL_SIZE * 0.18,
      textTransform: 'uppercase',
      marginBottom:  4,
    },
    confessionText: {
      fontFamily:   fontFamily.serif,
      fontSize:     14,
      lineHeight:   21,
      color:        color.paper,
      marginBottom: 4,
    },
    seamContainer: {
      marginVertical: 14,
      gap:            6,
      alignItems:     'center',
    },
    seamLabel: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      LABEL_SIZE,
      letterSpacing: LABEL_SIZE * 0.18,
      textTransform: 'uppercase',
      color:         color.dim,
    },
    // Single mode
    singleText: {
      fontFamily: fontFamily.serifItalic,
      fontSize:   16,
      lineHeight: 24,
      color:      color.paper,
      textAlign:  'center',
      marginTop:  8,
    },
    singleCountRow: {
      alignItems: 'center',
      gap:        2,
      marginBottom: 12,
    },
    singleCount: {
      fontFamily: fontFamily.sansBold,
      fontSize:   40,
      lineHeight: 44,
    },
    singleCountLabel: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      LABEL_SIZE,
      letterSpacing: LABEL_SIZE * 0.18,
      textTransform: 'uppercase',
      color:         color.dim,
    },
    // Footer (both modes)
    footer: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'center',
      paddingTop:     10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: color.line,
    },
    footerFelt: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      LABEL_SIZE,
      letterSpacing: LABEL_SIZE * 0.18,
      textTransform: 'uppercase',
      color:         color.dim,
    },
    footerUrl: {
      fontFamily: fontFamily.serifItalic,
      fontSize:   10,
      color:      color.dim,
      opacity:    0.8,
    },
    // CTA below card
    cta: {
      position:   'absolute',
      bottom:     20,
      left:       0,
      right:      0,
      fontFamily: fontFamily.serifItalic,
      fontSize:   11,
      color:      color.paper,
      opacity:    0.7,
      textAlign:  'center',
      paddingHorizontal: 32,
    },
  });
}
