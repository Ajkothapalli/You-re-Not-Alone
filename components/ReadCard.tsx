import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, TextStyle, View } from 'react-native';
import { WaveBackground } from './ConfessionCard';
import { HeartIcon } from './HeartIcon';
import { getPersona, PersonaBadge } from './Persona';
import type { Palette } from '../theme/palettes';
import { color, font, fontFamily } from '../theme/tokens';
import { announce, useReducedMotion } from '../lib/a11y';

interface Props {
  text:        string;
  feltCount:   number;
  palette:     Palette;
  onReport:    () => void;
  onPress?:    () => void;
  onFelt?:     () => void;  // called once when the user first taps felt (for event logging)
  delay?:      number;
  personaSeed: string;   // confession id — NEVER anything author-derived
}

// Single character that ticks vertically whenever `felt` flips (if isChanged).
// Direction: felt=true → slides up (count going up); felt=false → slides down.
function TickChar({ char, isChanged, felt, reduceMotion, style }: {
  char:        string;
  isChanged:   boolean;
  felt:        boolean;
  reduceMotion: boolean;
  style:       TextStyle;
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
      Animated.timing(y,       { toValue: outY, duration: 80, easing: Easing.in(Easing.quad),  useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0,    duration: 80,                                    useNativeDriver: true }),
    ]).start(() => {
      y.setValue(inY);
      Animated.parallel([
        Animated.timing(y,       { toValue: 0, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 120,                                   useNativeDriver: true }),
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

export default function ReadCard({ text, feltCount, palette, onReport, onPress, onFelt, delay = 0, personaSeed }: Props) {
  const [felt,        setFelt]        = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const persona = getPersona(personaSeed);

  const entranceAnim = useRef(new Animated.Value(0)).current;
  const feltScale    = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) { entranceAnim.setValue(1); return; }
    entranceAnim.setValue(0);
    Animated.timing(entranceAnim, {
      toValue:         1,
      duration:        600,
      delay,
      easing:          Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [text, reduceMotion]);

  const translateY   = entranceAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });
  const displayCount = feltCount + (felt ? 1 : 0);
  const labelColor   = felt ? palette.you : color.dim;

  // Which character positions differ between feltCount and feltCount+1 (static).
  const oldStr  = feltCount.toLocaleString();
  const newStr  = (feltCount + 1).toLocaleString();
  const maxLen  = Math.max(oldStr.length, newStr.length);
  const oldPad  = oldStr.padStart(maxLen, '\0');
  const newPad  = newStr.padStart(maxLen, '\0');
  const changed = newPad.split('').map((ch, i) => ch !== oldPad[i]);

  function handleFelt() {
    const next = !felt;
    setFelt(next);
    if (next) onFelt?.(); // notify once on first tap (not on un-felt)
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
      // Lub-dub heartbeat
      Animated.sequence([
        Animated.timing(feltScale, { toValue: 1.4,  duration: 100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(feltScale, { toValue: 0.88, duration: 80,  easing: Easing.in(Easing.quad),  useNativeDriver: true }),
        Animated.timing(feltScale, { toValue: 1.2,  duration: 90,  easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(feltScale, { toValue: 1.0,  duration: 150, easing: Easing.in(Easing.quad),  useNativeDriver: true }),
      ]).start();
    } else {
      Haptics.selectionAsync().catch(() => {});
      // Deflate
      Animated.sequence([
        Animated.timing(feltScale, { toValue: 0.65, duration: 120, easing: Easing.in(Easing.quad),  useNativeDriver: true }),
        Animated.timing(feltScale, { toValue: 1.0,  duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
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
    <Animated.View
      style={[
        styles.card,
        { opacity: entranceAnim, transform: [{ translateY }] },
      ]}
    >
      <WaveBackground bands={palette.bands} />
      <View style={styles.content}>
        {/* Tappable body area — navigates to full text when truncated */}
        <Pressable
          onPress={onPress}
          disabled={!onPress}
          style={styles.bodyArea}
          accessibilityRole={onPress ? 'button' : 'text'}
          accessibilityLabel={`${persona.name} wrote: ${text}`}
          accessibilityHint={onPress ? 'Opens the full confession' : undefined}
        >
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
        </Pressable>

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
              <HeartIcon filled={felt} color={labelColor} size={18} />
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf:       'stretch',
    minHeight:       220,
    backgroundColor: color.ink,
    borderRadius:    26,
    overflow:        'hidden',
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
