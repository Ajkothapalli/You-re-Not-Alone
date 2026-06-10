/**
 * Match reveal screen.
 *
 * noMatch === "1" — first person to feel this — shows "you're the first" copy
 * noMatch === "0" — shows ConfessionCard on screen + off-screen StoryCard for share
 *
 * Share flow: captureRef is called on the off-screen StoryCard (360×640),
 * not the on-screen card. The visible ConfessionCard is display-only.
 */
import ConfessionCard from '@/components/ConfessionCard';
import { StoryCard } from '@/components/StoryCard';
import { PrimaryButton, GhostButton } from '@/components/Buttons';
import { reportConfession } from '@/lib/api';
import { analytics } from '@/lib/analytics';
import { shareConfessionCard } from '@/lib/shareCard';
import { usePalette } from '@/theme/ThemeProvider';
import { color, fontFamily, radius, spacing } from '@/theme/tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export default function MatchScreen() {
  const palette = usePalette();
  const params = useLocalSearchParams<{
    youText:      string;
    themText:     string;
    feltCount:    string;
    confessionId: string;
    noMatch:      string;
  }>();

  const youText      = params.youText      ?? '';
  const themText     = params.themText     ?? '';
  const feltCount    = parseInt(params.feltCount ?? '1', 10);
  const confessionId = params.confessionId ?? '';
  const isNoMatch    = params.noMatch === '1';

  // Ref for the off-screen StoryCard (the share capture target)
  const storyRef = useRef<View>(null);

  const [sharing,   setSharing]   = useState(false);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    if (!isNoMatch && confessionId) {
      analytics.matchShown(confessionId, feltCount);
    }
  }, []);

  async function handleShare() {
    setSharing(true);
    try {
      await shareConfessionCard(storyRef);
      analytics.cardShared();
    } catch (err: any) {
      Alert.alert('Could not share', err.message ?? 'Try again.');
    } finally {
      setSharing(false);
    }
  }

  function handleReport() {
    Alert.alert(
      'Report this confession',
      'Are you sure you want to report this?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:  'Report',
          style: 'destructive',
          onPress: async () => {
            setReporting(true);
            try {
              await reportConfession(confessionId, 'other');
              analytics.reportSubmitted(confessionId);
              Alert.alert('Reported', 'Thank you. Our team will review this.');
              router.replace('/write');
            } catch (err: any) {
              Alert.alert('Error', err.message ?? 'Could not send report.');
            } finally {
              setReporting(false);
            }
          },
        },
      ],
    );
  }

  // ── No match path ────────────────────────────────────────────────────────────
  if (isNoMatch) {
    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>you're the first to feel this</Text>
        <Text style={styles.body}>
          Your words are waiting. When someone else shares something similar, they'll find
          you — and know they're not alone.
        </Text>
        <PrimaryButton label="Write another" onPress={() => router.replace('/write')} />
      </ScrollView>
    );
  }

  // ── Match path ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/*
        Off-screen StoryCard — always rendered while on this screen so captureRef
        can rasterize it. Positioned at left:-9999 inside StoryCard itself.
        Not inside the ScrollView so it is never unmounted by virtualisation.
      */}
      <StoryCard
        ref={storyRef}
        youText={youText}
        themText={themText}
        feltCount={feltCount}
        palette={palette}
      />

      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>you're not alone in this</Text>

        {/* On-screen card — display only, not the capture target */}
        <View style={styles.cardWrapper}>
          <ConfessionCard
            youText={youText}
            themText={themText}
            feltCount={feltCount}
            palette={palette}
          />
        </View>

        <View style={styles.actions}>
          <PrimaryButton
            label={sharing ? 'Preparing…' : 'Share this moment'}
            onPress={handleShare}
            loading={sharing}
          />
          <GhostButton
            label="Write another"
            onPress={() => router.replace('/write')}
          />
        </View>

        <Pressable
          style={styles.reportRow}
          onPress={handleReport}
          disabled={reporting}
          hitSlop={12}
        >
          <Text style={styles.reportText}>
            {reporting ? 'Reporting…' : 'report this confession'}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: color.ink,
  },
  fill: {
    flex: 1,
  },
  scroll: {
    flexGrow:      1,
    padding:       spacing.screenPadding,
    paddingTop:    60,
    paddingBottom: 60,
    alignItems:    'center',
    gap:           28,
  },
  heading: {
    fontFamily: fontFamily.serifItalic,
    fontSize:   24,
    color:      color.paper,
    textAlign:  'center',
  },
  body: {
    fontFamily:        fontFamily.sans,
    fontSize:          16,
    color:             color.dim,
    textAlign:         'center',
    lineHeight:        24,
    paddingHorizontal: 8,
  },
  cardWrapper: {
    borderRadius: radius.card,
    overflow:     'hidden',
    width:        '100%',
  },
  actions: {
    width: '100%',
    gap:   12,
  },
  reportRow: {
    paddingVertical: 8,
  },
  reportText: {
    fontFamily:         fontFamily.sans,
    fontSize:           13,
    color:              color.dim,
    textDecorationLine: 'underline',
  },
});
