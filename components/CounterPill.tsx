/**
 * CounterPill — "{count} felt this too" in neo-brutalist solid pill.
 * Solid palette.you background, black border, dark text.
 * Mount pop: spring 0→1 driving opacity + scale 0.8→1 (native driver).
 * Optionally pressable (onPress) with a gentle press-scale.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { font, fontFamily, radius } from '../theme/tokens';
import { DURATION, SPRING } from '../theme/motion';
import { useReducedMotion } from '../lib/a11y';

interface Props {
  count:    number;
  youColor: string;
  palette:  { you: string; them: string };
  style?:   ViewStyle;
  onPress?: () => void;
}

export default function CounterPill({ count, youColor, palette, style, onPress }: Props) {
  const mount = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) { mount.setValue(1); return; }
    Animated.spring(mount, {
      toValue:         1,
      ...SPRING.pop,
      useNativeDriver: true,
    }).start();
  }, [reduceMotion]);

  const scaleAnim = Animated.multiply(
    mount.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }),
    press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.95] }),
  );

  const pill = (
    <Animated.View
      style={[
        { alignSelf: 'flex-start' },
        style,
        { opacity: mount, transform: [{ scale: scaleAnim }] },
      ]}
    >
      <View style={[styles.pill, { backgroundColor: palette.you }]}>
        <Text style={styles.label}>
          {count.toLocaleString()} felt this too
        </Text>
      </View>
    </Animated.View>
  );

  if (!onPress) return pill;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        if (reduceMotion) return;
        Animated.timing(press, { toValue: 1, duration: DURATION.press, useNativeDriver: true }).start();
      }}
      onPressOut={() =>
        Animated.spring(press, { toValue: 0, ...SPRING.pressSpring, useNativeDriver: true }).start()
      }
      hitSlop={8}
      style={{ alignSelf: 'flex-start' }}
      accessibilityRole="button"
      accessibilityLabel={`${count.toLocaleString()} people felt this too`}
      accessibilityHint="Opens supporter plans"
    >
      {pill}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius:      radius.pill,
    borderWidth:       2,
    borderColor:       '#0A0A0A',
    paddingHorizontal: 16,
    paddingVertical:   8,
  },
  label: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      font.labelSize,
    letterSpacing: font.labelLetterSpacing,
    textTransform: 'uppercase',
    color:         '#0A0A0A',
  },
});
