/**
 * "This week's question" — the card at the top of the feed.
 *
 * The point of the whole feature is the primary action: a blank page asks you
 * to find something to say, a question hands you the thing. So "Answer it" is
 * the loud one, and everything else on this card is quieter than it.
 *
 * Never paired with the premium card (the 2026-09-27 decision): an invitation
 * to write must not be the warm-up act for an upsell. It also never appears on
 * the crisis path, and there is nothing to dismiss permanently — "Not now"
 * lasts the session, because next week it is a different question.
 */

import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, font, fontFamily, radius, spacing } from '@/theme/tokens';
import { analytics } from '@/lib/analytics';
import { answersLabel, hasReadableAnswers, type LiveQuestion } from '@/lib/question';

const SHADOW = 4;

export interface QuestionCardProps {
  question:    LiveQuestion;
  onAnswer:    () => void;
  onReadAnswers: () => void;
  onShare:     () => void;
  onDismiss:   () => void;
}

export default function QuestionCard({
  question, onAnswer, onReadAnswers, onShare, onDismiss,
}: QuestionCardProps) {
  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);
  const readable = hasReadableAnswers(question);

  useEffect(() => { analytics.questionCardShown(); }, [question.id]);

  return (
    <View style={styles.outer} testID="question-card">
      <View style={styles.shadow} />
      <View style={styles.card}>
        <View style={styles.topRow}>
          <Text style={styles.eyebrow}>This week’s question</Text>
          <Pressable
            onPress={onDismiss} hitSlop={12}
            accessibilityRole="button" accessibilityLabel="Not now — hide this week's question"
          >
            <Text style={styles.notNow}>Not now</Text>
          </Pressable>
        </View>

        <Text style={styles.question} accessibilityRole="header">{question.text}</Text>

        <Pressable
          onPress={() => { analytics.questionAnswerTapped(); onAnswer(); }}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Answer this week's question: ${question.text}`}
        >
          <Text style={styles.primaryLabel}>Answer it</Text>
        </Pressable>

        <View style={styles.footerRow}>
          {readable ? (
            <Pressable
              onPress={() => { analytics.questionFilterOpened(); onReadAnswers(); }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={answersLabel(question)}
            >
              <Text style={styles.secondary}>{answersLabel(question)}</Text>
            </Pressable>
          ) : (
            // Not a disabled button: there is nothing broken here, there is
            // just nobody yet, and saying so is an invitation rather than a
            // dead end.
            <Text style={styles.beFirst} testID="question-be-first">
              {answersLabel(question)}
            </Text>
          )}

          <Pressable
            onPress={() => { analytics.questionShared(); onShare(); }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Share this week's question"
            style={styles.shareRow}
          >
            <Icon name="arrow_right" size={14} />
            <Text style={styles.secondary}>Share the question</Text>
          </Pressable>
        </View>
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
      padding:         18,
      gap:             12,
    },
    topRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    eyebrow: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      font.labelSize,
      letterSpacing: font.labelLetterSpacing,
      textTransform: 'uppercase',
      color:         color.dim,
    },
    notNow: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      font.labelSize,
      letterSpacing: font.labelLetterSpacing,
      textTransform: 'uppercase',
      color:         color.dim,
    },
    question: { fontFamily: fontFamily.serifBold, fontSize: 21, lineHeight: 28, color: color.paper },
    primary: {
      alignSelf:       'flex-start',
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius:    radius.pill,
      borderWidth:     2,
      borderColor:     color.border,
      backgroundColor: color.accent,
    },
    primaryLabel: { fontFamily: fontFamily.sansBold, fontSize: 15, color: '#1A1A1A' },
    pressed: { opacity: 0.85 },
    footerRow: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
    },
    shareRow:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
    secondary: { fontFamily: fontFamily.sans, fontSize: 13, color: color.paper },
    beFirst:   { fontFamily: fontFamily.sans, fontSize: 13, color: color.dim, flexShrink: 1 },
  });
}
