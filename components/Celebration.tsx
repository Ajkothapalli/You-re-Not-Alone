/**
 * Celebration — the delight beat after a confession is posted.
 *
 * A radial burst of light + confetti, a luminous emblem that springs in, a
 * rotating affirmation, and a climbing "release count" that makes letting go
 * feel rewarding (and worth doing again). Milestones (every 5th) bloom bigger.
 *
 * Tone: warm and luminous, not party-popper — this fires right after someone
 * set down something heavy. Auto-advances to the match reveal; tap to skip.
 * Honours reduce-motion (no burst; emblem + words hold, then fade).
 */

import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { Palette } from '../theme/palettes';
import { color, fontFamily } from '../theme/tokens';
import { announce, useReducedMotion } from '../lib/a11y';
import { incrementReleaseCount, ordinal } from '../lib/profile';

const GOLD = '#FBBF24';

const AFFIRMATIONS = [
  'that took courage',
  'you let it out',
  'that\'s off your chest',
  'you said the hard thing',
  'braver than yesterday',
  'you set it down',
];

interface Props {
  palette: Palette;
  onDone:  () => void;
}

interface Piece {
  anim:     Animated.Value;
  angle:    number;   // radial direction
  distance: number;
  size:     number;
  bar:      boolean;  // confetti bar vs dot
  spin:     number;
  delay:    number;
  color:    string;
}

