/**
 * ConfessionInput — Fraunces multiline field with live character budget and
 * a full emoji picker (all categories + search + skin tones) via
 * rn-emoji-keyboard.
 *
 * Emojis are inserted at the cursor and become ordinary text, so drafts,
 * the safety pipeline, embeddings, matching, the card, and the share image
 * all treat them as content — no special handling needed. The OS keyboard's
 * emoji also still works; the ☺ button is just an in-app picker.
 */

import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import EmojiPicker, { type EmojiType } from 'rn-emoji-keyboard';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type NativeSyntheticEvent,
  type TextInputProps,
  type TextInputSelectionChangeEventData,
  View,
} from 'react-native';
import { usePalette } from '../theme/ThemeProvider';
import { color, font, fontFamily, radius } from '../theme/tokens';

const MAX_CHARS = 1000;

interface Props extends Omit<TextInputProps, 'multiline' | 'style'> {
  value:        string;
  onChangeText: (text: string) => void;
  maxChars?:    number;
  style?:       object;
}

export default function ConfessionInput({
  value, onChangeText, maxChars = MAX_CHARS, style, ...rest
}: Props) {
  const palette      = usePalette();
  const remaining    = maxChars - value.length;
  const counterColor = remaining <= 100 ? palette.you : color.dim;

  const [pickerOpen, setPickerOpen] = useState(false);
  // Last known caret; forced selection is applied only right after an insert.
  const [sel, setSel]           = useState({ start: 0, end: 0 });
  const [forceSel, setForceSel] = useState<{ start: number; end: number } | undefined>(undefined);

  function onSelectionChange(e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) {
    setSel(e.nativeEvent.selection);
    if (forceSel) setForceSel(undefined);
  }

  function insertEmoji(emoji: string) {
    if (remaining < emoji.length) return; // would exceed budget
    const start = sel.start ?? value.length;
    const end   = sel.end   ?? value.length;
    const next  = (value.slice(0, start) + emoji + value.slice(end)).slice(0, maxChars);
    onChangeText(next);
    const caret = Math.min(start + emoji.length, maxChars);
    setForceSel({ start: caret, end: caret });
    setSel({ start: caret, end: caret });
    Haptics.selectionAsync().catch(() => {});
  }

  // Dark theme for the picker, tied to the app palette.
  const emojiTheme = {
    backdrop:           '#0E0C13CC',
    knob:               palette.them,
    container:          '#1A1720',
    header:             color.dim,
    skinTonesContainer: '#241F2B',
    category: {
      icon:            color.dim,
      iconActive:      color.ink,
      container:       '#241F2B',
      containerActive: palette.them,
    },
    search: {
      text:        color.paper,
      placeholder: color.dim,
      icon:        color.dim,
      background:  '#241F2B',
    },
  };

  return (
    <View style={[styles.wrapper, style]}>
      <TextInput
        {...rest}
        style={styles.input}
        value={value}
        onChangeText={(t) => onChangeText(t.slice(0, maxChars))}
        onSelectionChange={onSelectionChange}
        selection={forceSel}
        multiline
        placeholderTextColor={color.dim}
        textAlignVertical="top"
        scrollEnabled
        accessibilityLabel="Your confession"
        accessibilityHint="Write what you can't say out loud. This stays private."
      />

      {/* Footer: emoji picker toggle + character budget */}
      <View style={styles.footerRow}>
        <Pressable
          onPress={() => setPickerOpen(true)}
          hitSlop={10}
          style={styles.toggle}
          accessibilityRole="button"
          accessibilityLabel="Emoji picker"
          accessibilityHint="Browse and insert any emoji into your confession"
        >
          <Text style={[styles.toggleFace, { color: color.dim }]}>☺</Text>
        </Pressable>
        <Text
          style={[styles.counter, { color: counterColor }]}
          accessibilityLabel={`${remaining} characters remaining`}
        >
          {remaining}
        </Text>
      </View>

      <EmojiPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onEmojiSelected={(e: EmojiType) => insertEmoji(e.emoji)}
        enableSearchBar
        enableRecentlyUsed
        categoryPosition="top"
        theme={emojiTheme}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex:            1,
    minHeight:       180,
    backgroundColor: '#1A1720',
    borderRadius:    radius.input,
    padding:         16,
  },
  input: {
    flex:       1,
    fontFamily: fontFamily.serif,
    fontSize:   font.confessionSize,
    lineHeight: font.confessionLineHeight,
    color:      color.paper,
  },
  footerRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginTop:      8,
  },
  toggle: {
    width:          30,
    height:         30,
    borderRadius:   15,
    borderWidth:    1,
    borderColor:    color.line,
    alignItems:     'center',
    justifyContent: 'center',
  },
  toggleFace: {
    fontSize:   18,
    lineHeight: 20,
  },
  counter: {
    fontFamily: fontFamily.sans,
    fontSize:   font.labelSize,
  },
});
