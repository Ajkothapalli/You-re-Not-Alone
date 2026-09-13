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
import { getRecommendations, isAuthError, logReadEvent, reportConfession, type Recommendation } from '@/lib/api';
import { isWithinIntroWindow } from '@/lib/introWindow';
import { getDailyLimit, recordRead, DAILY_ALLOWANCE } from '@/lib/readAllowance';
import { checkPremium } from '@/lib/purchases';
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

// Show the write + support cards after every Nth confession.
const INTERSTITIAL_EVERY = 10;

export default function ExploreScreen() {
  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);

  const [confessions,     setConfessions]     = useState<Recommendation[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [loadingMore,     setLoadingMore]     = useState(false);
  // Gates the write PROMPT only — never whether the feed loads.
  const [withinIntro,     setWithinIntro]     = useState(true);
  // null = unlimited (inside the intro window, or premium). A number is
  // today's cap; the feed is sliced to it and a gate card closes the list.
  const [dailyLimit,      setDailyLimit]      = useState<number | null>(null);
  const [exhausted,       setExhausted]       = useState(false);
  // 'auth'  — no/expired session, so signing in is the only way forward.
  // 'load'  — anything else (network, edge function, RPC); retrying may work.
  const [loadError,       setLoadError]       = useState<'auth' | 'load' | null>(null);
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
    setLoadError(null);
    shownIdsRef.current  = new Set();
    impressedRef.current = new Set();
    readToEndRef.current = new Set();
    const intro = await isWithinIntroWindow().catch(() => true);
    setWithinIntro(intro);
    // Fails OPEN to unlimited: a storage or billing hiccup should never be
    // the reason someone is told they have run out.
    const premium = await checkPremium().catch(() => true);
    setDailyLimit(await getDailyLimit({ withinIntroWindow: intro, isPremium: premium }).catch(() => null));
    try {
      const { confessions: data } = await getRecommendations(intro);
      data.forEach(c => shownIdsRef.current.add(c.id));
      setConfessions(data);
    } catch (e) {
      setLoadError(isAuthError(e) ? 'auth' : 'load');
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

  // -- Couldn't load ------------------------------------------------------------
  // Kept separate from the empty state on purpose. Every failure used to land
  // in "Nothing here yet", which blamed the reader's categories for problems
  // categories can't fix — so the obvious response (edit them) changed nothing
  // and the feed looked broken for no visible reason.
  if (loadError) {
    const isAuth = loadError === 'auth';
    return (
      <View style={styles.root}>
        <FeedHeader />
        <View style={styles.endContent}>
          <Text style={styles.endHeading} accessibilityRole="header">
            {isAuth ? 'You\'re signed out' : 'Couldn\'t load your feed'}
          </Text>
          <Text style={styles.endBody}>
            {isAuth
              ? 'Your session has ended. Sign in again to pick up where you left off.'
              : 'Something went wrong reaching your confessions. Check your connection and try again.'}
          </Text>
          {isAuth
            ? <GhostButton label="Sign in" onPress={() => router.replace('/')} />
            : <GhostButton label="Try again" onPress={fetchRecommendations} />}
        </View>
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
          {/* Should now be near-unreachable: the feed tops up from the curated
              pool whenever real volume is thin, so an empty feed means the
              reader's categories matched nothing at all. The premium branch is
              gone — reading is never gated, so "you must pay" was never an
              honest reason for an empty screen, and the copy that replaced it
              ("come back soon") told paywalled readers something untrue. */}
          <Text style={styles.endBody}>
            Add more reading categories — that will bring more in.
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
        // Sliced to today's allowance. The confessions beyond it are not
        // fetched-and-hidden — they are simply not rendered, and tomorrow's
        // reset brings them back without another round trip.
        data={dailyLimit === null ? confessions : confessions.slice(0, dailyLimit)}
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
              // Opening one is what counts against the day, not scrolling past.
              void recordRead();
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
        // The two asks repeat every INTERSTITIAL_EVERY cards rather than only
        // at the very end (owner decision 2026-09-13). With the feed uncapped
        // a reader can scroll a long way and never reach the footer, so the
        // end-of-feed placement meant most readers never saw either card.
        // Rendered as a separator so it sits BETWEEN cards and never replaces
        // a confession — the reader loses nothing to it.
        ItemSeparatorComponent={({ leadingItem }) => {
          const i = confessions.findIndex(c => c.id === leadingItem?.id);
          if (i < 0 || (i + 1) % INTERSTITIAL_EVERY !== 0) return null;
          return (
            <View style={styles.interstitial}>
              {!withinIntro && <WriteInviteCard onPress={() => router.replace('/write')} />}
              <PremiumCard onPress={() => router.push('/plans')} />
            </View>
          );
        }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        viewabilityConfigCallbackPairs={viewabilityPairs}
        ListFooterComponent={
          <View style={styles.footer}>
            <Text style={styles.endHeading} accessibilityRole="header">
              {dailyLimit !== null && confessions.length > dailyLimit
                ? "That's your " + DAILY_ALLOWANCE + " for today"
                : exhausted ? "That's everything for now" : "You're all caught up"}
            </Text>
            <Text style={styles.endBody}>
              {dailyLimit !== null && confessions.length > dailyLimit
                ? 'Write one of your own to unlock more now, or come back tomorrow for another ' + DAILY_ALLOWANCE + '.'
                : exhausted
                  ? 'You\'ve read every confession matching your categories. Add more categories to see others.'
                  : 'Come back later. New confessions are matched to your taste as they arrive.'}
            </Text>

            {/* Deliberately quiet — loading more is a small continuation, not
                the thing we're asking of anyone here. Available to everyone
                now: the feed is however much we have for your categories, and
                more is not a reward for writing. */}
            {!exhausted && dailyLimit === null && (
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

            {/* The write invite is a PROMPT, not a gate, and only after the
                intro window (owner decision 2026-09-13). Asking someone to
                write in their first 30 days is the thing we decided not to do
                — they read for a month first, and nothing is withheld either
                way. Premium stands on its own and shows throughout. */}
            <View style={styles.footerCards}>
              {!withinIntro && <WriteInviteCard onPress={() => router.replace('/write')} />}
              <PremiumCard onPress={() => router.push('/plans')} />
            </View>

            {/* Quieter than everything above it on purpose: this is upkeep, not
                an ask. As a bordered button it read as a third call to action
                and competed with the two cards. */}
            <Pressable
              onPress={() => router.push('/categories?mode=edit')}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Update categories"
              style={styles.subtleAction}
            >
              <Text style={styles.subtleActionLabel}>Update categories</Text>
            </Pressable>
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
      gap:       20,
      marginTop: 12,
    },
    // Breathing room on both sides. These cards sit between confessions, and
    // flush against them they read as part of the feed rather than as a break
    // in it — the reader's eye ran straight from a stranger's confession into
    // an ask with nothing between.
    interstitial: {
      gap:          20,
      marginTop:    20,
      marginBottom: 12,
    },
    loadMoreLink: {
      fontFamily:         fontFamily.sansBold,
      fontSize:           14,
      color:              color.dim,
      textDecorationLine: 'underline',
    },
    // Quieter still than loadMoreLink — lighter weight, smaller, centred under
    // the cards so it closes the page instead of competing with them.
    subtleAction: {
      alignSelf:     'center',
      paddingTop:    8,
      paddingBottom: 4,
    },
    subtleActionLabel: {
      fontFamily:         fontFamily.sans,
      fontSize:           13,
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
