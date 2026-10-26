/**
 * [S2] "N felt this too" — the heart, the ticking count, and the heartbeat.
 *
 * Pulled out of ReadCard as its own component.
 *
 * It was extracted so the deck and the list could share ONE heart. The deck
 * was removed on 2026-10-01 and ReadCard is the only caller again — but the
 * extraction is kept, because the episode that produced it is the argument
 * for it: for one draft this was a COPY of ReadCard's heart, and it had
 * already drifted to 13px plain text against ReadCard's 11px uppercase
 * label type. Nobody would have filed that as a bug; they would have said
 * the heart looks different. One implementation, wherever it ends up used.
 *
 * ── Why the count animates the way it does ──────────────────────────────────
 * Each CHARACTER that changes ticks vertically, the others stay put. So 99 →
 * 100 moves three digits and 41 → 42 moves one. A whole-number crossfade
 * would read as the number being replaced; this reads as it going up, which
 * is what actually happened.
 */

import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { HeartIcon } from './HeartIcon';
import type { Palette } from '../theme/palettes';
import { useTheme } from '../theme/ThemeProvider';
import { type ColorSet, font, fontFamily } from '../theme/tokens';
import { DURATION, EASING, HEARTBEAT } from '../theme/motion';
import { announce, useReducedMotion } from '../lib/a11y';

/** Single character that ticks vertically whenever `felt` flips. */
function TickChar({ char, isChanged, felt, reduceMotion, style }: {
  char: string; isChanged: boolean; felt: boolean;
  reduceMotion: boolean; style: TextStyle;
}) {
  const hasMounted = useRef(false);
  const y          = useRef(new Animated.Value(0)).current;
  const opacity    = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!hasMounted.current) { hasMounted.current = true; return; }
    if (!isChanged || reduceMotion) return;

    const outY = felt ? -10 : 10;
    const inY  = felt ?  10 : -10;

    Animated.parallel([
      Animated.timing(y,       { toValue: outY, duration: DURATION.press, easing: EASING.exit, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0,    duration: DURATION.press,                      useNativeDriver: true }),
    ]).start(() => {
      y.setValue(inY);
      Animated.parallel([
        Animated.timing(y,       { toValue: 0, duration: DURATION.quick, easing: EASING.standard, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: DURATION.quick,                          useNativeDriver: true }),
      ]).start();
    });
  }, [felt]);

  return (
    <Animated.Text style={[style, { transform: [{ translateY: y }], opacity }]}>
      {char}
    </Animated.Text>
  );
}

export interface FeltButtonProps {
  confessionId: string;
  feltCount:    number;
  palette:      Palette;
  onFelt?:      (id: string) => void;
  /** Callers that draw the heart larger than the feed card does. */
  size?:        number;
}

export default function FeltButton({
  confessionId, feltCount, palette, onFelt, size = 18,
}: FeltButtonProps) {
  const { colors: color, isDark } = useTheme();
  const styles = React.useMemo(() => createStyles(color), [color]);
  const reduceMotion = useReducedMotion();

  const [felt, setFelt] = useState(false);
  const feltScale = useRef(new Animated.Value(1)).current;

  const displayCount = feltCount + (felt ? 1 : 0);
  const labelColor   = felt ? (isDark ? palette.you : color.paper) : color.dim;

  // Which digits actually change, so only those tick.
  const oldStr  = feltCount.toLocaleString();
  const newStr  = (feltCount + 1).toLocaleString();
  const maxLen  = Math.max(oldStr.length, newStr.length);
  const oldPad  = oldStr.padStart(maxLen, '\0');
  const newPad  = newStr.padStart(maxLen, '\0');
  const changed = newPad.split('').map((ch, i) => ch !== oldPad[i]);

  // `changed` is indexed against the PADDED pair; the rendered string can be
  // shorter than that (99 shown, 100 pending). Line them up from the right.
  const displayStr        = displayCount.toLocaleString();
  const offset            = maxLen - displayStr.length;
  const changedForDisplay = displayStr.split('').map((_, i) => changed[i + offset] ?? false);

  const charStyle: TextStyle = { ...styles.count, color: labelColor };

  function handleFelt() {
    const next = !felt;
    setFelt(next);
    if (next) onFelt?.(confessionId);
    announce(next
      ? `Added. ${(feltCount + 1).toLocaleString()} people felt this too.`
      : 'Removed.');

    if (reduceMotion) {
      if (next) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      else Haptics.selectionAsync().catch(() => {});
      return;
    }

    if (next) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      Animated.sequence(
        HEARTBEAT.map(([toValue, duration, easing]) =>
          Animated.timing(feltScale, { toValue, duration, easing, useNativeDriver: true }),
        ),
      ).start();
    } else {
      Haptics.selectionAsync().catch(() => {});
      Animated.sequence([
        Animated.timing(feltScale, { toValue: 0.65, duration: DURATION.quick, easing: EASING.exit,     useNativeDriver: true }),
        Animated.timing(feltScale, { toValue: 1.0,  duration: DURATION.base,  easing: EASING.standard, useNativeDriver: true }),
      ]).start();
    }
  }

  return (
    <Pressable
      onPress={handleFelt}
      hitSlop={12}
      style={styles.row}
      accessibilityRole="button"
      accessibilityState={{ selected: felt }}
      accessibilityLabel={`${displayCount.toLocaleString()} people felt this too`}
      accessibilityHint={felt ? 'Removes that you felt this too' : 'Adds that you felt this too'}
      // ReadCard's confessionId is optional, and `felt-` is not an id.
      testID={confessionId ? `felt-${confessionId}` : undefined}
    >
      <Animated.View style={{ transform: [{ scale: feltScale }] }}>
        <HeartIcon filled={felt} size={size} />
      </Animated.View>

      <View style={styles.countRow}>
        {displayStr.split('').map((ch, i) => (
          <TickChar
            key={i}
            char={ch}
            isChanged={changedForDisplay[i]}
            felt={felt}
            reduceMotion={reduceMotion}
            style={charStyle}
          />
        ))}
      </View>

      <Text style={[styles.suffix, { color: labelColor }]}> felt this too</Text>
    </Pressable>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    row:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
    // overflow:hidden is what clips a digit mid-tick instead of letting it
    // slide out over the heart.
    countRow: { flexDirection: 'row', overflow: 'hidden' },
    // Label type — the same 11px uppercase the rest of the card's furniture
    // uses. Not a decision this component gets to make on its own.
    count: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      font.labelSize,
      letterSpacing: font.labelLetterSpacing,
      textTransform: 'uppercase',
    },
    suffix: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      font.labelSize,
      letterSpacing: font.labelLetterSpacing,
      textTransform: 'uppercase',
    },
  });
}
