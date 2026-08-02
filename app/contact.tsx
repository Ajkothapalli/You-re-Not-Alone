import { PrimaryButton, GhostButton } from '@/components/Buttons';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily, radius, spacing } from '@/theme/tokens';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ContactScreen() {
  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [msg,   setMsg]   = useState('');

  function handleSend() {
    const subject = encodeURIComponent('Support — soulyap');
    const body    = encodeURIComponent(`From: ${email.trim()}\n\n${msg.trim()}`);
    Linking.openURL(`mailto:nani.ajay@gmail.com?subject=${subject}&body=${body}`);
    router.back();
  }

  const canSend = email.trim().length > 0 && msg.trim().length > 0;

  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={[styles.scroll, { paddingBottom: 40 + insets.bottom }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.heading}>Contact support</Text>
      <Text style={styles.sub}>We read everything. We'll reply to your email.</Text>

      <View style={styles.fields}>
        <TextInput
          style={styles.input}
          placeholder="Your email address"
          placeholderTextColor={color.dim}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Your email address"
        />
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="What's going on?"
          placeholderTextColor={color.dim}
          value={msg}
          onChangeText={setMsg}
          multiline
          textAlignVertical="top"
          accessibilityLabel="Your message"
        />
      </View>

      <PrimaryButton label="Send" onPress={handleSend} disabled={!canSend} />
      <GhostButton label="Cancel" onPress={() => router.back()} />
    </ScrollView>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    fill: {
      flex:            1,
      backgroundColor: color.bg,
    },
    scroll: {
      padding:    spacing.screenPadding,
      paddingTop: 24,
      gap:        16,
    },
    heading: {
      fontFamily: fontFamily.sansBold,
      fontSize:   26,
      color:      color.paper,
      lineHeight: 34,
    },
    sub: {
      fontFamily: fontFamily.sans,
      fontSize:   14,
      color:      color.dim,
      lineHeight: 21,
      marginTop:  -4,
    },
    fields: {
      gap: 12,
    },
    input: {
      fontFamily:      fontFamily.sans,
      fontSize:        15,
      color:           color.paper,
      borderWidth:     2,
      borderColor:     color.border,
      borderRadius:    radius.input,
      padding:         16,
      backgroundColor: color.ink,
    },
    textarea: {
      height:    140,
      marginTop: 0,
    },
  });
}
