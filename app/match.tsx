/**
 * Match reveal — presented as a formSheet over the feed.
 *
 * noMatch === "1"  → first person to feel this; no paired confession.
 * noMatch === "0"  → paired match found; shows ConfessionCard.
 *
 * Share flow: captureRef targets the off-screen StoryCard (360×640),
 * not the on-screen display card.
 */
import { Celebration } from '@/components/Celebration';
import ConfessionCard from '@/components/ConfessionCard';
import { StoryCard } from '@/components/StoryCard';
import { PrimaryButton, GhostButton } from '@/components/Buttons';
import { analytics } from '@/lib/analytics';
import { shareConfessionCard } from '@/lib/shareCard';
import { usePalette } from '@/theme/ThemeProvider';
import { color, fontFamily, spacing } from '@/theme/tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { showDialog } from '@/components/AppDialog';

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

  const storyRef = useRef<View>(null);

  const [celebrating, setCelebrating] = useState(true);
  const [sharing,     setSharing]     = useState(false);

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
            <Text style={styles.heading} accessibilityRole="header">you're the first to feel this</Text>
            <Text style={styles.body}>
              Your words are waiting. When someone else shares something similar, they'll find
              you — and know they're not alone.
            </Text>
            <View style={styles.actions}>
              <PrimaryButton label="Take me to feed" onPress={goToFeed} />
              <Text style={styles.unlockHint}>writing just unlocked 2 more reads</Text>
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
          <Text style={styles.heading} accessibilityRole="header">you're not alone in this</Text>

          <ConfessionCard
            youText={youText}
            themText={themText}
            feltCount={feltCount}
            palette={palette}
          />

          <View style={styles.actions}>
            <PrimaryButton
              label={sharing ? 'Preparing…' : 'Share this moment'}
              onPress={handleShare}
              loading={sharing}
            />
            <Text style={styles.unlockHint}>writing just unlocked 2 more reads</Text>
            <GhostButton label="Take me to feed" onPress={goToFeed} />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
