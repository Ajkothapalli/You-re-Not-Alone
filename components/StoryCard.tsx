/**
 * StoryCard — off-screen 9:16 canvas for sharing.
 *
 * Fixed 360×640 logical pixels, captured at device pixel ratio
 * (3× on modern iPhones → 1080×1920 PNG, story-friendly).
 *
 * Positioned at left:-9999 so it renders but never appears on screen.
 * Parent must have position:'relative' (any View with explicit dimensions works).
 *
 * Usage:
 *   const storyRef = useRef<View>(null);
 *   <StoryCard ref={storyRef} youText themText feltCount palette />
 *   ...
 *   await shareConfessionCard(storyRef);
 */

import React, { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import type { Palette } from '../theme/palettes';
import { color, fontFamily } from '../theme/tokens';

export const STORY_W = 360;
export const STORY_H = 640;

const CARD_W    = 310;
const CARD_H    = 470;
const CARD_LEFT = (STORY_W - CARD_W) / 2;  // 25px gutter each side
const CARD_TOP  = 90;

// Outer canvas wave paths (coordinate system 360×640)
// Waves occupy the lower ~37% of the canvas, echoing the ConfessionCard palette.
const OUTER_BACK  = 'M0,440 C96,394 264,462 360,420 L360,640 L0,640 Z';
const OUTER_MID   = 'M0,500 C110,462 248,526 360,480 L360,640 L0,640 Z';
const OUTER_FRONT = 'M0,560 C120,530 240,584 360,548 L360,640 L0,640 Z';

// Inner card wave paths — same coordinate system as ConfessionCard (340×472),
// scaled to 310×470 via preserveAspectRatio="none".
const INNER_BACK  = 'M0,300 C95,262 250,338 340,296 L340,472 L0,472 Z';
const INNER_MID   = 'M0,350 C105,318 245,384 340,346 L340,472 L0,472 Z';
const INNER_FRONT = 'M0,400 C115,376 235,432 340,398 L340,472 L0,472 Z';

interface Props {
  youText:   string;
  themText:  string;
  feltCount: number;
  palette:   Palette;
}

export const StoryCard = forwardRef<View, Props>(function StoryCard(
  { youText, themText, feltCount, palette },
  ref,
) {
  const [back, mid, front] = palette.bands;

  return (
    <View ref={ref} collapsable={false} style={styles.canvas}>

      {/* ── Full-bleed outer wave background ── */}
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

      {/* ── Wordmark ── */}
      <Text style={styles.wordmark}>you're not alone</Text>

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

          {/* You wrote */}
          <Text style={[styles.label, { color: palette.you }]}>you wrote</Text>
          <Text style={styles.confessionText} numberOfLines={6}>{youText}</Text>

          {/* Seam */}
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
            <Text style={styles.seamLabel}>someone, at the same moment</Text>
          </View>

          {/* They wrote */}
          <Text style={[styles.label, { color: palette.them }]}>they wrote</Text>
          <Text style={styles.confessionText} numberOfLines={6}>{themText}</Text>

          <View style={{ flex: 1 }} />

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerFelt}>
              {feltCount.toLocaleString()} felt this too
            </Text>
            <Text style={styles.footerYNA}>you're not alone</Text>
          </View>

        </View>
      </View>

    </View>
  );
});

const LABEL_SIZE = 9;

const styles = StyleSheet.create({
  canvas: {
    position:        'absolute',
    left:            -9999,
    top:             0,
    width:           STORY_W,
    height:          STORY_H,
    backgroundColor: color.ink,
    overflow:        'hidden',
  },
  wordmark: {
    fontFamily:  fontFamily.serifItalic,
    fontSize:    18,
    color:       color.dim,
    textAlign:   'center',
    marginTop:   40,
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
    color:         color.feltText,
  },
  footerYNA: {
    fontFamily: fontFamily.serifItalic,
    fontSize:   11,
    color:      color.youreNotAlone,
  },
});
