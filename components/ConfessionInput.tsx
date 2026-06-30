/**
 * ConfessionInput — Fraunces multiline field with live character budget,
 * full emoji picker (all categories + search + skin tones) via rn-emoji-keyboard,
 * and on-device voice typing via expo-speech-recognition.
 *
 * Voice safety invariants:
 *  - ON-DEVICE recognition ONLY (requiresOnDeviceRecognition: true).
 *    Audio is never recorded to disk, never persisted, and never sent to any
 *    server or cloud STT service. If on-device recognition is unavailable,
 *    the mic button is hidden — no cloud fallback.
 *  - Dictated text still hits the server-side moderation + crisis + embedding
 *    pipeline on submission. No audio ever leaves the device.
 *  - onVoiceInsert is used instead of onTextChange so the authorship tracker
 *    never counts a dictation segment as a paste, even mid-composition.
 */

import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Path, Rect, Svg } from 'react-native-svg';
import EmojiPicker, { type EmojiType } from 'rn-emoji-keyboard';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
  type TextInputProps,
  type TextInputSelectionChangeEventData,
  View,
} from 'react-native';
import { usePalette } from '../theme/ThemeProvider';
import { color, font, fontFamily, radius } from '../theme/tokens';
import { createAuthorshipTracker, type AuthorshipPayload } from '../lib/authorship';

// expo-speech-recognition requires a native build; requireNativeModule throws
// in Expo Go when the module isn't linked. Try-require keeps Expo Go safe.
let SpeechModule: any = null;
try {
  SpeechModule = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
} catch { /* Expo Go: native module not available */ }

const VOICE_SUPPORTED = SpeechModule != null;

// Custom hook — always called unconditionally to satisfy React hooks rules.
// Subscribes to a SpeechModule event via addListener; no-op when module is null.
function useSpeechEvent(event: string, callback: (e: any) => void): void {
  const cbRef = useRef(callback);
  cbRef.current = callback;
  useEffect(() => {
    if (!SpeechModule?.addListener) return;
    const sub = SpeechModule.addListener(event, (e: any) => cbRef.current(e));
    return () => sub?.remove?.();
  }, [event]);
}

function MicIcon({ active }: { active: boolean }) {
  const c = active ? '#EF4444' : color.dim;
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      {/* Capsule body */}
      <Rect x="8" y="2" width="8" height="13" rx="4" fill={c} />
      {/* Stand arc */}
      <Path
        d="M5 11a7 7 0 0 0 14 0"
        stroke={c}
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      {/* Stem + base */}
      <Path
        d="M12 18v3M9 21h6"
        stroke={c}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  );
}

const MAX_CHARS = 1000;

interface Props extends Omit<TextInputProps, 'multiline' | 'style'> {
  value:                 string;
  onChangeText:          (text: string) => void;
  onAuthorshipChange?:   (payload: AuthorshipPayload) => void;
  maxChars?:             number;
  style?:                object;
}

