import { router, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrawlIcon } from './ScrawlIcon';
import { useNotificationsContext } from '../lib/notificationsContext';
import { useThemeColors } from '../theme/ThemeProvider';
import { SPRING } from '../theme/motion';
import { useReducedMotion } from '../lib/a11y';
import { fontFamily } from '../theme/tokens';

const ICON        = 20;
const ICON_STROKE = 4;
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
const SHOW_ON = new Set(['/read', '/you', '/write', '/notifications']);

interface TabItemProps {
  icon:    string;
  label:   string;
  active:  boolean;
  onPress: () => void;
  badge?:  number;
}

function TabItem({ icon, label, active, onPress, badge = 0 }: TabItemProps) {
  const color = useThemeColors();
  return (
    <Pressable
      style={styles.tab}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <View style={styles.iconSlot}>
        <ScrawlIcon
          name={icon}
          size={ICON}
          color={active ? '#1A1A1A' : color.dim}
          roughen={false}
          strokeWidth={ICON_STROKE}
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
}

export default function WriteFAB() {
  const insets          = useSafeAreaInsets();
  const pathname        = usePathname();
  const color           = useThemeColors();
  const { unreadCount } = useNotificationsContext();
  const reduceMotion    = useReducedMotion();

  const isRead   = pathname === '/read';
  const isYou    = pathname === '/you';
  const isWrite  = pathname === '/write';
  const isAlerts = pathname === '/notifications';

  const activeIndex = isRead ? 0 : isYou ? 1 : isWrite ? 2 : isAlerts ? 3 : -1;

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
    Animated.spring(slideX, {
      toValue:         activeIndex * TAB_STEP,
      ...SPRING.pop,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, reduceMotion]);

  // Early return must come after all hooks
  if (!SHOW_ON.has(pathname)) return null;

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

          <TabItem icon="book"   label="Read"   active={isRead}   onPress={() => router.navigate('/read')} />
          <TabItem icon="person" label="You"    active={isYou}    onPress={() => router.navigate('/(tabs)/you')} />
          <TabItem icon="pencil" label="Write"  active={isWrite}  onPress={() => router.navigate('/(tabs)/write')} />
          <TabItem icon="bell"   label="Alerts" active={isAlerts} onPress={() => router.navigate('/(tabs)/notifications')} badge={unreadCount} />

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
