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
import React, { useMemo, useState } from 'react';
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
import { usePalette, useThemeColors } from '../theme/ThemeProvider';
import { type ColorSet, font, fontFamily, radius } from '../theme/tokens';

const MAX_CHARS = 1000;
const SHADOW    = 4;

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
  const color        = useThemeColors();
  const styles       = useMemo(() => createStyles(color), [color]);
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

  const emojiTheme = {
    backdrop:           color.bg + 'CC',
    knob:               palette.them,
    container:          color.ink,
    header:             color.dim,
    skinTonesContainer: color.bg,
    category: {
      icon:            color.dim,
      iconActive:      color.bg,
      container:       color.bg,
      containerActive: palette.them,
    },
    search: {
      text:        color.paper,
      placeholder: color.dim,
      icon:        color.dim,
      background:  color.bg,
    },
  };

  return (
    <View style={[styles.outerShell, style]}>
      <View pointerEvents="none" style={styles.shadowBlock} />
      <View style={styles.wrapper}>
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
    </View>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    outerShell: {
      paddingRight:  SHADOW,
      paddingBottom: SHADOW,
    },
    shadowBlock: {
      position:     'absolute',
      top:          SHADOW,
      left:         SHADOW,
      right:        0,
      bottom:       0,
      borderRadius: radius.input,
      backgroundColor: color.border,
    },
    wrapper: {
      flex:            1,
      minHeight:       180,
      backgroundColor: color.ink,
      borderRadius:    radius.input,
      borderWidth:     2,
      borderColor:     color.border,
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
      alignItems:     'center',
      justifyContent: 'center',
    },
    toggleFace: {
      fontSize:           18,
      lineHeight:         30,
      includeFontPadding: false,
    },
    counter: {
      fontFamily: fontFamily.sans,
      fontSize:   font.labelSize,
    },
  });
}
