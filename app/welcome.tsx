/**
 * FTUE v2 — "The Doorway"
 *
 * 4-beat onboarding driven by react-native-reanimated.
 * scrollX → card depth (scale 0.96↔1.0 + opacity 0.7↔1.0)
 *         → content parallax (0.10× translateX, clipped at card boundary)
 *
 * Beats:
 *  0 – Welcome       (logo, tagline, begin)
 *  1 – How it works  (mini confession card at −3°)
 *  2 – Safe here     (3 safety pillars)
 *  3 – Categories    (multi-select chips, two CTAs)
 *
 * Cut 2026-09-17, from six beats to four. The two that went — "Your persona"
 * and "Appearance" — asked for preferences before the reader had seen a single
 * confession, so neither could mean anything yet. Nothing they set was lost:
 * a persona is still assigned silently at completion (persist() below), and
 * the theme now follows the OS by default. Both remain editable in the You tab,
 * which already owned the only copies of those controls.
 *
 * Categories survived the cut because it is the one input that changes what
 * the reader is about to see, and it feeds matching as well as the feed — so
 * it is the LAST beat, and finishing it lands on the feed itself.
 */

import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  runOnUI,
  scrollTo,
  type SharedValue,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { CATEGORIES, type CategoryId } from '@/lib/categories';
import { HeartIcon } from '@/components/HeartIcon';
import { CategoryBadge } from '@/components/CategoryGlyph';
import { Threshold, Sanctuary, IllustrationGround } from '@/components/illustrations';
import { useAspectFit } from '@/hooks/useAspectFit';
import { markFtueDone } from '@/lib/onboarding';
import { setProfilePersona } from '@/lib/profile';
import { getRecommendations, saveReaderPreferences } from '@/lib/api';
import { primeFeed } from '@/lib/feedPrefetch';
import { announce, useReducedMotion } from '@/lib/a11y';
import { randomPersona, type Persona, PersonaBadge, getPersonaById } from '@/components/Persona';
import { PrimaryButton } from '@/components/Buttons';
import { type ColorSet, fontFamily, radius } from '@/theme/tokens';
import { useThemeColors } from '@/theme/ThemeProvider';

// ─── Design constants ─────────────────────────────────────────────────────────

const SHAD   = 4;
// Ink for text sitting ON the yellow accent. The accent is #FFE500 in BOTH
// themes, so this stays dark in both — it is not a theme colour and must not
// be swapped for color.border, which inverts.
const INK_ON_ACCENT = '#1A1A1A';
const LEFT_R = 0.4111; // splash-quote-left width ratio

// FtueBust — the tappable, blinking persona head — lived here until the beat
// it belonged to was cut (2026-09-17). The persona picker in app/(tabs)/you.tsx
// is now the only place a persona is chosen by hand.

// IllustrationConnect — two persona avatars facing each other across the brand
// quote marks, captioned in its own comment as "two people finding each other"
// — was deleted here on 2026-09-17 along with the paired MiniCard below. It
// was already unused, and it drew the same promise: nobody is found, and
// nobody is linked to anybody. Persona avatars elsewhere render through the
// shared PersonaBadge (components/Persona.tsx), which is what this once
// existed to demonstrate.

// ─── MiniCard (beat 1 confession preview) ─────────────────────────────────────

/**
 * ONE confession, shaped like a feed card (components/ReadCard.tsx): persona,
 * text, felt count.
 *
 * It was a two-panel card until 2026-09-17 — "YOU WROTE" above your confession,
 * "THEY WROTE" above a stranger's, the two saying nearly the same thing. That
 * picture promised reciprocal matching, which is the exact claim the copy sweep
 * had just removed from every string on this screen; the illustration went on
 * making it anyway, louder than the words under it, and sat directly above copy
 * that said the opposite. The server picks by CATEGORY and at random within it
 * (owner decision 2026-09-13) — it pairs nobody with anybody.
 *
 * So the beat now shows what the beat is actually about. "Read first, write
 * when ready" is illustrated by the thing you read first: a single confession,
 * exactly as one arrives in the feed.
 *
 * Do not reintroduce a second panel here.
 */
