/**
 * ConfessionInput — Fraunces multiline text field with live character budget.
 * Background: #1A1720 (ink-raised surface), 16 px radius.
 * Counter turns amber (#F5996E) when ≤ 100 chars remaining.
 */

import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { color, font, fontFamily, radius } from '../theme/tokens';

const MAX_CHARS = 1000;

interface Props extends Omit<TextInputProps, 'multiline' | 'style'> {
  value:         string;
  onChangeText:  (text: string) => void;
  maxChars?:     number;
}

export default function ConfessionInput({
  value,
  onChangeText,
  maxChars = MAX_CHARS,
  ...rest
}: Props) {
  const remaining = maxChars - value.length;
  const counterColor = remaining <= 100 ? '#F5996E' : color.dim;

  return (
    <View style={styles.wrapper}>
      <TextInput
        {...rest}
        style={styles.input}
        value={value}
        onChangeText={(t) => onChangeText(t.slice(0, maxChars))}
        multiline
        placeholderTextColor={color.dim}
        textAlignVertical="top"
        scrollEnabled={false}
      />
      <Text style={[styles.counter, { color: counterColor }]}>{remaining}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#1A1720',
    borderRadius:    radius.input,
    padding:         16,
    minHeight:       180 + 16 + 16, // input + top/bottom padding
  },
  input: {
    fontFamily: fontFamily.serif,
    fontSize:   font.confessionSize,
    lineHeight: font.confessionLineHeight,
    color:      color.paper,
    minHeight:  180,
  },
  counter: {
    fontFamily: fontFamily.sans,
    fontSize:   font.labelSize,
    textAlign:  'right',
    marginTop:  8,
  },
});
