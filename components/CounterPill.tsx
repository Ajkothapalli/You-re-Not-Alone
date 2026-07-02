/**
 * CounterPill — "{count} felt this too" in a gradient-border pill.
 * Gradient border (padding 1, inner #17131D), text and shadow in palette.you.
 * Mount pop: spring 0→1 driving opacity + scale 0.8→1 (native driver).
 * Optionally pressable (onPress) with a gentle press-scale.
 */

import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { font, fontFamily, radius } from '../theme/tokens';
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
      speed:           14,
      bounciness:      12,
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
      {/* Gradient border: gradient outer + ink inner */}
      <LinearGradient
        colors={[palette.you, palette.them]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[
          styles.outer,
          {
            shadowColor:   youColor,
            alignSelf:     'flex-start',
          },
        ]}
      >
        <View style={styles.inner}>
          <Text style={[styles.label, { color: youColor }]}>
            {count.toLocaleString()} felt this too
          </Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );

  if (!onPress) return pill;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        if (reduceMotion) return;
        Animated.timing(press, { toValue: 1, duration: 80, useNativeDriver: true }).start();
      }}
      onPressOut={() =>
        Animated.spring(press, { toValue: 0, speed: 22, bounciness: 7, useNativeDriver: true }).start()
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
  outer: {
    borderRadius:  radius.pill,
    padding:       1,
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius:  10,
    elevation:     6,
  },
  inner: {
    backgroundColor:   '#17131D',
    borderRadius:      radius.pill - 1,
    paddingHorizontal: 16,
    paddingVertical:   8,
  },
  label: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      font.labelSize,
    letterSpacing: font.labelLetterSpacing,
    textTransform: 'uppercase',
  },
});