function MiniCard() {
  const color = useThemeColors();
  const mc    = useMemo(() => createMiniStyles(color), [color]);
  return (
    <View style={mc.wrapper}>
      <View pointerEvents="none" style={mc.shadow} />
      <View style={mc.card}>
        <View style={mc.labelRow}>
          <PersonaBadge persona={getPersonaById('river')} size={22} showName={false} />
          <Text style={mc.persona}>River</Text>
        </View>
        <Text style={mc.confText}>"everyone thinks i'm fine. i'm barely holding on."</Text>
        <View style={mc.pill}>
          <HeartIcon filled color="#3A0A14" size={10} />
          <Text style={mc.pillText}> 218 felt this too</Text>
        </View>
      </View>
    </View>
  );
}

/** Theme-aware: this is a mock of a real feed card, so it follows the feed. */
function createMiniStyles(color: ColorSet) {
  return StyleSheet.create({
  wrapper: {
    paddingRight:  SHAD,
    paddingBottom: SHAD,
    transform:     [{ rotate: '-3deg' }],
  },
  shadow: {
    position:        'absolute',
    top:             SHAD,
    left:            SHAD,
    right:           0,
    bottom:          0,
    borderRadius:    16,
    backgroundColor: color.border,
  },
  card: {
    width:           248,
    backgroundColor: color.ink,
    borderRadius:    16,
    borderWidth:     2,
    borderColor:     color.border,
    padding:         18,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           7,
    marginBottom:  5,
  },
  // The feed labels a confession with its random per-confession persona, never
  // with a role like "they" — there is no "you and them" here to label.
  persona: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      9,
    letterSpacing: 1.44,
    textTransform: 'uppercase',
    color:         '#9C8BF6',
  },
  confText: {
    fontFamily: fontFamily.serif,
    fontSize:   13.5,
    lineHeight: 19,
    color:      color.paper,
  },
  pill: {
    flexDirection:     'row',
    alignSelf:         'flex-start',
    backgroundColor:   '#FB7185',
    borderRadius:      999,
    paddingVertical:   6,
    paddingHorizontal: 11,
    marginTop:         14,
  },
  pillText: {
    fontFamily: fontFamily.sansBold,
    fontSize:   10,
    color:      '#3A0A14',
  },
  });
}

// ─── Safety icons ─────────────────────────────────────────────────────────────

