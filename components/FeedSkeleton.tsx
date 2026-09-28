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
 * Deliberately calm: a slow opacity breath, not a sweeping shimmer. This app
 * opens on people's worst days and the loading state should not be the
 * busiest thing on the screen. It stops dead under reduced motion.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, radius, spacing } from '@/theme/tokens';
import { useReducedMotion } from '@/lib/a11y';

/** Roughly a screenful. More would be invisible work. */
const CARDS = 3;

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
      {Array.from({ length: CARDS }).map((_, i) => (
        <Animated.View key={i} style={[styles.card, { opacity: pulse }]}>
          <View style={[styles.line, { width: '92%' }]} />
          <View style={[styles.line, { width: '84%' }]} />
          <View style={[styles.line, { width: '61%' }]} />
          <View style={styles.footer}>
            <View style={styles.avatar} />
            <View style={[styles.line, { width: 84, marginTop: 0 }]} />
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    wrap: { flex: 1, paddingHorizontal: spacing.screenPadding, paddingTop: 12, gap: 16 },
    card: {
      borderRadius:    radius.card,
      borderWidth:     StyleSheet.hairlineWidth,
      borderColor:     color.line,
      backgroundColor: color.ink,
      padding:         20,
      gap:             10,
    },
    line:   { height: 12, borderRadius: 6, backgroundColor: color.line },
    footer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
    avatar: { width: 27, height: 27, borderRadius: 14, backgroundColor: color.line },
  });
}
