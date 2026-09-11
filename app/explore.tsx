/**
 * Explore — personalized reading surface.
 *
 * Shows up to RETURN_N (10) confessions per session, one at a time.
 * Not a feed: no infinite scroll, no refresh gesture, no pagination.
 * Each card is a full ReadCard (no truncation) in a ScrollView.
 *
 * Events logged per card:
 *   impression  — on card mount
 *   read_to_end — after ≥5 s dwell
 *   felt        — when the user taps the felt button (mirrored from ReadCard)
 *   skip        — when "next" is tapped before 5 s
 *   report      — on report action
 *
 * Identity invariant: reader_account_id (logged) is separate from
 * author_token. Reading history does not reveal authorship.
 */

import ReadCard from '@/components/ReadCard';
import { StoryCard } from '@/components/StoryCard';
import { ScrawlIcon } from '@/components/ScrawlIcon';
import { PrimaryButton, GhostButton } from '@/components/Buttons';
import { announce } from '@/lib/a11y';
import { analytics } from '@/lib/analytics';
import { getRecommendations, logReadEvent, reportConfession, type Recommendation } from '@/lib/api';
import { isD7 } from '@/lib/d7';
import { shareConfessionCard } from '@/lib/shareCard';
import { palettes } from '@/theme/palettes';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily, spacing } from '@/theme/tokens';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
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
  const [index,           setIndex]           = useState(0);
  const [loading,         setLoading]         = useState(true);
  const [done,            setDone]            = useState(false);
  const [premiumRequired, setPremiumRequired] = useState(false);
  const [withinD7,        setWithinD7]        = useState(false);
  const [iconSession,     setIconSession]     = useState(() => Math.floor(Math.random() * 102));
  const [showShareNudge,  setShowShareNudge]  = useState(false);
  const [sharing,         setSharing]         = useState(false);
  const storyRef    = useRef<View>(null);
  const nudgeShown  = useRef(false);  // show at most once per session

  // Rotate icons each time the user navigates back to this screen
  useFocusEffect(useCallback(() => {
    setIconSession(Math.floor(Math.random() * 102));
  }, []));

  const dwellTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dwellFired   = useRef(false);
  const mountTimeRef = useRef<number>(Date.now());

  // D7 seamless-queue bookkeeping. Session-scoped only (not persisted) —
  // just needs to avoid immediate repeats within one continuous sitting.
  const shownIdsRef      = useRef<Set<string>>(new Set());
  const confessionsRef   = useRef<Recommendation[]>([]);   // mirrors `confessions`, readable synchronously across awaits
  const refillPromiseRef = useRef<Promise<void> | null>(null);
  const REFILL_AT = 3; // trigger the next fetch this many cards before the queue actually runs out

  async function fetchRecommendations() {
    setLoading(true);
    setDone(false);
    setIndex(0);
    shownIdsRef.current      = new Set();
    confessionsRef.current   = [];
    refillPromiseRef.current = null;
    const d7 = await isD7().catch(() => false);
    setWithinD7(d7);
    getRecommendations(d7)
      .then(({ confessions: data, premiumRequired: gated }) => {
        if (gated) {
          setPremiumRequired(true);
          setLoading(false);
          return;
        }
        data.forEach(c => shownIdsRef.current.add(c.id));
        confessionsRef.current = data;
        setConfessions(data);
        setLoading(false);
        if (data.length === 0) setDone(true);
      })
      .catch(() => {
        setLoading(false);
        setDone(true);
      });
  }

  // Fire-and-forget-able: kicks off a background fetch of more confessions
  // (excluding everything already shown this session) once the queue is
  // running low, and appends the result. Returns the in-flight promise so a
  // caller that's reached the true end can await the SAME fetch rather than
  // starting a second one or flashing the dead-end screen prematurely.
  function refillIfNeeded(afterIndex: number): Promise<void> {
    if (!withinD7) return Promise.resolve();
    const remaining = confessionsRef.current.length - afterIndex;
    if (remaining > REFILL_AT) return Promise.resolve();
    if (refillPromiseRef.current) return refillPromiseRef.current;

    const p = getRecommendations(true, Array.from(shownIdsRef.current))
      .then(({ confessions: more }) => {
        if (more.length > 0) {
          more.forEach(c => shownIdsRef.current.add(c.id));
          setConfessions(prev => {
            const merged = [...prev, ...more];
            confessionsRef.current = merged;
            return merged;
          });
        }
      })
      .catch(() => {
        // Silent — worst case the existing done-screen ("Keep reading")
        // fallback still catches it.
      })
      .finally(() => {
        refillPromiseRef.current = null;
      });

    refillPromiseRef.current = p;
    return p;
  }

  // Fetch on mount
  useEffect(() => { fetchRecommendations(); }, []);

  // Track dwell time per card
  useEffect(() => {
    if (loading || done || confessions.length === 0) return;

    const current = confessions[index];
    if (!current) return;

    // Log impression
    logReadEvent(current.id, 'impression');
    announce(`Confession ${index + 1} of ${confessions.length}`);

    mountTimeRef.current = Date.now();
    dwellFired.current   = false;

    dwellTimer.current = setTimeout(() => {
      dwellFired.current = true;
      logReadEvent(current.id, 'read_to_end');
    }, DWELL_THRESHOLD_MS);

    return () => {
      if (dwellTimer.current) clearTimeout(dwellTimer.current);
    };
  }, [index, loading, done]);

  async function handleNext() {
    const current = confessions[index];

    // If dwell threshold wasn't met, it's a skip
    if (!dwellFired.current && current) {
      logReadEvent(current.id, 'skip');
    }
    if (dwellTimer.current) clearTimeout(dwellTimer.current);

    const nextIndex = index + 1;

    if (withinD7) {
      // Kick off (or join) a silent refill as the queue runs low — before
      // the reader ever sees a dead end. Non-blocking when cards remain;
      // if we've actually hit the end, wait for it so a same-tick refill
      // lands before deciding whether this is really the end.
      const refill = refillIfNeeded(nextIndex);
      if (nextIndex >= confessionsRef.current.length) {
        await refill;
      }
    }

    if (nextIndex >= confessionsRef.current.length) {
      // Only reachable for D7 users when a fetch genuinely returned nothing
      // new (pool fully exhausted) — or immediately for non-D7 users at
      // their hard cap, unchanged from before.
      setDone(true);
    } else {
      setIndex(nextIndex);
    }
  }

  const SHARE_NUDGE_THRESHOLD = 50;

  function handleFelt(confessionId: string) {
    logReadEvent(confessionId, 'felt');
    // Light share nudge on a strong read (felt ≥ 50), once per session.
    const c = confessions[index];
    if (c && c.feltCount >= SHARE_NUDGE_THRESHOLD && !nudgeShown.current) {
      nudgeShown.current = true;
      setShowShareNudge(true);
    }
  }

  async function handleReadShare() {
    const currentId = confessions[index]?.id;
    setSharing(true);
    try {
      await shareConfessionCard(storyRef, 'read');
      analytics.cardShared('read');
      if (currentId) logReadEvent(currentId, 'share').catch(() => {});
      setShowShareNudge(false);
    } catch {
      setShowShareNudge(false);
    } finally {
      setSharing(false);
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
            handleNext();
          },
        },
      ],
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={color.dim} accessibilityLabel="Loading recommendations" />
      </View>
    );
  }

  // ── End of session ────────────────────────────────────────────────────────────
  if (done || confessions.length === 0) {
    return (
      <View style={styles.root}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ transform: [{ scaleX: -1 }] }}>
              <ScrawlIcon name="arrow_right" size={16} color={color.dim} roughen={false} strokeWidth={2.5} />
            </View>
            <Text style={styles.backLabel}>back</Text>
          </View>
        </Pressable>
        <View style={styles.endContent}>
          <Text style={styles.endHeading} accessibilityRole="header">
            {confessions.length === 0
              ? 'Nothing here yet'
              : 'You\'re all caught up'}
          </Text>
          <Text style={styles.endBody}>
            {confessions.length === 0
              ? 'Add more reading categories or check back soon — more people are sharing every day.'
              : 'Come back later. New confessions are matched to your taste as they arrive.'}
          </Text>
          {withinD7 && (
            <PrimaryButton label="Keep reading" onPress={fetchRecommendations} />
          )}
          <GhostButton label="Update categories" onPress={() => router.push('/categories?mode=edit')} />
          <GhostButton label="Write your own" onPress={() => router.replace('/write')} />
        </View>
      </View>
    );
  }

  const current     = confessions[index];
  const paletteIdx  = index % palettes.length;
  const palette     = palettes[paletteIdx];
  // D7 readers never see "Done" mid-queue — the last visible card of the
  // current batch usually isn't actually the end (a refill is either already
  // in flight or about to be triggered by handleNext), so the button always
  // reads as a continuation. Non-D7 keeps its exact prior hard-cap behavior.
  const isLast      = !withinD7 && index === confessions.length - 1;

  return (
    <View style={styles.root}>
      {/* Off-screen capture target for felt-share — updates with current card */}
      <StoryCard
        ref={storyRef}
        youText={current.text}
        feltCount={current.feltCount}
        palette={palette}
        source="read"
      />

      {/* Progress + back */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ transform: [{ scaleX: -1 }] }}>
              <ScrawlIcon name="arrow_right" size={16} color={color.dim} roughen={false} strokeWidth={2.5} />
            </View>
            <Text style={styles.backLabel}>back</Text>
          </View>
        </Pressable>
        <Text
          style={styles.progress}
          accessibilityLabel={`${index + 1} of ${confessions.length} confessions`}
        >
          {index + 1} / {confessions.length}
        </Text>
      </View>

      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <ReadCard
          text={current.text}
          feltCount={current.feltCount}
          palette={palette}
          personaSeed={current.id}
          onReport={() => handleReport(current.id)}
          onFelt={() => handleFelt(current.id)}
          iconSessionOffset={iconSession}
        />

        <View style={styles.navRow}>
          {showShareNudge && (
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
          )}
          <PrimaryButton
            label={isLast ? 'Done' : 'Next confession'}
            onPress={handleNext}
          />
        </View>
      </ScrollView>
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
    backBtn: {
      paddingHorizontal: spacing.screenPadding,
      paddingTop:        64,
      paddingBottom:     12,
    },
    backLabel: {
      fontFamily: fontFamily.sans,
      fontSize:   14,
      color:      color.dim,
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
      paddingBottom: 96,
      gap:           20,
    },
    navRow: {
      gap: 12,
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
