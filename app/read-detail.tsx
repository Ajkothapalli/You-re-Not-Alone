import ReadCard from '@/components/ReadCard';
import { reportConfession } from '@/lib/api';
import { palettes } from '@/theme/palettes';
import { color, fontFamily, spacing } from '@/theme/tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { showDialog } from '@/components/AppDialog';

export default function ReadDetailScreen() {
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
          },
        },
      ],
    );
  }

  return (
    <ScrollView
      style={styles.root}
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
          <Text style={styles.back}>← back</Text>
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
  );
}

const styles = StyleSheet.create({
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
