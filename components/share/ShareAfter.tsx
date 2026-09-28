/**
 * ShareAfter — what you see when the words have actually gone.
 *
 * The logo descends, beats once, and then the two quotes PART into the corners
 * of an empty frame. That emptiness is the whole point: the quotes opened
 * around someone else's confession a moment ago, and now they are open around
 * nothing, waiting. "Your turn." sits inside them with a blinking caret.
 *
 * Writing is the app's first priority (CLAUDE.md #2 / the W1 decision), so this
 * screen has exactly one real destination: the write screen, pre-loaded with a
 * starter for the category the person just shared about. Everything else here
 * is a way out, not a competing offer.
 *
 * Shown ONLY when a target app was demonstrably chosen (see didChooseTarget in
 * lib/shareCard.ts) — celebrating a share that never happened would be worse
 * than saying nothing.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence,
  withSpring, withTiming,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { Icon } from '@/components/Icon';
import { PrimaryButton, GhostButton } from '@/components/Buttons';
import {
  QuoteOpen, QuoteClose, QUOTE_H_RATIO, LOCKUP_GAP_RATIO,
} from '@/components/brand/SoulyapLogo';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, font, fontFamily, spacing } from '@/theme/tokens';
import { useReducedMotion, announce } from '@/lib/a11y';
import { analytics } from '@/lib/analytics';
import { afterHeading, afterSubline, afterPrimaryLabel } from '@/lib/shareAfterCopy';
import { startersFor } from '@/lib/starters';
import { PAPER, INK, YELLOW, categoryColor } from '@/lib/shareLooks';

const ENTER = Easing.out(Easing.cubic);
const MEET_SPRING = { damping: 11, stiffness: 90, mass: 1 } as const;

/** The frame the quotes part into. */
const FRAME_W = 342;
const FRAME_H = 250;
const QUOTE_W = 54;

const LETTER_MS = 38;

export interface ShareAfterProps {
  visible:   boolean;
  own:       boolean;
  category:  string | null;
  /** Rotates the heading, so two shares do not read the same. */
  variant:   number;
  onDone:    () => void;
  /** Back to the composer, on the next look. */
  onAnother: () => void;
}

