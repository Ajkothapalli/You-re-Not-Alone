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
  Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View,
  type View as RNView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue,
  withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import QuotedCard from './QuotedCard';
import ShareRelease from './ShareRelease';
import { Icon } from '@/components/Icon';
import { PrimaryButton, GhostButton } from '@/components/Buttons';
import { showToast, ToastHost } from '@/components/Toast';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, font, fontFamily, radius, spacing } from '@/theme/tokens';
import { useReducedMotion } from '@/lib/a11y';
import { analytics } from '@/lib/analytics';
import {
  LOOKS, LOOK_IDS, LOOK_COUNT, type LookId,
  DESIGN_W, DESIGN_H, CARD_W, newSeed, INCLUDE_WORDS_CONSENT,
} from '@/lib/shareLooks';
import { openingLook, rememberLook } from '@/lib/shareLookStore';
import { prepareShare, type PreparedShare } from '@/lib/shareCard';
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
  /**
   * Hands the prepared capture up once the release has finished.
   *
   * The composer deliberately does NOT open the share sheet itself. On
   * Android the chooser is an Activity, and launching it while this Modal is
   * still mounted — a separate window — leaves the chooser behind the modal
   * and the user staring at a blank screen. The parent closes the modal
   * first, then opens the sheet.
   */
  /** Called with a RESOLVED capture — see finishShare for why not a promise. */
  onRelease: (prepared: PreparedShare, look: LookId, includeWords: boolean) => void;
}

/** A capture that has not finished by now is not going to. */
const PREPARE_TIMEOUT_MS = 8_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('prepare timed out')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); },
           (e) => { clearTimeout(t); reject(e); });
  });
}

