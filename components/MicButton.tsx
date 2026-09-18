/**
 * MicButton — the dictation control, in the compose field's footer next to the
 * emoji picker.
 *
 * Quiet by design. It is not announced as a feature, it carries no badge, and
 * nothing here says "AI" or "beta": it is a way of saying the thing instead of
 * typing it. While listening it fills with the palette's accent and pulses
 * slowly, so "it is hearing me" is legible at a glance without a countdown, a
 * waveform, or a level meter dancing at someone mid-sentence.
 *
 * Renders nothing at all when dictation is unavailable — a dead mic on this
 * screen would be a small cruelty of its own.
 */

import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { useReducedMotion } from '@/lib/a11y';
import { usePalette, useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily } from '@/theme/tokens';

/**
 * Drawn here rather than added to ScrawlIcon's set.
 *
 * That set is not just a lookup: iconAtOffset() indexes into it by a hash of
 * the confession id modulo the pool SIZE, so appending a 104th icon silently
 * re-rolls the decorative icons on every card in the app. Same house style
 * (48×48, 2.5 round stroke, no fill), no pool.
 */
function MicGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path
        d="M18 12C18 8 21 5 24 5C27 5 30 8 30 12V22C30 26 27 29 24 29C21 29 18 26 18 22V12Z"
        stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M12 22C12 29 17 35 24 35C31 35 36 29 36 22"
        stroke={color} strokeWidth="2.5" strokeLinecap="round"
      />
      <Path d="M24 35V42" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <Path d="M17 42H31" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </Svg>
  );
}

export interface MicButtonProps {
  available: boolean;
  listening: boolean;
  onStart:   () => void;
  onStop:    () => void;
}

export default function MicButton({ available, listening, onStart, onStop }: MicButtonProps) {
  const palette      = usePalette();
  const color        = useThemeColors();
  const reduceMotion = useReducedMotion();
  const pulse        = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!listening || reduceMotion) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [listening, reduceMotion, pulse]);

  if (!available) return null;

  const styles = createStyles(color);

  return (
    <View style={styles.row}>
      <Animated.View
        style={[
          styles.halo,
          {
            backgroundColor: palette.you,
            opacity:   listening ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.42] }) : 0,
            transform: [{ scale: listening ? pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) : 1 }],
          },
        ]}
        pointerEvents="none"
      />
      <Pressable
        testID="mic-button"
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          listening ? onStop() : onStart();
        }}
        hitSlop={12}
        style={[styles.button, listening && { backgroundColor: palette.you, borderColor: color.border }]}
        accessibilityRole="button"
        accessibilityState={{ selected: listening }}
        accessibilityLabel={listening ? 'Stop speaking' : 'Say it out loud'}
        accessibilityHint={
          listening
            ? 'Stops dictation. Your words stay in the field and can be edited.'
            : 'Speak instead of typing. Your voice is turned into text on this device and never saved.'
        }
      >
        <MicGlyph size={16} color={listening ? color.border : color.dim} />
      </Pressable>
      {listening && (
        <Text style={styles.label} accessibilityLiveRegion="polite">
          Listening
        </Text>
      )}
    </View>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:           8,
    },
    halo: {
      position:     'absolute',
      left:         -3,
      top:          -3,
      width:        36,
      height:       36,
      borderRadius: 18,
    },
    button: {
      width:           30,
      height:          30,
      borderRadius:    15,
      borderWidth:     2,
      borderColor:     color.line,
      alignItems:      'center',
      justifyContent:  'center',
      backgroundColor: 'transparent',
    },
    label: {
      fontFamily: fontFamily.sans,
      fontSize:   12,
      color:      color.dim,
    },
  });
}
