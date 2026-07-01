/**
 * FTUE v2 — "The Doorway"
 *
 * 5-beat premium onboarding driven by react-native-reanimated.
 * scrollX → background glow crossfade (interpolateColor ambient wash)
 *         → card depth (scale 0.94↔1.0 + opacity 0.6↔1.0)
 *         → content parallax (0.12× translateX, clipped at card boundary)
 *
 * Beats:
 *  0 – Welcome       (3D logo, tagline, begin)
 *  1 – How it works  (mini confession card at −3°)
 *  2 – Safe here     (3 safety pillars)
 *  3 – Your persona  (tappable bust, shuffle, rename)
 *  4 – Categories    (multi-select chips, two CTAs)
 *
 * Skip (beats 1–3) → random persona + all categories → /read, markFtueDone().
 * Finish (beat 4)  → chosen persona + chosen categories → /write or /read.
 */

import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  runOnJS,
  runOnUI,
  scrollTo,
  type SharedValue,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { CATEGORIES, type CategoryId } from '@/lib/categories';
import { CategoryBadge } from '@/components/CategoryGlyph';
import { markFtueDone } from '@/lib/onboarding';
import { setProfilePersona, setProfileName } from '@/lib/profile';
import { saveReaderPreferences } from '@/lib/api';
import { announce, useReducedMotion } from '@/lib/a11y';
import { randomPersona, type Persona } from '@/components/Persona';
import { color, fontFamily } from '@/theme/tokens';

// ─── Design constants ─────────────────────────────────────────────────────────

const WARM   = '#F5996E';
const COOL   = '#9C8BF6';
const PINK   = '#FB7185';
const GOLD   = '#FBBF24';
const INK2   = '#241F2B';
const EYE_W  = '#FBF7F0';

// Per-beat background ambient hues for interpolateColor crossfade.
// Beat 3 uses WARM as a placeholder; the actual tint comes from the per-card SVG glow.
const BG_HUES = [WARM, WARM, COOL, WARM, PINK] as const;

// Per-beat glow overlay config (null = beat 3, driven by persona tint prop).
const BEAT_GLOWS = [
  { glowColor: WARM,  cy: 0.22, r: 0.58, opacity: 0.50 },   // 0 Welcome
  { glowColor: WARM,  cy: 0.16, r: 0.55, opacity: 0.22 },   // 1 How it works
  { glowColor: COOL,  cy: 0.20, r: 0.58, opacity: 0.50 },   // 2 Safety
  null,                                                        // 3 Persona (dynamic)
  { glowColor: PINK,  cy: 0.80, r: 0.58, opacity: 0.45 },   // 4 Categories
] as const;

// ─── CardGlow ─────────────────────────────────────────────────────────────────
// SVG radial gradient overlay. One per card, single colour, never blended.

function CardGlow({
  id, glowColor, cy, r, opacity, cardW, cardH,
}: {
  id:        string;
  glowColor: string;
  cy:        number;    // 0–1 fraction of card height
  r:         number;    // 0–1 fraction of card width
  opacity:   number;
  cardW:     number;
  cardH:     number;
}) {
  const cx   = cardW * 0.5;
  const cyPx = cardH * cy;
  const rPx  = cardW * r;
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      viewBox={`0 0 ${cardW} ${cardH}`}
      preserveAspectRatio="none"
    >
      <Defs>
        <RadialGradient id={id} cx={cx} cy={cyPx} r={rPx} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={glowColor} stopOpacity={String(opacity)} />
          <Stop offset="1" stopColor={glowColor} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={cardW} height={cardH} fill={`url(#${id})`} />
    </Svg>
  );
}

// ─── FtueBust ─────────────────────────────────────────────────────────────────
// Simple generic bust (viewBox 0 0 80 84) scaled by a Reanimated SharedValue.
// Used only in beat 3 as the tappable persona hero.