export function Celebration({ palette, onDone }: Props) {
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  const headline = useMemo(
    () => AFFIRMATIONS[Math.floor(Math.random() * AFFIRMATIONS.length)],
    [],
  );
  // Increment exactly once (lazy initializer runs a single time).
  const [count]      = useState(() => incrementReleaseCount());
  const isMilestone  = count > 0 && count % 5 === 0;
  const [shownCount, setShownCount] = useState(reduceMotion ? count : Math.max(count - 1, 0));

  const overlay  = useRef(new Animated.Value(1)).current;
  const emblem   = useRef(new Animated.Value(0)).current;  // spring in
  const pulse    = useRef(new Animated.Value(0)).current;  // ring bloom
  const textAnim = useRef(new Animated.Value(0)).current;
  const countAnim = useRef(new Animated.Value(0)).current;

  const cx = width / 2;
  const cy = height * 0.42;

  const pieces = useRef<Piece[]>(
    Array.from({ length: isMilestone ? 42 : 28 }, (_, i) => {
      const palette3 = [palette.you, palette.them, color.paper, GOLD];
      return {
        anim:     new Animated.Value(0),
        angle:    (i / (isMilestone ? 42 : 28)) * Math.PI * 2 + Math.random() * 0.4,
        distance: 120 + Math.random() * (height * 0.22),
        size:     5 + Math.random() * 6,
        bar:      i % 3 === 0,
        spin:     (Math.random() - 0.5) * 4,
        delay:    Math.random() * 120,
        color:    palette3[i % palette3.length],
      };
    }),
  ).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (isMilestone) {
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}), 180);
    }
    announce(`${headline}. Your ${ordinal(count)} confession. Someone is about to feel less alone.`);

    const finish = (delay: number) =>
      setTimeout(() => {
        Animated.timing(overlay, { toValue: 0, duration: 480, useNativeDriver: true })
          .start(({ finished }) => { if (finished) onDone(); });
      }, delay);

    if (reduceMotion) {
      emblem.setValue(1);
      textAnim.setValue(1);
      const t = finish(2400);
      return () => clearTimeout(t);
    }

    // Emblem springs in with overshoot
    Animated.spring(emblem, {
      toValue: 1, speed: 11, bounciness: 14, useNativeDriver: true,
    }).start();

    // Ring bloom pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
      { iterations: 2 },
    ).start();

    // Confetti burst
    pieces.forEach((p) => {
      Animated.sequence([
        Animated.delay(p.delay),
        Animated.timing(p.anim, {
          toValue: 1, duration: 1400 + Math.random() * 500,
          easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
      ]).start();
    });

    // Words rise, then the count climbs
    Animated.sequence([
      Animated.delay(280),
      Animated.timing(textAnim, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    Animated.sequence([
      Animated.delay(520),
      Animated.timing(countAnim, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
    ]).start();
    const countId = countAnim.addListener(({ value }) => {
      setShownCount(Math.round(Math.max(count - 1, 0) + value * 1));
    });

    const t = finish(isMilestone ? 3400 : 3000);
    return () => { clearTimeout(t); countAnim.removeListener(countId); };
  }, [reduceMotion]);

  const emblemScale = emblem.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });
  const ringScale   = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] });

  return (
    <Pressable
      style={styles.overlay}
      onPress={() => Animated.timing(overlay, { toValue: 0, duration: 260, useNativeDriver: true }).start(({ finished }) => finished && onDone())}
      accessibilityRole="button"
      accessibilityLabel={`${headline}. Tap to continue.`}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, { opacity: overlay }]}>

        {/* Confetti burst */}
        {pieces.map((p, i) => {
          const tx = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(p.angle) * p.distance] });
          const ty = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(p.angle) * p.distance + height * 0.12] });
          const op = p.anim.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 0.85, 0] });
          const rot = p.anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin * 360}deg`] });
          return (
            <Animated.View
              key={i}
              style={{
                position: 'absolute', left: cx - p.size / 2, top: cy - p.size / 2,
                width: p.bar ? p.size * 2.2 : p.size, height: p.size,
                borderRadius: p.bar ? 2 : p.size / 2,
                backgroundColor: p.color, opacity: op,
                transform: [{ translateX: tx }, { translateY: ty }, { rotate: rot }],
              }}
            />
          );
        })}

        {/* Bloom ring — expands and fades out from the emblem */}
        <Animated.View
          pointerEvents="none"
          style={{ position: 'absolute', top: cy - 46, opacity: ringOpacity, transform: [{ scale: ringScale }] }}
        >
          <Svg width={92} height={92} viewBox="0 0 92 92">
            <Circle cx={46} cy={46} r={30} stroke={palette.you} strokeWidth={2} fill="none" />
          </Svg>
        </Animated.View>

        {/* Emblem — luminous ring that springs in */}
        <Animated.View style={{ position: 'absolute', top: cy - 46, transform: [{ scale: emblemScale }] }}>
          <Svg width={92} height={92} viewBox="0 0 92 92">
            <Circle cx={46} cy={46} r={30} stroke={palette.them} strokeWidth={2.5} fill={palette.you + '22'} />
            <Circle cx={46} cy={46} r={6} fill={GOLD} />
          </Svg>
        </Animated.View>

        {/* Words */}
        <Animated.View
          style={[
            styles.textContainer,
            { opacity: textAnim, transform: [{ translateY: textAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] },
          ]}
        >
          <Text style={styles.headline}>{headline}</Text>

          {/* Climbing release count — the motivating beat */}
          <Text style={styles.countLine}>
            <Text style={[styles.countNum, { color: GOLD }]}>{shownCount}</Text>
            <Text style={styles.countRest}>
              {isMilestone ? `  things set down — a milestone` : `  ${count === 1 ? 'thing' : 'things'} set down`}
            </Text>
          </Text>

          <Text style={styles.sub}>
            {isMilestone
              ? 'you keep choosing honesty. that matters.'
              : 'someone is about to feel less alone'}
          </Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: color.ink,
    zIndex: 10,
  },
  center: { justifyContent: 'center', alignItems: 'center' },
  textContainer: { alignItems: 'center', gap: 10, marginTop: 90, paddingHorizontal: 32 },
  headline: {
    fontFamily: fontFamily.serifItalic,
    fontSize:   28,
    color:      color.paper,
    textAlign:  'center',
  },
  countLine: { textAlign: 'center' },
  countNum: {
    fontFamily: fontFamily.serif,
    fontSize:   20,
  },
  countRest: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color:         color.dim,
  },
  sub: {
    fontFamily: fontFamily.sans,
    fontSize:   13.5,
    color:      color.dim,
    textAlign:  'center',
    marginTop:  2,
  },
});
