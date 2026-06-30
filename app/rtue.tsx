/**
 * RTUE — Return-to-Use Experience.
 *
 * Full-screen moment screen. Never shown as a chooser or tab.
 * The orchestrator (lib/rtue.ts) already picked the ONE state to show;
 * this screen just renders it and routes out.
 *
 * If evaluateRtue() returns null on mount (e.g. race with a fresh install),
 * we immediately replace to /read so nothing is blocked.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { PrimaryButton } from '@/components/Buttons';
import { evaluateRtue, markRtueSeen, clearRtueCache, type RtueMoment, type RtueState } from '@/lib/rtue';
import { color, fontFamily } from '@/theme/tokens';
import { announce } from '@/lib/a11y';

// ─── Glow configs per state ───────────────────────────────────────────────────

const GLOW: Record<RtueState, { color: string; opacity: number }> = {
  not_yet:   { color: '#9C8BF6', opacity: 0.32 },
  one:       { color: '#F5996E', opacity: 0.38 },
  few:       { color: '#F5996E', opacity: 0.38 },
  growing:   { color: '#F5996E', opacity: 0.42 },
  milestone: { color: '#FBBF24', opacity: 0.40 },
};

// ─── Copy per state ───────────────────────────────────────────────────────────

const COPY: Record<RtueState, {
  hi:          string;
  feltLabel:   string;
  sub:         (gained: number, current: number) => string;
  primary:     string;
  primaryDest: '/write' | '/read';
  ghost:       string;
  ghostDest:   '/write' | '/read';
}> = {
  not_yet: {
    hi:          "it's still travelling",
    feltLabel:   '',
    sub:         () => "you said the thing — that took more than most manage. someone will feel it; it just hasn't reached them yet.",
    primary:     "read someone else's",
    primaryDest: '/read',
    ghost:       'say something new',
    ghostDest:   '/write',
  },
  one: {
    hi:          'someone felt this',
    feltLabel:   'person felt exactly this',
    sub:         () => "one stranger, somewhere, a little less alone because you spoke. that's the whole point.",
    primary:     'say something new',
    primaryDest: '/write',
    ghost:       "read someone else's",
    ghostDest:   '/read',
  },
  few: {
    hi:          'you were felt',
    feltLabel:   'felt this too',
    sub:         (_, n) => `${n} ${n === 1 ? 'stranger' : 'strangers'}, less alone because you didn't stay silent.`,
    primary:     'say something new',
    primaryDest: '/write',
    ghost:       'just sit with this',
    ghostDest:   '/read',
  },
  growing: {
    hi:          'you were heard',
    feltLabel:   'felt this too',
    sub:         () => "you're still not the only one.",
    primary:     'say something new',
    primaryDest: '/write',
    ghost:       'just sit with this',
    ghostDest:   '/read',
  },
  milestone: {
    hi:          'a milestone',
    feltLabel:   'have felt this',
    sub:         (_, n) => `${n.toLocaleString()} strangers, less alone because you spoke once.`,
    primary:     'say something new',
    primaryDest: '/write',
    ghost:       'not now',
    ghostDest:   '/read',
  },
};

// ─── ScreenGlow ──────────────────────────────────────────────────────────────
// Full-screen SVG radial glow, anchored at 28% from top.

function ScreenGlow({ glowColor, opacity, W, H }: {
  glowColor: string; opacity: number; W: number; H: number;
}) {
  const cx = W * 0.5;
  const cy = H * 0.28;
  const r  = W * 0.72;
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <Defs>
        <RadialGradient id="rg" cx={cx} cy={cy} r={r} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={glowColor} stopOpacity={String(opacity)} />
          <Stop offset="1" stopColor={glowColor} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={W} height={H} fill="url(#rg)" />
    </Svg>
  );
}

// ─── AnimatedCount ────────────────────────────────────────────────────────────
// Counts up from `from` to `to` with cubic ease-out over 1200ms.

function AnimatedCount({ from, to, state }: { from: number; to: number; state: RtueState }) {
  const anim    = useRef(new Animated.Value(from)).current;
  const [disp, setDisp] = useState(from);

  useEffect(() => {
    const id = anim.addListener(({ value }) => setDisp(Math.round(value)));
    // Delay slightly so the screen glow has rendered
    const timer = setTimeout(() => {
      Animated.timing(anim, {
        toValue:         to,
        duration:        1200,
        easing:          Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }, 220);
    return () => { clearTimeout(timer); anim.removeListener(id); };
  }, []);

  const countColor = state === 'milestone' ? '#FBBF24' : color.paper;

  return (
    <Text style={[st.count, { color: countColor }]}>
      {disp.toLocaleString()}
    </Text>
  );
}

// ─── StatPill ─────────────────────────────────────────────────────────────────
// "+N while you were away" with a beating heart icon.

function StatPill({ gained, state }: { gained: number; state: RtueState }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.28, duration: 200, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.00, duration: 200, useNativeDriver: true }),
        Animated.delay(1900),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const label = state === 'milestone'
    ? 'a milestone ✨'
    : state === 'not_yet'
    ? ''
    : gained === 1
      ? '+1 since you left'
      : `+${gained.toLocaleString()} ${gained >= 20 ? 'while you were away' : 'since you left'}`;

  if (!label) return null;

  return (
    <View style={st.pill}>
      <Animated.Text style={[st.pillHeart, { transform: [{ scale }] }]}>♥</Animated.Text>
      <Text style={st.pillText}>{label}</Text>
    </View>
  );
}

// ─── YouWroteCard ─────────────────────────────────────────────────────────────

function YouWroteCard({ text }: { text: string }) {
  return (
    <View style={st.youCard}>
      <Text style={st.youLabel}>you wrote</Text>
      <Text style={st.youText} numberOfLines={5} ellipsizeMode="tail">{text}</Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function RtueScreen() {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [moment, setMoment] = useState<RtueMoment | null | 'loading'>('loading');

  useEffect(() => {
    evaluateRtue().then(m => {
      if (!m) { router.replace('/read'); return; }
      setMoment(m);
      announce(
        m.state === 'not_yet'
          ? 'Welcome back. Your confession is still travelling.'
          : `Welcome back. ${m.current.toLocaleString()} people felt this too.`
      );
    }).catch(() => router.replace('/read'));
  }, []);

  function dismiss(dest: '/write' | '/read') {
    if (moment && moment !== 'loading') {
      markRtueSeen(moment.id, moment.current).catch(() => {});
      clearRtueCache();
    }
    router.replace(dest);
  }

  if (moment === 'loading' || moment === null) return null;

  const { state, text, current, lastSeen, gained } = moment;
  const glow  = GLOW[state];
  const copy  = COPY[state];
  const animFrom = lastSeen ?? Math.max(0, current - Math.min(gained, 30));

  return (
    <View style={[st.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScreenGlow glowColor={glow.color} opacity={glow.opacity} W={W} H={H} />

      <View style={st.content}>

        {/* Logo + kick */}
        <Image
          source={require('../assets/splash-icon.png')}
          style={st.logo}
          resizeMode="contain"
          accessibilityElementsHidden
        />
        <Text style={st.kick}>welcome back</Text>

        {/* Headline */}
        <Text style={st.hi}>{copy.hi}</Text>

        {/* Your confession mini-card */}
        <YouWroteCard text={text} />

        {/* Moment: count or big text */}
        <View style={st.moment}>
          {state === 'not_yet' ? (
            <Text style={st.bigText}>out there,{'\n'}finding its person</Text>
          ) : (
            <>
              <AnimatedCount from={animFrom} to={current} state={state} />
              <Text style={st.feltLabel}>{copy.feltLabel}</Text>
              {gained > 0 && <StatPill gained={gained} state={state} />}
            </>
          )}
        </View>

        {/* Sub-text */}
        <Text style={st.sub}>{copy.sub(gained, current)}</Text>

        {/* Push CTAs to bottom */}
        <View style={{ flex: 1 }} />

        <PrimaryButton
          label={copy.primary}
          onPress={() => dismiss(copy.primaryDest)}
        />
        <Pressable
          onPress={() => dismiss(copy.ghostDest)}
          hitSlop={12}
          style={st.ghostWrap}
          accessibilityRole="button"
          accessibilityLabel={copy.ghost}
        >
          <Text style={st.ghost}>{copy.ghost}</Text>
        </Pressable>

      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: color.ink,
  },
  content: {
    flex:              1,
    paddingHorizontal: 28,
    paddingTop:        16,
    paddingBottom:     8,
    alignItems:        'center',
  },

  logo: {
    width:     24,
    height:    24,
    opacity:   0.95,
    alignSelf: 'center',
    marginBottom: 2,
  },
  kick: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      9.5,
    letterSpacing: 1.9,
    textTransform: 'uppercase',
    color:         'rgba(243,238,232,0.70)',
    marginTop:     8,
  },
  hi: {
    fontFamily: fontFamily.serifItalic,
    fontSize:   23,
    lineHeight: 27,
    color:      color.paper,
    textAlign:  'center',
    marginTop:  6,
  },

  // "you wrote" card
  youCard: {
    width:           '100%',
    backgroundColor: '#0B0910',
    borderWidth:     1,
    borderColor:     'rgba(243,238,232,0.10)',
    borderRadius:    15,
    padding:         13,
    marginTop:       14,
  },
  youLabel: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      8,
    letterSpacing: 1.28,
    textTransform: 'uppercase',
    color:         '#F5996E',
    marginBottom:  4,
  },
  youText: {
    fontFamily: fontFamily.serif,
    fontSize:   12,
    lineHeight: 17,
    color:      color.paper,
  },

  // Moment area
  moment: {
    marginTop:      14,
    alignItems:     'center',
    minHeight:      78,
    justifyContent: 'center',
    gap:            4,
  },
  count: {
    fontFamily: fontFamily.serifItalic,
    fontSize:   44,
    lineHeight: 48,
  },
  feltLabel: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      9.5,
    letterSpacing: 0.66,
    textTransform: 'uppercase',
    color:         color.dim,
    textAlign:     'center',
  },
  bigText: {
    fontFamily: fontFamily.serifItalic,
    fontSize:   20,
    lineHeight: 24,
    color:      color.paper,
    textAlign:  'center',
  },

  // Stat pill
  pill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    backgroundColor:   'rgba(245,153,110,0.12)',
    borderWidth:       1,
    borderColor:       'rgba(245,153,110,0.38)',
    borderRadius:      999,
    paddingVertical:   5,
    paddingHorizontal: 11,
    marginTop:         7,
  },
  pillHeart: {
    fontSize:   11,
    color:      '#F5996E',
    lineHeight: 13,
  },
  pillText: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      11,
    color:         '#F5996E',
    letterSpacing: 0.1,
  },

  // Sub text
  sub: {
    fontFamily: fontFamily.sans,
    fontSize:   11.5,
    lineHeight: 17,
    color:      'rgba(243,238,232,0.85)',
    textAlign:  'center',
    marginTop:  12,
    maxWidth:   240,
  },

  // Ghost
  ghostWrap: {
    marginTop:  9,
    alignItems: 'center',
  },
  ghost: {
    fontFamily: fontFamily.sans,
    fontSize:   11.5,
    color:      'rgba(243,238,232,0.70)',
  },
});
