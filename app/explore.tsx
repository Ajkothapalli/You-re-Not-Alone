/**
 * Explore — the reading surface. The only one (CLAUDE.md invariant 2).
 *
 * Shows confessions whose CATEGORIES overlap the reader's chosen ones, as a
 * SCROLLABLE list of truncated preview cards. Tapping a card pushes
 * read-detail for the full text. No back button here: this IS the Read tab.
 *
 * Two stale claims removed from this comment on 2026-09-15, both superseded by
 * the 2026-09-13 owner decisions: the fixed 10-per-batch cap is gone (the feed
 * is however much matches the reader's categories), and "D7" no longer governs
 * anything here — the intro window only decides whether the write PROMPT
 * appears, never whether someone may read.
 *
 * Selection is by category overlap, not by similarity or taste. There is no
 * embedding in this path and no ranking by closeness; copy on this screen must
 * not imply otherwise.
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
import ShareFlow from '@/components/share/ShareFlow';
import QuestionCard from '@/components/QuestionCard';
import { getCurrentQuestion, type LiveQuestion } from '@/lib/question';
import * as feedCache from '@/lib/feedCache';
import FeedSkeleton from '@/components/FeedSkeleton';
import { GhostButton } from '@/components/Buttons';
import { WriteInviteCard, PremiumCard } from '@/components/EndOfReadingCards';
import TargetedWriteInvite, { InviteImpression } from '@/components/TargetedWriteInvite';
import {
  recordFelt, dismissWriteInvite, genericInviteAllowed, interstitialAt,
  type TargetedInvite,
} from '@/lib/writeInvite';
import { announce } from '@/lib/a11y';
import { analytics } from '@/lib/analytics';
import { getRecommendations, isAuthError, logReadEvent, reportConfession, type Recommendation } from '@/lib/api';
import { takePrimedFeed } from '@/lib/feedPrefetch';
import { stopAllPlayback } from '@/lib/audioPlayback';
import { getDailyLimit, recordRead, DAILY_ALLOWANCE, PER_WRITE } from '@/lib/readAllowance';
import { checkPremium } from '@/lib/purchases';
import { setConfessionHandoff } from '@/lib/confessionHandoff';
import { shareConfessionCard } from '@/lib/shareCard';
import { palettes } from '@/theme/palettes';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily, radius, spacing } from '@/theme/tokens';
import { Icon } from '@/components/Icon';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform,
  ActivityIndicator,
  AppState,
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

  /**
   * id → position, rebuilt only when the feed changes.
   *
   * The separator used to call confessions.findIndex() for EVERY gap on every
   * render — O(n) inside an O(n) pass, so the work grew with the square of the
   * feed while scrolling. At 200 items that is 40,000 comparisons per pass.
   */
  const indexById = useMemo(() => {
    const m = new Map<string, number>();
    confessions.forEach((c, i) => m.set(c.id, i));
    return m;
  }, [confessions]);
  const [loading,         setLoading]         = useState(true);
  const [loadingMore,     setLoadingMore]     = useState(false);
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
  const [composerOpen,    setComposerOpen]    = useState(false);

  // [W2] The weekly question. Null whenever there is no live one, the bank has
  // run out, or the lookup failed — the feed is unchanged in every one of
  // those cases, because this is an addition to the surface, not a dependency.
  const [question,        setQuestion]        = useState<LiveQuestion | null>(null);
  const [questionHidden,  setQuestionHidden]  = useState(false);
  /** The filter. When set, the feed shows only this question's real answers. */
  const [filterQuestion,  setFilterQuestion]  = useState<string | null>(null);
  const [sharingQuestion, setSharingQuestion] = useState(false);
  const nudgeShown = useRef(false);  // show at most once per session

  // Rotate icons each time the user navigates back to this screen
  useFocusEffect(useCallback(() => {
    setIconSession(Math.floor(Math.random() * 102));
    // Leaving the feed stops any voice mid-sentence. A recording that keeps
    // playing after the reader has navigated away is playing to nobody, out
    // loud, wherever they happen to be.
    return () => stopAllPlayback();
  }, []));

  // Backgrounding does the same. Nothing of this app should be audible once it
  // is not on screen.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') stopAllPlayback();
    });
    return () => sub.remove();
  }, []);

  // Session-scoped id sets. shownIds keeps "keep reading" batches from
  // repeating; the other two make sure each read signal fires at most once
  // per confession even as cards scroll in and out of view.
  const shownIdsRef  = useRef<Set<string>>(new Set());
  const impressedRef = useRef<Set<string>>(new Set());
  const readToEndRef = useRef<Set<string>>(new Set());

  /**
   * Load the feed.
   *
   * Two changes from the original, both about perceived speed rather than
   * throughput:
   *
   *  1. The cached feed is shown FIRST, with no spinner, and refreshed
   *     quietly behind it. Returning to Read used to re-fetch from scratch
   *     behind a full-screen spinner even when the reader had left four
   *     seconds ago.
   *  2. Premium, the daily limit, the question and the recommendations now
   *     run in PARALLEL. They were four sequential round trips, each waiting
   *     on the one before for no reason — none of them is an input to another.
   *
   * What has not changed: nothing loads on scroll, there is no refresh
   * gesture, and "Keep reading" is still the only way to extend the feed
   * (CLAUDE.md #2).
   */

  /**
   * ONE callback per action for the whole list, not three per card per render.
   *
   * ReadCard is React.memo'd, and a memo is defeated by a prop that changes
   * identity every render — which an inline arrow does. These take the id
   * instead of closing over the item, so they never need to be rebuilt.
   *
   * The lookup by id is against indexById, so it stays O(1) as the feed grows.
   */
  const onCardFelt = useCallback((id: string) => {
    const i = indexById.get(id);
    if (i === undefined) return;
    handleFelt(confessions[i]);
  }, [indexById, confessions]);

  const onCardPress = useCallback((id: string) => {
    const i = indexById.get(id);
    if (i === undefined) return;
    const item = confessions[i];

    // Opening one is what counts against the day, not scrolling past.
    void recordRead();
    // Params lose newlines in transit — hand the confession over in memory
    // and let params serve only as a deep-link fallback.
    setConfessionHandoff({
      id:              item.id,
      text:            item.text,
      feltCount:       item.feltCount,
      paletteIndex:    i % palettes.length,
      audioDurationMs: item.audioDurationMs,
      audioWaveform:   item.audioWaveform,
    });
    router.push({
      pathname: '/read-detail',
      params: {
        id:           item.id,
        text:         item.text,
        feltCount:    String(item.feltCount),
        paletteIndex: String(i % palettes.length),
      },
    });
  }, [indexById, confessions]);

  const keyExtractor = useCallback((item: Recommendation) => item.id, []);

  async function fetchRecommendations(opts: { background?: boolean } = {}) {
    const background = opts.background === true;

    if (!background) {
      setExhausted(false);
      setLoadError(null);
      shownIdsRef.current  = new Set();
      impressedRef.current = new Set();
      readToEndRef.current = new Set();
    }

    try {
      const [premium, primed, fresh, liveQuestion] = await Promise.all([
        // Fails OPEN to unlimited: a storage or billing hiccup should never be
        // the reason someone is told they have run out.
        checkPremium().catch(() => true),
        takePrimedFeed().catch(() => null),
        // richOnly = false. It used to be the intro-window flag, filtering the
        // feed to story-shaped confessions on the theory that a one-liner is a
        // poor first impression. With the window gone that would apply to every
        // reader forever, and it would quietly shrink the REAL pool — most
        // genuine confessions are short — leaning the feed harder on generated
        // ones, which is the opposite of letting AI content recede.
        getRecommendations(false).then(r => r.confessions).catch(e => e as Error),
        getCurrentQuestion().catch(() => null),
      ]);

      setDailyLimit(await getDailyLimit({ isPremium: premium }).catch(() => null));
      setQuestion(liveQuestion);

      // The FTUE primes this exact request as its last act, so a reader
      // arriving from onboarding lands on confessions rather than a spinner
      // (lib/feedPrefetch.ts).
      const data = primed ?? fresh;

      if (data instanceof Error) {
        // A failed REFRESH must not blank a feed the reader is already
        // reading. Only a cold failure with nothing on screen is an error.
        if (!background && confessions.length === 0) {
          setLoadError(isAuthError(data) ? 'auth' : 'load');
          setConfessions([]);
        }
        return;
      }

      data.forEach(c => shownIdsRef.current.add(c.id));
      setConfessions(data);
      feedCache.save(data);
    } catch (e) {
      if (!background && confessions.length === 0) {
        setLoadError(isAuthError(e) ? 'auth' : 'load');
        setConfessions([]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Instant: whatever we already had, on screen before any await resolves.
    const cached = feedCache.readMemory();
    if (cached) {
      setConfessions(cached);
      cached.forEach(c => shownIdsRef.current.add(c.id));
      setLoading(false);
      fetchRecommendations({ background: true });
      return;
    }

    // Cold start: the disk cache paints something while the network runs.
    let alive = true;
    feedCache.readDisk().then((disk) => {
      if (!alive || !disk) return;
      setConfessions(disk);
      disk.forEach(c => shownIdsRef.current.add(c.id));
      setLoading(false);
    }).catch(() => {});

    fetchRecommendations();
    return () => { alive = false; };
  }, []);

  useEffect(() => { getCurrentQuestion().then(setQuestion).catch(() => {}); }, []);

  /**
   * Turning the filter on or off refetches. The question's answers are a
   * different query, not a client-side filter of what is already loaded —
   * filtering locally would show only the answers that happened to be in the
   * current batch and call that "every answer so far".
   */
  useEffect(() => {
    let alive = true;
    if (filterQuestion === null) return;
    setLoading(true);
    getRecommendations(false, [], filterQuestion)
      .then(({ confessions: answers }) => {
        if (!alive) return;
        setConfessions(answers);
        setExhausted(true);   // the filtered list is complete by definition
      })
      .catch(() => { if (alive) setConfessions([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [filterQuestion]);

  function closeFilter() {
    setFilterQuestion(null);
    setExhausted(false);
    shownIdsRef.current.clear();
    fetchRecommendations();
  }

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

  // The targeted invite is anchored to the confession it should appear AFTER,
  // so it lands in the next gap rather than displacing the card being read.
  const [invite, setInvite]             = useState<TargetedInvite | null>(null);
  const [inviteAfterId, setInviteAfterId] = useState<string | null>(null);

  function handleFelt(c: Recommendation) {
    logReadEvent(c.id, 'felt');

    // Three felts in one category earns ONE invite, this session. recordFelt
    // settles itself, so this cannot fire twice however often it is called.
    const earned = recordFelt(c.categories ?? []);
    if (earned) {
      setInvite(earned);
      setInviteAfterId(c.id);
    }
    // Light share nudge on a strong read (felt >= 50), once per session.
    if (c.feltCount >= SHARE_NUDGE_THRESHOLD && !nudgeShown.current) {
      nudgeShown.current = true;
      setShareTarget(c);
      setShowShareNudge(true);
    }
  }

  // The nudge now OPENS the composer rather than firing the sheet directly —
  // the reader picks how the quotation looks before it goes anywhere.
  function handleReadShare() {
    if (!shareTarget) return;
    setShowShareNudge(false);
    setComposerOpen(true);
  }

  // useCallback with an empty dep list: a plain function declaration is
  // rebuilt on every render, which would change ReadCard's props and defeat
  // its memo. setConfessions's updater form means no dependency is needed.
  const handleReport = useCallback((confessionId: string) => {
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
  }, []);

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
  // Only a genuine cold start reaches this: with a cached feed, loading was
  // already set false before the first paint (see the mount effect).
  if (loading) {
    return (
      <View style={styles.root}>
        <FeedHeader />
        <FeedSkeleton />
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
            : <GhostButton label="Try again" onPress={() => { setLoading(true); fetchRecommendations(); }} />}
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
          {/* Should be near-unreachable: the feed tops up from the curated pool
              whenever real volume is thin, so an empty feed means the reader's
              categories matched nothing at all.
              There is still no premium branch here, and that is deliberate even
              though reading IS now capped (2026-09-13). A reader at their daily
              limit is shown a CAP — the end-of-feed state above, naming the
              number and what lifts it — never this empty state. "You must pay"
              was never an honest reason to show someone nothing. */}
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
      {question && (
        <ShareFlow
          visible={sharingQuestion}
          onClose={() => setSharingQuestion(false)}
          source="question"
          text={question.text}
          category={null}
          // The question itself has no felt count, and inventing one would be
          // the padding this whole feature refuses. showPill hides it at 0.
          feltCount={0}
          tagline="Answer it anonymously on soulyap"
          onShared={() => analytics.cardShared('question')}
        />
      )}

      {shareTarget && (
        <ShareFlow
          visible={composerOpen}
          onClose={() => setComposerOpen(false)}
          source="read"
          text={shareTarget.text}
          category={shareTarget.categories?.[0] ?? null}
          feltCount={shareTarget.feltCount}
          onShared={() => {
            analytics.cardShared('read');
            logReadEvent(shareTarget.id, 'share').catch(() => {});
          }}
        />
      )}

      <FeedHeader
        trailing={
          // Count what is actually readable, not what was fetched. This read
          // confessions.length — the unsliced array — so a capped reader was
          // told "540 to read" above a feed showing 10.
          <Text
            style={styles.progress}
            accessibilityLabel={
              dailyLimit === null
                ? `${confessions.length} confessions to read`
                : `${Math.min(dailyLimit, confessions.length)} confessions left today`
            }
          >
            {dailyLimit === null
              ? `${confessions.length} to read`
              : `${Math.min(dailyLimit, confessions.length)} today`}
          </Text>
        }
      />

      <FlatList
        ListHeaderComponent={
          <>
            {/* The question card. Hidden for the session by "Not now", and
                never rendered beside the premium card — the 2026-09-27
                decision applies to every write invite, this one included. */}
            {question && !questionHidden && filterQuestion === null && (
              <QuestionCard
                question={question}
                onAnswer={() => router.push({
                  pathname: '/write',
                  params:   { questionId: question.id },
                })}
                onReadAnswers={() => setFilterQuestion(question.id)}
                onShare={() => setSharingQuestion(true)}
                onDismiss={() => setQuestionHidden(true)}
              />
            )}

            {/* The filter chip. Present only while filtering, because turning
                it ON is what the card is for and two entry points to the same
                state is one too many. */}
            {question && filterQuestion !== null && (
              <Pressable
                onPress={closeFilter}
                style={styles.filterChip}
                accessibilityRole="button"
                accessibilityState={{ selected: true }}
                accessibilityLabel={`Showing answers to this week's question. Tap to show the whole feed.`}
                testID="question-filter-chip"
              >
                <Text style={styles.filterChipLabel}>This week’s question</Text>
                <Icon name="close" size={13} />
              </Pressable>
            )}
          </>
        }
        // Sliced to today's allowance. The confessions beyond it are not
        // fetched-and-hidden — they are simply not rendered, and tomorrow's
        // reset brings them back without another round trip.
        data={dailyLimit === null ? confessions : confessions.slice(0, dailyLimit)}
        keyExtractor={keyExtractor}
        renderItem={({ item, index }) => (
          // onPress makes ReadCard render as a truncated preview with a
          // "read more" affordance and become tappable — the full text lives
          // on read-detail, same as the onboarding read screen.
          <View>
            {/* Shown wherever an answer appears — inside the filter and in its
                ordinary category — so a reader always knows what it answers. */}
            {item.questionId && question && item.questionId === question.id && (
              <Text style={styles.answeringLabel} numberOfLines={1}>
                Answering: {question.text}
              </Text>
            )}
          <ReadCard
            text={item.text}
            feltCount={item.feltCount}
            confessionId={item.id}
            audioDurationMs={item.audioDurationMs}
            audioWaveform={item.audioWaveform}
            palette={palettes[index % palettes.length]}
            personaSeed={item.id}
            onReport={handleReport}
            onFelt={onCardFelt}
            onPress={onCardPress}
            iconSessionOffset={iconSession}
          />
          </View>
        )}
        // The asks repeat every INTERSTITIAL_EVERY cards rather than only at
        // the very end (owner decision 2026-09-13). With the feed uncapped a
        // reader can scroll a long way and never reach the footer, so the
        // end-of-feed placement meant most readers never saw either card.
        // Rendered as a separator so it sits BETWEEN cards and never replaces
        // a confession — the reader loses nothing to it.
        //
        // The two asks are no longer shown TOGETHER (owner decision
        // 2026-09-27). Side by side, "write one of your own" and "become a
        // supporter" read as one transaction, and the invitation to write —
        // the thing this app actually needs from a reader — became the warm-up
        // act for an upsell. They now alternate: write, then premium, then
        // write. Only the footer still stacks both, where the reading has
        // stopped and nothing is being interrupted.
        ItemSeparatorComponent={({ leadingItem }) => {
          const i = leadingItem ? indexById.get(leadingItem.id) ?? -1 : -1;
          if (i < 0) return null;

          // The targeted invite outranks whatever would otherwise appear here:
          // it is aimed at something the reader just felt three times, and it
          // is the only ask that gets to interrupt at a moment of its own
          // choosing rather than on a counter.
          if (invite && leadingItem?.id === inviteAfterId) {
            return (
              <View style={styles.interstitial}>
                <TargetedWriteInvite
                  invite={invite}
                  onAccept={(inv) => {
                    setInvite(null);
                    router.replace({
                      pathname: '/write',
                      params:   { starter: inv.starter },
                    });
                  }}
                  onDismiss={() => {
                    dismissWriteInvite();
                    setInvite(null);
                  }}
                />
              </View>
            );
          }

          const slot = interstitialAt(i, INTERSTITIAL_EVERY);
          if (!slot) return null;

          // Once the targeted invite has been shown or dismissed, the generic
          // write ask is done for the session — a reader who just answered
          // that question should not be asked it again in blander words. The
          // premium slot is unaffected; it was never the thing being repeated.
          if (slot === 'write') {
            if (!genericInviteAllowed()) return null;
            return (
              <View style={styles.interstitial}>
                <InviteImpression kind="interstitial" />
                <WriteInviteCard
                  onPress={() => {
                    analytics.writeInviteTapped('interstitial');
                    router.replace('/write');
                  }}
                />
              </View>
            );
          }

          return (
            <View style={styles.interstitial}>
              <PremiumCard onPress={() => router.push('/plans')} />
            </View>
          );
        }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        /* Windowing. The feed can carry 200 items while roughly four are on
           screen; the defaults render far more than that up front and keep
           them all mounted, which is what made the first paint and the scroll
           expensive. removeClippedSubviews is Android-only on purpose — it is
           known to clip incorrectly on iOS. */
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        keyboardShouldPersistTaps="handled"
        viewabilityConfigCallbackPairs={viewabilityPairs}
        ListFooterComponent={
          <View style={styles.footer}>
            <Text style={styles.endHeading} accessibilityRole="header">
              {filterQuestion !== null
                ? 'That’s every answer so far.'
                : dailyLimit !== null && confessions.length > dailyLimit
                  ? "That's your " + DAILY_ALLOWANCE + " for today"
                  : exhausted ? "That's everything for now" : "You're all caught up"}
            </Text>
            {filterQuestion !== null && (
              <GhostButton
                label="Add yours"
                onPress={() => {
                  analytics.questionAnswerTapped();
                  router.push({ pathname: '/write', params: { questionId: filterQuestion } });
                }}
              />
            )}
            <Text style={styles.endBody}>
              {filterQuestion !== null
                ? 'Answers appear here as people write them.'
                : dailyLimit !== null && confessions.length > dailyLimit
                ? 'Write one of your own to unlock ' + PER_WRITE + ' more right now, or come back tomorrow for another ' + DAILY_ALLOWANCE + '.'
                : exhausted
                  ? 'You\'ve read every confession matching your categories. Add more categories to see others.'
                  : 'Come back later. New confessions appear in your categories as people write them.'}
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

            {/* The write invite is a PROMPT, never a gate — that part has not
                changed. What did change (owner decision 2026-09-27): it appears
                from DAY ONE, not after a 30-day intro window.

                The comment that used to sit here described the 30-day window as
                though the code implemented it. It never did — nothing has ever
                called isWithinIntroWindow(), and this card has shown to every
                reader since it was written. The decision now matches the
                behaviour, deliberately: writing is the top priority, because
                every reader who writes adds to the pool every other reader
                reads, and a month of silence costs the pool more than an early
                ask costs the reader. markInstall() still runs — the install
                date is not recoverable once lost.

                Both cards stack here, and only here: the reading has stopped,
                so neither is interrupting the other. Mid-feed they alternate. */}
            <View style={styles.footerCards}>
              <InviteImpression kind="footer" />
              <WriteInviteCard
                onPress={() => {
                  analytics.writeInviteTapped('footer');
                  router.replace('/write');
                }}
              />
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
    filterChip: {
      alignSelf:         'flex-start',
      flexDirection:     'row',
      alignItems:        'center',
      gap:               6,
      paddingVertical:   7,
      paddingHorizontal: 13,
      borderRadius:      radius.pill,
      borderWidth:       2,
      borderColor:       color.border,
      backgroundColor:   color.accent,
      marginBottom:      14,
    },
    filterChipLabel: {
      fontFamily: fontFamily.sansBold,
      fontSize:   13,
      color:      '#1A1A1A',
    },
    answeringLabel: {
      fontFamily:   fontFamily.sans,
      fontSize:     12,
      color:        color.dim,
      marginBottom: 6,
      marginLeft:   2,
    },
    footerCards: {
      // Stacked, not paired: enough air that the write invite reads as its own
      // ask rather than the first half of the premium one.
      gap:       28,
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
