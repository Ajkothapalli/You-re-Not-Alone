import ReadCard from '@/components/ReadCard';
import { ScrawlIcon } from '@/components/ScrawlIcon';
import { reportConfession } from '@/lib/api';
import { palettes } from '@/theme/palettes';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily, spacing } from '@/theme/tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { showDialog } from '@/components/AppDialog';
import { showToast } from '@/components/Toast';
import { BackgroundPattern } from '@/components/BackgroundPattern';

export default function ReadDetailScreen() {
  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);

  const { id, text, feltCount, paletteIndex } = useLocalSearchParams<{
    id:           string;
    text:         string;
    feltCount:    string;
    paletteIndex: string;
  }>();

  const palette = palettes[Number(paletteIndex) === 0 ? 0 : 3];
  const count   = Number(feltCount) || 0;

  function handleReport() {
    showDialog(
      'Report this confession',
      'Are you sure you want to report this?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:  'Report',
          style: 'destructive',
          onPress: async () => {
            try { await reportConfession(id, 'other'); } catch {}
            showToast('Successfully reported');
          },
        },
      ],
    );
  }

  return (
    <View style={styles.root}>
    <BackgroundPattern />
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
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
            <Text style={styles.back}>back</Text>
          </View>
        </Pressable>
      </View>

      <ReadCard
        text={text ?? ''}
        feltCount={count}
        palette={palette}
        onReport={handleReport}
        personaSeed={id ?? ''}
      />
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
    scroll: {
      flexGrow:      1,
      padding:       spacing.screenPadding,
      paddingTop:    64,
      paddingBottom: 64,
      gap:           20,
    },
    topBar: {
      marginBottom: 8,
    },
    back: {
      fontFamily: fontFamily.sans,
      fontSize:   14,
      color:      color.dim,
    },
  });
}
