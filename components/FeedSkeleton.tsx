/**
 * FeedSkeleton — what the feed looks like before it has anything to say.
 *
 * Replaces a centred spinner. A spinner communicates "wait"; a skeleton
 * communicates "cards are coming, and they will be about this big", so the
 * screen stops being a blank box and the arrival of real content is a fill
 * rather than a jump. It also holds the layout, so nothing shifts under the
 * reader's thumb when the feed lands.
 *
 * Shown ONLY on a genuine cold start — with a cached feed there is real
 * content to show instead, and a skeleton in front of content we already have
 * would be a step backwards (see lib/feedCache.ts).
 *
 * ── It has to be THIS feed's skeleton (2026-10-02) ──────────────────────────
 * It was a generic card: a hairline border, three short lines, and a round
 * avatar in a FOOTER. The real card is none of those things — it is a
 * neo-brutalist block with a 2px border and a hard offset shadow in the
 * card's palette colour, a minimum height of 220, 28px of padding, and the
 * persona at the TOP, not the bottom. So the placeholder was a different
 * shape and a different size from the thing replacing it, which is the one
 * job a skeleton has: the content landed and everything jumped, which is
 * what a skeleton exists to prevent.
 *
 * Every number below is read from ReadCard rather than chosen here, and
 * __tests__/components/FeedSkeleton.test.tsx pins them together so the two
 * cannot drift apart again.
 *
 * Deliberately calm: a slow opacity breath, not a sweeping shimmer. This app
 * opens on people's worst days and the loading state should not be the
 * busiest thing on the screen. It stops dead under reduced motion.
 *
 * Only the PLACEHOLDER BARS breathe. The card's border and its coloured
 * shadow are drawn solid, because they are not placeholders — they are
 * exactly what the real card looks like, already correct. Pulsing them made
 * the outline flicker and read as a rendering fault.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { palettes } from '@/theme/palettes';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, radius, spacing } from '@/theme/tokens';
import { useReducedMotion } from '@/lib/a11y';

/** Roughly a screenful. More would be invisible work. */
const CARDS = 3;

/** ReadCard's own geometry. Changing one of these without changing it there
 *  is the drift this file exists to avoid — the test asserts they match. */
export const CARD = {
  /** ReadCard's SHADOW. */
  shadow:     5,
  /** styles.card.minHeight */
  minHeight:  220,
  /** styles.card.borderWidth */
  border:     2,
  /** styles.content.padding */
  padding:    28,
  /** PersonaBadge's default size. */
  badge:      27,
  /** styles.personaRow.marginBottom */
  personaGap: 14,
  /** font.confessionLineHeight, rounded — the body's line rhythm. */
  lineHeight: 29,
  /** styles.footer.paddingTop */
  footerGap:  16,
} as const;

/**
 * Three different cards, not the same one three times.
 *
 * A real feed is ragged: some confessions carry a headline, some do not,
 * and they run to different lengths. Three identical blocks read as a
 * loading GRAPHIC rather than as cards about to arrive.
 */
const SHAPES: { headline: boolean; lines: `${number}%`[] }[] = [
  { headline: true,  lines: ['96%', '88%', '93%', '54%'] },
  { headline: false, lines: ['92%', '97%', '71%'] },
  { headline: true,  lines: ['89%', '94%', '86%', '38%'] },
];

export default function FeedSkeleton() {
  const color   = useThemeColors();
  const styles  = useMemo(() => createStyles(color), [color]);
  const reduced = useReducedMotion();
  const pulse   = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (reduced) { pulse.setValue(0.75); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.95, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.6,  duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    // Stopped on unmount: a loop left running on a screen nobody is looking
    // at is exactly the kind of background work this phase is removing.
    return () => loop.stop();
  }, [reduced]);

  return (
    <View
      style={styles.wrap}
      testID="feed-skeleton"
      accessibilityRole="progressbar"
      accessibilityLabel="Loading confessions"
    >
      {Array.from({ length: CARDS }).map((_, i) => {
        const shape = SHAPES[i % SHAPES.length];
        return (
          <View key={i} style={styles.outerShell}>
            {/* The hard offset shadow, in the same palette colour this
                position will actually get — the feed indexes palettes the
                same way, so the first cards keep their colour when the
                real ones land on top. */}
            <View
              style={[styles.shadowBlock, { backgroundColor: palettes[i % palettes.length].you }]}
            />

            <View style={styles.card}>
              <Animated.View style={[styles.content, { opacity: pulse }]}>
                {/* Persona, at the TOP — where the real card puts it. */}
                <View style={styles.personaRow}>
                  <View style={styles.badge} />
                  <View style={[styles.bar, styles.personaName]} />
                </View>

                {shape.headline && <View style={styles.headline} />}

                {shape.lines.map((w, j) => (
                  <View key={j} style={[styles.bodyLine, { width: w }]} />
                ))}

                <View style={styles.spacer} />

                <View style={styles.footer}>
                  {/* "N felt this too" — heart, then the count and label. */}
                  <View style={styles.actionGroup}>
                    <View style={styles.glyph} />
                    <View style={[styles.bar, { width: 96 }]} />
                  </View>
                  {/* Share, then report. */}
                  <View style={styles.footerRight}>
                    <View style={styles.glyph} />
                    <View style={[styles.bar, { width: 34 }]} />
                  </View>
                </View>
              </Animated.View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    // Matches the list's contentContainerStyle (styles.scroll in explore),
    // so the first real card lands exactly where its placeholder sat.
    wrap: {
      flex:              1,
      paddingHorizontal: spacing.screenPadding,
      paddingTop:        8,
      gap:               16,
    },

    // ── ReadCard's box ──────────────────────────────────────────────────────
    outerShell: {
      alignSelf:     'stretch',
      paddingRight:  CARD.shadow,
      paddingBottom: CARD.shadow,
      position:      'relative',
    },
    shadowBlock: {
      position:     'absolute',
      top:          CARD.shadow,
      left:         CARD.shadow,
      right:        0,
      bottom:       0,
      borderRadius: radius.card,
    },
    card: {
      minHeight:       CARD.minHeight,
      backgroundColor: color.ink,
      borderRadius:    radius.card,
      borderWidth:     CARD.border,
      borderColor:     color.border,
      overflow:        'hidden',
    },
    content: { flex: 1, padding: CARD.padding },

    // ── What sits in it ─────────────────────────────────────────────────────
    personaRow: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:           9,
      marginBottom:  CARD.personaGap,
    },
    badge: {
      width:        CARD.badge,
      height:       CARD.badge,
      borderRadius: radius.pill,
      borderWidth:  CARD.border,
      borderColor:  color.line,
    },
    personaName: { width: 72, height: 10 },

    bar: { height: 12, borderRadius: 6, backgroundColor: color.line },
    // Bolder and taller than a body line, like the headline it stands for.
    headline: {
      height:       14,
      width:        '74%',
      borderRadius: 7,
      backgroundColor: color.line,
      marginBottom: 12,
    },
    // Spaced on the body's real line rhythm rather than an invented gap.
    bodyLine: {
      height:        12,
      borderRadius:  6,
      backgroundColor: color.line,
      marginBottom:  CARD.lineHeight - 12,
    },

    spacer: { minHeight: 32, flex: 1 },
    footer: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'center',
      paddingTop:     CARD.footerGap,
    },
    actionGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    footerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    // A heart or a share icon, both drawn at 18.
    glyph: { width: 18, height: 18, borderRadius: 9, backgroundColor: color.line },
  });
}
