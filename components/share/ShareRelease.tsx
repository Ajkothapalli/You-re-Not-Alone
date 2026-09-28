/**
 * ShareRelease — the quotes close over the words, meet as the logo, beat once,
 * and lift away.
 *
 * This is the Release from docs/design/motion.md, told with the brand mark: the
 * two quote halves that hold the confession come together, acknowledge it with
 * one heartbeat, and carry it off. It is the one place in the share flow with
 * a spring, and it is earned — the meeting IS the logo, the same "two souls
 * meeting" the splash plays.
 *
 * ── It is never the thing standing between a person and their share ─────────
 * The capture and the token are already in flight before this mounts, so the
 * animation costs no waiting. Tapping anywhere skips straight to the sheet, and
 * onDone fires exactly once whether it was skipped or ran to the end — a share
 * that silently failed to open because an animation callback was missed would
 * be a far worse bug than a missing flourish.
 */

import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue,
  withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import {
  QuoteOpen, QuoteClose, QUOTE_H_RATIO, LOCKUP_GAP_RATIO,
} from '@/components/brand/SoulyapLogo';
import { px, categoryColor, LOOKS, type LookId } from '@/lib/shareLooks';

// The script, in ms from the start.
const T_ANTICIPATE = 280;
const T_MEET       = 1060;
const T_BEAT       = 1840;
const T_END        = 2640;

/** Quote width at the meeting, in design space. */
const MEET_W = 76;

const MEET_SPRING = { damping: 11, stiffness: 90, mass: 1 } as const;
const ENTER = Easing.out(Easing.cubic);

export interface ShareReleaseProps {
  look:     LookId;
  category: string | null;
  /** Fires exactly once — at the end, or the moment the user taps to skip. */
  onDone:   () => void;
}

export default function ShareRelease({ look, category, onDone }: ShareReleaseProps) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const ring = categoryColor(category);

  // Progress through the script, 0..1 over T_END.
  const t     = useSharedValue(0);
  const beat  = useSharedValue(1);
  const lift  = useSharedValue(0);
  const rings = useSharedValue(0);
  const trail = useSharedValue(0);

  const fired = useRef(false);
  function finish() {
    if (fired.current) return;   // skip + natural end must not both fire
    fired.current = true;
    onDone();
  }

  useEffect(() => {
    // 0 → anticipation → meet (spring) is expressed as one progress value so
    // every element reads the same clock and cannot drift apart.
    t.value = withSequence(
      withTiming(0.12, { duration: T_ANTICIPATE, easing: ENTER }),
      withSpring(1, MEET_SPRING),
    );
    rings.value = withDelay(T_MEET, withTiming(1, { duration: T_BEAT - T_MEET, easing: ENTER }));
    beat.value  = withDelay(T_MEET, withSequence(
      withTiming(1.14, { duration: 150, easing: ENTER }),
      withTiming(0.97, { duration: 130, easing: ENTER }),
      withTiming(1.05, { duration: 140, easing: ENTER }),
      withTiming(1.00, { duration: 160, easing: ENTER }),
    ));
    trail.value = withDelay(T_BEAT, withTiming(1, { duration: T_END - T_BEAT, easing: ENTER }));
    lift.value  = withDelay(T_BEAT, withTiming(1, { duration: T_END - T_BEAT, easing: ENTER },
      (done) => { if (done) runOnJS(finish)(); }));

    const h1 = setTimeout(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); }, T_MEET);
    const h2 = setTimeout(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }, T_BEAT);
    // A belt-and-braces finish: if the animation callback is ever dropped, the
    // sheet still opens. Opening twice is impossible (fired).
    const safety = setTimeout(finish, T_END + 400);

    return () => {
      clearTimeout(h1); clearTimeout(h2); clearTimeout(safety);
      cancelAnimation(t); cancelAnimation(beat);
      cancelAnimation(lift); cancelAnimation(rings); cancelAnimation(trail);
    };
  }, []);

  // The lockup the pair meets in, centred on screen.
  const meetW  = px(MEET_W);
  const meetH  = meetW * QUOTE_H_RATIO;
  const gap    = meetW * LOCKUP_GAP_RATIO;
  const cx     = screenW / 2;
  const cy     = screenH / 2;
  const openEnd  = { x: cx - gap / 2 - meetW / 2, y: cy - meetH / 2 };
  const closeEnd = { x: cx - gap / 2 - meetW / 2 + gap, y: cy - meetH / 2 };

  const from = LOOKS[look];

  // Named as a hook because it calls one. Invoked exactly twice, unconditionally,
  // in the same order every render — which is what the rules of hooks require.
  function useQuoteStyle(
    start: { x: number; y: number; w: number; r: number },
    end: { x: number; y: number },
    pushX: number,
  ) {
    return useAnimatedStyle(() => {
      const p  = t.value;
      const sx = px(start.x), sy = px(start.y), sw = px(start.w);
      // Anticipation: push out and swell slightly before travelling in.
      const anticip = Math.min(p / 0.12, 1) * (p < 0.12 ? 1 : 0);
      const x = sx + (end.x - sx) * p + pushX * anticip * px(10);
      const y = sy + (end.y - sy) * p;
      const w = sw + (meetW - sw) * p;
      return {
        position: 'absolute',
        left:     x,
        top:      y - lift.value * 150,
        width:    w,
        height:   w * QUOTE_H_RATIO,
        opacity:  1 - lift.value,
        transform: [
          { rotate: `${start.r * (1 - p)}deg` },
          { scale: (1 + 0.06 * anticip) * beat.value },
        ],
      };
    });
  }

  const openStyle  = useQuoteStyle(from.open,  openEnd,  -1);
  const closeStyle = useQuoteStyle(from.close, closeEnd, 1);

  // The words squeeze shut as the quotes close over them.
  const textStyle = useAnimatedStyle(() => ({
    opacity:   1 - t.value,
    transform: [{ scaleX: 1 - t.value * 0.96 }, { scaleY: 1 - t.value * 0.6 }],
  }));

  const ringStyle = useAnimatedStyle(() => ({ opacity: rings.value > 0 ? 1 - rings.value : 0 }));

  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={finish}
      accessibilityRole="button"
      accessibilityLabel="Skip to sharing"
      testID="share-release"
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* Rings — the Resonance ripple, in the confession's own colour. */}
        <Animated.View style={[StyleSheet.absoluteFill, ringStyle]}>
          <Svg width={screenW} height={screenH}>
            {[0, 1, 2].map((i) => (
              <Circle key={i} cx={cx} cy={cy} r={meetW / 2}
                stroke={ring} strokeWidth={2} fill="none" opacity={0.5 - i * 0.14} />
            ))}
          </Svg>
        </Animated.View>

        <Animated.View style={[styles.words, textStyle]} />

        <Animated.View style={openStyle}><QuoteOpen style={StyleSheet.absoluteFill} /></Animated.View>
        <Animated.View style={closeStyle}><QuoteClose style={StyleSheet.absoluteFill} /></Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  words: { position: 'absolute', left: '12%', right: '12%', top: '42%', height: 2 },
});
