import * as Haptics from 'expo-haptics';
import React, { useCallback, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import { useTheme, useThemeColors } from '../theme/ThemeProvider';
import { type ColorSet, fontFamily, radius } from '../theme/tokens';
import { DURATION, EASING, SPRING } from '../theme/motion';
import { useReducedMotion } from '../lib/a11y';

// Neo-brutalism: flat electric yellow face, black hard-offset edge
const FACE_COLOR  = '#FFE500';
const EDGE_COLOR  = '#000000';
const FACE_TEXT   = '#0A0A0A';
const DEPTH       = 4;
const GHOST_DEPTH = 3;

interface ButtonProps extends PressableProps {
  label:    string;
  loading?: boolean;
  style?:   ViewStyle;
}

// One native-driver value drives face translateY + press tint opacity.
function usePressDepth(disabled?: boolean | null, reduceMotion?: boolean) {
  const press = useRef(new Animated.Value(0)).current;

  const onPressIn = useCallback(() => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (reduceMotion) return;
    Animated.timing(press, {
      toValue:         1,
      duration:        DURATION.press,
      useNativeDriver: true,
    }).start();
  }, [disabled, press, reduceMotion]);

  const onPressOut = useCallback(() => {
    Animated.spring(press, {
      toValue:         0,
      ...SPRING.pressSpring,
      useNativeDriver: true,
    }).start();
  }, [press]);

  return { press, onPressIn, onPressOut };
}

// ── PrimaryButton ────────────────────────────────────────────────────────────

export function PrimaryButton({
  label, loading, style, disabled,
  onPressIn: extPressIn, onPressOut: extPressOut,
  ...rest
}: ButtonProps) {
  const isDisabled = !!(disabled || loading);
  const reduceMotion = useReducedMotion();
  const { isDark } = useTheme();
  const { press, onPressIn, onPressOut } = usePressDepth(isDisabled, reduceMotion);
  const edgeColor  = isDark ? '#C07D00' : EDGE_COLOR;  // amber shadow on dark bg
  const faceBorder = isDark ? FACE_COLOR : EDGE_COLOR;

  const faceTranslateY = press.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, DEPTH - 1],
  });

  const tintOpacity = press.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, 0.18],
  });

  return (
    <View style={style}>
      <View style={primaryStyles.wrapper}>
        {/* Edge — black in light mode, amber in dark mode */}
        <View style={[primaryStyles.edge, { backgroundColor: edgeColor }]} />

        {/* Face — slides down on press */}
        <Pressable
          {...rest}
          disabled={isDisabled}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: isDisabled, busy: !!loading }}
          onPressIn={e  => { onPressIn();  extPressIn?.(e);  }}
          onPressOut={e => { onPressOut(); extPressOut?.(e); }}
        >
          <Animated.View style={{ transform: [{ translateY: faceTranslateY }] }}>
            <View style={[primaryStyles.face, { borderColor: faceBorder }]}>
              <Animated.View
                pointerEvents="none"
                style={[primaryStyles.tintOverlay, { opacity: tintOpacity }]}
              />
              {loading
                ? <ActivityIndicator color={FACE_TEXT} />
                : <Text style={[primaryStyles.label, isDisabled && primaryStyles.labelDisabled]}>
                    {label}
                  </Text>}
            </View>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

// ── GhostButton ──────────────────────────────────────────────────────────────

export function GhostButton({
  label, loading, style, disabled,
  onPressIn: extPressIn, onPressOut: extPressOut,
  ...rest
}: ButtonProps) {
  const isDisabled = !!(disabled || loading);
  const reduceMotion = useReducedMotion();
  const color  = useThemeColors();
  const styles = useMemo(() => createGhostStyles(color), [color]);
  const { press, onPressIn, onPressOut } = usePressDepth(isDisabled, reduceMotion);

  const faceTranslateY = press.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, GHOST_DEPTH - 1],
  });

  const tintOpacity = press.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, 1],
  });

  return (
    <View style={style}>
      <View style={[styles.wrapper, isDisabled && styles.disabled]}>
        {/* Edge */}
        <View style={styles.edge} />

        {/* Face — slides down on press */}
        <Pressable
          {...rest}
          disabled={isDisabled}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: isDisabled, busy: !!loading }}
          onPressIn={e  => { onPressIn();  extPressIn?.(e);  }}
          onPressOut={e => { onPressOut(); extPressOut?.(e); }}
        >
          <Animated.View style={{ transform: [{ translateY: faceTranslateY }] }}>
            <View style={styles.face}>
              <Animated.View
                pointerEvents="none"
                style={[styles.tintOverlay, styles.ghostTint, { opacity: tintOpacity }]}
              />
              {loading
                ? <ActivityIndicator color={color.paper} />
                : <Text style={styles.label}>{label}</Text>}
            </View>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

// ── Static styles (PrimaryButton — intentional hardcoded colors) ─────────────

const primaryStyles = StyleSheet.create({
  wrapper: {
    position:      'relative',
    paddingBottom: DEPTH,
    borderRadius:  radius.pill,
  },
  edge: {
    position:        'absolute',
    left:            0,
    right:           0,
    bottom:          0,
    top:             DEPTH,
    borderRadius:    radius.pill,
    backgroundColor: EDGE_COLOR,
  },
  face: {
    borderRadius:      radius.pill,
    paddingVertical:   16,
    paddingHorizontal: 32,
    alignItems:        'center',
    justifyContent:    'center',
    backgroundColor:   FACE_COLOR,
    borderWidth:       2,
    borderColor:       EDGE_COLOR,
    overflow:          'hidden',
  },
  label: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      14,
    letterSpacing: 0.18 * 14,
    textTransform: 'uppercase',
    color:         FACE_TEXT,
  },
  labelDisabled: {
    opacity: 0.38,
  },
  tintOverlay: {
    position:        'absolute',
    top:             0,
    left:            0,
    right:           0,
    bottom:          0,
    backgroundColor: '#000000',
  },
});

// ── Dynamic styles (GhostButton — theme-sensitive) ────────────────────────────

function createGhostStyles(color: ColorSet) {
  return StyleSheet.create({
    wrapper: {
      position:      'relative',
      paddingBottom: GHOST_DEPTH,
      borderRadius:  radius.pill,
    },
    edge: {
      position:        'absolute',
      left:            0,
      right:           0,
      bottom:          0,
      top:             GHOST_DEPTH,
      borderRadius:    radius.pill,
      backgroundColor: EDGE_COLOR,
    },
    face: {
      borderRadius:    radius.pill,
      paddingVertical: 14,
      alignItems:      'center',
      justifyContent:  'center',
      backgroundColor: color.ink,
      borderWidth:     2,
      borderColor:     color.border,
      overflow:        'hidden',
    },
    label: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      14,
      letterSpacing: 0.18 * 14,
      textTransform: 'uppercase',
      color:         color.paper,
    },
    tintOverlay: {
      position:        'absolute',
      top:             0,
      left:            0,
      right:           0,
      bottom:          0,
      backgroundColor: '#000000',
    },
    ghostTint: {
      backgroundColor: 'rgba(245,245,245,0.06)',
    },
    disabled: {
      opacity: 0.32,
    },
  });
}
