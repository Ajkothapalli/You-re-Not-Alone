/**
 * Toaster — non-intrusive notification system.
 *
 * States: success | error | alert
 * Design: card with a left accent stripe, no offset shadow (avoids button look),
 *         slides down from the top of the screen.
 *
 * Usage:
 *   showToast('Done')                     // success (default)
 *   showToast('Failed to save', 'error')
 *   showToast('Check your connection', 'alert')
 *
 * Mount <ToastHost /> once in _layout.tsx (outside the Stack, inside ThemeProvider).
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../theme/ThemeProvider';
import { type ColorSet, fontFamily, radius } from '../theme/tokens';
import { ScrawlIcon } from './ScrawlIcon';

// ─── Public types ──────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'alert';

// ─── State config ──────────────────────────────────────────────────────────────

const STATE: Record<ToastType, { icon: string; accent: string; label: string }> = {
  success: { icon: 'checkmark', accent: '#22C55E', label: 'Success' },
  error:   { icon: 'x_mark',   accent: '#EF4444', label: 'Error'   },
  alert:   { icon: 'lightning', accent: '#F59E0B', label: 'Alert'   },
};

const SHOW_MS = 3000;

// ─── Singleton emitter ─────────────────────────────────────────────────────────

interface ToastSpec { id: number; message: string; type: ToastType }
let nextId = 0;
let emit: ((spec: ToastSpec) => void) | null = null;

export function showToast(message: string, type: ToastType = 'success'): void {
  emit?.({ id: ++nextId, message, type });
}

// ─── ToastHost ─────────────────────────────────────────────────────────────────

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
      <View style={styles.card}>
        {/* Left accent stripe — communicates state without blocking touches */}
        <View style={[styles.stripe, { backgroundColor: cfg.accent }]} />
        <View style={styles.body}>
          <ScrawlIcon name={cfg.icon} size={18} color={cfg.accent} roughen={false} strokeWidth={2.5} />
          <Text style={styles.message} numberOfLines={2}>{spec.message}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(color: ColorSet) {
  return StyleSheet.create({
    root: {
      position: 'absolute',
      left:     20,
      right:    20,
      zIndex:   200,
    },
    card: {
      flexDirection:   'row',
      backgroundColor: color.ink,
      borderRadius:    radius.input,
      borderWidth:     2,
      borderColor:     color.border,
      overflow:        'hidden',
    },
    stripe: {
      width: 5,
    },
    body: {
      flex:              1,
      flexDirection:     'row',
      alignItems:        'center',
      gap:               10,
      paddingVertical:   14,
      paddingHorizontal: 16,
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
