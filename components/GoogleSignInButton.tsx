/**
 * Branded "Continue with Google" button.
 *
 * Follows Google's sign-in branding guidelines:
 *   https://developers.google.com/identity/branding-guidelines
 *
 * - White (#FFFFFF) pill container, 52px tall, radius.pill corners
 * - Four-colour Google "G" logo (20×20) — exact brand colours, no substitutions
 * - Label "Continue with Google", #1F1F1F, Inter 500 / 16px
 * - Press: 0.9 opacity + 0.97 scale (timing, no colour change)
 * - Disabled: 0.4 opacity
 */
import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useReducedMotion } from '../lib/a11y';
import { radius } from '../theme/tokens';

// Official four-colour Google "G" mark paths (24-unit viewBox, widely published).
// Colours must not be modified per Google brand policy.
const G_PATHS = [
  {
    // Blue
    d: 'M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.08 3.56-5.17 3.56-8.82z',
    fill: '#4285F4',
  },
  {
    // Green
    d: 'M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.615 24 12.255 24z',
    fill: '#34A853',
  },
  {
    // Yellow
    d: 'M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 0 0 0 10.76l3.98-3.09z',
    fill: '#FBBC05',
  },
  {
    // Red
    d: 'M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.64 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z',
    fill: '#EA4335',
  },
] as const;

interface Props {
  onPress:   () => void;
  disabled?: boolean;
  loading?:  boolean;
}

export default function GoogleSignInButton({ onPress, disabled, loading }: Props) {
  const scale       = useRef(new Animated.Value(1)).current;
  const opacity     = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReducedMotion();

  function handlePressIn() {
    if (reduceMotion) return;
    Animated.parallel([
      Animated.timing(scale,   { toValue: 0.97, duration: 80, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.9,  duration: 80, useNativeDriver: true }),
    ]).start();
  }

  function handlePressOut() {
    if (reduceMotion) return;
    Animated.parallel([
      Animated.timing(scale,   { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  }

  const isDisabled = disabled || loading;

  return (
    <Animated.View style={[{ transform: [{ scale }], opacity: isDisabled ? 0.4 : opacity }]}>
      <Pressable
        onPress={isDisabled ? undefined : onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        accessibilityHint="Sign in with your Google account"
        accessibilityState={{ disabled: isDisabled }}
      >
        <Svg width={20} height={20} viewBox="0 0 24 24">
          {G_PATHS.map((p) => (
            <Path key={p.fill} d={p.d} fill={p.fill} />
          ))}
        </Svg>
        <Text style={styles.label}>Continue with Google</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    height:          52,
    borderRadius:    radius.pill,
    backgroundColor: '#FFFFFF',
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             12,
    paddingHorizontal: 24,
  },
  label: {
    fontFamily:  'Inter_600SemiBold',
    fontSize:    16,
    color:       '#1F1F1F',
    letterSpacing: 0.1,
  },
});