function ShieldIcon({ size = 22, strokeWidth = 2.2, stroke }: { size?: number; strokeWidth?: number; stroke: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function NoReplyIcon({ stroke }: { stroke: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M8 11h8" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
    </Svg>
  );
}

function CheckIcon({ stroke }: { stroke: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={stroke} strokeWidth="2.2" />
      <Path d="M9 12l2 2 4-4" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── SegmentBar ───────────────────────────────────────────────────────────────

function SegItem({ i, scrollX, W }: { i: number; scrollX: SharedValue<number>; W: number }) {
  const dynColor = useThemeColors();
  const s        = useMemo(() => createStyles(dynColor), [dynColor]);
  const style = useAnimatedStyle(() => {
    const active = interpolate(
      scrollX.value,
      [(i - 0.5) * W, i * W, (i + 0.5) * W],
      [0, 1, 0],
      Extrapolation.CLAMP,
    );
    const size = interpolate(active, [0, 1], [5, 8]);
    return {
      width:        size,
      height:       size,
      borderRadius: size / 2,
      opacity:      interpolate(active, [0, 1], [0.28, 1]),
    };
  });
  return <Animated.View style={[s.dot, { backgroundColor: dynColor.paper }, style]} />;
}

/** One dot per beat. Single source of truth for how many beats there are. */
export const BEAT_COUNT = 4;

function SegmentBar({ scrollX, W }: { scrollX: SharedValue<number>; W: number }) {
  const dynColor = useThemeColors();
  const s        = useMemo(() => createStyles(dynColor), [dynColor]);
  return (
    <View style={s.segBar} testID="ftue-progress" accessibilityRole="progressbar">
      {Array.from({ length: BEAT_COUNT }, (_, i) => (
        <SegItem key={i} i={i} scrollX={scrollX} W={W} />
      ))}
    </View>
  );
}

// ─── BeatSlide ────────────────────────────────────────────────────────────────

interface SlideProps {
  index:        number;
  scrollX:      SharedValue<number>;
  W:            number;
  cardW:        number;
  cardH:        number;
  reduceMotion: boolean;
  showSkip:     boolean;
  onSkip:       () => void;
  accent:       string;
  children:     React.ReactNode;
}

function BeatSlide({ index, scrollX, W, cardW, cardH, reduceMotion, showSkip, onSkip, accent, children }: SlideProps) {
  const dynColor = useThemeColors();
  const s        = useMemo(() => createStyles(dynColor), [dynColor]);
  const depthStyle = useAnimatedStyle(() => {
    if (reduceMotion) return {};
    const range = [(index - 1) * W, index * W, (index + 1) * W];
    return {
      transform: [{ scale: interpolate(scrollX.value, range, [0.96, 1, 0.96], Extrapolation.CLAMP) }],
      opacity:          interpolate(scrollX.value, range, [0.7,  1, 0.7],  Extrapolation.CLAMP),
    };
  });

  const parallaxStyle = useAnimatedStyle(() => {
    if (reduceMotion) return {};
    return {
      transform: [{
        translateX: interpolate(
          scrollX.value,
          [(index - 1) * W, index * W, (index + 1) * W],
          [cardW * 0.10, 0, -cardW * 0.10],
          Extrapolation.CLAMP,
        ),
      }],
    };
  });

  return (
    <View style={{ width: W, flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      {/* depth animation wraps both shadow + card so they scale together */}
      <Animated.View style={[{ paddingRight: SHAD, paddingBottom: SHAD }, depthStyle]}>
        <View style={[s.cardShadow, { width: cardW, height: cardH, backgroundColor: accent }]} />
        <View style={[s.card, { width: cardW, height: cardH, backgroundColor: dynColor.ink }]}>
          <Animated.View
            style={[StyleSheet.absoluteFill, s.cardContent, parallaxStyle]}
          >
            {children}
          </Animated.View>
        </View>
      </Animated.View>
      {showSkip && (
        <Pressable
          onPress={onSkip}
          hitSlop={20}
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
        >
          <Text style={s.skipText}>Skip</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── WelcomeScreen ────────────────────────────────────────────────────────────

/**
 * Pre-ticked on the categories beat.
 *
 * Not the full set: selecting everything is the same pool as selecting nothing
 * (lib/api.ts widens an empty selection to the whole pool), so it personalises
 * nothing while still looking like a choice was made. Three broad ones instead,
 * so the feed the reader lands on is already shaped by something — and every
 * chip is one tap from on or off.
 */
const DEFAULT_CATEGORIES: CategoryId[] = ['mental_health', 'relationships', 'grief'];

export default function WelcomeScreen() {
  const { width: W, height: H } = useWindowDimensions();
  const insets       = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const CARD_W = W - 48;
  const CARD_H = Math.min(H - insets.top - insets.bottom - 100, 580);

  const dynColor = useThemeColors();
  const s        = useMemo(() => createStyles(dynColor), [dynColor]);

  // Assigned once, silently, and written at completion — the beat that used to
  // let the reader pick one is gone, but every profile still ends up with one.
  // Shuffle and rename live in the You tab.
  const [persona]                       = useState<Persona>(() => randomPersona());
  const [selected,     setSelected]     = useState<Set<CategoryId>>(new Set(DEFAULT_CATEGORIES));
  const [saving,       setSaving]       = useState(false);
  const [page,         setPage]         = useState(0);

  // Drives Threshold/Sanctuary's `isActive` — separate from `page`
  // (which only updates on onMomentumEnd, i.e. after a swipe fully settles).
  // Investigating the reported swipe jank found that gating a slide's idle
  // animation loop on `page` means, mid-drag from beat 0 to beat 1, beat 0's
  // breathe/nod/blink loops keep running full-tilt for the ENTIRE drag
  // (page is still 0 until the gesture ends) — directly competing with the
  // pan gesture's own per-frame work on the UI thread. activeBeat instead
  // updates from the continuous onScroll handler below (already firing every
  // frame via scrollEventThrottle=1), flipping as soon as scrollX crosses the
  // halfway point to the next slide — roughly mid-drag, not after release.
  const [activeBeat, setActiveBeat] = useState(0);
  const lastActiveBeat = useSharedValue(0);

  const scrollX    = useSharedValue(0);
  const aScrollRef = useAnimatedRef<Animated.ScrollView>();

  // Measured-fit boxes for the two hero illustrations — see hooks/useAspectFit.ts.
  // Both sit inside a flex:1 heroCenter competing for height with sibling
  // copy/buttons, so their available box isn't a simple width-derived shape.
  const thresholdFit = useAspectFit(4 / 3);
  const sanctuaryFit = useAspectFit(4 / 3);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
      const nearest = Math.round(e.contentOffset.x / W);
      // Guarded so runOnJS only fires on an actual change (typically once per
      // swipe direction, at the halfway crossing) rather than every frame.
      if (nearest !== lastActiveBeat.value) {
        lastActiveBeat.value = nearest;
        runOnJS(setActiveBeat)(nearest);
      }
    },
    onMomentumEnd: (e) => {
      const p = Math.round(e.contentOffset.x / W);
      runOnJS(onPageSnap)(p);
    },
  });

  // Slides more than one page away from the current scroll position render a
  // cheap empty placeholder instead of their full content below — all four
  // beats mount at once in this unvirtualized ScrollView, and a fully static
  // (non-animated) SVG scene still costs paint/composite time once mounted.
  // Bounded by activeBeat (not the settled `page`) so a slide's content is
  // already there by the time a swipe brings it on screen, never popping in
  // mid-gesture.
  function isNearBeat(index: number) {
    return Math.abs(index - activeBeat) <= 1;
  }

  function onPageSnap(p: number) {
    if (p === page) return;
    if (!reduceMotion) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const titles = ['Welcome', 'How it works', "You're safe here", 'What resonates'];
    announce(titles[p] ?? '');
    setPage(p);
  }

  function goToPage(p: number) {
    runOnUI(() => { scrollTo(aScrollRef, p * W, 0, true); })();
    setPage(p);
  }

  async function persist(chosenPersona: Persona, chosenCats: CategoryId[], dest: '/write' | '/explore') {
    setSaving(true);
    try {
      await Promise.all([
        setProfilePersona(chosenPersona.id),
        saveReaderPreferences(chosenCats),
        markFtueDone(),
      ]);
    } catch { /* non-fatal */ }

    // Start the feed's fetch here, with the categories that were just saved,
    // so finishing onboarding lands on a confession instead of a spinner.
    // This is NOT a second read surface (CLAUDE.md #2): nothing is rendered
    // here, the feed still does all the reading, and this only moves the ONE
    // request it already makes a few hundred milliseconds earlier. explore.tsx
    // consumes it if it is still warm and refetches itself if it is not.
    if (dest === '/explore') primeFeed(getRecommendations(false));

    setSaving(false);
    router.replace(dest);
  }

  function handleSkip() {
    // Skipping chooses nothing, so the whole pool is the honest default.
    persist(randomPersona(), CATEGORIES.map(c => c.id), '/explore');
  }

  function handleFinish(dest: '/write' | '/explore') {
    const cats = selected.size > 0 ? [...selected] : CATEGORIES.map(c => c.id);
    persist(persona, cats, dest);
  }

  function toggleCategory(id: CategoryId) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const commonSlideProps = { scrollX, W, cardW: CARD_W, cardH: CARD_H, reduceMotion };

  return (
    <View style={[s.root, { paddingTop: insets.top, backgroundColor: dynColor.bg }]}>

      <Animated.ScrollView
        ref={aScrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        decelerationRate="fast"
        onScroll={scrollHandler}
        scrollEventThrottle={1}
        style={{ flex: 1 }}
      >

        {/* ── Beat 0 — Welcome ──────────────────────────────────────────── */}
        <BeatSlide {...commonSlideProps} index={0} showSkip={false} onSkip={handleSkip} accent="#FFE500">
          <View style={s.col}>
            {/* Logo + wordmark compact at top */}
            <View style={{ alignItems: 'center', gap: 2 }}>
              <View style={s.logoRowSm}>
                <Image source={require('../assets/splash-quote-left.png')}  style={s.logoSmLeft}  resizeMode="stretch" />
                <Image source={require('../assets/splash-quote-right.png')} style={s.logoSmRight} resizeMode="stretch" />
              </View>
              <Text style={s.wordmark}>soulyap</Text>
            </View>
            {/* Threshold — two people about to connect across an open
                doorway, distinct from EmptyBench's solitary "waiting" park
                bench (which stays reserved for you.tsx's My Confessions
                empty state, per EmptyBench's own file header). heroCenter's
                height here is flex-resolved (a share of the card's remaining
                space after the logo/tagline/button siblings claim theirs) —
                it is NOT a simple width-derived box, so neither `aspectRatio`
                nor `width:'100%',height:'100%'` can be trusted to produce a
                clean 4:3 shape (both were tried against EmptyBench here and
                both put its falling leaf in the wrong place — see
                hooks/useAspectFit.ts for the full explanation). useAspectFit
                measures the actual resolved box via onLayout and hands
                Threshold an exact, pre-computed 4:3 pixel size that is
                mathematically guaranteed to fit both axes, so
                preserveAspectRatio="xMidYMid meet" never has anything left
                to reconcile. */}
            <View style={s.heroCenter} onLayout={thresholdFit.onLayout}>
              {thresholdFit.ready && (
                isNearBeat(0) ? (
                  <IllustrationGround style={{ width: thresholdFit.width, height: thresholdFit.height }}>
                    <Threshold
                      style={{ width: thresholdFit.width, height: thresholdFit.height }}
                      isActive={activeBeat === 0}
                    />
                  </IllustrationGround>
                ) : (
                  <View style={{ width: thresholdFit.width, height: thresholdFit.height }} />
                )
              )}
            </View>
            {/* Reading is the primary act; writing is the invitation. Nobody
                is found or paired with anybody here — the server picks by
                CATEGORY, at random within it. */}
            <Text style={s.tagline}>
              Read the things people can't say out loud. Write your own when you're ready.
            </Text>
            <PrimaryButton label="Begin" onPress={() => goToPage(1)} />
          </View>
        </BeatSlide>

        {/* ── Beat 1 — How it works ─────────────────────────────────────── */}
        <BeatSlide {...commonSlideProps} index={1} showSkip onSkip={handleSkip} accent="#FF4F00">
          <View style={s.col}>
            <View style={s.logoRowSm}>
              <Image source={require('../assets/splash-quote-left.png')}  style={s.logoSmLeft}  resizeMode="stretch" />
              <Image source={require('../assets/splash-quote-right.png')} style={s.logoSmRight} resizeMode="stretch" />
            </View>
            <Text style={s.kick}>How it works</Text>
            <Text style={s.title}>Read first.{'\n'}Write when ready.</Text>
            <View style={s.heroCenter}>
              <MiniCard />
            </View>
            <Text style={s.body}>
              You choose what you want to read — grief, guilt, relationships,
              mental health — and read what real people have written about it.
              When you're ready, you can write one of your own.
            </Text>
          </View>
        </BeatSlide>

        {/* ── Beat 2 — Safe here ────────────────────────────────────────── */}
        <BeatSlide {...commonSlideProps} index={2} showSkip onSkip={handleSkip} accent="#00D4FF">
          <View style={s.col}>
            <View style={s.logoRowSm}>
              <Image source={require('../assets/splash-quote-left.png')}  style={s.logoSmLeft}  resizeMode="stretch" />
              <Image source={require('../assets/splash-quote-right.png')} style={s.logoSmRight} resizeMode="stretch" />
            </View>
            <Text style={s.kick}>You're safe here</Text>
            <Text style={s.title}>Nothing here{'\n'}can reach you</Text>
            {/* Full paper/ink illustration, not a line icon — a persona-less
                figure wrapped to the chin in a blanket, in the same visual
                language as beat 0's Threshold (see Sanctuary.tsx). Sized the
                same measured way as beat 0: heroCenter is flex:1, so its
                available box is whatever's left after the kick/title/ticks/
                button siblings claim theirs, not a fixed or width-derived
                shape — useAspectFit measures it and hands Sanctuary an exact
                4:3 pixel box that's guaranteed to fit. */}
            <View style={s.heroCenter} onLayout={sanctuaryFit.onLayout}>
              {sanctuaryFit.ready && (
                isNearBeat(2) ? (
                  <IllustrationGround style={{ width: sanctuaryFit.width, height: sanctuaryFit.height }}>
                    <Sanctuary
                      style={{ width: sanctuaryFit.width, height: sanctuaryFit.height }}
                      isActive={activeBeat === 2}
                    />
                  </IllustrationGround>
                ) : (
                  <View style={{ width: sanctuaryFit.width, height: sanctuaryFit.height }} />
                )
              )}
            </View>
            <View style={s.ticks}>
              <View style={s.tick}>
                <ShieldIcon stroke={dynColor.paper} />
                <View style={{ flex: 1 }}>
                  <Text style={s.tickTitle}>Anonymous</Text>
                  <Text style={s.tickBody}>Always a random persona — no one can tie it to you.</Text>
                </View>
              </View>
              <View style={s.tick}>
                <NoReplyIcon stroke={dynColor.paper} />
                <View style={{ flex: 1 }}>
                  <Text style={s.tickTitle}>No replies, ever</Text>
                  <Text style={s.tickBody}>No DMs, no profiles. No one can find you.</Text>
                </View>
              </View>
              <View style={s.tick}>
                <CheckIcon stroke={dynColor.paper} />
                <View style={{ flex: 1 }}>
                  <Text style={s.tickTitle}>Checked first</Text>
                  <Text style={s.tickBody}>Reviewed before anyone sees it.</Text>
                </View>
              </View>
            </View>
            <PrimaryButton label="I understand" onPress={() => goToPage(3)} />
          </View>
        </BeatSlide>

        {/* ── Beat 3 — Categories (final beat) ──────────────────────────── */}
        <BeatSlide {...commonSlideProps} index={3} showSkip={false} onSkip={handleSkip} accent="#CCFF00">
          <View style={s.col}>
            <View style={s.logoRowSm}>
              <Image source={require('../assets/splash-quote-left.png')}  style={s.logoSmLeft}  resizeMode="stretch" />
              <Image source={require('../assets/splash-quote-right.png')} style={s.logoSmRight} resizeMode="stretch" />
            </View>
            <Text style={s.kick}>What resonates</Text>
            <Text style={s.title}>What do you{'\n'}want to read?</Text>

            <View style={s.chips}>
              {CATEGORIES.map(cat => {
                const on = selected.has(cat.id);
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => toggleCategory(cat.id)}
                    style={[s.chip, on && s.chipOn]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={cat.label}
                  >
                    <CategoryBadge id={cat.id} size={22} />
                    <Text style={[s.chipTxt, on && s.chipTxtOn]}>{cat.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ flex: 1 }} />

            {/* Onboarding ends ON the feed, not on a settings screen: the
                first "someone else feels this" moment is the product, and
                it should not be something a new reader has to go and find. */}
            <PrimaryButton
              label="Start reading"
              onPress={() => handleFinish('/explore')}
              disabled={saving}
            />
            <Pressable
              onPress={() => handleFinish('/write')}
              disabled={saving}
              hitSlop={10}
              style={{ marginTop: 12, alignSelf: 'center' }}
              accessibilityRole="button"
            >
              <Text style={[s.ghostLink, { color: dynColor.dim }]}>Or say your first thing</Text>
            </Pressable>
          </View>
        </BeatSlide>


      </Animated.ScrollView>

      {/* Fixed segment bar */}
      <View style={[s.segBarRow, { paddingBottom: insets.bottom + 16 }]}>
        <SegmentBar scrollX={scrollX} W={W} />
      </View>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const LOGO_SM  = 32;

/**
 * Theme-aware, as of 2026-09-18.
 *
 * These styles used to be a module-scope StyleSheet built from the STATIC
 * `color` export in theme/tokens.ts — which is permanently lightColors, with
 * its own comment saying "use useThemeColors() for dynamic theming". So every
 * beat drew `color.paper` (#1A1A1A) text onto a card painted `dynColor.ink`
 * (#141414 in dark): near-black on near-black, i.e. onboarding was unreadable
 * in dark mode. Nothing in the file was obviously wrong to read, because both
 * halves looked like they came from the theme.
 */
function createStyles(color: ColorSet) {
  return StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: color.bg,
  },

  // Card shell — matches feed cards exactly
  cardShadow: {
    position:     'absolute',
    top:          SHAD,
    left:         SHAD,
    borderRadius: radius.input,
  },
  card: {
    backgroundColor: color.ink,
    borderRadius:    radius.input,
    borderWidth:     2,
    borderColor:     color.border,
    overflow:        'hidden',
  },
  cardContent: {
    padding: 26,
  },

  // Skip
  skipText: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color:         color.dim,
  },

  // Column layout used inside every card
  col: {
    flex:          1,
    flexDirection: 'column',
    gap:           14,
  },

  // Logo — small mark on every beat
  logoRowSm: {
    flexDirection: 'row',
    width:         LOGO_SM,
    height:        LOGO_SM,
    alignSelf:     'center',
    marginBottom:  -Math.round(LOGO_SM * 0.28),
  },
  logoSmLeft:  { width: LOGO_SM * LEFT_R,       height: LOGO_SM },
  logoSmRight: { width: LOGO_SM * (1 - LEFT_R), height: LOGO_SM },

  // Hero centering area
  heroCenter: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
  },

  // Beat 0 wordmark + tagline
  wordmark: {
    fontFamily: fontFamily.sansBold,
    fontSize:   28,
    lineHeight: 32,
    color:      color.paper,
    textAlign:  'center',
  },
  tagline: {
    fontFamily: fontFamily.sans,
    fontSize:   14,
    lineHeight: 22,
    color:      color.dim,
    textAlign:  'center',
    maxWidth:   240,
    marginTop:  4,
    alignSelf:  'center',
  },

  // Eyebrow label
  kick: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      10,
    letterSpacing: 3.0,
    textTransform: 'uppercase',
    color:         color.dim,
    textAlign:     'center',
    marginTop:     4,
  },

  // Section heading
  title: {
    fontFamily: fontFamily.sansBold,
    fontSize:   28,
    lineHeight: 33,
    color:      color.paper,
    textAlign:  'center',
  },

  // Body copy
  body: {
    fontFamily: fontFamily.sans,
    fontSize:   13,
    lineHeight: 21,
    color:      color.dim,
    textAlign:  'center',
    maxWidth:   240,
    alignSelf:  'center',
  },

  // Safety ticks (beat 2)
  ticks: {
    gap:       18,
    marginTop: 4,
  },
  tick: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           12,
  },
  tickTitle: {
    fontFamily:   fontFamily.sansBold,
    fontSize:     14,
    color:        color.paper,
    marginBottom: 2,
    marginTop:    1,
  },
  tickBody: {
    fontFamily: fontFamily.sans,
    fontSize:   12.5,
    lineHeight: 18,
    color:      color.dim,
  },

  // Persona (beat 3)
  ghostLink: {
    fontFamily: fontFamily.sansBold,
    fontSize:   12,
    color:      color.dim,
  },
  // Shuffle/Rename — light outline pill chips (same neo-brutal chip contract
  // as s.chip/s.chipOn below), so they read as tappable instead of inline
  // text. Kept visually secondary (outline, not filled) — "That's me" is
  // still the only solid CTA on this beat.

  // Category chips (beat 4) — neo-brutal flat, yellow when selected
  chips: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            8,
    justifyContent: 'center',
    marginTop:      2,
  },
  chip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    borderWidth:       2,
    borderColor:       color.border,
    borderRadius:      999,
    paddingVertical:   6,
    paddingHorizontal: 12,
    backgroundColor:   'transparent',
  },
  chipOn: {
    backgroundColor: '#FFE500',
  },
  chipTxt: {
    fontFamily: fontFamily.sansBold,
    fontSize:   13,
    color:      color.paper,
  },
  chipTxtOn: {
    color: INK_ON_ACCENT,
  },

  // Segment bar
  segBarRow: {
    paddingTop:  10,
    alignItems:  'center',
    gap:         12,
  },
  segBar: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           7,
  },
  dot: {
    backgroundColor: color.paper,
  },

  });
}

