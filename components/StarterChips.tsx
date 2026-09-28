/**
 * StarterChips — the first few words, offered on a blank page.
 *
 * Shown ONLY while the input is empty. The moment there is text the chips are
 * gone: a writer mid-sentence is past needing a way in, and a row of
 * suggestions under their own words reads as a comment on them.
 *
 * Tapping one inserts it as ordinary editable text with the caret at the end.
 * There is no "starter mode" and nothing is remembered about which chip was
 * tapped — from that moment it is the writer's sentence.
 *
 * Deliberately quiet: these sit under a question someone is trying to answer
 * honestly, and buttons that look eager would turn a prompt into a demand.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../theme/ThemeProvider';
import { type ColorSet, font, fontFamily, radius, spacing } from '../theme/tokens';
import { analytics } from '@/lib/analytics';
import { categoryOfStarter } from '@/lib/starters';

interface Props {
  starters: readonly string[];
  /** Hidden entirely when false — never rendered disabled. */
  visible:  boolean;
  onPick:   (starter: string) => void;
}

export default function StarterChips({ starters, visible, onPick }: Props) {
  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);

  // One `starter_shown` per category per appearance, not one per render — a
  // re-render is not a new impression, and counting it as one would quietly
  // inflate the only number this phase is measured by.
  const reported = useRef(false);
  useEffect(() => {
    if (!visible || starters.length === 0) {
      reported.current = false;
      return;
    }
    if (reported.current) return;
    reported.current = true;
    const seen = new Set<string>();
    for (const s of starters) {
      const c = categoryOfStarter(s);
      if (c && !seen.has(c)) {
        seen.add(c);
        analytics.starterShown(c);
      }
    }
  }, [visible, starters]);

  if (!visible || starters.length === 0) return null;

  return (
    <View style={styles.wrap} testID="starter-chips">
      <Text style={styles.lead}>Not sure how to start?</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {starters.map((s) => (
          <Pressable
            key={s}
            onPress={() => {
              const c = categoryOfStarter(s);
              if (c) analytics.starterUsed(c);
              onPick(s);
            }}
            hitSlop={6}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Start with: ${s}`}
            accessibilityHint="Puts these words in your confession. You can change them."
          >
            <Text style={styles.chipLabel} numberOfLines={1}>{s}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    wrap: {
      paddingTop: 10,
    },
    lead: {
      fontFamily:        fontFamily.sans,
      fontSize:          font.labelSize,
      letterSpacing:     font.labelLetterSpacing,
      textTransform:     'uppercase',
      color:             color.dim,
      paddingHorizontal: spacing.screenPadding,
      marginBottom:      8,
    },
    row: {
      paddingHorizontal: spacing.screenPadding,
      gap:               8,
    },
    chip: {
      paddingVertical:   8,
      paddingHorizontal: 14,
      borderRadius:      radius.pill,
      borderWidth:       StyleSheet.hairlineWidth,
      borderColor:       color.dim,
      backgroundColor:   'transparent',
      maxWidth:          260,
    },
    chipPressed: { opacity: 0.6 },
    chipLabel: {
      fontFamily: fontFamily.serif,
      fontSize:   15,
      color:      color.paper,
    },
  });
}
