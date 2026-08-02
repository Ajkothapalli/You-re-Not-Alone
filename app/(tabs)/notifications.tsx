/**
 * Alerts tab — in-app notifications.
 *
 * Invariants (CLAUDE.md §2/#3):
 *   - Notifications are anonymous and self-referential only.
 *   - Never reveal feeler identity, never offer reply/contact.
 *   - account_id never in any client payload.
 *
 * On focus: fetch notifications, mark all unread as read, clear badge.
 */

import { getNotifications, markNotificationsRead, type AppNotification } from '@/lib/notifications';
import { useNotificationsContext } from '@/lib/notificationsContext';
import { BackgroundPattern } from '@/components/BackgroundPattern';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily, radius, spacing } from '@/theme/tokens';
import { DURATION, EASING } from '@/theme/motion';
import { useReducedMotion } from '@/lib/a11y';
import { ScrawlIcon } from '@/components/ScrawlIcon';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 2)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const TYPE_LABEL: Record<AppNotification['type'], string> = {
  felt:    'someone felt your confession',
  matched: 'your confession found a match',
  live:    'your confession is now live',
  removed: 'your confession was reviewed',
};

const TYPE_ICON_NAME: Record<AppNotification['type'], string> = {
  felt:    'heart',
  matched: 'star',
  live:    'checkmark',
  removed: 'x_mark',
};

const TYPE_ICON_COLOR: Record<AppNotification['type'], string> = {
  felt:    '#F472B6',
  matched: '#FFE500',
  live:    '#22C55E',
  removed: '#888888',
};

function NotificationItem({ item }: { item: AppNotification }) {
  const color  = useThemeColors();
  const styles = useMemo(() => createItemStyles(color), [color]);
  const isRead = !!item.read_at;

  return (
    <View style={[styles.item, isRead && styles.itemRead]}>
      <View style={styles.iconWrap}>
        <ScrawlIcon
          name={TYPE_ICON_NAME[item.type]}
          size={18}
          color={isRead ? color.dim : TYPE_ICON_COLOR[item.type]}
          roughen={false}
          strokeWidth={2.5}
        />
      </View>
      <View style={styles.body}>
        <Text style={[styles.label, isRead && styles.labelRead]}>
          {TYPE_LABEL[item.type]}
        </Text>
        {item.type === 'felt' && item.data.felt_count != null && (
          <Text style={styles.meta}>{item.data.felt_count} total felt</Text>
        )}
        <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
      </View>
    </View>
  );
}

export default function NotificationsScreen() {
  const color  = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(color), [color]);

  const { setUnreadCount } = useNotificationsContext();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading]             = useState(true);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const { notifications: data, unreadCount } = await getNotifications();
        if (!active) return;
        setNotifications(data);
        if (unreadCount > 0) {
          setUnreadCount(0);
          markNotificationsRead().catch(() => {}); // fire-and-forget
        }
      } catch { /* fail silently */ }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <BackgroundPattern />
      <View style={styles.header}>
        <Text style={styles.title}>Alerts</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={color.dim} />
        </View>
      ) : notifications.length === 0 ? (
        <AlertsEmptyState />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 70 }]}
          showsVerticalScrollIndicator={false}
        >
          {notifications.map((n) => (
            <NotificationItem key={n.id} item={n} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function AlertsEmptyState() {
  const color        = useThemeColors();
  const reduceMotion = useReducedMotion();
  const fadeAnim     = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) { fadeAnim.setValue(1); return; }
    Animated.timing(fadeAnim, {
      toValue:         1,
      duration:        DURATION.entrance,
      delay:           180,
      easing:          EASING.enter,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={[emptyStyles.root, { opacity: fadeAnim }]}>

      {/* Focal illustration — bell with floating accent heart */}
      <View style={emptyStyles.focal}>
        <ScrawlIcon name="bell" size={80} color={color.dim} roughen strokeWidth={2.2} />
        <View style={emptyStyles.heartFloat} pointerEvents="none">
          <ScrawlIcon name="heart" size={20} color={color.accent} roughen={false} strokeWidth={3} />
        </View>
      </View>

      {/* Copy */}
      <Text style={[emptyStyles.headline, { color: color.paper }]}>Still quiet</Text>
      <Text style={[emptyStyles.sub, { color: color.dim }]}>
        you'll hear it here when{'\n'}someone feels what you wrote
      </Text>

    </Animated.View>
  );
}

const emptyStyles = StyleSheet.create({
  root: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 40,
    gap:               10,
  },
  // Focal zone: bell centered with room for the floating heart
  focal: {
    width:          96,
    height:         96,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   8,
  },
  // Heart floats upper-right, outside the focal bounds
  heartFloat: {
    position: 'absolute',
    top:      6,
    right:    -12,
  },
  headline: {
    fontFamily: fontFamily.sansBold,
    fontSize:   26,
    lineHeight: 32,
    textAlign:  'center',
  },
  sub: {
    fontFamily: fontFamily.sans,
    fontSize:   14,
    lineHeight: 22,
    textAlign:  'center',
  },
});

// ─── Screen styles ────────────────────────────────────────────────────────────

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    root:   { flex: 1, backgroundColor: color.bg },
    header: { paddingHorizontal: spacing.screenPadding, paddingTop: 16, paddingBottom: 12 },
    title:  { fontFamily: fontFamily.sansBold, fontSize: 17, color: color.paper },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.screenPadding },
    list:   { padding: spacing.screenPadding, paddingBottom: 32, gap: 2 },
  });
}

function createItemStyles(color: ColorSet) {
  return StyleSheet.create({
    item: {
      flexDirection:     'row',
      alignItems:        'flex-start',
      gap:               12,
      paddingVertical:   14,
      paddingHorizontal: 16,
      backgroundColor:   color.ink,
      borderRadius:      radius.input,
      borderWidth:       1.5,
      borderColor:       color.line,
      marginBottom:      8,
    },
    itemRead: { opacity: 0.65 },
    iconWrap: {
      width:           32,
      height:          32,
      borderRadius:    16,
      backgroundColor: color.bg,
      alignItems:      'center',
      justifyContent:  'center',
      marginTop:       1,
    },
    icon:      { fontFamily: fontFamily.sans, fontSize: 14, color: color.paper },
    iconRead:  { color: color.dim },
    body:      { flex: 1, gap: 3 },
    label:     { fontFamily: fontFamily.sansBold, fontSize: 13, color: color.paper, lineHeight: 18 },
    labelRead: { fontFamily: fontFamily.sans, color: color.dim },
    meta:      { fontFamily: fontFamily.sans, fontSize: 12, color: color.dim },
    time:      { fontFamily: fontFamily.sans, fontSize: 11, color: color.dim, marginTop: 2 },
  });
}
