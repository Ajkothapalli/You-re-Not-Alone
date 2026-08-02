/**
 * FTUE v2 — "The Doorway"
 *
 * 5-beat onboarding driven by react-native-reanimated.
 * scrollX → card depth (scale 0.96↔1.0 + opacity 0.7↔1.0)
 *         → content parallax (0.10× translateX, clipped at card boundary)
 *
 * Beats:
 *  0 – Welcome       (logo, tagline, begin)
 *  1 – How it works  (mini confession card at −3°)
 *  2 – Safe here     (3 safety pillars)
 *  3 – Your persona  (tappable bust, shuffle, rename)
 *  4 – Categories    (multi-select chips, two CTAs)
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
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { CATEGORIES, type CategoryId } from '@/lib/categories';
import { HeartIcon } from '@/components/HeartIcon';
import { CategoryBadge } from '@/components/CategoryGlyph';
import { markFtueDone } from '@/lib/onboarding';
import { setProfilePersona, setProfileName } from '@/lib/profile';
import { saveReaderPreferences } from '@/lib/api';
import { announce, useReducedMotion } from '@/lib/a11y';
import { randomPersona, type Persona, Bust, PERSONAS } from '@/components/Persona';
import { PrimaryButton, GhostButton } from '@/components/Buttons';
import { ScrawlIcon } from '@/components/ScrawlIcon';
import { color, fontFamily, radius } from '@/theme/tokens';
import { useTheme, useThemeColors } from '@/theme/ThemeProvider';

// ─── Design constants ─────────────────────────────────────────────────────────

const SHAD   = 4;
const BORDER = '#1A1A1A';
const INK2   = '#241F2B';
const EYE_W  = '#FBF7F0';
const LEFT_R = 0.4111; // splash-quote-left width ratio

// ─── FtueBust ─────────────────────────────────────────────────────────────────

function FtueBust({ persona, bustScale }: { persona: Persona; bustScale: SharedValue<number> }) {
  const [, skin, hair] = persona.colors;
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: bustScale.value }] }));
  return (
    <Animated.View style={aStyle}>
      <Svg width={120} height={126} viewBox="0 0 80 84">
        <Circle cx="40" cy="38" r="33" fill={hair} />
        <Circle cx="40" cy="44" r="24" fill={skin} />
        <Path d="M16 36 Q40 6 64 36 Q56 22 40 21 Q24 22 16 36 Z" fill={hair} />
        <Ellipse cx="31" cy="44" rx="4" ry="5" fill={EYE_W} />
        <Ellipse cx="49" cy="44" rx="4" ry="5" fill={EYE_W} />
        <Circle cx="31.6" cy="44.8" r="2.3" fill={INK2} />
        <Circle cx="49.6" cy="44.8" r="2.3" fill={INK2} />
        <Ellipse cx="26" cy="52" rx="4" ry="2.6" fill="#F0837A" fillOpacity="0.55" />
        <Ellipse cx="54" cy="52" rx="4" ry="2.6" fill="#F0837A" fillOpacity="0.55" />
        <Path d="M34 56 Q40 60 46 56" stroke={INK2} strokeWidth="2" fill="none" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

// ─── PersonaCircle — shared across illustrations ──────────────────────────────

function PersonaCircle({ id, size }: { id: string; size: number }) {
  const persona = PERSONAS.find(p => p.id === id) ?? PERSONAS[0];
  return (
    <View style={{
      width:           size,
      height:          size,
      borderRadius:    size / 2,
      backgroundColor: persona.colors[0] + '30',
      alignItems:      'center',
      justifyContent:  'center',
      overflow:        'hidden',
      borderWidth:     2,
      borderColor:     BORDER,
    }}>
      <Svg width={size * 1.25} height={size * 1.25} viewBox="0 0 24 24">
        <Bust id={id} skin={persona.colors[1]} hair={persona.colors[2]} />
      </Svg>
    </View>
  );
}

// ─── IllustrationConnect (beat 0) — two people finding each other ─────────────

function IllustrationConnect() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <PersonaCircle id="cove"  size={92} />
      {/* Brand quote marks = the shared confession linking them */}
      <View style={{ alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', width: 48, height: 48, marginBottom: -Math.round(48 * 0.28) }}>
          <Image source={require('../assets/splash-quote-left.png')}  style={{ width: 48 * LEFT_R,        height: 48 }} resizeMode="stretch" />
          <Image source={require('../assets/splash-quote-right.png')} style={{ width: 48 * (1 - LEFT_R),  height: 48 }} resizeMode="stretch" />
        </View>
      </View>
      <PersonaCircle id="miles" size={92} />
    </View>
  );
}

