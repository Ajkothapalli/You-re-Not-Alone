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

import { PrimaryButton } from '@/components/Buttons';
import ProfileButton from '@/components/ProfileButton';
import ReadCard from '@/components/ReadCard';
import { analytics } from '@/lib/analytics';
import { getMatchingCount, getOnboardingConfessions, reportConfession, type ReadConfession } from '@/lib/api';
import { session } from '@/lib/sessionFlags';
import { palettes } from '@/theme/palettes';
import { color, font, fontFamily, radius, spacing } from '@/theme/tokens';
import { useReturnLoop } from '@/hooks';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
  const { totalNewFelt, visible: returnVisible, dismiss: dismissReturn } = useReturnLoop();

  const [items,      setItems]      = useState<ReadConfession[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [matchCount, setMatchCount] = useState(0);

  const done = useRef(false);

  // No flag to set — read screen shows every launch (owner decision 2026-06-12).
  function finish() {
    if (done.current) return;
    done.current = true;
    router.replace('/write');
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
    Alert.alert(
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
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Global profile entry — top-left */}
      <View style={styles.topBar}>
        <ProfileButton />
      </View>

      {/* Return loop: show felt-count growth since last visit. Dismissed once per session. */}
      {returnVisible && (
        <Pressable
          style={styles.returnBanner}
          onPress={dismissReturn}
          accessibilityRole="button"
          accessibilityLabel={`Since you left, ${totalNewFelt} more ${totalNewFelt === 1 ? 'person' : 'people'} felt what you wrote. Tap to dismiss.`}
        >
          <Text style={styles.returnText}>
            since you left,{' '}
            <Text style={styles.returnCount}>{totalNewFelt.toLocaleString()}</Text>
            {' '}more {totalNewFelt === 1 ? 'person' : 'people'} felt what you wrote
          </Text>
          <Text style={styles.returnDismiss}>tap to dismiss</Text>
        </Pressable>
      )}

      <View style={styles.header}>
        <Text style={styles.heading} accessibilityRole="header">before you write, read</Text>
        <Text style={styles.sub}>
          these people reached out into the dark.{'\n'}someone always finds them.
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
        />
      ))}

      <View style={styles.actions}>
        <PrimaryButton label="Now it's your turn" onPress={finish} />
        <Text style={styles.writeHint}>write one confession — unlock 2 more reads</Text>
      </View>

      <View style={styles.orRow}>
        <View style={styles.orLine} />
        <Text style={styles.orText}>or</Text>
        <View style={styles.orLine} />
      </View>

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
        <Text style={styles.promoTitle}>don't stop at 2</Text>
        <Text style={styles.promoBody}>
          Right now, hundreds of confessions match what you carry.
          Premium readers see every one — no writing, no waiting.
        </Text>
        <View style={styles.promoCta}>
          <Text style={styles.promoCtaText}>Unlock unlimited reads</Text>
          <Text style={styles.promoCtaArrow}> →</Text>
        </View>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
    paddingBottom: 64,
    gap:           24,
  },
  topBar: {
    flexDirection: 'row',
    marginBottom:  4,
  },
  header: {
    gap: 10,
  },
  heading: {
    fontFamily: fontFamily.serifItalic,
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
  actions: {
    alignItems: 'center',
    gap:        12,
    marginTop:  8,
  },
  writeHint: {
    fontFamily: fontFamily.sans,
    fontSize:   13,
    color:      color.dim,
    textAlign:  'center',
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
  promoCard: {
    backgroundColor: '#16131C',
    borderRadius:    radius.input,
    borderWidth:     1,
    borderColor:     '#FBBF2444',
    padding:         20,
    gap:             12,
  },
  promoCardPressed: {
    backgroundColor: '#1C1824',
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
    color:         '#FBBF24',
  },
  promoStat: {
    fontFamily: fontFamily.sansBold,
    fontSize:   12,
    color:      color.dim,
  },
  promoTitle: {
    fontFamily: fontFamily.serifItalic,
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
    backgroundColor:   '#FBBF24',
    borderRadius:      radius.pill,
    paddingHorizontal: 18,
    paddingVertical:   11,
    alignSelf:         'flex-start',
    marginTop:         4,
  },
  promoCtaText: {
    fontFamily: fontFamily.sansBold,
    fontSize:   14,
    color:      '#1A0A00',
  },
  promoCtaArrow: {
    fontFamily: fontFamily.sansBold,
    fontSize:   14,
    color:      '#1A0A00',
  },
  returnBanner: {
    backgroundColor: 'rgba(110,150,255,0.10)',
    borderRadius:    radius.input,
    borderWidth:     1,
    borderColor:     'rgba(110,150,255,0.25)',
    padding:         14,
    gap:             4,
  },
  returnText: {
    fontFamily: fontFamily.sans,
    fontSize:   14,
    color:      color.paper,
    lineHeight: 21,
  },
  returnCount: {
    fontFamily: fontFamily.sansBold,
    color:      '#6E96FF',
  },
  returnDismiss: {
    fontFamily: fontFamily.sans,
    fontSize:   12,
    color:      color.dim,
  },
});
