import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextStyle, View } from 'react-native';
import { HeartIcon } from './HeartIcon';
import { getPersona, PersonaBadge } from './Persona';
import { ScrawlIcon, iconAtOffset } from './ScrawlIcon';
import type { Palette } from '../theme/palettes';
import { useTheme } from '../theme/ThemeProvider';
import { type ColorSet, font, fontFamily, radius } from '../theme/tokens';
import { DURATION, EASING, HEARTBEAT, RISE } from '../theme/motion';
import { announce, useReducedMotion } from '../lib/a11y';

const SHADOW = 5;

interface Props {
  text:               string;
  feltCount:          number;
  palette:            Palette;
  onReport:           () => void;
  onPress?:           () => void;
  onFelt?:            () => void;
  delay?:             number;
  personaSeed:        string;
  iconSessionOffset?: number;
}

// Single character that ticks vertically whenever `felt` flips.
function TickChar({ char, isChanged, felt, reduceMotion, style }: {
  char:         string;
  isChanged:    boolean;
  felt:         boolean;
  reduceMotion: boolean;
  style:        TextStyle;
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
      Animated.timing(y,       { toValue: outY, duration: DURATION.press, easing: EASING.exit,     useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0,    duration: DURATION.press,                          useNativeDriver: true }),
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

const MAX_LINES = 6;

export default function ReadCard({ text, feltCount, palette, onReport, onPress, onFelt, delay = 0, personaSeed, iconSessionOffset = 0 }: Props) {
  const { colors: color, isDark } = useTheme();
  const styles = useMemo(() => createStyles(color), [color]);

  const [felt,        setFelt]        = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const persona = getPersona(personaSeed);
  const iconBR  = iconAtOffset(personaSeed, 0, iconSessionOffset);
  const iconTL  = iconAtOffset(personaSeed, 2, iconSessionOffset);

  const entranceAnim = useRef(new Animated.Value(0)).current;
  const feltScale    = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) { entranceAnim.setValue(1); return; }
    entranceAnim.setValue(0);
    Animated.timing(entranceAnim, {
      toValue:         1,
      duration:        DURATION.entrance,
      delay,
      easing:          EASING.enter,
      useNativeDriver: true,
    }).start();
  }, [text, reduceMotion]);

  const translateY   = entranceAnim.interpolate({ inputRange: [0, 1], outputRange: [RISE.md, 0] });
  const displayCount = feltCount + (felt ? 1 : 0);
  // Heart icon keeps palette color; text uses paper in light (not yellow-on-white)
  const heartColor  = felt ? palette.you : color.dim;
  const labelColor  = felt ? (isDark ? palette.you : color.paper) : color.dim;

  const oldStr  = feltCount.toLocaleString();
  const newStr  = (feltCount + 1).toLocaleString();
  const maxLen  = Math.max(oldStr.length, newStr.length);
  const oldPad  = oldStr.padStart(maxLen, '\0');
  const newPad  = newStr.padStart(maxLen, '\0');
  const changed = newPad.split('').map((ch, i) => ch !== oldPad[i]);

  function handleFelt() {
    const next = !felt;
    setFelt(next);
    if (next) onFelt?.();
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

  const charStyle: TextStyle = {
    fontFamily:    fontFamily.sansBold,
    fontSize:      font.labelSize,
    letterSpacing: font.labelLetterSpacing,
    textTransform: 'uppercase',
    color:         labelColor,
  };

  const displayStr        = displayCount.toLocaleString();
  const offset            = maxLen - displayStr.length;
  const changedForDisplay = displayStr.split('').map((_, i) => changed[i + offset] ?? false);

  return (
    <Animated.View style={{ opacity: entranceAnim, transform: [{ translateY }] }}>
      {/* Neo-brutalist shadow wrapper */}
      <View style={styles.outerShell}>
        {/* Hard offset shadow block */}
        <View style={[styles.shadowBlock, { backgroundColor: palette.you }]} />

        {/* Card — whole card is tappable when onPress is provided */}
        <Pressable
          onPress={onPress}
          disabled={!onPress}
          accessibilityRole={onPress ? 'button' : 'none'}
          accessibilityLabel={onPress ? `${persona.name} wrote: ${text}` : undefined}
          accessibilityHint={onPress ? 'Opens the full confession' : undefined}
          style={({ pressed }) => [styles.card, onPress && pressed && styles.cardPressed]}
        >
          {/* Scrawl decorative graphics — scattered positions */}
          <View pointerEvents="none" style={[styles.decor, { top: 14, right: 14, opacity: 0.13 }]}>
            <ScrawlIcon name={iconBR} size={44} color={color.paper} roughen />
          </View>
          <View pointerEvents="none" style={[styles.decor, { bottom: 50, left: 12, opacity: 0.10, transform: [{ rotate: '-42deg' }] }]}>
            <ScrawlIcon name={iconTL} size={36} color={color.paper} roughen />
          </View>

          <View style={styles.content}>
            <View style={styles.bodyArea}>
              <View style={styles.personaRow}>
                <PersonaBadge persona={persona} />
              </View>
              <Text
                style={styles.body}
                numberOfLines={onPress ? MAX_LINES : undefined}
                ellipsizeMode={onPress ? 'tail' : undefined}
                onTextLayout={onPress
                  ? (e) => setIsTruncated(e.nativeEvent.lines.length >= MAX_LINES)
                  : undefined}
              >
                {text}
              </Text>
              {isTruncated && onPress && (
                <Text style={styles.readMore}>read more</Text>
              )}
            </View>

            <View style={styles.spacer} />

            <View style={styles.footer}>
              <Pressable
                onPress={handleFelt}
                hitSlop={12}
                style={styles.feltRow}
                accessibilityRole="button"
                accessibilityState={{ selected: felt }}
                accessibilityLabel={`${displayCount.toLocaleString()} people felt this too`}
                accessibilityHint={felt ? 'Removes that you felt this too' : 'Adds that you felt this too'}
              >
                <Animated.View style={{ transform: [{ scale: feltScale }] }}>
                  <HeartIcon filled={felt} color={heartColor} size={18} />
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

                <Text style={[styles.feltSuffix, { color: labelColor }]}> felt this too</Text>
              </Pressable>

              <Pressable
                onPress={onReport}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Report this confession"
                accessibilityHint="Hides it and sends it for review"
              >
                <Text style={styles.reportLink}>report</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </View>
    </Animated.View>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    outerShell: {
      alignSelf:     'stretch',
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
      minHeight:       220,
      backgroundColor: color.ink,
      borderRadius:    radius.card,
      borderWidth:     2,
      borderColor:     color.border,
      overflow:        'hidden',
    },
    cardPressed: {
      opacity: 0.88,
    },
    decor: {
      position:  'absolute',
      transform: [{ rotate: '45deg' }],
    },
    content: {
      flex:    1,
      padding: 28,
    },
    bodyArea: {
      flexShrink: 1,
    },
    personaRow: {
      marginBottom: 14,
    },
    body: {
      fontFamily: fontFamily.serif,
      fontSize:   font.confessionSize,
      lineHeight: font.confessionLineHeight,
      color:      color.paper,
    },
    readMore: {
      fontFamily:         fontFamily.sans,
      fontSize:           12,
      color:              color.dim,
      textDecorationLine: 'underline',
      marginTop:          6,
    },
    spacer: {
      minHeight: 32,
      flex:      1,
    },
    footer: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'center',
      paddingTop:     16,
    },
    feltRow: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:           4,
    },
    countRow: {
      flexDirection: 'row',
      overflow:      'hidden',
    },
    feltSuffix: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      font.labelSize,
      letterSpacing: font.labelLetterSpacing,
      textTransform: 'uppercase',
    },
    reportLink: {
      fontFamily:         fontFamily.sans,
      fontSize:           12,
      color:              color.dim,
      textDecorationLine: 'underline',
    },
  });
}
