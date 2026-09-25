/**
 * Match reveal — presented as a formSheet over the feed.
 *
 * noMatch === "1"  → nobody else has written in this category yet; no second
 *                    confession to show.
 * noMatch === "0"  → another confession from a shared category; shows
 *                    ConfessionCard.
 *
 * What "match" means here, so the copy on this screen stays honest: the server
 * picks a confession that overlaps on CATEGORY and language, at random
 * (match_confession_by_category, owner decision 2026-09-13). The two texts are
 * not compared, scored, or ranked. Nothing on this screen may imply the two
 * confessions are equivalent, or that this person is the closest one — only
 * that they wrote about the same territory.
 *
 * Share flow: captureRef targets the off-screen StoryCard (360×640),
 * not the on-screen display card.
 */
import { Celebration } from '@/components/Celebration';
import { Icon } from '@/components/Icon';
import ConfessionCard from '@/components/ConfessionCard';
import { StoryCard } from '@/components/StoryCard';
import { PrimaryButton, GhostButton } from '@/components/Buttons';
import { analytics } from '@/lib/analytics';
import { logReadEvent } from '@/lib/api';
import { PER_WRITE } from '@/lib/readAllowance';
import { shareConfessionCard } from '@/lib/shareCard';
import { usePalette, useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily, spacing } from '@/theme/tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { showDialog } from '@/components/AppDialog';

export default function MatchScreen() {
  const palette = usePalette();
  const color   = useThemeColors();
  const styles  = useMemo(() => createStyles(color), [color]);
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

  const storyRef = useRef<View>(null);

  const [celebrating,  setCelebrating]  = useState(true);
  const [sharing,      setSharing]      = useState(false);
  const [iconSession]                   = useState(() => Math.floor(Math.random() * 102));

  useEffect(() => {
    if (!isNoMatch && confessionId) {
      analytics.matchShown(confessionId, feltCount);
    }
  }, []);

  async function handleShare() {
    setSharing(true);
    try {
      await shareConfessionCard(storyRef, 'match');
      analytics.cardShared('match');
      if (confessionId) logReadEvent(confessionId, 'share').catch(() => {});
    } catch (err: any) {
      showDialog('Could not share', err.message ?? 'Try again.');
    } finally {
      setSharing(false);
    }
  }

  function goToFeed() {
    // Sheet is over the feed — just dismiss it.
    router.back();
  }

  // ── No match path ────────────────────────────────────────────────────────────
  if (isNoMatch) {
    return (
      <View style={styles.root}>
        {celebrating && (
          <Celebration palette={palette} onDone={() => setCelebrating(false)} />
        )}
        {!celebrating && (
          <ScrollView
            style={styles.fill}
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.heading} accessibilityRole="header">You're the first to feel this</Text>
            {/* "yours is what they'll find" promised a reciprocal match this
                app cannot make: the pool is picked from at random within a
                category, so being in it is the whole of the claim. */}
            <Text style={styles.body}>
              Your words are in the pool now. When someone else writes about the
              same thing, yours is one of the ones they could be shown.
            </Text>
            <View style={styles.actions}>
              <PrimaryButton label="Take me to feed" onPress={goToFeed} />
              <Text style={styles.unlockHint}>Writing just unlocked {PER_WRITE} more reads</Text>
            </View>
          </ScrollView>
        )}
      </View>
    );
  }

  // ── Match path ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* Off-screen capture target for share */}
      <StoryCard
        ref={storyRef}
        youText={youText}
        themText={themText}
        feltCount={feltCount}
        palette={palette}
        source="match"
      />

      {celebrating && (
        <Celebration palette={palette} onDone={() => setCelebrating(false)} />
      )}

      {!celebrating && (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headingRow}>
            <Icon name="infinity" size={20} />
            <Text style={styles.heading} accessibilityRole="header">You're not alone in this</Text>
          </View>

          <ConfessionCard
            youText={youText}
            themText={themText}
            feltCount={feltCount}
            palette={palette}
            iconSeed={confessionId}
            iconSessionOffset={iconSession}
          />

          <View style={styles.actions}>
            <PrimaryButton
              label={sharing ? 'Preparing…' : 'Share this moment'}
              onPress={handleShare}
              loading={sharing}
            />
            <Text style={styles.unlockHint}>Writing just unlocked {PER_WRITE} more reads</Text>
            <GhostButton label="Take me to feed" onPress={goToFeed} />
          </View>
        </ScrollView>
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
    fill: {
      flex: 1,
    },
    scroll: {
      flexGrow:      1,
      padding:       spacing.screenPadding,
      paddingTop:    24,
      paddingBottom: 40,
      alignItems:    'center',
      gap:           24,
    },
    headingRow: {
      flexDirection:  'row',
      alignItems:     'center',
      justifyContent: 'center',
      gap:            8,
    },
    heading: {
      fontFamily: fontFamily.sansBold,
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
    actions: {
      width: '100%',
      gap:   12,
    },
    unlockHint: {
      fontFamily: fontFamily.sans,
      fontSize:   13,
      color:      color.dim,
      textAlign:  'center',
    },
  });
}
