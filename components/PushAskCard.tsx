/**
 * [N1] The pre-permission card.
 *
 * The OS dialog can be shown once. Neither platform offers a second chance,
 * and a "no" is permanent until somebody walks into their phone settings —
 * which almost nobody does. So the dialog is never the first thing a person
 * sees: this card explains, in plain words, exactly what will arrive and
 * what will not, and the dialog appears only after they tap yes.
 *
 * That is the whole reason this component exists. Without it the app would
 * be spending its one irreversible ask on a moment the person has no
 * context for.
 *
 * ── Inline, never a modal ───────────────────────────────────────────────────
 * It sits in the flow, under the thing that earned it. A full-screen
 * takeover for a permission request is the pattern this product is supposed
 * to be the opposite of, and the CCPA dark-pattern guidance India applies
 * treats an unavoidable interstitial as exactly that.
 *
 * ── The copy is fixed ───────────────────────────────────────────────────────
 * Every string below is owner-supplied and reproduced verbatim (N1 §4d).
 * Do not soften, shorten or "improve" them. In particular: nothing here
 * promises speed, because pushes are batched, capped at two a day and
 * silent from 10pm — and nothing guilts a decline.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { IllustrationCard } from '@/components/illustrations/IllustrationCard';
import Arrival from '@/components/illustrations/Arrival';
import { PrimaryButton, TertiaryButton } from '@/components/Buttons';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, font, fontFamily, spacing } from '@/theme/tokens';
import { announce, useReducedMotion } from '@/lib/a11y';
import type { AskMoment } from '@/lib/pushAsk';

/**
 * The promise, on all three cards.
 *
 * It is the most important text on the card: it is the only place a person
 * is told what will NOT happen. "Never your words themselves" is the line
 * that makes the rest of it safe to say yes to.
 */
export const PROMISE =
  'Only two things: when someone feels your words, and Monday’s question. '
  + 'Never your words themselves. Quiet from 10pm to 8am.';

export interface MomentCopy {
  eyebrow:  string;
  headline: string;
  body:     string;
  primary:  string;
  decline:  string;
}

/** Owner-supplied, verbatim. See the header. */
export const COPY: Record<AskMoment, MomentCopy> = {
  proof: {
    eyebrow:  'Just now',
    headline: 'Someone felt what you wrote.',
    body:     'Want to know next time, even when soulyap is closed?',
    primary:  'Tell me when it happens',
    decline:  'Not now',
  },
  just_posted: {
    eyebrow:  'It’s out there',
    headline: 'Your words are out there now.',
    body:     'Someone might feel them tonight, or next week. Want us to tell you when they do?',
    primary:  'Yes, tell me',
    decline:  'Not now',
  },
  question: {
    eyebrow:  'Every Monday',
    headline: 'One question, the same for everyone.',
    body:     'A new one lands every Monday evening. Want it when it does?',
    primary:  'Send me Monday’s question',
    decline:  'Not now',
  },
};

/** Exact, and used by both the granted and denied paths. */
export const TOAST_GRANTED = 'Done. We’ll only knock when it matters.';
export const TOAST_DENIED  = 'Okay. You can turn it on anytime in You → Notifications.';

/** Entrance: rises 12px and fades in. Breath, not bounce. */
const RISE_PX  = 12;
const RISE_MS  = 320;

export interface PushAskCardProps {
  moment: AskMoment;
  /**
   * Runs the landing beat, then the OS dialog, then reports the result.
   * Kept out of this component entirely: it must not import the
   * notifications API, so that the ONLY places that can trigger the system
   * dialog are the card's primary button and the Settings master toggle.
   */
  onAccept:  () => void | Promise<void>;
  onDecline: () => void;
  /** Set by the parent once the permission flow has finished either way. */
  collapsed?: boolean;
}

export default function PushAskCard({
  moment, onAccept, onDecline, collapsed = false,
}: PushAskCardProps) {
  const color  = useThemeColors();
  const styles = React.useMemo(() => createStyles(color), [color]);
  const reduceMotion = useReducedMotion();
  const copy = COPY[moment];

  const [landing, setLanding] = useState(false);
  const [busy, setBusy]       = useState(false);
  const rise    = useRef(new Animated.Value(reduceMotion ? 0 : RISE_PX)).current;
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    // Announced, because a card that appears mid-screen is invisible to
    // somebody who is not looking at that part of it.
    announce(`${copy.headline} ${copy.body}`);
    if (reduceMotion) return;
    Animated.parallel([
      Animated.timing(rise,    { toValue: 0, duration: RISE_MS, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: RISE_MS, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleAccept = useCallback(() => {
    if (busy) return;
    setBusy(true);
    // The landing beat runs FIRST and the dialog follows it — the sequence
    // is the point. With reduce-motion, Arrival calls back immediately, so
    // the dialog is not delayed by an animation that is not playing.
    setLanding(true);
  }, [busy]);

  const handleLanded = useCallback(() => { void onAccept(); }, [onAccept]);

  if (collapsed) return null;

  return (
    <Animated.View
      style={[styles.wrap, { opacity, transform: [{ translateY: rise }] }]}
      testID={`push-ask-${moment}`}
    >
      <IllustrationCard testID="push-ask-illustration">
        {/* Decorative. A screen reader hears the headline and the body; a
            described drawing would just be noise in front of them. */}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Arrival landing={landing} onLanded={handleLanded} />
        </View>
      </IllustrationCard>

      <View style={styles.body}>
        <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
        <Text style={styles.headline} accessibilityRole="header">{copy.headline}</Text>
        <Text style={styles.copy}>{copy.body}</Text>

        <PrimaryButton
          label={copy.primary}
          onPress={handleAccept}
          disabled={busy}
          style={styles.primary}
          testID={`push-ask-yes-${moment}`}
        />

        {/* Quiet, and no guilt. "Not now" is a real answer and the card
            must not argue with it — India's CCPA dark-pattern guidance
            treats confirmshaming as a listed pattern. */}
        <TertiaryButton
          label={copy.decline}
          onPress={onDecline}
          testID={`push-ask-no-${moment}`}
        />

        <Text style={styles.promise}>{PROMISE}</Text>
      </View>
    </Animated.View>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    wrap: { marginVertical: 14 },
    body: { paddingTop: 14, gap: 8 },
    eyebrow: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      font.labelSize,
      letterSpacing: font.labelLetterSpacing,
      textTransform: 'uppercase',
      color:         color.dim,
    },
    headline: {
      fontFamily: fontFamily.sansBold,
      fontSize:   20,
      lineHeight: 26,
      color:      color.paper,
    },
    copy: {
      fontFamily: fontFamily.sans,
      fontSize:   15,
      lineHeight: 22,
      color:      color.paper,
    },
    primary: { alignSelf: 'flex-start', marginTop: 6 },
    promise: {
      fontFamily: fontFamily.sans,
      fontSize:   12,
      lineHeight: 18,
      color:      color.dim,
      marginTop:  4,
    },
  });
}