export default function ShareAfter({
  visible, own, category, variant, onDone, onAnother,
}: ShareAfterProps) {
  const color   = useThemeColors();
  const styles  = useMemo(() => createStyles(color), [color]);
  const reduced = useReducedMotion();

  const heading = afterHeading(own, variant);
  const subline = afterSubline(own);

  const [typed, setTyped] = useState(reduced ? heading.length : 0);
  const [caretOn, setCaretOn] = useState(true);

  const descend = useSharedValue(reduced ? 1 : 0);
  const beat    = useSharedValue(1);
  const part    = useSharedValue(reduced ? 1 : 0);
  const fade    = useSharedValue(reduced ? 1 : 0);
  const marker  = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (!visible) return;
    analytics.shareAfterShown();
    announce(heading);

    if (reduced) { setTyped(heading.length); return; }

    descend.value = withTiming(1, { duration: 820, easing: ENTER });
    beat.value    = withDelay(820, withSequence(
      withTiming(1.14, { duration: 150, easing: ENTER }),
      withTiming(0.97, { duration: 130, easing: ENTER }),
      withTiming(1.05, { duration: 140, easing: ENTER }),
      withTiming(1.00, { duration: 160, easing: ENTER }),
    ));
    part.value   = withDelay(1400, withSpring(1, MEET_SPRING));
    marker.value = withDelay(2450, withTiming(1, { duration: 420, easing: ENTER }));
    fade.value   = withDelay(2600, withTiming(1, { duration: 320, easing: ENTER }));

    // The heading types itself in from 1.5s.
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= heading.length; i++) {
      timers.push(setTimeout(() => setTyped(i), 1500 + i * LETTER_MS));
    }
    const blink = setInterval(() => setCaretOn((v) => !v), 520);
    return () => { timers.forEach(clearTimeout); clearInterval(blink); };
  }, [visible, reduced, heading]);

  const lockupStyle = useAnimatedStyle(() => ({
    opacity:   descend.value,
    transform: [{ translateY: -250 * (1 - descend.value) }],
  }));

  // Parting: the pair travels from the lockup into the frame's two corners.
  const openStyle = useAnimatedStyle(() => {
    const p = part.value;
    return {
      position:  'absolute',
      left:      (FRAME_W / 2 - QUOTE_W * LOCKUP_GAP_RATIO / 2 - QUOTE_W / 2) * (1 - p),
      top:       (FRAME_H / 2 - QUOTE_W * QUOTE_H_RATIO / 2) * (1 - p),
      transform: [{ scale: beat.value }],
    };
  });
  const closeStyle = useAnimatedStyle(() => {
    const p = part.value;
    const restX = FRAME_W - QUOTE_W;
    const restY = FRAME_H - QUOTE_W * QUOTE_H_RATIO;
    const meetX = FRAME_W / 2 - QUOTE_W * LOCKUP_GAP_RATIO / 2 - QUOTE_W / 2
                + QUOTE_W * LOCKUP_GAP_RATIO;
    const meetY = FRAME_H / 2 - QUOTE_W * QUOTE_H_RATIO / 2;
    return {
      position:  'absolute',
      left:      meetX + (restX - meetX) * p,
      top:       meetY + (restY - meetY) * p,
      transform: [{ scale: beat.value }],
    };
  });

  const fadeStyle   = useAnimatedStyle(() => ({ opacity: fade.value }));
  const markerStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: marker.value }],
  }));

  function goWrite() {
    analytics.shareAfterSayYoursTapped();
    analytics.writeStarted('share_after');
    const starter = startersFor(category ?? '')[0];
    onDone();
    router.push({
      pathname: '/write',
      params:   starter ? { starter } : {},
    });
  }

  if (!visible) return null;

  return (
    <View style={styles.screen} testID="share-after">
      <Animated.View style={[styles.lockup, lockupStyle]}>
        <Pressable
          onPress={goWrite}
          accessibilityRole="button"
          accessibilityLabel={`${afterPrimaryLabel(own)} — write your own confession`}
          style={styles.frame}
        >
          <Animated.View style={[styles.quote, openStyle]}>
            <QuoteOpen style={StyleSheet.absoluteFill} />
          </Animated.View>
          <Animated.View style={[styles.quote, closeStyle]}>
            <QuoteClose style={StyleSheet.absoluteFill} />
          </Animated.View>

          <View style={styles.turnWrap} pointerEvents="none">
            <View style={styles.turnRow}>
              <Text style={[styles.caret, !caretOn && styles.caretOff]}>|</Text>
              <Text style={styles.turn}>Your turn.</Text>
            </View>
            <Animated.View
              style={[styles.marker, { backgroundColor: YELLOW }, markerStyle]}
            />
          </View>
        </Pressable>
      </Animated.View>

      <Text style={styles.heading} accessibilityRole="header">
        {heading.slice(0, typed)}
      </Text>
      <Animated.Text style={[styles.subline, fadeStyle]}>{subline}</Animated.Text>

      <Animated.View style={[styles.actions, fadeStyle]}>
        <PrimaryButton
          label={afterPrimaryLabel(own)}
          onPress={goWrite}
          icon={<Icon name="pencil" size={18} />}
        />
        <GhostButton label="Share it another way" onPress={onAnother} />
        <Pressable onPress={onDone} hitSlop={10} accessibilityRole="button">
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    screen:  { ...StyleSheet.absoluteFill as object, backgroundColor: PAPER, alignItems: 'center', paddingHorizontal: spacing.screenPadding, paddingTop: 70 },
    lockup:  { width: FRAME_W, height: FRAME_H },
    frame:   { width: FRAME_W, height: FRAME_H },
    quote:   { width: QUOTE_W, height: QUOTE_W * QUOTE_H_RATIO },
    turnWrap:{ ...StyleSheet.absoluteFill as object, alignItems: 'center', justifyContent: 'center' },
    turnRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    caret:   { fontFamily: fontFamily.serif, fontSize: 30, color: INK },
    caretOff:{ opacity: 0 },
    turn:    { fontFamily: fontFamily.serifItalic, fontSize: 32, color: INK },
    marker:  { height: 10, width: 150, marginTop: -6, transformOrigin: 'left', opacity: 0.85 },
    heading: { fontFamily: fontFamily.serifBold, fontSize: 26, color: INK, textAlign: 'center', marginTop: 18, minHeight: 34 },
    subline: { fontFamily: fontFamily.sans, fontSize: 14, color: '#5A5A5A', textAlign: 'center', marginTop: 8 },
    actions: { marginTop: 'auto', width: '100%', paddingBottom: 30, gap: 10, alignItems: 'stretch' },
    done:    { fontFamily: fontFamily.sansBold, fontSize: font.labelSize, letterSpacing: font.labelLetterSpacing, textTransform: 'uppercase', color: '#8A8A8A', textAlign: 'center', paddingVertical: 8 },
  });
}
