import * as Haptics from 'expo-haptics';

/**
 * Structurally typed rather than imported: the bottom-tabs prop types live
 * under expo-router/build/react-navigation/, which that source marks as
 * internal and subject to change without notice. This is the part of the
 * contract the bar actually uses.
 */
export interface BottomTabBarProps {
  state: { index: number; routeNames: string[] };
  navigation: {
    navigate: (name: string) => void;
    /**
     * Optional because it reaches us through this structural type rather
     * than a package export — see hooks/useTabPreload.ts. The navigator
     * does provide it; useTabPreload checks at runtime and does nothing if
     * a future version stops.
     */
    preload?: (name: string) => void;
  };
}
import React, { useCallback, useEffect, useRef } from 'react';
import { Easing, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './Icon';
import { useNotificationsContext } from '../lib/notificationsContext';
import { useThemeColors } from '../theme/ThemeProvider';
import { useReducedMotion } from '../lib/a11y';
import { useTabPreload } from '../hooks/useTabPreload';
import { fontFamily } from '../theme/tokens';

const ICON        = 24;
const CIRCLE      = 34;  // indicator diameter
const SHAD        = 2;   // neo-brutal shadow offset
const PILL_PAD_H  = 10;  // pill paddingHorizontal
const PILL_PAD_V  = 6;   // pill paddingVertical
const TAB_PAD_H   = 6;   // tab paddingHorizontal (each side)
const GAP         = 4;   // flexbox gap between tabs
const TAB_STEP    = CIRCLE + TAB_PAD_H * 2 + GAP; // 50px per tab slot

// Top-left corner of the indicator circle when on tab 0
const IND_LEFT = PILL_PAD_H + TAB_PAD_H; // 16
const IND_TOP  = PILL_PAD_V;             // 6

// Only show the nav bar on the four main tab screens.
// Every other route (sub-pages, sheets, overlays) hides it automatically.
const SHOW_ON = new Set(['/explore', '/you', '/write', '/notifications']);

interface TabItemProps {
  icon:    IconName;
  label:   string;
  active:  boolean;
  onPress: () => void;
  badge?:  number;
}

/**
 * One tab.
 *
 * Memoized, and the onPress handlers below are memoized with it — a memo on
 * this alone would do nothing, because a fresh `() => go(0)` arrow on every
 * render is a changed prop. The bar re-renders on every navigation and on
 * every unread-count change, and without both halves all four tabs and their
 * SVG icons re-rendered each time.
 */
const TabItem = React.memo(function TabItem(
  { icon, label, active, onPress, badge = 0 }: TabItemProps,
) {
  const color = useThemeColors();
  return (
    <Pressable
      // Immediate, local feedback. Everything else about a tab tap depends on
      // navigation landing; this does not.
      style={({ pressed }) => [styles.tab, pressed && { opacity: 0.65 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <View style={styles.iconSlot}>
        {/* tone="light" on the active tab: it sits on the yellow indicator
            disc, and a dark-theme outline would vanish against it. The label
            below still uses the theme's own colours. */}
        <Icon
          name={icon}
          size={ICON}
          state={active ? 'selected' : 'unselected'}
          tone={active ? 'light' : 'auto'}
        />
        {badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 99 ? '99+' : String(badge)}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.label, { color: active ? color.paper : color.dim }]}>
        {label}
      </Text>
    </Pressable>
  );
});

/**
 * The tab bar, rendered BY the navigator.
 *
 * It used to sit in the root layout and derive its active tab from
 * usePathname(), which only updates once a navigation has completed — so the
 * indicator sat still through the whole transition and the tap had no visible
 * response. As the navigator's own tabBar it reads props.state.index, which
 * changes in the SAME FRAME as the tap. No optimistic index, no timeout to
 * recover from a navigation that never lands, and no list of routes it must
 * know to hide on: a pushed screen covers it naturally.
 */
export default function WriteFAB({ state, navigation }: BottomTabBarProps) {
  const insets          = useSafeAreaInsets();
  const color           = useThemeColors();
  const { unreadCount } = useNotificationsContext();
  const reduceMotion    = useReducedMotion();

  // Straight from navigation state — no derivation, no lag.
  const activeIndex = state.index;

  /**
   * Builds the other three screens during idle, so the first tap on each
   * does not have to. Here because the tabBar is handed the navigator's own
   * navigation object, which is the only thing that can dispatch PRELOAD.
   */
  useTabPreload(navigation, state.routeNames, activeIndex);

  const isRead   = activeIndex === 0;
  const isWrite  = activeIndex === 1;
  const isYou    = activeIndex === 2;
  const isAlerts = activeIndex === 3;

  const go = useCallback((target: number) => {
    // A tap on the ALREADY ACTIVE tab does nothing. Navigating to it would
    // re-run the screen's focus effects and, on the feed, lose the reader's
    // place — doing nothing is the correct behaviour, not a missing feature.
    if (target === state.index) return;
    Haptics.selectionAsync().catch(() => {});
    // navigate() on the tab navigator is a JUMP: it never creates a second
    // copy, which is the entire point of the bar living in here.
    navigation.navigate(state.routeNames[target]);
  }, [state.index, state.routeNames, navigation]);

  // One per tab, stable for as long as `go` is — see the note on TabItem.
  const goRead   = useCallback(() => go(0), [go]);
  const goWrite  = useCallback(() => go(1), [go]);
  const goYou    = useCallback(() => go(2), [go]);
  const goAlerts = useCallback(() => go(3), [go]);

  // Single animated value — the whole indicator slides, nothing per-tab.
  const slideX = useRef(
    new Animated.Value(Math.max(0, activeIndex) * TAB_STEP),
  ).current;

  useEffect(() => {
    if (activeIndex < 0) return;
    if (reduceMotion) {
      slideX.setValue(activeIndex * TAB_STEP);
      return;
    }
    // A calm slide, not SPRING.pop. `pop` is the mount-pop token (bounciness
    // 12) and visibly overshoots — the brand's motion is breath, not bounce
    // (docs/design/motion.md §1). This settles in ~200ms with no overshoot.
    Animated.timing(slideX, {
      toValue:         activeIndex * TAB_STEP,
      duration:        200,
      easing:          Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeIndex, reduceMotion]);

  const indicatorTransform = [{ translateX: slideX }];

  return (
    <View style={[styles.root, { bottom: (insets.bottom || 0) + 12 }]}>
      <View style={styles.pillOuter}>
        <View style={[styles.pillShadow, { backgroundColor: color.border }]} />
        <View style={[styles.pill, { backgroundColor: color.ink, borderColor: color.border }]}>

          {/* Sliding indicator — behind all tab content */}
          <Animated.View
            style={[styles.indicatorShadow, { backgroundColor: color.border, transform: indicatorTransform }]}
          />
          <Animated.View
            style={[styles.indicatorCircle, { backgroundColor: color.accent, borderColor: color.border, transform: indicatorTransform }]}
          />

          <TabItem icon="book"   label="Read"   active={isRead}   onPress={goRead} />
          <TabItem icon="pencil" label="Write"  active={isWrite}  onPress={goWrite} />
          <TabItem icon="person" label="You"    active={isYou}    onPress={goYou} />
          <TabItem icon="bell"   label="Alerts" active={isAlerts} onPress={goAlerts} badge={unreadCount} />

        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position:   'absolute',
    left:       0,
    right:      0,
    alignItems: 'center',
  },
  pillOuter: {
    paddingRight:  SHAD,
    paddingBottom: SHAD,
  },
  pillShadow: {
    position:     'absolute',
    top:          SHAD,
    left:         SHAD,
    right:        0,
    bottom:       0,
    borderRadius: 9999,
  },
  pill: {
    flexDirection:     'row',
    alignItems:        'center',
    borderRadius:      9999,
    borderWidth:       1.5,
    paddingHorizontal: PILL_PAD_H,
    paddingVertical:   PILL_PAD_V,
    gap:               GAP,
  },
  // Shadow of the sliding indicator (offset 2px right+down)
  indicatorShadow: {
    position:     'absolute',
    top:          IND_TOP  + SHAD,
    left:         IND_LEFT + SHAD,
    width:        CIRCLE,
    height:       CIRCLE,
    borderRadius: 9999,
  },
  // Accent circle that actually slides
  indicatorCircle: {
    position:     'absolute',
    top:          IND_TOP,
    left:         IND_LEFT,
    width:        CIRCLE,
    height:       CIRCLE,
    borderRadius: 9999,
    borderWidth:  1.5,
  },
  tab: {
    alignItems:        'center',
    gap:               4,
    paddingHorizontal: TAB_PAD_H,
  },
  // Fixed CIRCLE×CIRCLE slot keeps indicator math exact regardless of icon size
  iconSlot: {
    width:          CIRCLE,
    height:         CIRCLE,
    alignItems:     'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily:    fontFamily.sans,
    fontSize:      9,
    lineHeight:    11,
    letterSpacing: 0.2,
  },
  badge: {
    position:          'absolute',
    top:               1,
    right:             1,
    backgroundColor:   '#EF4444',
    borderRadius:      8,
    minWidth:          14,
    height:            14,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 2,
    zIndex:            1,
  },
  badgeText: {
    fontFamily: fontFamily.sansBold,
    fontSize:   8,
    color:      '#FFFFFF',
    lineHeight: 11,
  },
});
