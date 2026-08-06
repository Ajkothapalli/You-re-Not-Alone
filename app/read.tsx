/**
 * Onboarding read screen — shows up to 2 confessions before the write screen.
 *
 * Invariant (CLAUDE.md §2): this is the ONLY sanctioned read surface.
 * Hard cap of 2: server enforces it via get_onboarding_confessions(); the
 * client-side fallback below is also exactly 2 entries.
 * Owner decision 2026-06-12: shown every launch (not once per install).
 * Both cards visible simultaneously — not paginated, not a feed.
 * Report control present on every card (CLAUDE.md §2 requirement).
 *
 * Resilience: if the RPC fails or returns 0 rows the screen falls back to
 * two curated example confessions bundled in FALLBACK_CONFESSIONS. The screen
 * always appears — there is no bypass-to-write path.
 */

import ProfileButton from '@/components/ProfileButton';
import ReadCard from '@/components/ReadCard';
import { analytics } from '@/lib/analytics';
import { getMatchingCount, getOnboardingConfessions, reportConfession, type ReadConfession } from '@/lib/api';
import { session } from '@/lib/sessionFlags';
import { palettes } from '@/theme/palettes';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily, radius, spacing } from '@/theme/tokens';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Circle, Path, Ellipse, Line } from 'react-native-svg';
import { showDialog } from '@/components/AppDialog';
import { showToast } from '@/components/Toast';
import { BackgroundPattern } from '@/components/BackgroundPattern';
import { ScrawlIcon } from '@/components/ScrawlIcon';

const SHADOW = 4;

// Shown when the server pool is empty or the RPC fails.
// IDs match the seed migration so reporting works once the migration is applied.
const FALLBACK_CONFESSIONS: ReadConfession[] = [
  {
    id:         '00000000-0000-0000-0000-000000000001',
    text:       'I became so good at being okay that I stopped knowing when I wasn\'t. I smile through everything. I answer "fine" before people finish asking. I don\'t know how to let anyone actually see me.\n\nI\'ve been performing "fine" for so long that I\'m not sure who I am without it. I got the promotion, kept the friendships, showed up to every birthday. And every night I come home and sit in the quiet and feel nothing, and then feel everything, and then feel ashamed that I can\'t just be grateful.\n\nSomeone told me last week that I seem like I have it all together. I laughed and said thanks. I didn\'t know what else to do.',
    felt_count: 1284,
  },
  {
    id:         '00000000-0000-0000-0000-000000000002',
    text:       'There are things I did years ago that I still replay at 3am. Not because they were that bad, but because no one knows about them. The hiding is heavier than whatever I did. I\'m so tired of carrying it alone.\n\nI hurt someone who trusted me. Nothing illegal, nothing dramatic — just a quiet betrayal that I never confessed to. They moved on. They probably forgot. But I carry it every single day like a stone in my chest. I\'ve built a whole life around being a good person and this one thing keeps whispering that I\'m not.\n\nI don\'t know if telling anyone would make it better or just spread the weight around. So I keep it here, in the middle of the night, between me and no one.',
    felt_count: 973,
  },
];

