/**
 * Explore — personalized reading surface.
 *
 * Shows up to 10 confessions per batch, matched to the reader's chosen
 * categories, as a SCROLLABLE list of truncated preview cards (owner
 * decision 2026-09-12 — see CLAUDE.md invariant 2; this replaced the
 * previous one-card-at-a-time presentation). Tapping a card pushes
 * read-detail for the full text, the same drill-down the onboarding read
 * screen uses. No back button here: during D7 this IS the Read tab.
 *
 * Still bounded, deliberately: the batch is capped, nothing loads on scroll,
 * and there is no refresh gesture. A reader inside their first 7 days (D7)
 * can tap "Keep reading" to append the next batch — an explicit action, never
 * an automatic one — so the screen can't turn into an endless feed.
 *
 * Events logged per card (viewability-driven, since cards scroll past rather
 * than being advanced; each fires at most once per confession per session):
 *   impression  — card ≥50% visible
 *   read_to_end — card ≥60% visible for ≥5 s
 *   felt        — when the user taps the felt button (mirrored from ReadCard)
 *   report      — on report action (card is removed from the feed)
 * 'skip' is no longer emitted here: with a scrolling list there is no explicit
 * "next" tap to distinguish a skip from simply reading on.
 *
 * Identity invariant: reader_account_id (logged) is separate from
 * author_token. Reading history does not reveal authorship.
 */

import ReadCard from '@/components/ReadCard';
import { StoryCard } from '@/components/StoryCard';
import { ScrawlIcon } from '@/components/ScrawlIcon';
import { GhostButton } from '@/components/Buttons';
import { WriteInviteCard, PremiumCard } from '@/components/EndOfReadingCards';
import { announce } from '@/lib/a11y';
import { analytics } from '@/lib/analytics';
import { getRecommendations, logReadEvent, reportConfession, type Recommendation } from '@/lib/api';
import { isD7 } from '@/lib/d7';
import { setConfessionHandoff } from '@/lib/confessionHandoff';
import { shareConfessionCard } from '@/lib/shareCard';
import { palettes } from '@/theme/palettes';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily, spacing } from '@/theme/tokens';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { showDialog } from '@/components/AppDialog';
import { showToast } from '@/components/Toast';

const DWELL_THRESHOLD_MS = 5_000;

