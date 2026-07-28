import * as Haptics from 'expo-haptics';
import React, { useCallback, useRef } from 'react';
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
import { color, fontFamily, radius } from '../theme/tokens';
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
      duration:        80,
      useNativeDriver: true,
    }).start();
  }, [disabled, press, reduceMotion]);

  const onPressOut = useCallback(() => {
    Animated.spring(press, {
      toValue:        0,
      speed:          22,
      bounciness:     7,
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
  const { press, onPressIn, onPressOut } = usePressDepth(isDisabled, reduceMotion);

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
      <View style={[styles.primaryWrapper, isDisabled && styles.disabled]}>
        {/* Edge — static black block below the face */}
        <View style={styles.primaryEdge} />

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
            <View style={styles.primaryFace}>
              <Animated.View
                pointerEvents="none"
                style={[styles.tintOverlay, { opacity: tintOpacity }]}
              />
              {loading
                ? <ActivityIndicator color={FACE_TEXT} />
                : <Text style={styles.primaryLabel}>{label}</Text>}
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
      <View style={[styles.ghostWrapper, isDisabled && styles.disabled]}>
        {/* Edge */}
        <View style={styles.ghostEdge} />

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
            <View style={styles.ghostFace}>
              <Animated.View
                pointerEvents="none"
                style={[styles.tintOverlay, styles.ghostTint, { opacity: tintOpacity }]}
              />
              {loading
                ? <ActivityIndicator color={color.paper} />
                : <Text style={styles.ghostLabel}>{label}</Text>}
            </View>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // primary
  primaryWrapper: {
    position:      'relative',
    paddingBottom: DEPTH,
    borderRadius:  radius.pill,
  },
  primaryEdge: {
    position:        'absolute',
    left:            0,
    right:           0,
    bottom:          0,
    top:             DEPTH,
    borderRadius:    radius.pill,
    backgroundColor: EDGE_COLOR,
  },
  primaryFace: {
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
  primaryLabel: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      14,
    letterSpacing: 0.18 * 14,
    textTransform: 'uppercase',
    color:         FACE_TEXT,
  },

  // ghost
  ghostWrapper: {
    position:      'relative',
    paddingBottom: GHOST_DEPTH,
    borderRadius:  radius.pill,
  },
  ghostEdge: {
    position:        'absolute',
    left:            0,
    right:           0,
    bottom:          0,
    top:             GHOST_DEPTH,
    borderRadius:    radius.pill,
    backgroundColor: EDGE_COLOR,
  },
  ghostFace: {
    borderRadius:    radius.pill,
    paddingVertical: 14,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: color.ink,
    borderWidth:     2,
    borderColor:     color.border,
    overflow:        'hidden',
  },
  ghostLabel: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      14,
    letterSpacing: 0.18 * 14,
    textTransform: 'uppercase',
    color:         color.paper,
  },

  // shared
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
