import { PrimaryButton, GhostButton } from '@/components/Buttons';
import { showToast } from '@/components/Toast';
import { showDialog } from '@/components/AppDialog';
import { supabase } from '@/lib/supabase';
import { useThemeColors } from '@/theme/ThemeProvider';
import * as Linking from 'expo-linking';
import { type ColorSet, fontFamily, radius, spacing } from '@/theme/tokens';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Where support mail goes when the Edge Function path fails.
 *
 * Kept in sync with supabase/functions/send-support-message/index.ts, which is
 * the PRIMARY route — this constant only matters when that function is
 * unreachable or not deployed.
 *
 * Interim (owner decision 2026-09-22). A personal address in a shipped bundle
 * is scrapeable, and this repo is public, so expect spam. Replace it with an
 * address on a domain that actually receives mail — soulyap.com has no MX
 * record, which is why the previous value silently swallowed every message.
 */
const SUPPORT_EMAIL = 'nani.ajay@gmail.com';

export default function ContactScreen() {
  const color   = useThemeColors();
  const styles  = useMemo(() => createStyles(color), [color]);
  const insets  = useSafeAreaInsets();

  const [email,   setEmail]   = useState('');
  const [msg,     setMsg]     = useState('');
  const [sending, setSending] = useState(false);

  /**
   * Three outcomes, and the user is told which one happened.
   *
   * This used to announce "Message sent! We'll reply to your email." after the
   * try/catch, unconditionally — so someone whose message reached neither the
   * server nor their mail app was told it had arrived, and then the screen
   * closed. On a support form for this app that is the worst available lie:
   * the people who reach it are the ones something has already gone wrong for,
   * and they would have had no reason to try again.
   *
   *   'sent'   — the edge function accepted it. It is durable at that point:
   *              send-support-message writes to support_messages BEFORE
   *              attempting email, so the record survives a Resend failure.
   *   'mailto' — the function was unreachable and the mail app opened. NOT
   *              sent: the user still has to press send there, so the copy
   *              says so.
   *   'failed' — neither worked. Say so, and show the address so the message
   *              can be sent by hand rather than lost.
   */
  async function handleSend() {
    setSending(true);
    let outcome: 'sent' | 'mailto' | 'failed' = 'failed';

    try {
      const { error } = await supabase.functions.invoke('send-support-message', {
        body: { email: email.trim(), message: msg.trim() },
      });
      if (error) throw error;
      outcome = 'sent';
    } catch {
      // Edge function unreachable or not deployed — hand off to the mail app.
      // support@soulyap.com had no MX record, so the old fallback address
      // swallowed everything (owner decision 2026-09-22).
      const subject = encodeURIComponent('Support — soulyap');
      const body    = encodeURIComponent(`From: ${email.trim()}\n\n${msg.trim()}`);
      const url     = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
      try {
        await Linking.openURL(url);
        outcome = 'mailto';
      } catch {
        outcome = 'failed';
      }
    } finally {
      setSending(false);
    }

    if (outcome === 'failed') {
      showDialog(
        "Couldn't send",
        `Something went wrong reaching us. Please email ${SUPPORT_EMAIL} directly — ` +
        'your message has not been sent.',
      );
      return; // stay on the screen so the text is not lost
    }

    showToast(
      outcome === 'sent'
        ? "Message sent. We'll reply to your email."
        : 'Opening your email app — send it from there.',
    );
    setTimeout(() => router.back(), 1200);
  }

  const canSend = email.trim().length > 0 && msg.trim().length > 4;

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

      <PrimaryButton label="Send" onPress={handleSend} disabled={!canSend} loading={sending} />
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
