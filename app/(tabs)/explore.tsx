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
import * as signalQueue from '@/lib/signalQueue';
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
import FeedClock from '@/components/FeedClock';
import PushAskCard from '@/components/PushAskCard';
import { usePushAsk } from '@/hooks/usePushAsk';
import { usePremium } from '@/lib/premiumContext';
import { setConfessionHandoff } from '@/lib/confessionHandoff';
import { shareConfessionCard } from '@/lib/shareCard';
import { palettes } from '@/theme/palettes';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily, radius, spacing } from '@/theme/tokens';
import { Icon } from '@/components/Icon';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform,
  ActivityIndicator,
  ScrollView,
  AppState,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showDialog } from '@/components/AppDialog';
import { showToast } from '@/components/Toast';

const DWELL_THRESHOLD_MS = 5_000;

// Show the write + support cards after every Nth confession.
const INTERSTITIAL_EVERY = 10;

/**
 * How stale the feed may get before returning to the tab quietly refreshes it.
 *
 * Long on purpose. Short enough that a reader coming back after a break is
 * not reading yesterday's batch; long enough that flicking between tabs costs
 * nothing. Anything that made this feel continuous would have crossed the
 * line invariant 2 draws around automatic refilling.
 */
const QUIET_REFRESH_MS = 10 * 60 * 1000;


/** Height of the floating tab bar plus its gap — see WriteFAB's styles. */
const TAB_BAR_CLEARANCE = 74;

/**
 * [S1] The end of the feed — one component, both layouts.
 *
 * It was the list's ListFooterComponent and nothing else. The stack needs
 * the same thing as its last PAGE, and the brief was explicit that it uses
 * "exactly today's footer logic" — so rather than write it twice and let the
 * two drift, it is one component rendered in two places.
 *
 * That matters more than it sounds. This is where the daily cap is
 * explained, where the write-to-unlock-more offer lives, and where "Keep
 * reading" sits as an explicit TAP. Two copies of that would eventually
 * disagree about what a reader is being told about their own allowance.
 *
 * (The number in that offer is PER_WRITE, never a literal — including in
 * comments. An earlier draft of this note spelled it out and tripped the
 * guard in __tests__/copy/matchingLanguage.test.ts, which scans raw source
 * on purpose: a stale number is just as wrong in a comment someone copies
 * from as in the string itself.)
 */
export interface FeedEndProps {
  styles:         ReturnType<typeof createStyles>;
  filterQuestion: string | null;
  dailyLimit:     number | null;
  total:          number;
  exhausted:      boolean;
  loadingMore:    boolean;
  onLoadMore:     () => void;
}

