/**
 * The shape of a voice confession, drawn as bars.
 *
 * One component for both places it appears — live while recording, and static
 * on a card someone is reading — because they have to LOOK the same. The whole
 * point of persisting the waveform is that the reader sees the shape the writer
 * saw; two renderers would drift apart the first time either was touched.
 *
 * ── It is loudness, not pitch ───────────────────────────────────────────────
 * The recogniser owns the mic stream and reports a single amplitude value per
 * interval. There is no raw PCM to run an FFT over, and opening a second
 * capture client to get it is what Android refuses. This is what every other
 * app's "waveform" is too.
 *
 * ── Plain Views, not SVG ────────────────────────────────────────────────────
 * 48 absolutely-cheap rounded rectangles. The live strip re-renders ~10× a
 * second on a low-end device, and an <Svg> with 48 <Rect> children re-mounts
 * the whole native tree each time. Views are diffed.
 */

import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useThemeColors } from '@/theme/ThemeProvider';

export interface WaveformProps {
  /** Bar heights. 0..1 live, or 0..100 as stored — both are accepted. */
  levels:    number[];
  /** Bar height in px. Width scales with it so the shape stays consistent. */
  height?:   number;
  /** 0..1. Bars before this point are drawn in `color.paper`, the rest dim. */
  progress?: number;
  /** Pad to this many bars with silence so a short capture is not stretched. */
  minBars?:  number;
  style?:    ViewStyle;
  testID?:   string;
}

/** Accepts the live 0..1 floats and the stored 0..100 integers alike. */
function toUnit(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(1, v > 1 ? v / 100 : v);
}

export default function Waveform({
  levels, height = 28, progress, minBars = 0, style, testID,
}: WaveformProps) {
  const color = useThemeColors();

  const bars = levels.map(toUnit);
  while (bars.length < minBars) bars.push(0);
  if (bars.length === 0) return null;

  // A bar at literally 0 disappears and the strip looks broken mid-silence;
  // a 2px stub reads as "quiet here" instead.
  const MIN_H = 2;
  const cut = progress === undefined ? bars.length : Math.round(progress * bars.length);

  return (
    <View
      style={[styles.row, { height }, style]}
      testID={testID ?? 'waveform'}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {bars.map((v, i) => (
        <View
          key={i}
          style={{
            flex:            1,
            marginHorizontal: 0.75,
            height:          Math.max(MIN_H, v * height),
            borderRadius:    1.5,
            backgroundColor: i < cut ? color.paper : color.dim,
            opacity:         i < cut ? 0.9 : 0.45,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    width:         '100%',
  },
});
