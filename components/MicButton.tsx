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
import { Icon } from './Icon';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from '@/lib/a11y';
import { usePalette, useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily } from '@/theme/tokens';

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
        {/* Listening turns the button yellow (palette.you), so the outline has to
            be the light one there or it vanishes in dark mode. */}
        <Icon
          name="mic"
          size={16}
          state={listening ? 'selected' : 'unselected'}
          tone={listening ? 'light' : 'auto'}
        />
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
