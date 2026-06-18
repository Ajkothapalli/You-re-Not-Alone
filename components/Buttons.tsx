import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
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

// Fixed palette — never coupled to the rotating theme palette.
const FACE: [string, string] = ['#FBBF24', '#FB7185'];
const EDGE: [string, string] = ['#B17B12', '#A83C50'];
const FACE_TEXT   = '#3A0A14'; // dark maroon — reads cleanly on amber→rose
const DEPTH       = 5;
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
    if (reduceMotion) return; // no depth travel when motion is reduced
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
    outputRange: [0, 0.14],
  });

  // `style` is an outer container so any external padding/margin never bleeds
  // into the mechanics wrapper (the edge fills it absolutely).
  return (
    <View style={style}>
      <View style={[styles.primaryWrapper, isDisabled && styles.disabled]}>
        {/* Edge — static; sits below the face in z-order */}
        <LinearGradient
          colors={EDGE}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.primaryEdge}
        />

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
            <LinearGradient
              colors={FACE}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.primaryFace}
            >
              {/* Press tint — ink darkens the face on press */}
              <Animated.View
                pointerEvents="none"
                style={[styles.tintOverlay, { opacity: tintOpacity }]}
              />
              {loading
                ? <ActivityIndicator color={FACE_TEXT} />
                : <Text style={styles.primaryLabel}>{label}</Text>}
            </LinearGradient>
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
              {/* Press tint — subtle paper lightening */}
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
    position:      'absolute',
    left:          0,
    right:         0,
    bottom:        0,
    top:           DEPTH,
    borderRadius:  radius.pill,
    shadowColor:   '#000000',
    shadowOpacity: 0.45,
    shadowRadius:  7,
    shadowOffset:  { width: 0, height: 4 },
    elevation:     8,
  },
  primaryFace: {
    borderRadius:      radius.pill,
    paddingVertical:   16,
    paddingHorizontal: 32,
    alignItems:        'center',
    justifyContent:    'center',
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
    backgroundColor: '#08070B',
    shadowColor:     '#000000',
    shadowOpacity:   0.35,
    shadowRadius:    5,
    shadowOffset:    { width: 0, height: 3 },
    elevation:       5,
  },
  ghostFace: {
    borderRadius:    radius.pill,
    paddingVertical: 14,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: '#1A1720',
    borderWidth:     1,
    borderColor:     color.line,
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
    backgroundColor: color.ink,
  },
  ghostTint: {
    backgroundColor: 'rgba(243,238,232,0.05)',
  },
  disabled: {
    opacity: 0.32,
  },
});