export default function ReadScreen() {
  const color = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);
  const { from } = useLocalSearchParams<{ from?: string }>();

  const [items,      setItems]      = useState<ReadConfession[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [matchCount, setMatchCount] = useState(0);
  const [iconSession, setIconSession] = useState(() => Math.floor(Math.random() * 102));

  const done = useRef(false);

  useFocusEffect(useCallback(() => {
    setIconSession(Math.floor(Math.random() * 102));
  }, []));

  // No flag to set — read screen shows every launch (owner decision 2026-06-12).
  function finish() {
    if (done.current) return;
    done.current = true;
    router.replace('/(tabs)/write');
  }

  useEffect(() => {
    session.readShown = true;
    (async () => {
      try {
        const rows = await getOnboardingConfessions();
        setItems(rows.length > 0 ? rows : FALLBACK_CONFESSIONS);
      } catch {
        // RPC unavailable (migration not yet applied, network error, etc.)
        setItems(FALLBACK_CONFESSIONS);
      } finally {
        setLoading(false);
      }
    })();
    getMatchingCount().then(setMatchCount).catch(() => {});
  }, []);

  // Track impression for every card shown (both at once)
  useEffect(() => {
    items.forEach(item => analytics.onboardingReadShown(item.id));
  }, [items]);

  function handleReport(item: ReadConfession) {
    showDialog(
      'Report this confession',
      'Are you sure you want to report this?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:  'Report',
          style: 'destructive',
          onPress: async () => {
            try { await reportConfession(item.id, 'other'); } catch {}
            analytics.reportSubmitted(item.id);
            showToast('Successfully reported');
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={color.dim} accessibilityLabel="Loading confessions" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
    <BackgroundPattern />
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Global profile entry — top-left */}
      <View style={styles.topBar}>
        <ProfileButton />
      </View>

      <View style={styles.header}>
        <Text style={styles.heading} accessibilityRole="header">
          {from === 'match' ? '2 more, because you shared' : 'Before you write, read'}
        </Text>
        <Text style={styles.sub}>
          These people reached out into the dark.{'\n'}Someone always finds them.
        </Text>
      </View>

      {/* Both cards visible simultaneously — hard-capped at 2 by the server */}
      {items.map((item, i) => (
        <ReadCard
          key={item.id}
          text={item.text}
          feltCount={item.felt_count}
          palette={i === 0 ? palettes[0] : palettes[3]}
          onReport={() => handleReport(item)}
          onPress={() => router.push({
            pathname: '/read-detail',
            params: {
              id:           item.id,
              text:         item.text,
              feltCount:    String(item.felt_count),
              paletteIndex: String(i === 0 ? 0 : 3),
            },
          })}
          delay={i * 160}
          personaSeed={item.id}
          iconSessionOffset={iconSession}
        />
      ))}

      <WriteInviteCard onPress={finish} />

      <View style={styles.orRow}>
        <View style={styles.orLine} />
        <Text style={styles.orText}>or</Text>
        <View style={styles.orLine} />
      </View>

      <View style={styles.promoOuter}>
      <View pointerEvents="none" style={styles.promoShadow} />
      <Pressable
        onPress={() => router.push('/plans')}
        style={({ pressed }) => [styles.promoCard, pressed && styles.promoCardPressed]}
        accessibilityRole="button"
        accessibilityLabel="Unlock unlimited reads"
      >
        <View style={styles.promoTop}>
          <Text style={styles.promoEyebrow}>PREMIUM</Text>
          {matchCount > 0 && (
            <Text style={styles.promoStat}>{matchCount.toLocaleString()}+ waiting</Text>
          )}
        </View>
        <Text style={styles.promoTitle}>Don't stop at 2</Text>
        <Text style={styles.promoBody}>
          Right now, hundreds of confessions match what you carry.
          Premium readers see every one — no writing, no waiting.
        </Text>
        <View style={styles.promoCta}>
          <Text style={styles.promoCtaText}>Unlock unlimited reads</Text>
          <ScrawlIcon name="arrow_right" size={16} color="#0A0A0A" roughen={false} strokeWidth={2.5} />
        </View>
      </Pressable>
      </View>
    </ScrollView>
    </View>
  );
}

// ── WriteInviteCard ────────────────────────────────────────────────────────────

function WriteInviteCard({ onPress }: { onPress: () => void }) {
  const color = useThemeColors();
  const { width: screenW } = useWindowDimensions();
  const cardW = screenW - spacing.screenPadding * 2;
  const illH  = 160;

  // Sparkle cross at (cx, cy) with arm length r
  function Sparkle({ cx, cy, r, stroke }: { cx: number; cy: number; r: number; stroke: string }) {
    return (
      <>
        <Line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke={stroke} strokeWidth={2} strokeLinecap="round" />
        <Line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke={stroke} strokeWidth={2} strokeLinecap="round" />
        <Line x1={cx - r * 0.65} y1={cy - r * 0.65} x2={cx + r * 0.65} y2={cy + r * 0.65} stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
        <Line x1={cx + r * 0.65} y1={cy - r * 0.65} x2={cx - r * 0.65} y2={cy + r * 0.65} stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
      </>
    );
  }

  return (
    <View style={{ paddingRight: SHADOW, paddingBottom: SHADOW }}>
      {/* Neo-brutal hard shadow */}
      <View style={{
        position: 'absolute', top: SHADOW, left: SHADOW,
        right: 0, bottom: 0,
        borderRadius: 20,
        backgroundColor: color.border,
      }} />

      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          borderRadius:    20,
          borderWidth:     2,
          borderColor:     color.border,
          overflow:        'hidden',
          opacity:         pressed ? 0.9 : 1,
        })}
        accessibilityRole="button"
        accessibilityLabel="Now it's your turn — write a confession"
      >
        {/* ── Colourful illustration ── */}
        <Svg width={cardW} height={illH} viewBox={`0 0 ${cardW} ${illH}`}>
          {/* Dark base */}
          <Path d={`M0 0 H${cardW} V${illH} H0Z`} fill="#0D0D0D" />

          {/* Three overlapping colour blobs */}
          <Ellipse cx={cardW * 0.18} cy={illH * 0.45} rx={cardW * 0.30} ry={illH * 0.68} fill="#FF6B6B" opacity={0.82} />
          <Ellipse cx={cardW * 0.82} cy={illH * 0.45} rx={cardW * 0.30} ry={illH * 0.68} fill="#9B6BFF" opacity={0.82} />
          <Ellipse cx={cardW * 0.50} cy={illH * 0.80} rx={cardW * 0.28} ry={illH * 0.50} fill="#FFD166" opacity={0.88} />

          {/* Small accent dots */}
          <Circle cx={cardW * 0.08} cy={illH * 0.18} r={5} fill="#72D9C7" opacity={0.9} />
          <Circle cx={cardW * 0.92} cy={illH * 0.22} r={4} fill="#FFE500" opacity={0.9} />
          <Circle cx={cardW * 0.15} cy={illH * 0.82} r={3.5} fill="#FFE500" opacity={0.8} />
          <Circle cx={cardW * 0.85} cy={illH * 0.78} r={4} fill="#72D9C7" opacity={0.8} />
          <Circle cx={cardW * 0.50} cy={illH * 0.12} r={3} fill="#FF6B6B" opacity={0.7} />

          {/* Heart — centred */}
          <Path
            d={`
              M ${cardW * 0.5} ${illH * 0.60}
              C ${cardW * 0.5} ${illH * 0.60}
                ${cardW * 0.29} ${illH * 0.42}
                ${cardW * 0.29} ${illH * 0.30}
              C ${cardW * 0.29} ${illH * 0.19}
                ${cardW * 0.38} ${illH * 0.12}
                ${cardW * 0.5}  ${illH * 0.22}
              C ${cardW * 0.62} ${illH * 0.12}
                ${cardW * 0.71} ${illH * 0.19}
                ${cardW * 0.71} ${illH * 0.30}
              C ${cardW * 0.71} ${illH * 0.42}
                ${cardW * 0.5}  ${illH * 0.60}
                ${cardW * 0.5}  ${illH * 0.60}
              Z
            `}
            fill="white"
            opacity={0.95}
          />

          {/* Sparkles */}
          <Sparkle cx={cardW * 0.20} cy={illH * 0.30} r={8}  stroke="white" />
          <Sparkle cx={cardW * 0.80} cy={illH * 0.32} r={7}  stroke="white" />
          <Sparkle cx={cardW * 0.50} cy={illH * 0.72} r={6}  stroke="white" />
          <Sparkle cx={cardW * 0.12} cy={illH * 0.62} r={5}  stroke="#FFE500" />
          <Sparkle cx={cardW * 0.88} cy={illH * 0.60} r={5}  stroke="#FFE500" />
        </Svg>

        {/* ── Text area ── */}
        <View style={{
          backgroundColor:   color.ink,
          padding:           20,
          gap:               6,
        }}>
          <Text style={{
            fontFamily: fontFamily.sansBold,
            fontSize:   20,
            color:      color.paper,
            lineHeight: 27,
          }}>
            Now it's your turn
          </Text>
          <Text style={{
            fontFamily: fontFamily.sans,
            fontSize:   13,
            color:      color.dim,
            lineHeight: 19,
          }}>
            Write one confession — unlock 2 more reads
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <Text style={{
              fontFamily: fontFamily.sansBold,
              fontSize:   13,
              color:      color.paper,
              letterSpacing: 0.3,
            }}>
              Write yours
            </Text>
            <ScrawlIcon name="arrow_right" size={14} color={color.paper} roughen={false} strokeWidth={2.5} />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    root: {
      flex:            1,
      backgroundColor: color.bg,
    },
    center: {
      flex:            1,
      backgroundColor: color.bg,
      justifyContent:  'center',
      alignItems:      'center',
    },
    scroll: {
      flexGrow:      1,
      padding:       spacing.screenPadding,
      paddingTop:    64,
      paddingBottom: 96,
      gap:           24,
    },
    topBar: {
      flexDirection: 'row',
      marginBottom:  4,
    },
    header: {
      gap: 8,
    },
    heading: {
      fontFamily: fontFamily.sansBold,
      fontSize:   26,
      color:      color.paper,
      textAlign:  'center',
    },
    sub: {
      fontFamily:   fontFamily.sans,
      fontSize:     15,
      color:        color.dim,
      textAlign:    'center',
      lineHeight:   22,
      marginBottom: 4,
    },
    orRow: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:           12,
    },
    orLine: {
      flex:            1,
      height:          StyleSheet.hairlineWidth,
      backgroundColor: color.line,
    },
    orText: {
      fontFamily: fontFamily.sans,
      fontSize:   12,
      color:      color.dim,
    },
    promoOuter: {
      paddingRight:  SHADOW,
      paddingBottom: SHADOW,
    },
    promoShadow: {
      position:        'absolute',
      top:             SHADOW,
      left:            SHADOW,
      right:           0,
      bottom:          0,
      borderRadius:    radius.input,
      backgroundColor: color.border,
    },
    promoCard: {
      backgroundColor: color.ink,
      borderRadius:    radius.input,
      borderWidth:     2,
      borderColor:     color.border,
      padding:         20,
      gap:             12,
    },
    promoCardPressed: {
      opacity: 0.88,
    },
    promoTop: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'center',
    },
    promoEyebrow: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      10,
      letterSpacing: 1.6,
      color:         color.paper,
    },
    promoStat: {
      fontFamily: fontFamily.sansBold,
      fontSize:   12,
      color:      color.dim,
    },
    promoTitle: {
      fontFamily: fontFamily.sansBold,
      fontSize:   24,
      color:      color.paper,
      lineHeight: 30,
    },
    promoBody: {
      fontFamily: fontFamily.sans,
      fontSize:   14,
      color:      color.dim,
      lineHeight: 21,
    },
    promoCta: {
      flexDirection:     'row',
      alignItems:        'center',
      backgroundColor:   '#FFE500',
      borderRadius:      radius.pill,
      paddingHorizontal: 18,
      paddingVertical:   11,
      alignSelf:         'flex-start',
      marginTop:         4,
    },
    promoCtaText: {
      fontFamily: fontFamily.sansBold,
      fontSize:   14,
      color:      '#0A0A0A',
    },
    promoCtaArrow: {
      fontFamily: fontFamily.sansBold,
      fontSize:   14,
      color:      '#0A0A0A',
    },
  });
}