export default function ConfessionInput({
  value, onChangeText, onAuthorshipChange, maxChars = MAX_CHARS, style, ...rest
}: Props) {
  const palette      = usePalette();
  const remaining    = maxChars - value.length;
  const counterColor = remaining <= 100 ? palette.you : color.dim;

  const tracker = useRef(createAuthorshipTracker()).current;

  const [pickerOpen,   setPickerOpen]  = useState(false);
  const [listening,    setListening]   = useState(false);
  const [partial,      setPartial]     = useState('');
  const [micDisabled,  setMicDisabled] = useState(false); // true after a hard failure

  // Refs for async/event callbacks — avoid stale closure on value and selection
  const valueRef = useRef(value);
  const selRef   = useRef({ start: 0, end: 0 });
  useEffect(() => { valueRef.current = value; }, [value]);

  // Last known caret; forceSel snaps the cursor after an insert
  const [sel,      setSel]      = useState({ start: 0, end: 0 });
  const [forceSel, setForceSel] = useState<{ start: number; end: number } | undefined>(undefined);

  // No availability pre-check — supportsOnDeviceRecognition() returns false
  // on the iOS simulator even when the module is loaded, which would hide the
  // button unnecessarily. On-device failure is caught at start() time instead.

  // Pulsing scale animation while listening, gated by reduce-motion preference
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    pulseLoop.current?.stop();
    pulseLoop.current = null;
    pulseAnim.setValue(1);
    if (!listening) return;

    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (reduced) return;
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.22, duration: 560, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.00, duration: 560, useNativeDriver: true }),
        ]),
      );
      pulseLoop.current = loop;
      loop.start();
    });

    return () => {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    };
  }, [listening]);

  // ── Speech recognition events ──────────────────────────────────────────────

  useSpeechEvent('result', (e: any) => {
    const transcript: string = e.results?.[0]?.transcript ?? '';
    if (e.isFinal) {
      if (transcript.trim()) insertVoiceSegment(transcript);
      setPartial('');
    } else {
      setPartial(transcript);
    }
  });

  useSpeechEvent('end', () => {
    setListening(false);
    setPartial('');
  });

  useSpeechEvent('error', (e: any) => {
    setListening(false);
    setPartial('');
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      Alert.alert(
        'Microphone access needed',
        'Enable microphone in Settings to use voice typing.',
        [{ text: 'OK' }],
      );
    } else if (e.error === 'not-supported') {
      setMicDisabled(true);
    }
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function onSelectionChange(e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) {
    const s = e.nativeEvent.selection;
    setSel(s);
    selRef.current = s;
    if (forceSel) setForceSel(undefined);
  }

  function handleKeyPress(e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    tracker.onKeyPress(e.nativeEvent.key);
  }

  function handleChangeText(next: string) {
    tracker.onTextChange(value, next);
    onChangeText(next.slice(0, maxChars));
    onAuthorshipChange?.(tracker.getPayload());
  }

  function insertEmoji(emoji: string) {
    if (remaining < emoji.length) return;
    const { start, end } = selRef.current;
    const next  = (value.slice(0, start) + emoji + value.slice(end)).slice(0, maxChars);
    onChangeText(next);
    const caret = Math.min(start + emoji.length, maxChars);
    setForceSel({ start: caret, end: caret });
    setSel({ start: caret, end: caret });
    selRef.current = { start: caret, end: caret };
    Haptics.selectionAsync().catch(() => {});
  }

  // Inserts a finalised dictation segment at the current cursor.
  // Bypasses handleChangeText so the tracker counts this as voice, not paste.
  function insertVoiceSegment(segment: string): void {
    const cur   = valueRef.current;
    const { start, end } = selRef.current;
    const next  = (cur.slice(0, start) + segment + cur.slice(end)).slice(0, maxChars);
    const added = next.length - cur.length + (end - start);
    if (added <= 0) return;

    onChangeText(next);
    tracker.onVoiceInsert(added);
    onAuthorshipChange?.(tracker.getPayload());

    const caret = Math.min(start + segment.length, maxChars);
    setForceSel({ start: caret, end: caret });
    setSel({ start: caret, end: caret });
    selRef.current = { start: caret, end: caret };
    Haptics.selectionAsync().catch(() => {});
  }

  async function handleMicPress(): Promise<void> {
    if (micDisabled) return;

    if (!SpeechModule) {
      Alert.alert(
        'Voice typing unavailable',
        'This feature requires a development build. Run "expo run:ios" or use EAS to get voice typing.',
        [{ text: 'OK' }],
      );
      return;
    }

    if (listening) {
      SpeechModule.stop?.();
      setListening(false);
      return;
    }

    let granted = false;
    try {
      const result = await SpeechModule.requestPermissionsAsync();
      granted = result.granted;
    } catch {
      granted = false;
    }

    if (!granted) {
      Alert.alert(
        'Microphone access needed',
        'Enable microphone in Settings to use voice typing.',
        [{ text: 'OK' }],
      );
      return;
    }

    setPartial('');
    setListening(true);
    try {
      SpeechModule.start({
        lang:                        'en-US',
        interimResults:               true,
        continuous:                   true,
        requiresOnDeviceRecognition:  true,
      });
    } catch {
      setListening(false);
      setMicDisabled(true);
      Alert.alert('Voice typing unavailable', 'On-device recognition is not supported on this device.');
    }
  }

  // ── Dark theme for the emoji picker ───────────────────────────────────────

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
        onChangeText={handleChangeText}
        onKeyPress={handleKeyPress}
        onSelectionChange={onSelectionChange}
        selection={forceSel}
        multiline
        placeholderTextColor={color.dim}
        textAlignVertical="top"
        scrollEnabled
        accessibilityLabel="Your confession"
        accessibilityHint="Write what you can't say out loud. This stays private."
      />

      {/* Interim transcript hint while dictating */}
      {!!partial && (
        <Text style={styles.partial} numberOfLines={2}>
          {partial}
        </Text>
      )}

      {/* Footer: [mic · emoji]  ···  [counter] */}
      <View style={styles.footerRow}>
        <View style={styles.footerLeft}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }], opacity: micDisabled ? 0.3 : 1 }}>
            <Pressable
              onPress={handleMicPress}
              hitSlop={10}
              style={[styles.toggle, listening && styles.toggleListening]}
              accessibilityRole="button"
              accessibilityLabel={listening ? 'Stop voice typing' : 'Start voice typing'}
              accessibilityHint="Dictate on-device — audio never leaves your phone"
              accessibilityState={{ selected: listening, disabled: micDisabled }}
            >
              <MicIcon active={listening} />
            </Pressable>
          </Animated.View>
          <Pressable
            onPress={() => setPickerOpen(true)}
            hitSlop={10}
            style={styles.toggle}
            accessibilityRole="button"
            accessibilityLabel="Emoji picker"
            accessibilityHint="Browse and insert any emoji into your confession"
          >
            <Text style={{ fontSize: 18, lineHeight: 20, color: color.dim }}>☺</Text>
          </Pressable>
        </View>

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
  partial: {
    fontFamily: fontFamily.sans,
    fontSize:   12,
    color:      color.dim,
    opacity:    0.65,
    marginTop:  6,
  },
  footerRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginTop:      8,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
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
  toggleListening: {
    borderColor:     '#EF4444',
    backgroundColor: '#EF444418',
  },
  counter: {
    fontFamily: fontFamily.sans,
    fontSize:   font.labelSize,
  },
});