export default function ExploreScreen() {
  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);

  const [confessions,     setConfessions]     = useState<Recommendation[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [loadingMore,     setLoadingMore]     = useState(false);
  const [premiumRequired, setPremiumRequired] = useState(false);
  const [withinD7,        setWithinD7]        = useState(false);
  const [exhausted,       setExhausted]       = useState(false);
  const [iconSession,     setIconSession]     = useState(() => Math.floor(Math.random() * 102));
  const [showShareNudge,  setShowShareNudge]  = useState(false);
  const [sharing,         setSharing]         = useState(false);
  const [shareTarget,     setShareTarget]     = useState<Recommendation | null>(null);
  const storyRef   = useRef<View>(null);
  const nudgeShown = useRef(false);  // show at most once per session

  // Rotate icons each time the user navigates back to this screen
  useFocusEffect(useCallback(() => {
    setIconSession(Math.floor(Math.random() * 102));
  }, []));

  // Session-scoped id sets. shownIds keeps "keep reading" batches from
  // repeating; the other two make sure each read signal fires at most once
  // per confession even as cards scroll in and out of view.
  const shownIdsRef  = useRef<Set<string>>(new Set());
  const impressedRef = useRef<Set<string>>(new Set());
  const readToEndRef = useRef<Set<string>>(new Set());

  async function fetchRecommendations() {
    setLoading(true);
    setExhausted(false);
    shownIdsRef.current  = new Set();
    impressedRef.current = new Set();
    readToEndRef.current = new Set();
    const d7 = await isD7().catch(() => false);
    setWithinD7(d7);
    try {
      const { confessions: data, premiumRequired: gated } = await getRecommendations(d7);
      if (gated) {
        setPremiumRequired(true);
        setConfessions([]);
        return;
      }
      data.forEach(c => shownIdsRef.current.add(c.id));
      setConfessions(data);
    } catch {
      setConfessions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchRecommendations(); }, []);

  // D7 only, and only on an explicit tap — never triggered by scrolling.
  // The feed stays a bounded batch; this just lets a reader inside their
  // first week ask for the next one instead of hitting a dead end.
  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const { confessions: more } = await getRecommendations(true, Array.from(shownIdsRef.current));
      const fresh = more.filter(c => !shownIdsRef.current.has(c.id));
      if (fresh.length === 0) {
        setExhausted(true);
        return;
      }
      fresh.forEach(c => shownIdsRef.current.add(c.id));
      setConfessions(prev => [...prev, ...fresh]);
    } catch {
      setExhausted(true);
    } finally {
      setLoadingMore(false);
    }
  }

  // Read signals are viewability-driven now that cards scroll past instead of
  // being advanced one at a time: 50% visible = impression, 5s continuously
  // visible = read_to_end. Refs (not state) so the config object stays stable —
  // FlatList throws if viewabilityConfigCallbackPairs changes identity.
  const handleImpression = useRef(({ viewableItems }: { viewableItems: Array<{ item: Recommendation }> }) => {
    viewableItems.forEach(({ item }) => {
      if (!item || impressedRef.current.has(item.id)) return;
      impressedRef.current.add(item.id);
      logReadEvent(item.id, 'impression');
    });
  }).current;

  const handleReadToEnd = useRef(({ viewableItems }: { viewableItems: Array<{ item: Recommendation }> }) => {
    viewableItems.forEach(({ item }) => {
      if (!item || readToEndRef.current.has(item.id)) return;
      readToEndRef.current.add(item.id);
      logReadEvent(item.id, 'read_to_end');
    });
  }).current;

  const viewabilityPairs = useRef([
    {
      viewabilityConfig:      { itemVisiblePercentThreshold: 50 },
      onViewableItemsChanged: handleImpression,
    },
    {
      viewabilityConfig:      { itemVisiblePercentThreshold: 60, minimumViewTime: DWELL_THRESHOLD_MS },
      onViewableItemsChanged: handleReadToEnd,
    },
  ]).current;

  const SHARE_NUDGE_THRESHOLD = 50;

  function handleFelt(c: Recommendation) {
    logReadEvent(c.id, 'felt');
    // Light share nudge on a strong read (felt >= 50), once per session.
    if (c.feltCount >= SHARE_NUDGE_THRESHOLD && !nudgeShown.current) {
      nudgeShown.current = true;
      setShareTarget(c);
      setShowShareNudge(true);
    }
  }

  async function handleReadShare() {
    if (!shareTarget) return;
    setSharing(true);
    try {
      await shareConfessionCard(storyRef, 'read');
      analytics.cardShared('read');
      logReadEvent(shareTarget.id, 'share').catch(() => {});
    } catch {
      /* sharing cancelled or failed — just dismiss the nudge */
    } finally {
      setSharing(false);
      setShowShareNudge(false);
    }
  }

  function handleReport(confessionId: string) {
    showDialog(
      'Report this confession',
      'Are you sure you want to report this?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:    'Report',
          style:   'destructive',
          onPress: async () => {
            try {
              await reportConfession(confessionId, 'other');
              logReadEvent(confessionId, 'report');
              announce('Reported. Thank you.');
              showToast('Successfully reported');
            } catch {}
            // Drop it out of the feed instead of advancing an index.
            setConfessions(prev => prev.filter(c => c.id !== confessionId));
          },
        },
      ],
    );
  }

  function FeedHeader({ trailing }: { trailing?: React.ReactNode }) {
    // No back button: this is a tab destination (the Read tab lands here
    // during D7), not a pushed screen. Drilling into a card is what pushes.
    return (
      <View style={styles.topBar}>
        <Text style={styles.screenTitle} accessibilityRole="header">Read</Text>
        {trailing}
      </View>
    );
  }

  // -- Loading ------------------------------------------------------------------
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={color.dim} accessibilityLabel="Loading recommendations" />
      </View>
    );
  }

  // -- Nothing to show ----------------------------------------------------------
  if (confessions.length === 0) {
    return (
      <View style={styles.root}>
        <FeedHeader />
        <View style={styles.endContent}>
          <Text style={styles.endHeading} accessibilityRole="header">Nothing here yet</Text>
          <Text style={styles.endBody}>
            {premiumRequired
              ? 'Come back soon — more confessions are matched to your taste as they arrive.'
              : 'Add more reading categories or check back soon — more people are sharing every day.'}
          </Text>
          <GhostButton label="Update categories" onPress={() => router.push('/categories?mode=edit')} />
          <GhostButton label="Write your own" onPress={() => router.replace('/write')} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Off-screen capture target for felt-share */}
      {shareTarget && (
        <StoryCard
          ref={storyRef}
          youText={shareTarget.text}
          feltCount={shareTarget.feltCount}
          palette={palettes[0]}
          source="read"
        />
      )}

      <FeedHeader
        trailing={
          <Text style={styles.progress} accessibilityLabel={`${confessions.length} confessions to read`}>
            {confessions.length} to read
          </Text>
        }
      />

      <FlatList
        data={confessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          // onPress makes ReadCard render as a truncated preview with a
          // "read more" affordance and become tappable — the full text lives
          // on read-detail, same as the onboarding read screen.
          <ReadCard
            text={item.text}
            feltCount={item.feltCount}
            palette={palettes[index % palettes.length]}
            personaSeed={item.id}
            onReport={() => handleReport(item.id)}
            onFelt={() => handleFelt(item)}
            onPress={() => {
              // Params lose newlines in transit — hand the confession over in
              // memory and let params serve only as a deep-link fallback.
              setConfessionHandoff({
                id:           item.id,
                text:         item.text,
                feltCount:    item.feltCount,
                paletteIndex: index % palettes.length,
              });
              router.push({
                pathname: '/read-detail',
                params: {
                  id:           item.id,
                  text:         item.text,
                  feltCount:    String(item.feltCount),
                  paletteIndex: String(index % palettes.length),
                },
              });
            }}
            iconSessionOffset={iconSession}
          />
        )}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        viewabilityConfigCallbackPairs={viewabilityPairs}
        ListFooterComponent={
          <View style={styles.footer}>
            <Text style={styles.endHeading} accessibilityRole="header">
              {exhausted ? "That's everything for now" : "You're all caught up"}
            </Text>
            <Text style={styles.endBody}>
              {exhausted
                ? 'You\'ve read every confession matching your categories. Add more, or write your own.'
                : 'Come back later. New confessions are matched to your taste as they arrive.'}
            </Text>

            {/* Deliberately quiet — loading another batch is a small continuation,
                not the thing we're asking of anyone here. The cards below are. */}
            {withinD7 && !exhausted && (
              <Pressable
                onPress={loadMore}
                disabled={loadingMore}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Load more confessions"
                style={{ alignSelf: 'flex-start' }}
              >
                <Text style={styles.loadMoreLink}>
                  {loadingMore ? 'Loading…' : 'Keep reading'}
                </Text>
              </Pressable>
            )}

            {/* The two asks that actually matter at the end of a read. */}
            <View style={styles.footerCards}>
              <WriteInviteCard onPress={() => router.replace('/write')} />
              <PremiumCard onPress={() => router.push('/plans')} />
            </View>

            <GhostButton label="Update categories" onPress={() => router.push('/categories?mode=edit')} />
          </View>
        }
      />

      {/* Share nudge floats above the feed so it isn't stranded at the bottom */}
      {showShareNudge && (
        <View style={styles.nudgeDock} pointerEvents="box-none">
          <Pressable
            onPress={handleReadShare}
            disabled={sharing}
            style={styles.shareNudge}
            accessibilityRole="button"
            accessibilityLabel="Share this confession"
          >
            <Text style={styles.shareNudgeText}>
              {sharing ? 'Preparing…' : 'This resonated — share it'}
            </Text>
          </Pressable>
        </View>
      )}
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
    topBar: {
      flexDirection:     'row',
      justifyContent:    'space-between',
      alignItems:        'center',
      paddingHorizontal: spacing.screenPadding,
      paddingTop:        64,
      paddingBottom:     12,
    },
    screenTitle: {
      fontFamily: fontFamily.sansBold,
      fontSize:   17,
      color:      color.paper,
    },
    progress: {
      fontFamily: fontFamily.sans,
      fontSize:   12,
      color:      color.dim,
    },
    fill: {
      flex: 1,
    },
    scroll: {
      padding:       spacing.screenPadding,
      paddingTop:    8,
      paddingBottom: 120,
      gap:           16,
    },
    footer: {
      gap:        12,
      paddingTop: 8,
    },
    footerCards: {
      gap:       16,
      marginTop: 4,
    },
    loadMoreLink: {
      fontFamily:         fontFamily.sansBold,
      fontSize:           14,
      color:              color.dim,
      textDecorationLine: 'underline',
    },
    nudgeDock: {
      position: 'absolute',
      left:     spacing.screenPadding,
      right:    spacing.screenPadding,
      bottom:   24,
    },
    shareNudge: {
      alignItems:        'center',
      paddingVertical:   11,
      paddingHorizontal: 16,
      borderRadius:      12,
      borderWidth:       1,
      borderColor:       color.line,
      backgroundColor:   color.ink,
    } as ViewStyle,
    shareNudgeText: {
      fontFamily: fontFamily.sans,
      fontSize:   14,
      color:      color.paper,
    },
    endContent: {
      flex:              1,
      padding:           spacing.screenPadding,
      paddingTop:        24,
      justifyContent:    'center',
      gap:               16,
    },
    endHeading: {
      fontFamily: fontFamily.sansBold,
      fontSize:   26,
      color:      color.paper,
    },
    endBody: {
      fontFamily: fontFamily.sans,
      fontSize:   15,
      color:      color.dim,
      lineHeight: 23,
    },
  });
}
