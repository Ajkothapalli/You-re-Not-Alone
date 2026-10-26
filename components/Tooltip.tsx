/**
 * A small explanation, anchored under the thing it explains.
 *
 * Built like Toast and the buttons: a hard offset edge layer behind a
 * bordered face. Same two-layer construction, so it is recognisably the
 * same product rather than a floating grey box.
 *
 * ── It is not a dialog ──────────────────────────────────────────────────────
 * No backdrop, nothing blocked, nothing to dismiss before carrying on. A
 * backdrop over the feed would mean tapping a small pill out of curiosity
 * cost you your place in what you were reading. It closes on a second tap
 * and on its own after a few seconds.
 *
 * ── It is positioned by its caller ──────────────────────────────────────────
 * This draws; the anchor decides where. That keeps it reusable and keeps
 * the stacking decision (which is the fiddly part on Android) next to the
 * thing being anchored to.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../theme/ThemeProvider';
import { type ColorSet, fontFamily, radius } from '../theme/tokens';
import { DURATION, EASING, RISE } from '../theme/motion';
import { useReducedMotion } from '../lib/a11y';

/** The hard offset, same depth Toast uses. */
const DEPTH = 4;
/** The notch is a rotated square; this is its side. */
const NOTCH = 12;

export interface TooltipProps {
  text: string;
  /**
   * An optional way out of what the text just described.
   *
   * Its presence changes two things that are easy to miss. The card stops
   * being `pointerEvents: none` — it becomes `box-none`, so it still never
   * intercepts a scroll but its button can be pressed — and it stops being
   * hidden from the accessibility tree, because a button a screen reader
   * cannot reach is not a button.
   */
  action?: { label: string; onPress: () => void };
  /** Which edge the notch points from. Only 'top' is used so far. */
  from?: 'top';
  /** Where the notch sits along that edge, from the right. */
  notchRight?: number;
}

export default function Tooltip({
  text, action, from = 'top', notchRight = 18,
}: TooltipProps) {
  const color  = useThemeColors();
  const styles = React.useMemo(() => createStyles(color), [color]);
  const reduceMotion = useReducedMotion();

  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) { enter.setValue(1); return; }
    Animated.timing(enter, {
      toValue:         1,
      duration:        DURATION.base,
      easing:          EASING.enter,
      useNativeDriver: true,
    }).start();
  }, [reduceMotion]);

  // Arrives from slightly above, because it belongs to the thing above it.
  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [-RISE.sm, 0] });

  return (
    <Animated.View
      style={[styles.wrap, { opacity: enter, transform: [{ translateY }] }]}
      testID="tooltip"
      // Hidden only when there is nothing in here to do. With an action,
      // the subtree has to be reachable or the button does not exist for
      // anyone using a screen reader.
      accessibilityElementsHidden={!action}
      importantForAccessibility={action ? 'yes' : 'no-hide-descendants'}
      // box-none, not none: the card never takes a touch itself — a reader
      // scrolling the feed through it must not be stopped — but the button
      // inside it can.
      pointerEvents={action ? 'box-none' : 'none'}
    >
      {/* The notch, drawn BEHIND the face so the face's own background
          hides its inner two sides and it reads as a point rather than a
          diamond stuck to the edge. */}
      {from === 'top' && (
        <View style={[styles.notch, { right: notchRight }]} />
      )}
      <View style={styles.edge} />
      <View style={styles.face}>
        <Text style={styles.text}>{text}</Text>
        {action && (
          <Pressable
            onPress={action.onPress}
            hitSlop={8}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            testID="tooltip-action"
          >
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    wrap: { position: 'relative', paddingRight: DEPTH, paddingBottom: DEPTH },
    notch: {
      position:        'absolute',
      top:             -NOTCH / 2,
      width:           NOTCH,
      height:          NOTCH,
      backgroundColor: color.ink,
      borderTopWidth:  2,
      borderLeftWidth: 2,
      borderColor:     color.border,
      transform:       [{ rotate: '45deg' }],
      zIndex:          1,
    },
    edge: {
      position:        'absolute',
      top:             DEPTH,
      left:            DEPTH,
      right:           0,
      bottom:          0,
      borderRadius:    radius.input,
      backgroundColor: color.border,
    },
    face: {
      backgroundColor:   color.ink,
      borderRadius:      radius.input,
      borderWidth:       2,
      borderColor:       color.border,
      paddingVertical:   10,
      paddingHorizontal: 12,
    },
    text: {
      fontFamily: fontFamily.sans,
      fontSize:   13,
      lineHeight: 18,
      color:      color.paper,
    },
    /**
     * A pill, not underlined yellow writing.
     *
     * #FFE500 text on the light card is 1.28:1 — invisible. The same
     * yellow BEHIND #1A1A1A is 13.6:1, which is how every other call to
     * action here is built (the Share button, the premium card's CTA).
     * Being a pill also reads as a button, which it is.
     */
    action: {
      marginTop:         10,
      alignSelf:         'flex-start',
      backgroundColor:   color.accent,
      borderRadius:      radius.pill,
      borderWidth:       2,
      borderColor:       color.border,
      paddingVertical:   6,
      paddingHorizontal: 12,
    },
    actionPressed: { opacity: 0.85 },
    actionLabel: {
      fontFamily: fontFamily.sansBold,
      fontSize:   13,
      lineHeight: 17,
      // Ink, always: the ground is the accent in both themes.
      color:      '#1A1A1A',
    },
  });
}
