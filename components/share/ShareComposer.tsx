/**
 * ShareComposer — pick how the quotation looks, then send it.
 *
 * A full-screen modal rather than a sheet: this is a moment of authorship, and
 * the card wants the whole screen to be looked at rather than a strip of it.
 *
 * ── The idle drift ──────────────────────────────────────────────────────────
 * Each quote breathes on its own clock (5.2s and 6.1s — ILLUSTRATION.breathe,
 * the same pair used everywhere else in the app). Two clocks that never divide
 * evenly into one another means the pair never visibly beats in sync, which is
 * what keeps the card feeling alive rather than animated. Both stop dead under
 * reduced motion.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, Pressable, StyleSheet, Switch, Text, View, type View as RNView,
} from 'react-native';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue,
  withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import QuotedCard from './QuotedCard';
import ShareRelease from './ShareRelease';
import { Icon } from '@/components/Icon';
import { PrimaryButton, GhostButton } from '@/components/Buttons';
import { showToast } from '@/components/Toast';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, font, fontFamily, radius, spacing } from '@/theme/tokens';
import { useReducedMotion } from '@/lib/a11y';
import { analytics } from '@/lib/analytics';
import {
  LOOKS, LOOK_IDS, LOOK_COUNT, type LookId,
  DESIGN_W, DESIGN_H, CARD_W, newSeed, INCLUDE_WORDS_CONSENT,
} from '@/lib/shareLooks';
import { openingLook, rememberLook } from '@/lib/shareLookStore';
import { prepareShare, openShareSheet, type PreparedShare } from '@/lib/shareCard';
import type { ShareSource } from '@/lib/shareLink';

/** On-screen preview is the design size; the capture card stays 360 wide. */
const PREVIEW_SCALE = DESIGN_W / CARD_W; // 0.75

/** The meeting spring, in Reanimated terms — a little overshoot, ~740ms. */
const MEET_SPRING = { damping: 11, stiffness: 90, mass: 1 } as const;

export interface ShareComposerProps {
  visible:   boolean;
  onClose:   () => void;
  source:    ShareSource;
  text:      string;
  category:  string | null;
  feltCount: number;
  own?:      boolean;
  tagline?:  string;
  /** Called once a target app was actually chosen. */
  onShared:  (look: LookId, includeWords: boolean) => void;
}

