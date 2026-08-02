/**
 * Celebration — the delight beat after a confession is posted.
 *
 * Confetti bursts from the screen centre (absolute layer).
 * Emblem + text sit in a centred flex column — no absolute overlap.
 * Auto-advances to the match reveal; tap to skip.
 * Honours reduce-motion (no burst; emblem + words hold, then fade).
 */

import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import type { Palette } from '../theme/palettes';
import { useThemeColors } from '../theme/ThemeProvider';
import { type ColorSet, fontFamily } from '../theme/tokens';
import { announce, useReducedMotion } from '../lib/a11y';
import { DURATION, EASING, SPRING } from '../theme/motion';
import { Bust, getPersonaById } from '../components/Persona';
import { getProfileSync, incrementReleaseCount, ordinal } from '../lib/profile';

// Mustard — visible on both light and dark backgrounds (~4.5:1 on white)
const MUSTARD = '#C07D00';

const AFFIRMATIONS = [
  'that took courage',
  'you let it out',
  "that's off your chest",
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
  angle:    number;
  distance: number;
  size:     number;
  bar:      boolean;
  spin:     number;
  delay:    number;
  color:    string;
}

export function Celebration({ palette, onDone }: Props) {
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);

  const persona            = getPersonaById(getProfileSync().personaId);
  const [tint, skin, hair] = persona.colors;

  const headline = useMemo(
    () => AFFIRMATIONS[Math.floor(Math.random() * AFFIRMATIONS.length)],
    [],
  );

  const [count]     = useState(() => incrementReleaseCount());
  const isMilestone = count > 0 && count % 5 === 0;
  const [shownCount, setShownCount] = useState(reduceMotion ? count : Math.max(count - 1, 0));

  const overlay   = useRef(new Animated.Value(1)).current;
  const emblem    = useRef(new Animated.Value(0)).current;
  const pulse     = useRef(new Animated.Value(0)).current;
  const textAnim  = useRef(new Animated.Value(0)).current;
  const countAnim = useRef(new Animated.Value(0)).current;
  const float     = useRef(new Animated.Value(0)).current;

  // Confetti bursts from the visible centre of the overlay
  const cx = width / 2;
  const cy = height * 0.38;

  const pieces = useRef<Piece[]>(
    Array.from({ length: isMilestone ? 42 : 28 }, (_, i) => {
      const palette3 = [palette.you, palette.them, color.paper, MUSTARD];
      return {
        anim:     new Animated.Value(0),
        angle:    (i / (isMilestone ? 42 : 28)) * Math.PI * 2 + Math.random() * 0.4,
        distance: 100 + Math.random() * (height * 0.20),
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
        Animated.timing(overlay, { toValue: 0, duration: DURATION.gentle, easing: EASING.exit, useNativeDriver: true })
          .start(({ finished }) => { if (finished) onDone(); });
      }, delay);

    if (reduceMotion) {
      emblem.setValue(1);
      textAnim.setValue(1);
      const t = finish(2400);
      return () => clearTimeout(t);
    }

    Animated.spring(emblem, {
      toValue: 1, ...SPRING.pop, useNativeDriver: true,
    }).start();

    // Gentle floating bob — starts once the spring settles
    Animated.sequence([
      Animated.delay(600),
      Animated.loop(
        Animated.sequence([
          Animated.timing(float, { toValue: 1, duration: DURATION.count, easing: EASING.breathe, useNativeDriver: true }),
          Animated.timing(float, { toValue: 0, duration: DURATION.count, easing: EASING.breathe, useNativeDriver: true }),
        ])
      ),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: DURATION.breath, easing: EASING.enter, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: DURATION.instant, useNativeDriver: true }),
      ]),
      { iterations: 2 },
    ).start();

    pieces.forEach((p) => {
      Animated.sequence([
        Animated.delay(p.delay),
        Animated.timing(p.anim, {
          toValue: 1, duration: 1400 + Math.random() * 500,
          easing: EASING.enter, useNativeDriver: true,
        }),
      ]).start();
    });

    Animated.sequence([
      Animated.delay(280),
      Animated.timing(textAnim, { toValue: 1, duration: DURATION.entrance, easing: EASING.enter, useNativeDriver: true }),
    ]).start();

    Animated.sequence([
      Animated.delay(520),
      Animated.timing(countAnim, { toValue: 1, duration: DURATION.entrance, easing: EASING.enter, useNativeDriver: false }),
    ]).start();
    const countId = countAnim.addListener(({ value }) => {
      setShownCount(Math.round(Math.max(count - 1, 0) + value * 1));
    });

    const t = finish(isMilestone ? 3400 : 3000);
    return () => { clearTimeout(t); countAnim.removeListener(countId); };
  }, [reduceMotion]);

  const emblemScale = emblem.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });
  const ringScale   = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.45, 0] });
  const floatY      = float.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });

  return (
    <Pressable
      style={styles.overlay}
      onPress={() =>
        Animated.timing(overlay, { toValue: 0, duration: DURATION.base, easing: EASING.exit, useNativeDriver: true })
          .start(({ finished }) => finished && onDone())
      }
      accessibilityRole="button"
      accessibilityLabel={`${headline}. Tap to continue.`}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: overlay }]}>

        {/* ── Confetti — absolute burst from centre ── */}
        {pieces.map((p, i) => {
          const tx  = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(p.angle) * p.distance] });
          const ty  = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(p.angle) * p.distance] });
          const op  = p.anim.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 0.85, 0] });
          const rot = p.anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin * 360}deg`] });
          return (
            <Animated.View
              key={i}
              pointerEvents="none"
              style={{
                position:        'absolute',
                left:            cx - p.size / 2,
                top:             cy - p.size / 2,
                width:           p.bar ? p.size * 2.2 : p.size,
                height:          p.size,
                borderRadius:    p.bar ? 2 : p.size / 2,
                backgroundColor: p.color,
                opacity:         op,
                transform:       [{ translateX: tx }, { translateY: ty }, { rotate: rot }],
              }}
            />
          );
        })}

        {/* ── Centred content column: emblem → text ── */}
        <View style={styles.column}>

          {/* Emblem wrapper — ring and character overlap; text block sits below in flex */}
          <View style={styles.emblemWrap}>
            {/* Ground shadow stays grounded while character floats above */}
            <View pointerEvents="none" style={styles.groundShadow} />

            {/* Float layer — ring + disc bob together */}
            <Animated.View style={[StyleSheet.absoluteFill, styles.centred, { transform: [{ translateY: floatY }] }]}>

              {/* Bloom pulse ring */}
              <Animated.View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, styles.centred, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
              >
                <Svg width={140} height={140} viewBox="0 0 140 140">
                  <Circle cx={70} cy={70} r={46} stroke={palette.you} strokeWidth={2} fill="none" />
                </Svg>
              </Animated.View>

              {/* Character disc — springs in, Blender clay aesthetic */}
              <Animated.View style={{ transform: [{ scale: emblemScale }] }}>
                {/* Outer: shadow + border-radius without overflow:hidden */}
                <View style={styles.clayOuter}>
                  {/* Inner: clips character to circle */}
                  <View style={[styles.clayInner, { backgroundColor: tint }]}>
                    {/* Specular gradient — diffuse top-left light hitting the clay */}
                    <Svg style={StyleSheet.absoluteFill} width={120} height={120} viewBox="0 0 120 120">
                      <Defs>
                        <RadialGradient id="spec" cx="35%" cy="28%" r="55%">
                          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.55} />
                          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
                        </RadialGradient>
                      </Defs>
                      <Circle cx={60} cy={60} r={60} fill="url(#spec)" />
                      {/* Rim light — bright crescent top-right, classic 3-point lighting */}
                      <Ellipse cx={90} cy={20} rx={22} ry={9} fill="white" opacity={0.18} transform="rotate(-28 90 20)" />
                    </Svg>

                    {/* User's chosen character */}
                    <Svg style={StyleSheet.absoluteFill} width={120} height={120} viewBox="0 0 24 24">
                      <Bust id={persona.id} skin={skin} hair={hair} />
                    </Svg>
                  </View>
                </View>
              </Animated.View>

            </Animated.View>
          </View>

          {/* Text block */}
          <Animated.View
            style={[
              styles.textBlock,
              {
                opacity:   textAnim,
                transform: [{ translateY: textAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
              },
            ]}
          >
            <Text style={styles.headline}>{headline}</Text>

            <View style={styles.countRow}>
              <Text style={styles.countNum}>{shownCount}</Text>
              <Text style={styles.countLabel}>
                {isMilestone
                  ? ` ${count === 1 ? 'thing' : 'things'} set down — a milestone`
                  : ` ${count === 1 ? 'thing' : 'things'} set down`}
              </Text>
            </View>

            <Text style={styles.sub}>
              {isMilestone
                ? 'you keep choosing honesty. that matters.'
                : 'someone is about to feel less alone'}
            </Text>
          </Animated.View>

        </View>

      </Animated.View>
    </Pressable>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: color.ink,
      zIndex: 10,
    },
    root: {
      justifyContent: 'center',
      alignItems:     'center',
    },
    // Flex column — emblem sits directly above text, never overlapping
    column: {
      alignItems: 'center',
      gap:        28,
      paddingHorizontal: 32,
    },
    emblemWrap: {
      width:  140,
      height: 140,
    },
    centred: {
      alignItems:     'center',
      justifyContent: 'center',
    },
    groundShadow: {
      position:        'absolute',
      bottom:          4,
      alignSelf:       'center',
      width:           88,
      height:          18,
      borderRadius:    44,
      backgroundColor: 'rgba(0,0,0,0.2)',
    },
    clayOuter: {
      width:         120,
      height:        120,
      borderRadius:  60,
      shadowColor:   '#000',
      shadowOffset:  { width: 0, height: 10 },
      shadowOpacity: 0.28,
      shadowRadius:  18,
      elevation:     20,
    },
    clayInner: {
      width:        120,
      height:       120,
      borderRadius: 60,
      overflow:     'hidden',
    },
    textBlock: {
      alignItems: 'center',
      gap:        10,
    },
    headline: {
      fontFamily: fontFamily.sansBold,
      fontSize:   30,
      lineHeight: 38,
      color:      color.paper,
      textAlign:  'center',
    },
    countRow: {
      flexDirection: 'row',
      alignItems:    'baseline',
      flexWrap:      'wrap',
      justifyContent: 'center',
    },
    countNum: {
      fontFamily: fontFamily.sansBold,
      fontSize:   22,
      color:      MUSTARD,           // ~4.5:1 on white, passes AA
    },
    countLabel: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      12,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color:         color.paper,    // high contrast in both themes
    },
    sub: {
      fontFamily: fontFamily.sans,
      fontSize:   14,
      lineHeight: 21,
      color:      color.paper,       // was color.dim — now AA-compliant
      textAlign:  'center',
      opacity:    0.65,
    },
  });
}
