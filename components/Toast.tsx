/**
 * Toaster — non-intrusive notification system.
 *
 * Design: neo-brutal card — face + hard offset edge layer, same structure
 * as PrimaryButton/GhostButton. No left stripe.
 *
 * Usage:
 *   showToast('Done')                     // success (default)
 *   showToast('Failed to save', 'error')
 *   showToast('Check your connection', 'alert')
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../theme/ThemeProvider';
import { type ColorSet, fontFamily, radius } from '../theme/tokens';
import { ScrawlIcon } from './ScrawlIcon';

export type ToastType = 'success' | 'error' | 'alert';

const STATE: Record<ToastType, { icon: string }> = {
  success: { icon: 'checkmark' },
  error:   { icon: 'x_mark'   },
  alert:   { icon: 'lightning' },
};

const SHOW_MS = 3000;
const DEPTH   = 4;

interface ToastSpec { id: number; message: string; type: ToastType }
let nextId = 0;
let emit: ((spec: ToastSpec) => void) | null = null;

export function showToast(message: string, type: ToastType = 'success'): void {
  emit?.({ id: ++nextId, message, type });
}

export function ToastHost() {
  const color  = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(color);

  const [spec,     setSpec]     = useState<ToastSpec | null>(null);
  const [rendered, setRendered] = useState(false);

  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-16)).current;
  const timer      = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    emit = (s) => {
      if (timer.current) clearTimeout(timer.current);
      setSpec(s);
      setRendered(true);
      opacity.setValue(0);
      translateY.setValue(-16);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, damping: 16, stiffness: 220, mass: 0.8, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
      timer.current = setTimeout(hide, SHOW_MS);
    };
    return () => { emit = null; };
  }, []);

  function hide() {
    if (timer.current) clearTimeout(timer.current);
    Animated.parallel([
      Animated.timing(translateY, { toValue: -16, duration: 200, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start(() => { setRendered(false); setSpec(null); });
  }

  if (!rendered || !spec) return null;

  const cfg = STATE[spec.type];

  return (
    <Animated.View
      style={[styles.root, { top: insets.top + 10 }, { opacity, transform: [{ translateY }] }]}
      pointerEvents="none"
    >
      {/* Neo-brutal hard offset layer (same as buttons) */}
      <View style={styles.edge} />
      {/* Face card */}
      <View style={styles.face}>
        <ScrawlIcon name={cfg.icon} size={18} color={color.paper} roughen={false} strokeWidth={2.5} />
        <Text style={styles.message} numberOfLines={2}>{spec.message}</Text>
      </View>
    </Animated.View>
  );
}

function makeStyles(color: ColorSet) {
  return StyleSheet.create({
    root: {
      position:      'absolute',
      left:          20,
      right:         20,
      zIndex:        200,
      paddingRight:  DEPTH,
      paddingBottom: DEPTH,
    },
    edge: {
      position:        'absolute',
      top:             DEPTH,
      left:            DEPTH,
      right:           0,
      bottom:          0,
      borderRadius:    radius.input,
      backgroundColor: color.border,
    },
    face: {
      flexDirection:     'row',
      alignItems:        'center',
      gap:               10,
      paddingVertical:   14,
      paddingHorizontal: 16,
      backgroundColor:   color.ink,
      borderRadius:      radius.input,
      borderWidth:       2,
      borderColor:       color.border,
    },
    message: {
      flex:       1,
      fontFamily: fontFamily.sansBold,
      fontSize:   13,
      lineHeight: 18,
      color:      color.paper,
    },
  });
}
