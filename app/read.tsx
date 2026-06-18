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

      {/* Read-more unlock — opens premium plans. Quiet by design. */}
      {matchCount > 0 && (
        <Pressable
          onPress={() => router.push('/plans')}
          style={({ pressed }) => [styles.unlockCard, pressed && styles.unlockPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Read ${matchCount} more confessions that match your categories`}
          accessibilityHint="Opens subscription plans"
        >
          <Text style={styles.unlockCount}>{matchCount}</Text>
          <View style={styles.unlockDivider} />
          <View style={styles.unlockTextWrap}>
            <Text style={styles.unlockTitle}>Read more like these</Text>
            <Text style={styles.unlockSub}>members only</Text>
          </View>
          <Text style={styles.unlockArrow}>›</Text>
        </Pressable>
      )}

      <View style={styles.actions}>
        <PrimaryButton label="Now it's your turn" onPress={finish} />
      </View>
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
  unlockCard: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               16,
    backgroundColor:   '#16131C',
    borderRadius:      radius.input,
    borderWidth:       StyleSheet.hairlineWidth,
    borderColor:       color.line,
    paddingVertical:   16,
    paddingHorizontal: 18,
  },
  unlockPressed: {
    backgroundColor: '#1C1824',
  },
  unlockCount: {
    fontFamily: fontFamily.serif,
    fontSize:   34,
    color:      color.paper,
    lineHeight: 38,
  },
  unlockDivider: {
    alignSelf:       'stretch',
    width:           StyleSheet.hairlineWidth,
    backgroundColor: color.line,
    marginVertical:  3,
  },
  unlockTextWrap: { flex: 1, gap: 3 },
  unlockTitle: {
    fontFamily: fontFamily.serifItalic,
    fontSize:   17,
    color:      color.paper,
  },
  unlockSub: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color:         color.dim,
  },
  unlockArrow: {
    fontFamily: fontFamily.serif,
    fontSize:   26,
    color:      color.dim,
  },
  actions: {
    alignItems: 'center',
    gap:        16,
    marginTop:  8,
  },
});