export default function ShareComposer({
  visible, onClose, source, text, category, feltCount, own = false, tagline, onRelease,
}: ShareComposerProps) {
  const color   = useThemeColors();
  const insets  = useSafeAreaInsets();
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

  /**
   * The CARD no longer drifts — the two quote marks do, each on its own
   * clock inside QuotedCard. Moving the whole card moved the words too,
   * which read as the card being unstable rather than the quotes being
   * alive. What is left here is the look-change spring.
   */
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.985 + morph.value * 0.015 }],
  }));

  async function handleShare() {
    // Kick the capture + token off NOW; the animation runs over the top of it.
    prepared.current = prepareShare(captureRef, source);
    analytics.shareSheetOpened(source, look, includeWords);
    rememberLook(look).catch(() => {});

    // Reduced motion skips the release entirely and hands over at once.
    if (reduced) { finishShare(); return; }
    setReleasing(true);
  }

  /**
   * Hand over ONLY once the capture has actually finished.
   *
   * This used to pass the in-flight promise straight to ShareFlow, which
   * hid this Modal and awaited it afterwards — so captureRef ran against a
   * view that had already unmounted. On Android that does not reliably
   * throw; it can simply never settle, and then ShareFlow's effect never
   * reaches setPresenting(null), so the composer stays hidden, the after
   * screen never opens, and the reader is left on a torn-down Modal
   * looking at a grey screen with no way out. That was the bug.
   *
   * Awaiting here means the only thing that happens after the unmount is
   * Share.open, which needs no view at all.
   */
  async function finishShare() {
    const p = prepared.current;
    prepared.current = null;
    if (!p) { setReleasing(false); return; }

    try {
      // Bounded: a capture that hangs must not hold the release overlay
      // open forever either.
      const resolved = await withTimeout(p, PREPARE_TIMEOUT_MS);
      setReleasing(false);
      onRelease(resolved, look, includeWords);
    } catch {
      // Stay on the composer. The words are still here and the button can
      // be pressed again — losing the share silently would be worse.
      setReleasing(false);
      showToast('Could not prepare the card', 'error');
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
    /**
     * A BOTTOM SHEET, not a full screen (2026-10-02).
     *
     * It used to be an opaque full-screen Modal whose header carried a bare
     * `paddingTop: 12`. On a device with a Dynamic Island the top inset is
     * about 59pt, so the close button was drawn UNDER the status bar: half
     * hidden, and unreachable, because the system owns touches up there.
     * The only way out of the composer was the hardware back button, and
     * on iOS there isn't one.
     *
     * A sheet fixes the cause rather than the symptom. It starts below the
     * status bar by construction, so no inset arithmetic can be wrong, and
     * it comes with the dismissals people already expect: the backdrop, and
     * the grabber it is captioned by.
     */
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent
      statusBarTranslucent
    >
      <View style={styles.root}>
        {/* Off-screen full-size capture target. Never the previewed node: a
            scaled view captures at the scaled size and the PNG comes out small.
            At the ROOT, not in the sheet — the sheet clips. */}
        <View style={styles.offscreen} pointerEvents="none">
          {/* alive is NOT set here: this is the node being rasterised, and a
              PNG has no time axis — capturing a moving card would freeze the
              quotes wherever the drift happened to be at that millisecond. */}
          <View ref={captureRef} collapsable={false}>
            <QuotedCard {...cardProps} />
          </View>
        </View>

        {/* Tap-anywhere-above to dismiss. Hidden from screen readers: a
            full-screen button is noise when the header has a real one. */}
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID="share-backdrop"
        />

        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grabber} />

          <View style={styles.header}>
            <View style={{ width: 32 }} />
            <Text style={styles.title} accessibilityRole="header">
              {own ? 'Share your moment' : 'Pass it on'}
            </Text>
            <Pressable
              onPress={onClose} hitSlop={12}
              accessibilityRole="button" accessibilityLabel="Close"
              style={styles.closeBtn}
              testID="share-close"
            >
              <Icon name="close" size={20} />
            </Pressable>
          </View>

          {/* Scrollable, because the preview alone is 480pt: on a small
              phone the card plus the picker is taller than the sheet, and
              a sheet that clipped its own Share button would be the first
              bug all over again. */}
          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
          >
            {/* Tapping the card cycles looks — the fastest way to see them all. */}
            <Pressable
              onPress={() => step(1)}
              accessibilityRole="button"
              accessibilityLabel={`Look: ${LOOKS[look].name}. Tap to try the next one.`}
              style={styles.previewWrap}
            >
              <Animated.View style={[styles.preview, cardStyle]}>
                <View style={{ transform: [{ scale: PREVIEW_SCALE }] }}>
                  <QuotedCard {...cardProps} alive />
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
          </ScrollView>

          {/* Pinned below the scroll area, so Share is reachable at any
              screen height without hunting for it. */}
          <View style={styles.actions}>
            <PrimaryButton label="Share" onPress={handleShare} />
            <GhostButton label="Copy link" onPress={handleCopy} />
          </View>
        </View>

        {/**
          * A Modal is a separate native WINDOW. The ToastHost in the root
          * layout renders behind it, so "Link copied" fired and animated
          * where nobody could see it — which read as Copy link doing
          * nothing at all.
          *
          * Mounted last so it sits above the sheet, and so it is the
          * top of the host stack while this screen is open (see Toast).
          */}
        <ToastHost />

        {/* Above the sheet, not inside it: the release animation is sized to
            the whole screen and a sheet would crop it. */}
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
    root:     { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...(StyleSheet.absoluteFill as object), backgroundColor: 'rgba(0,0,0,0.55)' },
    /**
     * Capped so the sheet always reads as a sheet — there is visibly a
     * screen behind it to tap back to, which is half of why a sheet is
     * easier to get out of than the full screen this replaced.
     */
    sheet: {
      maxHeight:              '92%',
      backgroundColor:        color.bg,
      borderTopLeftRadius:    radius.card,
      borderTopRightRadius:   radius.card,
      borderTopWidth:         2,
      borderColor:            color.border,
      paddingHorizontal:      spacing.screenPadding,
    },
    grabber: {
      alignSelf:       'center',
      width:           40,
      height:          4,
      borderRadius:    2,
      backgroundColor: color.line,
      marginTop:       10,
      marginBottom:    4,
    },
    offscreen:{ position: 'absolute', left: -9999, top: 0 },
    header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, paddingBottom: 8 },
    closeBtn: { width: 32, alignItems: 'flex-end' },
    body:     { paddingBottom: 8 },
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
    actions:  { paddingTop: 12, gap: 10 },
  });
}
