/**
 * PrimaryButton  — paper fill, ink text, pill radius.
 * GhostButton    — transparent bg, line border, paper text.
 * Both use Inter 600 15 px uppercase labels and support a loading state.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import { color, fontFamily, radius } from '../theme/tokens';

interface ButtonProps extends PressableProps {
  label:    string;
  loading?: boolean;
  style?:   ViewStyle;
}

const LABEL_STYLE = {
  fontFamily:    fontFamily.sansBold,
  fontSize:      15,
  letterSpacing: 0.18 * 15,
  textTransform: 'uppercase' as const,
};

export function PrimaryButton({ label, loading, style, disabled, ...rest }: ButtonProps) {
  return (
    <Pressable
      {...rest}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.primary,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator color={color.ink} />
        : <Text style={[LABEL_STYLE, { color: color.ink }]}>{label}</Text>}
    </Pressable>
  );
}

export function GhostButton({ label, loading, style, disabled, ...rest }: ButtonProps) {
  return (
    <Pressable
      {...rest}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.ghost,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator color={color.paper} />
        : <Text style={[LABEL_STYLE, { color: color.paper }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primary: {
    backgroundColor: color.paper,
    borderRadius:    radius.pill,
    paddingVertical: 16,
    alignItems:      'center',
    justifyContent:  'center',
  },
  ghost: {
    borderRadius:    radius.pill,
    borderWidth:     StyleSheet.hairlineWidth,
    borderColor:     color.line,
    paddingVertical: 14,
    alignItems:      'center',
    justifyContent:  'center',
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.8,
  },
});