function FeedEnd({
  styles, filterQuestion, dailyLimit, total, exhausted, loadingMore, onLoadMore,
}: FeedEndProps) {
  return (
    <View testID="feed-end">
    <View style={styles.footer}>
      <Text style={styles.endHeading} accessibilityRole="header">
        {filterQuestion !== null
          ? 'That’s every answer so far.'
          : dailyLimit !== null && total > dailyLimit
            ? "That's your " + DAILY_ALLOWANCE + " for today"
            : exhausted ? "That's everything for now" : "You're all caught up"}
      </Text>
      {filterQuestion !== null && (
        <GhostButton
          label="Add yours"
          onPress={() => {
            analytics.questionAnswerTapped();
            router.navigate({ pathname: '/write', params: { questionId: filterQuestion } });
          }}
        />
      )}
      <Text style={styles.endBody}>
        {filterQuestion !== null
          ? 'Answers appear here as people write them.'
          : dailyLimit !== null && total > dailyLimit
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
          onPress={onLoadMore}
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
            router.navigate('/write');
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
    </View>
  );
}

/**
 * The feed's title bar.
 *
 * Module level, and it has to stay there. Declared INSIDE ExploreScreen it
 * was a brand-new component TYPE on every render, so React could not match it
 * to the previous tree: it unmounted the old header and mounted a fresh one
 * every time anything in the feed changed — a felt tap, a scroll that fired
 * an impression, the question resolving. Same pixels, whole subtree rebuilt.
 *
 * No back button: this is a tab destination, not a pushed screen. Drilling
 * into a card is what pushes.
 */
const FeedHeader = React.memo(function FeedHeader({
  styles, trailing,
}: {
  styles:    ReturnType<typeof createStyles>;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={styles.topBar}>
      <Text style={styles.screenTitle} accessibilityRole="header">Read</Text>
      {trailing}
    </View>
  );
});

export default function ExploreScreen() {
  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);

  const [confessions,     setConfessions]     = useState<Recommendation[]>([]);
  /** When the feed last came back from the server. 0 = never. */
  const lastFetchedAt = useRef(0);

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
  const { isPremium, ready: premiumReady } = usePremium();

  // [W2] The weekly question. Null whenever there is no live one, the bank has
  // run out, or the lookup failed — the feed is unchanged in every one of
  // those cases, because this is an addition to the surface, not a dependency.
  const [question,        setQuestion]        = useState<LiveQuestion | null>(null);
  const [questionHidden,  setQuestionHidden]  = useState(false);
  /** The filter. When set, the feed shows only this question's real answers. */
  const [filterQuestion,  setFilterQuestion]  = useState<string | null>(null);
  const [sharingQuestion, setSharingQuestion] = useState(false);
  const nudgeShown = useRef(false);  // show at most once per session

  /**
   * Icons are picked ONCE per session, not per visit.
   *
   * This used to re-randomise on every focus. That changed a prop on every
   * card in the feed, so returning to Read re-rendered the whole list and
   * every card re-picked its icon — visible as the feed flickering into a
   * different set of drawings each time the reader came back, and, with the
   * tab now staying mounted, a full re-render for a tab switch that should
   * have cost nothing. Variety between sessions was the point; variety
   * between tab switches was never asked for and reads as instability.
   */
  useFocusEffect(useCallback(() => {
    /**
     * A quiet refresh, at most once every QUIET_REFRESH_MS.
     *
     * The tabs stay mounted now, so a reader can leave Read open for an hour,
     * come back, and be looking at an hour-old batch with no way to know it.
     * This is NOT a refresh gesture and NOT a load-on-scroll: it replaces the
     * batch in place, it is invisible when nothing has changed, and it never
     * makes the feed longer. "Keep reading" is still the one explicit tap
     * that grows it (CLAUDE.md #2).
     *
     * background: true is what keeps it quiet — no spinner, no error state,
     * and a failure leaves whatever is on screen exactly where it is.
     */
    if (filterQuestion === null
        && lastFetchedAt.current > 0
        && Date.now() - lastFetchedAt.current > QUIET_REFRESH_MS) {
      fetchRecommendations({ background: true });
    }

    // Leaving the feed stops any voice mid-sentence. A recording that keeps
    // playing after the reader has navigated away is playing to nobody, out
    // loud, wherever they happen to be.
    return () => stopAllPlayback();
    // filterQuestion only: re-subscribing on every feed change would run this
    // on each felt tap, and the age check is what decides anything anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterQuestion]));

  // Backgrounding does the same. Nothing of this app should be audible once it
  // is not on screen.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        stopAllPlayback();
        // Backgrounding is the last chance to send queued read signals —
        // the process may not come back.
        signalQueue.flushNow();
      }
    });
    return () => sub.remove();
  }, []);

  // Leaving the tab flushes too, so signals do not sit in a buffer for ten
  // seconds while the reader is somewhere else entirely.
  useFocusEffect(useCallback(() => () => { signalQueue.flushNow(); }, []));

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

  /**
   * The pinned question card's four actions.
   *
   * Memoized because the card is mounted for the whole session now. Inline
   * arrows would hand it four new props on every render of this screen —
   * every impression, every felt, every scroll that moves the allowance —
   * and re-render a card whose content changes once a week.
   */
  const onAnswerQuestion = useCallback(() => {
    if (!question) return;
    setQuestionEngaged(true);
    router.navigate({ pathname: '/write', params: { questionId: question.id } });
  }, [question]);

  const onReadAnswers = useCallback(() => {
    if (question) setFilterQuestion(question.id);
    // Engaged: they went looking at what other people said.
    setQuestionEngaged(true);
  }, [question]);

  const onShareQuestion  = useCallback(() => setSharingQuestion(true), []);
  const onDismissQuestion = useCallback(() => setQuestionHidden(true), []);


  /**
   * What the floating tab bar covers.
   *
   * The bar sits at insets.bottom + 12 and is ~62 tall (components/
   * WriteFAB.tsx), and in the stack it floats OVER a full-screen card rather
   * than below a list. Without this the category chip and the action rail
   * sit underneath it — visible, and unpressable.
   */
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom + TAB_BAR_CLEARANCE;

  /**
   * Open read-detail. Counts nothing.
   *
   * Split out from onCardPress for the stack: there, the allowance is spent
   * by DWELLING on a card, so opening one that has already been counted must
   * not spend a second read. The list keeps counting on open, which is still
   * right for a layout where scrolling past is not reading.
   */
  const openDetail = useCallback((id: string) => {
    const i = indexById.get(id);
    if (i === undefined) return;
    const item = confessions[i];

    // Params lose newlines in transit — hand the confession over in memory
    // and let params serve only as a deep-link fallback.
    setConfessionHandoff({
      id:              item.id,
      text:            item.text,
      headline:        item.headline,
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

  /** The LIST's card tap: opening one is what counts against the day there. */
  const onCardPress = useCallback((id: string) => {
    void recordRead();
    openDetail(id);
  }, [openDetail]);

  /**
   * Share, from any card.
   *
   * Opens the same composer the nudge does — the reader chooses how the
   * quotation looks before anything leaves the app. Stable per the note on
   * ReadCard's props: an inline arrow here would change every card's props
   * on every render and silently defeat its memo.
   */
  const onCardShare = useCallback((id: string) => {
    const i = indexById.get(id);
    if (i === undefined) return;
    setShareTarget(confessions[i]);
    setShowShareNudge(false);
    setComposerOpen(true);
  }, [indexById, confessions]);


  const keyExtractor = useCallback((item: Recommendation) => item.id, []);

  /**
   * Settle the allowance once the premium answer actually arrives.
   *
   * The fetch below reads `premiumReady ? isPremium : true` — it fails OPEN
   * so a billing hiccup is never the reason somebody is told they have run
   * out. That default is right for a moment and wrong for a session: the
   * provider starts `ready: false`, the feed loads before it settles, and
   * `getDailyLimit` returns null. Null is UNLIMITED, and nothing ever asked
   * again — so every free reader got an uncapped feed for the whole
   * session, which is what "the feed is unlimited now" was.
   *
   * Still fails open: until `ready` flips, the limit stays whatever the
   * fetch decided. This only replaces a guess with the truth.
   */
  useEffect(() => {
    if (!premiumReady) return;
    let alive = true;
    void getDailyLimit({ isPremium })
      .then((n) => { if (alive) setDailyLimit(n); })
      .catch(() => {});
    return () => { alive = false; };
  }, [premiumReady, isPremium]);

  /**
   * What is actually rendered, sliced to today's allowance.
   *
   * Memoized because .slice() returns a NEW array every call, and FlatList
   * compares `data` by identity: an unmemoized slice told it the entire feed
   * had changed on every single render, which is the one thing that makes
   * every windowing option above useless.
   *
   * The confessions beyond the limit are not fetched-and-hidden — they are
   * simply not rendered, and tomorrow's reset brings them back without
   * another round trip.
   */
  const visible = useMemo(
    () => (dailyLimit === null ? confessions : confessions.slice(0, dailyLimit)),
    [confessions, dailyLimit]);

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
      const [primed, fresh, liveQuestion] = await Promise.all([
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

      /**
       * Premium comes from the context, not from a fresh checkPremium() call.
       *
       * The provider has already resolved it at startup, so asking again on
       * every feed load was an extra await in front of the content for an
       * answer we were holding. Fails OPEN to unlimited while the provider is
       * still settling: a billing hiccup must never be the reason someone is
       * told they have run out.
       */
      setDailyLimit(
        await getDailyLimit({ isPremium: premiumReady ? isPremium : true }).catch(() => null));
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
      lastFetchedAt.current = Date.now();
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

  // getCurrentQuestion is NOT called here. It is already one of the three
  // parallel requests inside fetchRecommendations, which runs on mount — a
  // second effect meant two identical round trips on every cold start, racing
  // each other to set the same state.

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

  /**
   * [N1] Moment C — THE QUESTION.
   *
   * Offered after the reader has engaged with this week's question: they
   * opened "Read answers" and came back, or they answered it. Not on
   * merely SEEING the card — that is the weakest possible version of the
   * ask, and spending the one dialog on it would burn the other two.
   *
   * otherAskOnScreen is passed because the question card carries its own
   * buttons. One ask at a time, and the question's own actions come first.
   */
  const [questionEngaged, setQuestionEngaged] = useState(false);
  const questionAsk = usePushAsk(
    questionEngaged && !questionHidden ? 'question' : null,
    { otherAskOnScreen: !!invite },
  );


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

  /**
   * One row.
   *
   * useCallback, because FlatList treats a new renderItem identity as a
   * reason to re-render every visible row — which defeated ReadCard's memo
   * on every state change in this screen, including the ones that have
   * nothing to do with the list (a share sheet opening, an impression
   * firing). The deps are the props a row actually reads.
   */
  const renderItem = useCallback(({ item, index }: { item: Recommendation; index: number }) => (
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
        headline={item.headline}
        feltCount={item.feltCount}
        confessionId={item.id}
        audioDurationMs={item.audioDurationMs}
        audioWaveform={item.audioWaveform}
        palette={palettes[index % palettes.length]}
        personaSeed={item.id}
        onReport={handleReport}
        onFelt={onCardFelt}
        onShare={onCardShare}
        onPress={onCardPress}
        iconSessionOffset={iconSession}
      />
    </View>
  ), [question, styles, handleReport, onCardFelt, onCardShare, onCardPress, iconSession]);

  /**
   * What goes BETWEEN two cards.
   *
   * Memoized for the same reason as renderItem: an inline arrow here is a new
   * component type on every render, so React threw away and rebuilt every
   * separator — including the interstitial cards, which then re-ran their own
   * impression effects.
   */
  // ── [S1] The page model ────────────────────────────────────────────────────
  /**
   * The question, at the top of the feed and scrolling with it.
   *
   * Memoised because ListHeaderComponent is re-evaluated on every list
   * render — a felt tap, an impression firing, a scroll — and QuestionCard
   * is not cheap. Passing an element (not a component type) keeps React
   * from unmounting and remounting it each time, which would restart its
   * entrance animation while somebody was reading it.
   */
  const questionHeader = useMemo(() => {
    if (!question || filterQuestion !== null || questionHidden) return null;
    return (
      <View style={styles.questionHeader}>
        {/* Never rendered beside the premium card — the 2026-09-27 decision
            applies to every write invite, this one included. */}
        <QuestionCard
          question={question}
          featured
          onAnswer={onAnswerQuestion}
          onReadAnswers={onReadAnswers}
          onShare={onShareQuestion}
          onDismiss={onDismissQuestion}
        />
        {/* [N1] Moment C, inline under the question card. */}
        {questionAsk.moment && (
          <PushAskCard
            moment={questionAsk.moment}
            onAccept={questionAsk.onAccept}
            onDecline={questionAsk.onDecline}
            collapsed={questionAsk.collapsed}
          />
        )}
      </View>
    );
  }, [question, filterQuestion, questionHidden, styles,
      onAnswerQuestion, onReadAnswers, onShareQuestion, onDismissQuestion,
      questionAsk.moment, questionAsk.collapsed,
      questionAsk.onAccept, questionAsk.onDecline]);

  const Separator = useCallback(({ leadingItem }: { leadingItem?: Recommendation }) => {
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
              router.navigate({
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
              router.navigate('/write');
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
  }, [indexById, invite, inviteAfterId, styles]);

  // -- Loading ------------------------------------------------------------------
  // Only a genuine cold start reaches this: with a cached feed, loading was
  // already set false before the first paint (see the mount effect).
  if (loading) {
    return (
      <View style={styles.root}>
        <FeedHeader styles={styles} />
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
        <FeedHeader styles={styles} />
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
        <FeedHeader styles={styles} />
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
          <GhostButton label="Write your own" onPress={() => router.navigate('/write')} />
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
        styles={styles}
        trailing={
          <View style={styles.headerRight}>
            {/**
              * The hour, in the colour of the hour. A clock, not a
              * countdown — see lib/timeOfDay.ts.
              *
              * Capped readers only. A premium reader has no midnight
              * reset, so for them the pill has nothing to be about: the
              * right answer is no pill, not a pill with softer copy.
              *
              * dailyLimit is null until the premium answer settles, so
              * this appears a moment after load rather than being there
              * from the first frame. That direction is deliberate — a
              * premium reader never sees it at all, which is the point.
              */}
            {dailyLimit !== null && (
              <FeedClock onPremium={() => router.push('/plans')} />
            )}
            {/* Count what is actually readable, not what was fetched. This
                read confessions.length — the unsliced array — so a capped
                reader was told "540 to read" above a feed showing 10. */}
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

          </View>
        }
      />

      {/**
        * The filter chip STAYS pinned, and it is the only thing here that does.
        *
        * While the filter is on this is the ONLY way back to the whole feed.
        * Scrolled out of sight it left a reader stuck in a short list with no
        * exit — so unlike the question card it is a sibling of the list, not
        * a row in it.
        */}
      {question && filterQuestion !== null && (
        <View style={styles.pinned}>
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
        </View>
      )}

        <FlatList
          data={visible}
          /**
           * The question SCROLLS AWAY with the feed.
           *
           * It was pinned above the list so a reader who had started reading
           * could always see it. In practice that meant it never left: a card
           * permanently occupying the top of the one reading surface, above
           * every confession, every session. The feed is other people's
           * writing, and the question was standing in front of it.
           *
           * As a list header it is the first thing seen and then it is
           * passed, like everything else here. What replaces "always
           * visible" is "hard to miss once" — see QuestionCard's `featured`
           * treatment.
           *
           * Still a header rather than a row: it is not a confession, it
           * must never be counted as one, and `visible` is the confession
           * array that the allowance, the impressions and the separators
           * all index into.
           */
          ListHeaderComponent={questionHeader}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
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
          ItemSeparatorComponent={Separator}
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
            <FeedEnd
              styles={styles}
              filterQuestion={filterQuestion}
              dailyLimit={dailyLimit}
              total={confessions.length}
              exhausted={exhausted}
              loadingMore={loadingMore}
              onLoadMore={loadMore}
            />
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
      /**
       * Above the list, which is a later sibling and would otherwise
       * paint over anything hanging out of the header — the clock's
       * tooltip is the first thing that does.
       *
       * zIndex, not elevation: elevation would put a material drop
       * shadow under the entire header on Android.
       */
      zIndex:            2,
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
    /**
      * The pinned region above the feed.
      *
      * Horizontal padding matches the list's own (styles.scroll) so the card
      * lines up with the confessions under it rather than looking like a
      * different surface bolted on top.
      */
    pinned: {
      paddingHorizontal: spacing.screenPadding,
      paddingTop:        4,
    },
    /** The question, inside the list. The list supplies the side padding. */
    questionHeader: { paddingBottom: 4 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