function FtueBust({
  persona,
  bustScale,
}: {
  persona:   Persona;
  bustScale: SharedValue<number>;
}) {
  const [, skin, hair] = persona.colors;
  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bustScale.value }],
  }));
  return (
    <Animated.View style={aStyle}>
      <Svg width={130} height={136} viewBox="0 0 80 84">
        <Circle cx="40" cy="38" r="33" fill={hair} />
        <Circle cx="40" cy="44" r="24" fill={skin} />
        <Path d="M16 36 Q40 6 64 36 Q56 22 40 21 Q24 22 16 36 Z" fill={hair} />
        <Ellipse cx="31" cy="44" rx="4" ry="5" fill={EYE_W} />
        <Ellipse cx="49" cy="44" rx="4" ry="5" fill={EYE_W} />
        <Circle cx="31.6" cy="44.8" r="2.3" fill={INK2} />
        <Circle cx="49.6" cy="44.8" r="2.3" fill={INK2} />
        <Ellipse cx="26" cy="52" rx="4"  ry="2.6" fill="#F0837A" fillOpacity="0.55" />
        <Ellipse cx="54" cy="52" rx="4"  ry="2.6" fill="#F0837A" fillOpacity="0.55" />
        <Path
          d="M34 56 Q40 60 46 56"
          stroke={INK2} strokeWidth="2" fill="none" strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}

// ─── WarmCta ──────────────────────────────────────────────────────────────────
// Gold→Pink gradient button (105°), matching the ftue.html reference.

