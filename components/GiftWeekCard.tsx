/**
 * GiftWeekCard — what the invitee sees, once, after onboarding.
 *
 * Someone gave them something. The card says so plainly and then gets out of
 * the way: no confetti, no countdown, no upsell, and nothing to do but carry
 * on reading. Tone is the point — this is a gift from a person who cares
 * about them, not a promotion.
 *
 * The second line is the honest one, and it is doing two jobs at once. It
 * tells the invitee their friend gets something too, so the gift does not
 * feel like a trick — and it tells them, unprompted, that the friend will
 * never see what they read or write. That reassurance is not decoration: it
 * is the promise the whole referral design is built to keep (CLAUDE.md #3),
 * and the person who most needs to hear it is the one who just arrived
 * through someone they know.
 */

import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily, radius, spacing } from '@/theme/tokens';
import { analytics } from '@/lib/analytics';
import { GIFT_CARD_TITLE, GIFT_CARD_NOTE, markGiftCardShown } from '@/lib/referral';

const SHADOW = 4;

export default function GiftWeekCard({ onDismiss }: { onDismiss: () => void }) {
  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);

  useEffect(() => {
    analytics.giftWeekGranted('invitee');
    markGiftCardShown().catch(() => {});
  }, []);

  return (
    <View style={styles.outer} testID="gift-week-card">
      <View style={styles.shadow} />
      <View style={styles.card}>
        <Text style={styles.title} accessibilityRole="header">{GIFT_CARD_TITLE}</Text>
        <Text style={styles.note}>{GIFT_CARD_NOTE}</Text>
        <Pressable
          onPress={onDismiss}
          style={({ pressed }) => [styles.action, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel="Start reading"
        >
          <Text style={styles.actionLabel}>Start reading</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    outer:  { paddingRight: SHADOW, paddingBottom: SHADOW, marginBottom: 18 },
    shadow: {
      position: 'absolute', top: SHADOW, left: SHADOW, right: 0, bottom: 0,
      borderRadius: radius.card, backgroundColor: color.border,
    },
    card: {
      borderRadius:    radius.card,
      borderWidth:     2,
      borderColor:     color.border,
      backgroundColor: color.ink,
      padding:         20,
      gap:             12,
    },
    title: { fontFamily: fontFamily.serifBold, fontSize: 20, lineHeight: 27, color: color.paper },
    note:  { fontFamily: fontFamily.sans, fontSize: 13, lineHeight: 19, color: color.dim },
    action: {
      alignSelf:         'flex-start',
      marginTop:         2,
      paddingVertical:   10,
      paddingHorizontal: 20,
      borderRadius:      radius.pill,
      borderWidth:       2,
      borderColor:       color.border,
      backgroundColor:   color.accent,
    },
    actionLabel: { fontFamily: fontFamily.sansBold, fontSize: 15, color: '#1A1A1A' },
  });
}
