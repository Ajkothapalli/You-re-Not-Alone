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
 *
 * ── It scrolls with the feed again (owner decision 2026-10-01) ──────────────
 * For a while this was PINNED above the list so a reader who had started
 * reading could always see it. In practice "always visible" meant a card
 * permanently parked on top of the one reading surface, above every
 * confession, every session — the feed is other people's writing, and this
 * was standing in front of it.
 *
 * It is the feed's list header now: first, then passed. What replaces
 * "always visible" is `featured` — hard to miss ONCE. See the prop.
 *
 * Dismiss stays a real control (a TertiaryButton beside "Answer it") rather
 * than going back to a corner link. Scrolling past is now free, so the
 * button is no longer load-bearing, but two taps of hierarchy read more
 * clearly than a link hidden in a corner and there is no reason to make
 * declining harder than accepting.
 *
 * Tertiary, not Ghost, on purpose: a Ghost button would carry the same visual
 * weight as the primary and turn one invitation into two equal choices. The
 * hierarchy is the whole point of this card (see the note above about "Answer
 * it" being the loud one). The label stays "Not now" — CLAUDE.md names that
 * copy, and "Dismiss" is a colder word for declining an invitation.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { ScrawlIcon } from '@/components/ScrawlIcon';
import { TertiaryButton } from '@/components/Buttons';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, font, fontFamily, radius, spacing } from '@/theme/tokens';
import { DURATION, EASING, RISE } from '@/theme/motion';
import { useReducedMotion } from '@/lib/a11y';
import { analytics } from '@/lib/analytics';
import { answersLabel, hasReadableAnswers, type LiveQuestion } from '@/lib/question';

/**
 * The hard offset shadow. Deeper when featured.
 *
 * A confession card sits at 5. Featured puts this at 6 so it reads as the
 * one thing lifted slightly off the page, without becoming a different
 * species of object — same border, same radius, same paper.
 */
const SHADOW          = 4;
const SHADOW_FEATURED = 6;

export interface QuestionCardProps {
  question:    LiveQuestion;
  /**
   * The top-of-feed treatment: accent shadow, accent eyebrow, a scrawl
   * mark, and the standard content entrance.
   *
   * It exists because the card stopped being pinned. Everything here is
   * the app's existing vocabulary turned up — a coloured hard shadow is
   * how ReadCard already makes a card sing (palette.you), the eyebrow is
   * the accent used on every selected chip, and the entrance is the same
   * rise a confession gets. Nothing new is introduced to shout with: no
   * badge, no gradient, no colour that is not already on this screen.
   */
  featured?:   boolean;
  onAnswer:    () => void;
  onReadAnswers: () => void;
  onShare:     () => void;
  onDismiss:   () => void;
}

/**
 * Memoized, because pinning made this a permanent resident of the feed
 * screen. Unmemoized it re-rendered on every impression, every felt and
 * every allowance tick — a card whose content changes once a week.
 */
const QuestionCard = React.memo(function QuestionCard({
  question, featured = false, onAnswer, onReadAnswers, onShare, onDismiss,
}: QuestionCardProps) {
  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);
  const readable = hasReadableAnswers(question);
  const reduceMotion = useReducedMotion();

  useEffect(() => { analytics.questionCardShown(); }, [question.id]);

  // The same arrival a confession gets in the list — it is the first thing
  // in the feed, so it should arrive rather than simply be there.
  const entrance = useRef(new Animated.Value(featured ? 0 : 1)).current;
  useEffect(() => {
    if (!featured) return;
    if (reduceMotion) { entrance.setValue(1); return; }
    entrance.setValue(0);
    Animated.timing(entrance, {
      toValue:         1,
      duration:        DURATION.entrance,
      easing:          EASING.enter,
      useNativeDriver: true,
    }).start();
  }, [featured, reduceMotion, question.id]);

  const translateY = entrance.interpolate({ inputRange: [0, 1], outputRange: [RISE.md, 0] });

  return (
    <Animated.View style={featured ? { opacity: entrance, transform: [{ translateY }] } : undefined}>
    <View style={styles.outer} testID="question-card">
      <View style={[styles.shadow, featured && styles.shadowFeatured]} />
      <View style={[styles.card, featured && styles.cardFeatured]}>
        {/* Decorative only, and marked as such: the same roughened scrawl
            language ReadCard scatters on every confession, so the loudest
            card in the feed is still unmistakably one of the family. */}
        {featured && (
          <View pointerEvents="none" style={styles.decor}>
            <ScrawlIcon name="quote_mark" size={52} color={color.paper} roughen />
          </View>
        )}

        <Text style={[styles.eyebrow, featured && styles.eyebrowFeatured]}>
          This week’s question
        </Text>

        <Text style={styles.question} accessibilityRole="header">{question.text}</Text>

        <View style={styles.actionRow}>
          <Pressable
            onPress={() => { analytics.questionAnswerTapped(); onAnswer(); }}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Answer this week's question: ${question.text}`}
          >
            <Text style={styles.primaryLabel}>Answer it</Text>
          </Pressable>

          <TertiaryButton
            label="Not now"
            onPress={onDismiss}
            accessibilityHint="Hides this week's question until you reopen the app"
            testID="question-dismiss"
          />
        </View>

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
    </Animated.View>
  );
});

export default QuestionCard;

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    outer:  { paddingRight: SHADOW_FEATURED, paddingBottom: SHADOW_FEATURED, marginBottom: 18 },
    shadow: {
      position: 'absolute', top: SHADOW, left: SHADOW,
      right: SHADOW_FEATURED - SHADOW, bottom: SHADOW_FEATURED - SHADOW,
      borderRadius: radius.card, backgroundColor: color.border,
    },
    /**
     * The one bold move.
     *
     * ReadCard already throws a coloured hard shadow (palette.you) behind
     * every confession, so a shadow in the accent is this app's own way of
     * making a card sing rather than a new idea borrowed from somewhere.
     * Everything else on the featured card stays exactly as it was.
     */
    shadowFeatured: {
      top: SHADOW_FEATURED, left: SHADOW_FEATURED, right: 0, bottom: 0,
      backgroundColor: color.accent,
    },
    card: {
      borderRadius:    radius.card,
      borderWidth:     2,
      borderColor:     color.border,
      backgroundColor: color.ink,
      padding:         18,
      gap:             12,
    },
    // Room for the scrawl, so a long question never runs under it.
    cardFeatured: { paddingRight: 44, overflow: 'hidden' },
    decor: { position: 'absolute', top: 10, right: 10, opacity: 0.13 },
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
    eyebrow: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      font.labelSize,
      letterSpacing: font.labelLetterSpacing,
      textTransform: 'uppercase',
      color:         color.dim,
    },
    /**
     * The label is what says "this is the question" — dim, it was the
     * quietest thing on the card.
     *
     * accentText, not accent: the raw yellow is 1.28:1 on this card's
     * white face, so the "louder" eyebrow was less readable than the
     * dim grey it replaced. The accent is still here — it is the card's
     * hard shadow, where a ground is what yellow is good at.
     */
    eyebrowFeatured: { color: color.accentText },
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