function WarmCta({ label, onPress, disabled }: {
  label:    string;
  onPress:  () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
    >
      <LinearGradient
        colors={[GOLD, PINK]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={s.ctaWarm}
      >
        <Text style={s.ctaWarmTxt}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

// ─── MiniCard (beat 1 confession preview) ─────────────────────────────────────

function MiniCard() {
  return (
    <View style={mc.card}>
      <Text style={mc.labelW}>you wrote</Text>
      <Text style={mc.confText}>
        "i smile all day so nobody worries."
      </Text>
      <View style={mc.seam} />
      <Text style={mc.labelC}>they wrote</Text>
      <Text style={mc.confText}>
        "everyone thinks i'm fine. i'm barely holding on."
      </Text>
      <View style={mc.pill}>
        <Text style={mc.pillText}>♥ 218 felt this too</Text>
      </View>
    </View>
  );
}

const mc = StyleSheet.create({
  card: {
    width:            228,
    backgroundColor:  '#0B0910',
    borderWidth:      1,
    borderColor:      'rgba(243,238,232,0.10)',
    borderRadius:     20,
    padding:          17,
    transform:        [{ rotate: '-3deg' }],
    shadowColor:      WARM,
    shadowOpacity:    0.26,
    shadowRadius:     16,
    shadowOffset:     { width: 0, height: 8 },
    elevation:        10,
  },
  labelW: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      9,
    letterSpacing: 1.44,
    textTransform: 'uppercase',
    color:         WARM,
    marginBottom:  4,
  },
  labelC: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      9,
    letterSpacing: 1.44,
    textTransform: 'uppercase',
    color:         COOL,
    marginBottom:  4,
    marginTop:     12,
  },
  confText: {
    fontFamily: fontFamily.serif,
    fontSize:   13.5,
    lineHeight: 19,
    color:      color.paper,
  },
  seam: {
    height:          1,
    backgroundColor: 'rgba(243,238,232,0.20)',
    marginTop:       12,
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

// ─── Safety tick icons ────────────────────────────────────────────────────────

function ShieldIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z"
        stroke={COOL} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

function NoReplyIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        stroke={COOL} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      />
      <Path d="M8 11h8" stroke={COOL} strokeWidth="2.2" strokeLinecap="round" />
    </Svg>
  );
}

function CheckIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={COOL} strokeWidth="2.2" />
      <Path
        d="M9 12l2 2 4-4"
        stroke={COOL} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── SegmentBar ───────────────────────────────────────────────────────────────
// 5 equal-width segments; active = full-opacity white.

function SegItem({ i, scrollX, W }: { i: number; scrollX: SharedValue<number>; W: number }) {
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
  return <Animated.View style={[s.dot, style]} />;
}

function SegmentBar({ scrollX, W }: { scrollX: SharedValue<number>; W: number }) {
  return (
    <View style={s.segBar}>
      {[0, 1, 2, 3, 4].map(i => <SegItem key={i} i={i} scrollX={scrollX} W={W} />)}
    </View>
  );
}

// ─── BeatSlide ────────────────────────────────────────────────────────────────
// Wraps card content with depth (scale+opacity) and parallax (0.12× translateX).

interface SlideProps {
  index:        number;
  scrollX:      SharedValue<number>;
  W:            number;
  cardW:        number;
  cardH:        number;
  reduceMotion: boolean;
  showSkip:     boolean;
  onSkip:       () => void;
  glowCfg:      { glowColor: string; cy: number; r: number; opacity: number } | null;
  personaTint?: string;    // beat 3: override glow with live persona tint
  children:     React.ReactNode;
}

function BeatSlide({
  index, scrollX, W, cardW, cardH, reduceMotion,
  showSkip, onSkip, glowCfg, personaTint, children,
}: SlideProps) {
  const depthStyle = useAnimatedStyle(() => {
    if (reduceMotion) return {};
    const range = [(index - 1) * W, index * W, (index + 1) * W];
    return {
      transform: [{ scale: interpolate(scrollX.value, range, [0.94, 1, 0.94], Extrapolation.CLAMP) }],
      opacity:          interpolate(scrollX.value, range, [0.6,  1, 0.6],  Extrapolation.CLAMP),
    };
  });

  const parallaxStyle = useAnimatedStyle(() => {
    if (reduceMotion) return {};
    return {
      transform: [{
        translateX: interpolate(
          scrollX.value,
          [(index - 1) * W, index * W, (index + 1) * W],
          [cardW * 0.12, 0, -cardW * 0.12],
          Extrapolation.CLAMP,
        ),
      }],
    };
  });

  const gColor   = personaTint ?? glowCfg?.glowColor ?? WARM;
  const gCy      = glowCfg?.cy      ?? 0.40;
  const gR       = glowCfg?.r       ?? 0.58;
  const gOpacity = glowCfg?.opacity  ?? 0.45;

  return (
    <View style={{ width: W, flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[s.card, { width: cardW, height: cardH }, depthStyle]}>
        {/* 1. Radial glow behind content */}
        <CardGlow
          id={`g${index}`}
          glowColor={gColor}
          cy={gCy}
          r={gR}
          opacity={gOpacity}
          cardW={cardW}
          cardH={cardH}
        />

        {/* 2. Parallaxed card content */}
        <Animated.View style={[StyleSheet.absoluteFill, s.cardContent, showSkip && s.cardContentSkip, parallaxStyle]}>
          {children}
        </Animated.View>

        {/* 3. Skip — bottom-center of the card, above parallax layer */}
        {showSkip && (
          <Pressable
            onPress={onSkip}
            hitSlop={20}
            style={s.skipBtn}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
          >
            <Text style={s.skipText}>skip</Text>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

// ─── WelcomeScreen ────────────────────────────────────────────────────────────

export default function WelcomeScreen() {
  const { width: W, height: H } = useWindowDimensions();
  const insets      = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const CARD_W = W - 48;
  const CARD_H = Math.min(H - insets.top - insets.bottom - 80, 600);

  // ── State ──────────────────────────────────────────────────────────────────
  const [persona,  setPersona]  = useState<Persona>(() => randomPersona());
  const [name,     setName]     = useState('');
  const [renaming, setRenaming] = useState(false);
  const [selected, setSelected] = useState<Set<CategoryId>>(
    new Set(CATEGORIES.map(c => c.id)),
  );
  const [saving,   setSaving]   = useState(false);
  const [page,     setPage]     = useState(0);

  // ── Reanimated ─────────────────────────────────────────────────────────────
  const scrollX    = useSharedValue(0);
  const bustScale  = useSharedValue(1);
  const aScrollRef = useAnimatedRef<Animated.ScrollView>();

  const scrollHandler = useAnimatedScrollHandler({
    onScroll:       (e) => { scrollX.value = e.contentOffset.x; },
    onMomentumEnd:  (e) => {
      const p = Math.round(e.contentOffset.x / W);
      runOnJS(onPageSnap)(p);
    },
  });

  function onPageSnap(p: number) {
    if (p === page) return;
    if (!reduceMotion) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const titles = ['Welcome', 'How it works', "You're safe here", 'Your persona', 'What resonates'];
    announce(titles[p] ?? '');
    setPage(p);
  }

  function goToPage(p: number) {
    runOnUI(() => { scrollTo(aScrollRef, p * W, 0, true); })();
    setPage(p);
  }

  // ── Persistence + navigation ───────────────────────────────────────────────
  async function persist(
    chosenPersona: Persona,
    chosenCats:    CategoryId[],
    dest:          '/write' | '/read',
  ) {
    setSaving(true);
    try {
      await Promise.all([
        setProfilePersona(chosenPersona.id),
        saveReaderPreferences(chosenCats),
        markFtueDone(),
      ]);
    } catch { /* non-fatal — route through anyway */ }
    setSaving(false);
    router.replace(dest);
  }

  function handleSkip() {
    persist(randomPersona(), CATEGORIES.map(c => c.id), '/read');
  }

  function handleFinish(dest: '/write' | '/read') {
    const cats = selected.size > 0 ? [...selected] : CATEGORIES.map(c => c.id);
    const n    = name.trim();
    if (n) setProfileName(n).catch(() => {});
    persist(persona, cats, dest);
  }

  // ── Persona shuffle with pop spring ───────────────────────────────────────
  function shufflePersona() {
    setPersona(prev => {
      let next: Persona;
      do { next = randomPersona(); } while (next.id === prev.id);
      return next;
    });
    if (!reduceMotion) {
      runOnUI(() => {
        'worklet';
        bustScale.value = withSequence(
          withTiming(0.82, { duration: 60 }),
          withSpring(1,    { damping: 6, stiffness: 200, mass: 0.8 }),
        );
      })();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  }

  function toggleCategory(id: CategoryId) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Ambient background tint ───────────────────────────────────────────────
  const bgTintStyle = useAnimatedStyle(() => {
    if (reduceMotion) return {};
    return {
      backgroundColor: interpolateColor(
        scrollX.value,
        [0, W, 2 * W, 3 * W, 4 * W],
        [...BG_HUES],
      ),
    };
  });

  const commonSlideProps = { scrollX, W, cardW: CARD_W, cardH: CARD_H, reduceMotion };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>

      {/* Ambient background tint (7% opacity crossfade) */}
      <Animated.View
        style={[StyleSheet.absoluteFill, bgTintStyle, s.bgTint]}
        pointerEvents="none"
      />

      {/* Horizontal paged scroll */}
      <Animated.ScrollView
        ref={aScrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={scrollHandler}
        scrollEventThrottle={1}
        style={{ flex: 1 }}
      >

        {/* ── Beat 0 — Welcome ────────────────────────────────────────────── */}
        <BeatSlide
          {...commonSlideProps}
          index={0}
          showSkip={false}
          onSkip={handleSkip}
          glowCfg={BEAT_GLOWS[0]}
        >
          <View style={s.col}>
            <View style={s.heroCenter}>
              <Image
                source={require('../assets/splash-icon.png')}
                style={s.logo}
                resizeMode="contain"
                accessibilityLabel="soulyap"
              />
              <Text style={s.title}>welcome to{'\n'}soulyap</Text>
              <Text style={s.body}>
                say the things you can't say out loud — and meet the one person who felt the same.
              </Text>
            </View>
            <Pressable
              onPress={() => goToPage(1)}
              style={s.ctaPaper}
              accessibilityRole="button"
              accessibilityLabel="Begin"
            >
              <Text style={s.ctaPaperTxt}>begin</Text>
            </Pressable>
          </View>
        </BeatSlide>

        {/* ── Beat 1 — How it works ───────────────────────────────────────── */}
        <BeatSlide
          {...commonSlideProps}
          index={1}
          showSkip
          onSkip={handleSkip}
          glowCfg={BEAT_GLOWS[1]}
        >
          <View style={s.col}>
            <Image
              source={require('../assets/splash-icon.png')}
              style={s.logoSm}
              resizeMode="contain"
              accessibilityElementsHidden
            />
            <Text style={s.kick}>how it works</Text>
            <Text style={s.title}>write it,{'\n'}and you're heard</Text>
            <View style={s.heroCenter}>
              <MiniCard />
            </View>
            <Text style={[s.body, { marginBottom: 0 }]}>
              one true thing → one real match. no feed, no comments.
            </Text>
          </View>
        </BeatSlide>

        {/* ── Beat 2 — Safe here ──────────────────────────────────────────── */}
        <BeatSlide
          {...commonSlideProps}
          index={2}
          showSkip
          onSkip={handleSkip}
          glowCfg={BEAT_GLOWS[2]}
        >
          <View style={s.col}>
            <Image
              source={require('../assets/splash-icon.png')}
              style={s.logoSm}
              resizeMode="contain"
              accessibilityElementsHidden
            />
            <Text style={s.kick}>you're safe here</Text>
            <Text style={s.title}>nothing here{'\n'}can reach you</Text>
            <View style={s.ticks}>
              <View style={s.tick}>
                <ShieldIcon />
                <View style={{ flex: 1 }}>
                  <Text style={s.tickTitle}>anonymous</Text>
                  <Text style={s.tickBody}>never tied to you — even we can't.</Text>
                </View>
              </View>
              <View style={s.tick}>
                <NoReplyIcon />
                <View style={{ flex: 1 }}>
                  <Text style={s.tickTitle}>no replies, ever</Text>
                  <Text style={s.tickBody}>no DMs, no profiles. no one can find you.</Text>
                </View>
              </View>
              <View style={s.tick}>
                <CheckIcon />
                <View style={{ flex: 1 }}>
                  <Text style={s.tickTitle}>checked first</Text>
                  <Text style={s.tickBody}>reviewed before anyone sees it.</Text>
                </View>
              </View>
            </View>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => goToPage(3)}
              style={s.ctaPaper}
              accessibilityRole="button"
            >
              <Text style={s.ctaPaperTxt}>I understand</Text>
            </Pressable>
          </View>
        </BeatSlide>

        {/* ── Beat 3 — Your persona ───────────────────────────────────────── */}
        <BeatSlide
          {...commonSlideProps}
          index={3}
          showSkip
          onSkip={handleSkip}
          glowCfg={null}
          personaTint={persona.colors[0]}
        >
          <View style={s.col}>
            <View style={{ flex: 1 }} />

            {/* Tappable bust — shuffle on tap */}
            <Pressable
              onPress={shufflePersona}
              style={{ alignSelf: 'center' }}
              accessibilityRole="button"
              accessibilityLabel={`Your persona: ${name || persona.name}. Tap to change.`}
              accessibilityHint="Double-tap to shuffle to a different persona"
            >
              <FtueBust persona={persona} bustScale={bustScale} />
            </Pressable>

            {renaming ? (
              <TextInput
                style={[s.personaName, s.nameInput, { color: persona.colors[0] }]}
                value={name}
                onChangeText={setName}
                onBlur={() => setRenaming(false)}
                placeholder={persona.name}
                placeholderTextColor={color.dim}
                autoFocus
                maxLength={32}
                returnKeyType="done"
                onSubmitEditing={() => setRenaming(false)}
                accessibilityLabel="Enter your display name"
              />
            ) : (
              <Text style={[s.personaName, { color: persona.colors[0] }]}>
                you're {name || persona.name}
              </Text>
            )}

            <Text style={s.body}>
              a private face, just for you — never shown on a confession.{' '}
              <Text style={{ color: color.paper, fontFamily: fontFamily.sansBold }}>
                tap it to change.
              </Text>
            </Text>

            <View style={{ flex: 1 }} />

            <View style={s.ghostRow}>
              <Pressable onPress={shufflePersona} hitSlop={10}>
                <Text style={s.ghostLink}>↻ shuffle</Text>
              </Pressable>
              <Text style={s.ghostDot}> · </Text>
              <Pressable
                onPress={() => { setRenaming(true); if (!name) setName(persona.name); }}
                hitSlop={10}
              >
                <Text style={s.ghostLink}>rename</Text>
              </Pressable>
            </View>

            <WarmCta label="that's me" onPress={() => goToPage(4)} />
          </View>
        </BeatSlide>

        {/* ── Beat 4 — Categories ─────────────────────────────────────────── */}
        <BeatSlide
          {...commonSlideProps}
          index={4}
          showSkip={false}
          onSkip={handleSkip}
          glowCfg={BEAT_GLOWS[4]}
        >
          <View style={s.col}>
            <Image
              source={require('../assets/splash-icon.png')}
              style={s.logoSm}
              resizeMode="contain"
              accessibilityElementsHidden
            />
            <Text style={s.kick}>what resonates</Text>
            <Text style={s.title}>what do you{'\n'}want to read?</Text>

            <View style={s.chips}>
              {CATEGORIES.map(cat => {
                const on = selected.has(cat.id);
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => toggleCategory(cat.id)}
                    style={[
                      s.chip,
                      on && { borderColor: cat.color, backgroundColor: cat.color + '1A' },
                    ]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={cat.label}
                  >
                    <CategoryBadge id={cat.id} size={26} />
                    <Text style={[s.chipTxt, on && { color: cat.color, fontFamily: fontFamily.sansBold }]}>
                      {cat.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ flex: 1 }} />

            <WarmCta
              label="say your first thing"
              onPress={() => handleFinish('/write')}
              disabled={saving}
            />
            <Pressable
              onPress={() => handleFinish('/read')}
              disabled={saving}
              hitSlop={10}
              style={{ marginTop: 12, alignSelf: 'center' }}
              accessibilityRole="button"
            >
              <Text style={s.ghostLink}>or read a few first</Text>
            </Pressable>
          </View>
        </BeatSlide>

      </Animated.ScrollView>

      {/* Fixed segment bar below the scroll — outside the ScrollView */}
      <View style={[s.segBarRow, { paddingBottom: insets.bottom + 12 }]}>
        <SegmentBar scrollX={scrollX} W={W} />
      </View>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: color.ink,
  },
  bgTint: {
    opacity: 0.07,
  },

  // Card shell
  card: {
    backgroundColor: color.ink,
    borderRadius:    36,
    borderWidth:     1,
    borderColor:     'rgba(243,238,232,0.07)',
    overflow:        'hidden',
    shadowColor:     '#000',
    shadowOpacity:   0.55,
    shadowRadius:    26,
    shadowOffset:    { width: 0, height: 13 },
    elevation:       20,
  },
  cardContent: {
    padding: 26,
  },
  cardContentSkip: {
    paddingBottom: 54,
  },

  // Skip button — bottom-center of the card (outside parallax layer)
  skipBtn: {
    position:   'absolute',
    bottom:     20,
    left:       0,
    right:      0,
    alignItems: 'center',
    zIndex:     10,
  },
  skipText: {
    fontFamily:    fontFamily.sans,
    fontSize:      12,
    letterSpacing: 0.4,
    color:         'rgba(243,238,232,0.48)',
  },

  // Column layout used inside every beat card
  col: {
    flex:           1,
    flexDirection:  'column',
    gap:            14,
  },

  // Logo
  logo: {
    width:        150,
    height:       150,
    alignSelf:    'center',
    marginBottom: 8,
  },
  logoSm: {
    width:       26,
    height:      26,
    alignSelf:   'center',
    opacity:     0.9,
    marginTop:   2,
  },

  // Hero center area (flex: 1 so it pushes CTAs to the bottom)
  heroCenter: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            16,
  },

  // Text styles
  kick: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      10,
    letterSpacing: 3.5,
    textTransform: 'uppercase',
    color:         'rgba(243,238,232,0.65)',
    textAlign:     'center',
    marginTop:     4,
  },
  title: {
    fontFamily: fontFamily.serifItalic,
    fontSize:   30,
    lineHeight: 35,
    color:      color.paper,
    textAlign:  'center',
  },
  body: {
    fontFamily: fontFamily.sans,
    fontSize:   13,
    lineHeight: 21,
    color:      'rgba(243,238,232,0.82)',
    textAlign:  'center',
    maxWidth:   240,
    alignSelf:  'center',
  },

  // Safety ticks (beat 2)
  ticks: {
    gap:       20,
    marginTop: 6,
  },
  tick: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           12,
  },
  tickTitle: {
    fontFamily: fontFamily.serifItalic,
    fontSize:   13.5,
    color:      color.paper,
    marginBottom: 2,
  },
  tickBody: {
    fontFamily: fontFamily.sans,
    fontSize:   12.5,
    lineHeight: 18,
    color:      '#EDE7DE',
  },

  // Persona (beat 3)
  personaName: {
    fontFamily: fontFamily.serifItalic,
    fontSize:   27,
    textAlign:  'center',
    marginTop:  4,
  },
  nameInput: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(243,238,232,0.25)',
    paddingBottom:     4,
    fontSize:          22,
  },
  ghostRow: {
    flexDirection:  'row',
    justifyContent: 'center',
    alignItems:     'center',
    marginBottom:   8,
  },
  ghostLink: {
    fontFamily: fontFamily.sans,
    fontSize:   12.5,
    color:      'rgba(243,238,232,0.70)',
  },
  ghostDot: {
    fontFamily: fontFamily.sans,
    fontSize:   12.5,
    color:      'rgba(243,238,232,0.35)',
  },

  // Category chips (beat 4)
  chips: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            7,
    justifyContent: 'center',
    marginTop:      4,
  },
  chip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    borderWidth:       1.5,
    borderColor:       'rgba(243,238,232,0.22)',
    borderRadius:      999,
    paddingVertical:   5,
    paddingHorizontal: 10,
  },
  chipTxt: {
    fontFamily: fontFamily.sans,
    fontSize:   11.5,
    color:      '#EDE7DE',
  },

  // CTA buttons
  ctaPaper: {
    backgroundColor: color.paper,
    borderRadius:    999,
    paddingVertical: 13,
    alignItems:      'center',
  },
  ctaPaperTxt: {
    fontFamily: fontFamily.sansBold,
    fontSize:   14,
    color:      '#9c2f17',
  },
  ctaWarm: {
    borderRadius:    999,
    paddingVertical: 13,
    alignItems:      'center',
  },
  ctaWarmTxt: {
    fontFamily: fontFamily.sansBold,
    fontSize:   14,
    color:      '#3A0A14',
  },

  // Dot indicator
  segBarRow: {
    paddingTop:  10,
    alignItems:  'center',
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
