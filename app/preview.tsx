/**
 * Preview screen — dev only.
 * Renders the ConfessionCard with all 6 palettes + the supporting components.
 * Gate or remove before production.
 */

import { GhostButton, PrimaryButton } from '@/components/Buttons';
import ConfessionCard from '@/components/ConfessionCard';
import ConfessionInput from '@/components/ConfessionInput';
import CounterPill from '@/components/CounterPill';
import { palettes } from '@/theme/palettes';
import { color, spacing } from '@/theme/tokens';
import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const SAMPLE_YOU = "I've spent years pretending I'm fine. I smile at every party, say the right things, laugh at the right moments. But when I get home and close the door I just sit on the floor for a while. I don't know what I'm waiting for.";
const SAMPLE_THEM = "Every morning I make plans to change something. By evening I've already convinced myself it's not worth trying. I keep waiting to feel ready. I think I'm afraid that ready never comes.";

export default function PreviewScreen() {
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [inputText, setInputText] = useState('');
  const palette = palettes[paletteIndex];

  function prev() {
    setPaletteIndex((i) => (i - 1 + palettes.length) % palettes.length);
  }
  function next() {
    setPaletteIndex((i) => (i + 1) % palettes.length);
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Palette nav */}
      <View style={styles.paletteNav}>
        <GhostButton label="←" onPress={prev} style={styles.navBtn} />
        <Text style={styles.paletteName}>
          {paletteIndex + 1} / {palettes.length} — {palette.name}
        </Text>
        <GhostButton label="→" onPress={next} style={styles.navBtn} />
      </View>

      {/* The locked card */}
      <ConfessionCard
        youText={SAMPLE_YOU}
        themText={SAMPLE_THEM}
        feltCount={247}
        palette={palette}
      />

      {/* Counter pill */}
      <CounterPill count={247} youColor={palette.you} />

      {/* ConfessionInput */}
      <ConfessionInput
        value={inputText}
        onChangeText={setInputText}
        placeholder="Write it here. It stays private."
      />

      {/* Buttons */}
      <PrimaryButton label="Find who feels this" onPress={() => {}} />
      <GhostButton   label="Write another"       onPress={() => {}} />

      {/* Dev watermark */}
      <Text style={styles.devNote}>⚠ Dev preview — remove before production</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: color.ink,
  },
  scroll: {
    padding:        spacing.screenPadding,
    paddingTop:     60,
    paddingBottom:  60,
    alignItems:     'center',
    gap:            24,
  },
  paletteNav: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            16,
    alignSelf:      'stretch',
    justifyContent: 'center',
  },
  navBtn: {
    paddingHorizontal: 20,
    paddingVertical:   10,
  },
  paletteName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize:   13,
    color:      color.dim,
    flex:       1,
    textAlign:  'center',
  },
  devNote: {
    fontFamily: 'Inter_400Regular',
    fontSize:   11,
    color:      color.dim,
    marginTop:  8,
  },
});