export default function ShareComposer({
  visible, onClose, source, text, category, feltCount, own = false, tagline, onShared,
}: ShareComposerProps) {
  const color   = useThemeColors();
  const styles  = useMemo(() => createStyles(color), [color]);
  const reduced = useReducedMotion();

  const [look, setLook]                 = useState<LookId>(LOOK_IDS[0]);
  const [seed, setSeed]                 = useState(newSeed);
  const [includeWords, setIncludeWords] = useState(false);
  const [releasing, setReleasing]       = useState(false);

  // The capture target: full-size, off-screen, never the previewed copy.
  const captureRef = useRef<RNView>(null);
  // Started the instant Share is tapped so it overlaps the release animation.
  const prepared   = useRef<Promise<PreparedShare> | null>(null);

  const drift = useSharedValue(0);
  const morph = useSharedValue(1);

  useEffect(() => {
    if (!visible) return;
    analytics.shareComposerOpened(source);
    // A new share: next look in the rotation, and a fresh jitter seed.
    openingLook().then(setLook).catch(() => {});
    setSeed(newSeed());
    setIncludeWords(false);
  }, [visible, source]);

  useEffect(() => {
    if (!visible || reduced) { drift.value = 0; return; }
    drift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
      ), -1, false);
    return () => cancelAnimation(drift);
  }, [visible, reduced]);

  function changeLook(next: LookId) {
    setLook(next);
    analytics.shareLookChanged(next);
    Haptics.selectionAsync().catch(() => {});
    if (reduced) return;               // instant swap, no morph
    morph.value = 0;
    morph.value = withSpring(1, MEET_SPRING);
  }

  function step(delta: number) {
    const i = (LOOK_IDS.indexOf(look) + delta + LOOK_COUNT) % LOOK_COUNT;
    changeLook(LOOK_IDS[i]);
  }

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: reduced ? 0 : (drift.value - 0.5) * 6 },
      { scale: 0.985 + morph.value * 0.015 },
    ],
  }));

  async function handleShare() {
    // Kick the capture + token off NOW; the animation runs over the top of it.
    prepared.current = prepareShare(captureRef, source);
    analytics.shareSheetOpened(source, look, includeWords);
    rememberLook(look).catch(() => {});

    if (reduced) { await finishShare(); return; }
    setReleasing(true);
  }

  async function finishShare() {
    setReleasing(false);
    try {
      const p = await prepared.current!;
      const result = await openShareSheet(p);
      if (result.choseTarget) {
        analytics.shareTargetChosen(source, look);
        onShared(look, includeWords);
      }
      // Not chosen → the chooser was dismissed. Nothing is celebrated, and the
      // composer simply stays where it was.
    } catch {
      showToast('Could not share', 'error');
    } finally {
      prepared.current = null;
    }
  }

  async function handleCopy() {
    try {
      const p = await (prepared.current ?? prepareShare(captureRef, source));
      showToast(p.linkCopied ? 'Link copied' : 'Could not copy link',
                p.linkCopied ? 'success' : 'error');
    } catch {
      showToast('Could not copy link', 'error');
    } finally {
      prepared.current = null;
    }
  }

  const cardProps = {
    text, category, feltCount, look, seed, own, includeWords, tagline,
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} transparent={false}>
      <View style={styles.screen}>
        {/* Off-screen full-size capture target. Never the previewed node: a
            scaled view captures at the scaled size and the PNG comes out small. */}
        <View style={styles.offscreen} pointerEvents="none">
          <View ref={captureRef} collapsable={false}>
            <QuotedCard {...cardProps} />
          </View>
        </View>

        <View style={styles.header}>
          <Pressable
            onPress={onClose} hitSlop={12}
            accessibilityRole="button" accessibilityLabel="Close"
          >
            <Icon name="close" size={20} />
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">
            {own ? 'Share your moment' : 'Pass it on'}
          </Text>
          <View style={{ width: 20 }} />
        </View>

        {/* Tapping the card cycles looks — the fastest way to see them all. */}
        <Pressable
          onPress={() => step(1)}
          accessibilityRole="button"
          accessibilityLabel={`Look: ${LOOKS[look].name}. Tap to try the next one.`}
          style={styles.previewWrap}
        >
          <Animated.View style={[styles.preview, cardStyle]}>
            <View style={{ transform: [{ scale: PREVIEW_SCALE }] }}>
              <QuotedCard {...cardProps} />
            </View>
          </Animated.View>
        </Pressable>

        <View style={styles.picker}>
          <Pressable onPress={() => step(-1)} hitSlop={14}
            accessibilityRole="button" accessibilityLabel="Previous look">
            <Text style={styles.arrow}>‹</Text>
          </Pressable>
          <Text style={styles.lookName}>{LOOKS[look].name}</Text>
          <Pressable onPress={() => step(1)} hitSlop={14}
            accessibilityRole="button" accessibilityLabel="Next look">
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        </View>

        <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {LOOK_IDS.map((id) => (
            <View key={id} style={[styles.dot, id === look && styles.dotOn]} />
          ))}
        </View>

        {own && (
          <View style={styles.consent}>
            <View style={styles.consentRow}>
              <Text style={styles.consentLabel}>Include my words</Text>
              <Switch
                value={includeWords}
                onValueChange={setIncludeWords}
                accessibilityLabel="Include my words on the card"
              />
            </View>
            {includeWords && (
              <Text style={styles.consentNote}>{INCLUDE_WORDS_CONSENT}</Text>
            )}
          </View>
        )}

        <View style={styles.actions}>
          <PrimaryButton label="Share" onPress={handleShare} />
          <GhostButton label="Copy link" onPress={handleCopy} />
        </View>

        {releasing && (
          <ShareRelease
            look={look}
            category={category}
            onDone={finishShare}
          />
        )}
      </View>
    </Modal>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    screen:   { flex: 1, backgroundColor: color.bg, paddingHorizontal: spacing.screenPadding },
    offscreen:{ position: 'absolute', left: -9999, top: 0 },
    header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 8 },
    title:    { fontFamily: fontFamily.serifBold, fontSize: 17, color: color.paper },
    previewWrap: { alignItems: 'center', marginTop: 4 },
    preview:  { width: DESIGN_W, height: DESIGN_H, alignItems: 'center', justifyContent: 'center' },
    picker:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginTop: 14 },
    arrow:    { fontFamily: fontFamily.serif, fontSize: 26, color: color.paper },
    lookName: { fontFamily: fontFamily.sansBold, fontSize: font.labelSize, letterSpacing: font.labelLetterSpacing, textTransform: 'uppercase', color: color.dim, minWidth: 92, textAlign: 'center' },
    dots:     { flexDirection: 'row', justifyContent: 'center', gap: 7, marginTop: 10 },
    dot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: color.line },
    dotOn:    { backgroundColor: color.paper },
    consent:  { marginTop: 14, gap: 6 },
    consentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    consentLabel: { fontFamily: fontFamily.serif, fontSize: 16, color: color.paper },
    consentNote:  { fontFamily: fontFamily.sans, fontSize: 13, color: color.dim, lineHeight: 18 },
    actions:  { marginTop: 'auto', paddingBottom: 24, gap: 10 },
  });
}
