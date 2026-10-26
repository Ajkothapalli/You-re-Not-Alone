/**
 * The time, at the top of the feed, in the colour of the hour.
 *
 * A small pill beside the counter. It ticks on the minute BOUNDARY rather
 * than every 60s from mount — see msToNextMinute — so it is never showing
 * the minute before.
 *
 * All of the decisions are in lib/timeOfDay.ts; this is the part that has
 * to re-render.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from './Icon';
import Tooltip from './Tooltip';
import { fontFamily, font, radius } from '../theme/tokens';
import {
  periodAt, formatClock, msToNextMinute, PERIOD_COLOR, PERIOD_LABEL,
  CLOCK_TOOLTIP, CLOCK_TOOLTIP_CTA, TOOLTIP_MS,
} from '../lib/timeOfDay';

/**
 * Rendered only for a reader who HAS a daily reset — app/(tabs)/explore.tsx
 * mounts it behind `dailyLimit !== null`. There is no `capped` prop: the
 * component's existence is the condition, and a parameter that is
 * structurally always true is the kind that rots into a lie.
 *
 * It still never reaches the allowance module itself. If it could read the
 * number it would eventually show it, and it would be the countdown this
 * was deliberately not built as.
 */
export interface FeedClockProps {
  /**
   * Opens supporter plans. Passed in rather than routed from here, the
   * same way the feed's other premium entry points work.
   */
  onPremium: () => void;
}

export default function FeedClock({ onPremium }: FeedClockProps) {
  const [now,  setNow]  = useState(() => new Date());
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /**
   * Closes itself, and is cancelled on unmount.
   *
   * Without the cleanup a tooltip opened just before leaving the tab fires
   * setState four seconds later against a component that is gone — the
   * same leak the Toast host had.
   */
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  function toggle() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen((was) => {
      if (was) return false;
      closeTimer.current = setTimeout(() => setOpen(false), TOOLTIP_MS);
      return true;
    });
  }

  /**
   * Taking the offer closes the thing that made it.
   *
   * Without this the tooltip is still hanging over the feed when the
   * reader comes back from plans.
   */
  function takeOffer() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(false);
    onPremium();
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    /**
     * Re-scheduled each tick from the CURRENT time, not on a fixed
     * interval. A phone that slept through twenty minutes comes back and
     * lands on the next boundary rather than inheriting the old offset.
     */
    const tick = () => {
      const d = new Date();
      setNow(d);
      timer = setTimeout(tick, msToNextMinute(d));
    };

    timer = setTimeout(tick, msToNextMinute(new Date()));
    return () => clearTimeout(timer);
  }, []);

  const period = periodAt(now);
  const c      = PERIOD_COLOR[period];

  return (
    /**
     * `position: relative` so the tooltip can hang off the pill.
     *
     * It falls BELOW the header, over the feed list — which is a later
     * sibling and therefore paints on top by default. The lift that
     * matters is on the header itself (styles.topBar); this only orders
     * things within the header. zIndex rather than elevation on purpose:
     * elevation would draw a material shadow under the whole header.
     */
    <View style={styles.anchor}>
    <Pressable
      onPress={toggle}
      hitSlop={8}
      style={[styles.pill, { backgroundColor: c.bg }]}
      testID="feed-clock"
      // The icon is decoration; the time and the part of day are the
      // content. Icon hides itself from screen readers unless labelled,
      // so the pill speaks once rather than three times.
      accessibilityRole="button"
      accessibilityLabel={`${formatClock(now)}, ${PERIOD_LABEL[period]}`}
      accessibilityHint="Explains what this shows"
      accessibilityState={{ expanded: open }}
    >
      {/* Our drawn clock, not a Unicode ◷ — which rendered as whatever
          glyph the device happened to have and matched nothing else in
          the app. `tone` follows the pill's own ground, not the theme:
          these colours are the same in light and dark. */}
      <Icon name="clock" size={14} tone={period === 'night' ? 'dark' : 'light'} />
      <Text style={[styles.time, { color: c.fg }]} accessibilityElementsHidden>
        {formatClock(now)}
      </Text>
    </Pressable>

      {/* Tooltip sets pointerEvents none on itself; this wrapper only
          positions it. */}
      {open && (
        <View style={styles.tip}>
          <Tooltip
            text={CLOCK_TOOLTIP}
            action={{ label: CLOCK_TOOLTIP_CTA, onPress: takeOffer }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'relative', zIndex: 2 },
  tip: {
    position:  'absolute',
    top:       '100%',
    marginTop: 8,
    // Hangs from the right edge: the pill sits in the header's right-hand
    // group, so a left-anchored tooltip would run off the screen.
    right:     0,
    width:     220,
    zIndex:    3,
  },
  pill: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             4,
    paddingVertical:   3,
    paddingHorizontal: 9,
    borderRadius:    radius.pill,
    // The same 2px ink border every other pill in the app carries.
    borderWidth:     2,
    borderColor:     '#1A1A1A',
  },
  time: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      font.labelSize,
    letterSpacing: font.labelLetterSpacing,
  },
});