// ─── MiniCard (beat 1 confession preview) ─────────────────────────────────────

function MiniCard() {
  return (
    <View style={mc.wrapper}>
      <View pointerEvents="none" style={mc.shadow} />
      <View style={mc.card}>
        <View style={mc.labelRow}>
          <PersonaCircle id="max"   size={22} />
          <Text style={mc.labelW}>You wrote</Text>
        </View>
        <Text style={mc.confText}>"i smile all day so nobody worries."</Text>
        <View style={mc.seam} />
        <View style={mc.labelRow}>
          <PersonaCircle id="river" size={22} />
          <Text style={mc.labelC}>They wrote</Text>
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

const mc = StyleSheet.create({
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
    backgroundColor: BORDER,
  },
  card: {
    width:           248,
    backgroundColor: color.ink,
    borderRadius:    16,
    borderWidth:     2,
    borderColor:     BORDER,
    padding:         18,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           7,
    marginBottom:  5,
  },
  labelW: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      9,
    letterSpacing: 1.44,
    textTransform: 'uppercase',
    color:         '#E8A87C',
  },
  labelC: {
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
  seam: {
    height:          1,
    backgroundColor: 'rgba(26,26,26,0.12)',
    marginTop:       12,
    marginBottom:    12,
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

// ─── Safety icons ─────────────────────────────────────────────────────────────

function ShieldIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z" stroke={BORDER} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function NoReplyIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke={BORDER} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M8 11h8" stroke={BORDER} strokeWidth="2.2" strokeLinecap="round" />
    </Svg>
  );
}

function CheckIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={BORDER} strokeWidth="2.2" />
      <Path d="M9 12l2 2 4-4" stroke={BORDER} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── SegmentBar ───────────────────────────────────────────────────────────────

function SegItem({ i, scrollX, W }: { i: number; scrollX: SharedValue<number>; W: number }) {
  const dynColor = useThemeColors();
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

function SegmentBar({ scrollX, W }: { scrollX: SharedValue<number>; W: number }) {
  return (
    <View style={s.segBar}>
      {[0, 1, 2, 3, 4, 5].map(i => <SegItem key={i} i={i} scrollX={scrollX} W={W} />)}
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

export default function WelcomeScreen() {
  const { width: W, height: H } = useWindowDimensions();
  const insets       = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const CARD_W = W - 48;
  const CARD_H = Math.min(H - insets.top - insets.bottom - 100, 580);

  const { setTheme } = useTheme();
  const dynColor = useThemeColors();

  const [persona,      setPersona]      = useState<Persona>(() => randomPersona());
  const [name,         setName]         = useState('');
  const [renaming,     setRenaming]     = useState(false);
  const [selected,     setSelected]     = useState<Set<CategoryId>>(new Set(CATEGORIES.map(c => c.id)));
  const [saving,       setSaving]       = useState(false);
  const [page,         setPage]         = useState(0);
  const [chosenTheme,  setChosenTheme]  = useState<'light' | 'dark' | null>(null);

  const scrollX    = useSharedValue(0);
  const bustScale  = useSharedValue(1);
  const aScrollRef = useAnimatedRef<Animated.ScrollView>();

  const scrollHandler = useAnimatedScrollHandler({
    onScroll:      (e) => { scrollX.value = e.contentOffset.x; },
    onMomentumEnd: (e) => {
      const p = Math.round(e.contentOffset.x / W);
      runOnJS(onPageSnap)(p);
    },
  });

  function onPageSnap(p: number) {
    if (p === page) return;
    if (!reduceMotion) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const titles = ['Welcome', 'How it works', "You're safe here", 'Your persona', 'What resonates', 'Appearance'];
    announce(titles[p] ?? '');
    setPage(p);
  }

  function goToPage(p: number) {
    runOnUI(() => { scrollTo(aScrollRef, p * W, 0, true); })();
    setPage(p);
  }

  async function persist(chosenPersona: Persona, chosenCats: CategoryId[], dest: '/write' | '/read') {
    setSaving(true);
    try {
      await Promise.all([
        setProfilePersona(chosenPersona.id),
        saveReaderPreferences(chosenCats),
        markFtueDone(),
      ]);
    } catch { /* non-fatal */ }
    setSaving(false);
    router.replace(dest);
  }

  function handleSkip() {
    persist(randomPersona(), CATEGORIES.map(c => c.id), '/read');
  }

  function handleFinish(dest: '/write' | '/read') {
    const cats = selected.size > 0 ? [...selected] : CATEGORIES.map(c => c.id);
    const n = name.trim();
    if (n) setProfileName(n).catch(() => {});
    persist(persona, cats, dest);
  }

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

  const commonSlideProps = { scrollX, W, cardW: CARD_W, cardH: CARD_H, reduceMotion };

  return (
    <View style={[s.root, { paddingTop: insets.top, backgroundColor: dynColor.bg }]}>

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
            {/* Illustration fills the flex center */}
            <View style={s.heroCenter}>
              <IllustrationConnect />
            </View>
            <Text style={s.tagline}>
              Say the things you can't say out loud — and meet the one person who felt the same.
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
            <Text style={s.title}>Write it,{'\n'}and you're heard</Text>
            <View style={s.heroCenter}>
              <MiniCard />
            </View>
            <Text style={s.body}>
              One true thing → one real match. No feed, no comments.
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
            <View style={{ alignItems: 'center', marginVertical: 4 }}>
              <PersonaCircle id="sage" size={80} />
            </View>
            <View style={s.ticks}>
              <View style={s.tick}>
                <ShieldIcon />
                <View style={{ flex: 1 }}>
                  <Text style={s.tickTitle}>Anonymous</Text>
                  <Text style={s.tickBody}>Always a random persona — no one can tie it to you.</Text>
                </View>
              </View>
              <View style={s.tick}>
                <NoReplyIcon />
                <View style={{ flex: 1 }}>
                  <Text style={s.tickTitle}>No replies, ever</Text>
                  <Text style={s.tickBody}>No DMs, no profiles. No one can find you.</Text>
                </View>
              </View>
              <View style={s.tick}>
                <CheckIcon />
                <View style={{ flex: 1 }}>
                  <Text style={s.tickTitle}>Checked first</Text>
                  <Text style={s.tickBody}>Reviewed before anyone sees it.</Text>
                </View>
              </View>
            </View>
            <PrimaryButton label="I understand" onPress={() => goToPage(3)} />
          </View>
        </BeatSlide>

        {/* ── Beat 3 — Your persona ─────────────────────────────────────── */}
        <BeatSlide {...commonSlideProps} index={3} showSkip onSkip={handleSkip} accent="#B388FF">
          <View style={s.col}>
            <View style={{ flex: 1 }} />

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
                style={[s.personaName, s.nameInput]}
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
              <Text style={s.personaName}>
                You're{' '}
                <Text style={s.personaNameBold}>{name || persona.name}</Text>
              </Text>
            )}

            <Text style={s.body}>
              A private face, just for you — never shown on a confession.{' '}
              <Text style={s.bodyBold}>Tap it to change.</Text>
            </Text>

            <View style={{ flex: 1 }} />

            <View style={s.ghostRow}>
              <Pressable onPress={shufflePersona} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <ScrawlIcon name="arrow_loop" size={16} color={BORDER} roughen={false} strokeWidth={2.5} />
                <Text style={s.ghostLink}>Shuffle</Text>
              </Pressable>
              <Text style={s.ghostDot}> · </Text>
              <Pressable
                onPress={() => { setRenaming(true); if (!name) setName(persona.name); }}
                hitSlop={10}
              >
                <Text style={s.ghostLink}>Rename</Text>
              </Pressable>
            </View>

            <PrimaryButton label="That's me" onPress={() => goToPage(4)} />
          </View>
        </BeatSlide>

        {/* ── Beat 4 — Categories ───────────────────────────────────────── */}
        <BeatSlide {...commonSlideProps} index={4} showSkip={false} onSkip={handleSkip} accent="#CCFF00">
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

            <PrimaryButton
              label="Next"
              onPress={() => goToPage(5)}
            />
          </View>
        </BeatSlide>

        {/* ── Beat 5 — Appearance ───────────────────────────────────── */}
        <BeatSlide {...commonSlideProps} index={5} showSkip={false} onSkip={handleSkip} accent="#B388FF">
          <View style={s.col}>
            <View style={s.logoRowSm}>
              <Image source={require('../assets/splash-quote-left.png')}  style={s.logoSmLeft}  resizeMode="stretch" />
              <Image source={require('../assets/splash-quote-right.png')} style={s.logoSmRight} resizeMode="stretch" />
            </View>
            <Text style={[s.kick, { color: dynColor.dim }]}>One last thing</Text>
            <Text style={[s.title, { color: dynColor.paper }]}>How do you like{'\n'}your screen?</Text>

            <View style={s.heroCenter}>
              <View style={s.themeOptions}>
                {([
                  { mode: 'light' as const, icon: 'sun',  label: 'Light' },
                  { mode: 'dark'  as const, icon: 'moon', label: 'Dark'  },
                ]).map(({ mode, icon, label }) => {
                  const active = chosenTheme === mode;
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => {
                        setChosenTheme(mode);
                        setTheme(mode);
                      }}
                      style={[s.themeOpt, !active && { borderColor: dynColor.border }, active && s.themeOptActive]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${label} mode`}
                    >
                      <ScrawlIcon
                        name={icon}
                        size={32}
                        color={active ? '#1A1A1A' : dynColor.dim}
                        roughen={false}
                        strokeWidth={2.5}
                      />
                      <Text style={[s.themeOptLabel, { color: dynColor.dim }, active && s.themeOptLabelActive]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {chosenTheme !== null && (
                <Text style={[s.themeHint, { color: dynColor.dim }]}>You can always switch this in your profile.</Text>
              )}
            </View>

            <PrimaryButton
              label="Say your first thing"
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
              <Text style={[s.ghostLink, { color: dynColor.dim }]}>Or read a few first</Text>
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

const LOGO_H   = 96;
const LOGO_SM  = 32;

const s = StyleSheet.create({
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
    borderColor:     BORDER,
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

  // Logo — beat 0 (large, two-part)
  logoRow: {
    flexDirection: 'row',
    width:         LOGO_H,
    height:        LOGO_H,
    marginBottom:  -Math.round(LOGO_H * 0.28), // compensate baked-in transparent padding
  },
  logoLeft:  { width: LOGO_H * LEFT_R,        height: LOGO_H },
  logoRight: { width: LOGO_H * (1 - LEFT_R),  height: LOGO_H },

  // Logo — small mark on beats 1/2/4
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
  bodyBold: {
    fontFamily: fontFamily.sansBold,
    color:      color.paper,
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
  personaName: {
    fontFamily: fontFamily.sansBold,
    fontSize:   26,
    textAlign:  'center',
    color:      color.paper,
    marginTop:  4,
  },
  personaNameBold: {
    fontFamily: fontFamily.sansBold,
    color:      color.paper,
  },
  nameInput: {
    borderBottomWidth:  2,
    borderBottomColor:  BORDER,
    paddingBottom:      4,
    fontSize:           22,
    color:              color.paper,
  },
  ghostRow: {
    flexDirection:  'row',
    justifyContent: 'center',
    alignItems:     'center',
    marginBottom:   4,
  },
  ghostLink: {
    fontFamily: fontFamily.sansBold,
    fontSize:   12,
    color:      color.dim,
  },
  ghostDot: {
    fontFamily: fontFamily.sans,
    fontSize:   12,
    color:      color.dim,
  },

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
    borderColor:       BORDER,
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
    color: BORDER,
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

  // Appearance (beat 5) — theme option cards
  themeOptions: {
    flexDirection: 'row',
    gap:           14,
    marginBottom:  4,
  },
  themeOpt: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            10,
    paddingVertical: 24,
    borderRadius:   radius.input,
    borderWidth:    2,
    borderColor:    BORDER,
    backgroundColor: 'transparent',
  },
  themeOptActive: {
    backgroundColor: '#FFE500',
  },
  themeOptLabel: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color:         color.dim,
  },
  themeOptLabelActive: {
    color: BORDER,
  },
  themeHint: {
    fontFamily: fontFamily.sans,
    fontSize:   12,
    lineHeight: 18,
    color:      color.dim,
    textAlign:  'center',
    maxWidth:   220,
  },

});
