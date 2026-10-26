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

import { NotificationsEmpty, IllustrationGround } from '@/components/illustrations';
import { useAspectFitWidth } from '@/hooks/useAspectFit';
import { getNotifications, markNotificationsRead, type AppNotification } from '@/lib/notifications';
import { useNotificationsContext } from '@/lib/notificationsContext';
import { readTabMemory, writeTabMemory, TAB_MEMORY } from '@/lib/tabMemory';
import PushAskCard from '@/components/PushAskCard';
import { usePushAsk } from '@/hooks/usePushAsk';
import { BackgroundPattern } from '@/components/BackgroundPattern';
import { Icon, type IconName } from '@/components/Icon';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily, radius, spacing } from '@/theme/tokens';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
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

const TYPE_ICON_NAME: Record<AppNotification['type'], IconName> = {
  felt:    'heart',
  matched: 'star',
  live:    'check_circle',
  removed: 'close',
};

// TYPE_ICON_COLOR is gone: each icon carries its own accent now, and a
// per-type tint on top would fight it. Read vs unread is state, not colour.

function NotificationItem({ item }: { item: AppNotification }) {
  const color  = useThemeColors();
  const styles = useMemo(() => createItemStyles(color), [color]);
  const isRead = !!item.read_at;

  return (
    <View style={[styles.item, isRead && styles.itemRead]}>
      <View style={styles.iconWrap}>
        <Icon
          name={TYPE_ICON_NAME[item.type]}
          size={18}
          state={isRead ? 'unselected' : 'selected'}
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

  // Seeded from memory so a remount paints the last known list instead of a
  // spinner over content the app already has. null means "nothing known yet",
  // which is the only state that earns a spinner — an empty ARRAY is a real
  // answer with its own designed screen.
  const cached = readTabMemory<AppNotification[]>(TAB_MEMORY.alerts);
  const [notifications, setNotifications] = useState<AppNotification[] | null>(cached);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      try {
        const { notifications: data, unreadCount } = await getNotifications();
        if (!active) return;
        // The refresh happens BEHIND whatever is on screen. Blanking to a
        // spinner first made every return to this tab flash, including the
        // overwhelmingly common case where the list came back unchanged.
        setNotifications(data);
        writeTabMemory(TAB_MEMORY.alerts, data);
        if (unreadCount > 0) {
          setUnreadCount(0);
          markNotificationsRead().catch(() => {}); // fire-and-forget
        }
      } catch {
        // Fail silently, and keep showing what we had. A failed refresh must
        // not take away alerts the person can already see.
      }
    })();
    return () => { active = false; };
  }, []));

  /**
   * [N1] Moment A — PROOF.
   *
   * The strongest of the three: the reader is looking at evidence that a
   * stranger felt what they wrote, and the card asks whether they want to
   * know next time. It is only offered when the NEWEST item is an unread
   * felt — further down the list it is a card about something they have
   * already scrolled past, which is a different and much weaker ask.
   */
  const newest = notifications?.[0];
  const proofMoment = (newest && newest.type === 'felt' && !newest.read_at) ? 'proof' as const : null;
  const ask = usePushAsk(proofMoment);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <BackgroundPattern />
      <View style={styles.header}>
        <Text style={styles.title}>Alerts</Text>
      </View>

      {notifications === null ? (
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
          {notifications.map((n, i) => (
            <React.Fragment key={n.id}>
              <NotificationItem item={n} />
              {/* Inline, directly under the item that earned it. */}
              {i === 0 && ask.moment && (
                <PushAskCard
                  moment={ask.moment}
                  onAccept={ask.onAccept}
                  onDecline={ask.onDecline}
                  collapsed={ask.collapsed}
                />
              )}
            </React.Fragment>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function AlertsEmptyState() {
  const color = useThemeColors();
  // Seeded so the empty state paints the bench on its FIRST frame rather
  // than one blank frame then the artwork. The number is this wrapper's own
  // width: the screen root has no horizontal padding, emptyStyles.root has 32
  // a side. onLayout corrects it the moment the real measurement lands.
  const fit   = useAspectFitWidth(4 / 3, Dimensions.get('window').width - 64);
  return (
    <View style={emptyStyles.root}>
      <View style={{ width: '100%' }} onLayout={fit.onLayout}>
        {fit.ready && (
          <IllustrationGround style={{ width: fit.width, height: fit.height }}>
            <NotificationsEmpty style={{ width: fit.width, height: fit.height }} />
          </IllustrationGround>
        )}
      </View>
      <Text style={[emptyStyles.headline, { color: color.paper }]}>Still quiet</Text>
      <Text style={[emptyStyles.sub, { color: color.dim }]}>
        you'll hear it here when{'\n'}someone feels what you wrote
      </Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  root: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 32,
    gap:               12,
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
