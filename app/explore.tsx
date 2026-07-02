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
import { PrimaryButton, GhostButton } from '@/components/Buttons';
import { announce } from '@/lib/a11y';
import { getRecommendations, logReadEvent, reportConfession, type Recommendation } from '@/lib/api';
import { palettes } from '@/theme/palettes';
import { color, fontFamily, spacing } from '@/theme/tokens';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { showDialog } from '@/components/AppDialog';

const DWELL_THRESHOLD_MS = 5_000;

export default function ExploreScreen() {
  const [confessions,     setConfessions]     = useState<Recommendation[]>([]);
  const [index,           setIndex]           = useState(0);
  const [loading,         setLoading]         = useState(true);
  const [done,            setDone]            = useState(false);
  const [premiumRequired, setPremiumRequired] = useState(false);

  const dwellTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dwellFired   = useRef(false);
  const mountTimeRef = useRef<number>(Date.now());

  // Fetch on mount
  useEffect(() => {
    getRecommendations()
      .then(({ confessions: data, premiumRequired: gated }) => {
        if (gated) {
          setPremiumRequired(true);
          setLoading(false);
          return;
        }
        setConfessions(data);
        setLoading(false);
        if (data.length === 0) setDone(true);
      })
      .catch(() => {
        setLoading(false);
        setDone(true);
      });
  }, []);

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

  function handleNext() {
    const current = confessions[index];

    // If dwell threshold wasn't met, it's a skip
    if (!dwellFired.current && current) {
      logReadEvent(current.id, 'skip');
    }
    if (dwellTimer.current) clearTimeout(dwellTimer.current);

    const nextIndex = index + 1;
    if (nextIndex >= confessions.length) {
      setDone(true);
    } else {
      setIndex(nextIndex);
    }
  }

  function handleFelt(confessionId: string) {
    logReadEvent(confessionId, 'felt');
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
          <Text style={styles.backLabel}>← back</Text>
        </Pressable>
        <View style={styles.endContent}>
          <Text style={styles.endHeading} accessibilityRole="header">
            {confessions.length === 0
              ? 'nothing here yet'
              : 'you\'re all caught up'}
          </Text>
          <Text style={styles.endBody}>
            {confessions.length === 0
              ? 'Add more reading categories or check back soon — more people are sharing every day.'
              : 'Come back later. New confessions are matched to your taste as they arrive.'}
          </Text>
          <GhostButton label="Update categories" onPress={() => router.push('/categories?mode=edit')} />
          <GhostButton label="Write your own" onPress={() => router.replace('/write')} />
        </View>
      </View>
    );
  }

  const current     = confessions[index];
  const paletteIdx  = index % palettes.length;
  const palette     = palettes[paletteIdx];
  const isLast      = index === confessions.length - 1;

  return (
    <View style={styles.root}>
      {/* Progress + back */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backLabel}>← back</Text>
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
        />

        <View style={styles.navRow}>
          <PrimaryButton
            label={isLast ? 'Done' : 'Next confession'}
            onPress={handleNext}
          />
        </View>
      </ScrollView>
    </View>
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
    paddingBottom: 60,
    gap:           20,
  },
  navRow: {
    gap: 12,
  },
  endContent: {
    flex:              1,
    padding:           spacing.screenPadding,
    paddingTop:        24,
    justifyContent:    'center',
    gap:               16,
  },
  endHeading: {
    fontFamily: fontFamily.serifItalic,
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
