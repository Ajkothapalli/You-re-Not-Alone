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
import ConfessionQuote from '@/components/ConfessionQuote';
import { announce } from '@/lib/a11y';
import { getRecommendations, logReadEvent, reportConfession, type Recommendation } from '@/lib/api';
import { session } from '@/lib/sessionFlags';
import { palettes } from '@/theme/palettes';
import { color, fontFamily, spacing } from '@/theme/tokens';
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

const DWELL_THRESHOLD_MS = 5_000;

export default function ExploreScreen() {
  const [confessions, setConfessions] = useState<Recommendation[]>([]);
  const [index,       setIndex]       = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [done,        setDone]        = useState(false);

  const dwellTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dwellFired   = useRef(false);
  const mountTimeRef = useRef<number>(Date.now());

  // Consume credits atomically on mount — no credits = skip straight to end
  useEffect(() => {
    const allowed = session.readCredits;
    session.readCredits = 0;

    if (allowed <= 0) {
      setLoading(false);
      setDone(true);
      return;
    }

    getRecommendations()
      .then(({ confessions: data }) => {
        setConfessions(data.slice(0, allowed));
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
    Alert.alert(
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
    const isEmpty = confessions.length === 0;
    return (
      <View style={styles.root}>
        {/* Scrollable top content */}
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.endContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.endHeading} accessibilityRole="header">
            {isEmpty ? 'nothing here yet' : 'that\'s your 2 for now'}
          </Text>
          <Text style={styles.endBody}>
            {isEmpty
              ? 'Add more reading categories or check back soon — more people are sharing every day.'
              : 'Write another confession to unlock 2 more reads. The more people share, the richer this place gets.'}
          </Text>
          <PrimaryButton label="Write another" onPress={() => router.replace('/write')} />
          {isEmpty && (
            <GhostButton label="Update categories" onPress={() => router.push('/categories?mode=edit')} />
          )}
          <ConfessionQuote />
        </ScrollView>

        {/* Premium promo — always pinned at the bottom */}
        <View style={styles.promoSection}>
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
            <Text style={styles.promoEyebrow}>PREMIUM</Text>
            <Text style={styles.promoTitle}>want more?</Text>
            <Text style={styles.promoBody}>
              Hundreds of confessions match what you carry. Premium readers never run out — no writing required.
            </Text>
            <View style={styles.promoCta}>
              <Text style={styles.promoCtaText}>Unlock unlimited reads →</Text>
            </View>
          </Pressable>
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
    flexGrow:      1,
    padding:       spacing.screenPadding,
    paddingTop:    80,
    paddingBottom: 24,
    gap:           16,
    justifyContent: 'center',
  },
  promoSection: {
    padding:       spacing.screenPadding,
    paddingBottom: 48,
    gap:           16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
    backgroundColor: color.bg,
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
  orRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
    marginTop:     4,
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
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     '#FBBF2444',
    padding:         20,
    gap:             10,
  },
  promoCardPressed: {
    backgroundColor: '#1C1824',
  },
  promoEyebrow: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      10,
    letterSpacing: 1.6,
    color:         '#FBBF24',
  },
  promoTitle: {
    fontFamily: fontFamily.serifItalic,
    fontSize:   22,
    color:      color.paper,
  },
  promoBody: {
    fontFamily: fontFamily.sans,
    fontSize:   14,
    color:      color.dim,
    lineHeight: 21,
  },
  promoCta: {
    backgroundColor:   '#FBBF24',
    borderRadius:      999,
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
});
