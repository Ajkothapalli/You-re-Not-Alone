/**
 * My Confessions — server-backed list of the user's own confessions.
 *
 * Opens as a formSheet from the profile screen.
 * Cross-device: loaded from the server by account_id (not local receipts).
 * Local receipts are shown as a loading fallback only.
 *
 * Cards show: confession text, felt_count, and a status badge.
 * Actions: Remove (soft-delete with destructive confirm).
 *
 * Anonymity: account_id is never returned by the server; only the confession
 * content itself is shown. No other user can see this screen.
 */

import { GhostButton } from '@/components/Buttons';
import { showDialog } from '@/components/AppDialog';
import { getMyConfessions, removeConfession, type OwnConfession } from '@/lib/api';
import { color, fontFamily, radius, spacing } from '@/theme/tokens';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STATUS_LABEL: Record<string, string> = {
  live:         'live',
  approved:     'live',
  under_review: 'under review',
  removed:      'removed',
};

const STATUS_COLOR: Record<string, string> = {
  live:         '#4ADE80',
  approved:     '#4ADE80',
  under_review: '#FBBF24',
  removed:      '#6B7280',
};

function ConfessionRow({
  item,
  onRemove,
}: {
  item:     OwnConfession;
  onRemove: (id: string) => void;
}) {
  const statusLabel = STATUS_LABEL[item.status] ?? item.status;
  const statusColor = STATUS_COLOR[item.status] ?? color.dim;
  const isRemoved   = item.status === 'removed';

  return (
    <View style={[styles.card, isRemoved && styles.cardRemoved]}>
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: statusColor + '22' }]}>
          <View style={[styles.badgeDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.badgeText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        <Text style={styles.felt}>{item.felt_count} felt this</Text>
      </View>

      <Text
        style={[styles.text, isRemoved && styles.textDim]}
        numberOfLines={5}
      >
        {item.text}
      </Text>

      {!isRemoved && (
        <View style={styles.actions}>
          <Pressable
            onPress={() => onRemove(item.id)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Remove this confession"
          >
            <Text style={styles.removeLink}>remove</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default function MyConfessionsScreen() {
  const insets = useSafeAreaInsets();
  const [confessions, setConfessions] = useState<OwnConfession[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error,   setError]           = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyConfessions();
      setConfessions(data);
    } catch (e: any) {
      setError('Could not load your confessions. Check your connection.');
    } finally {
      setLoading(false);
    }
  }

  function handleRemove(confessionId: string) {
    showDialog(
      'Remove this confession?',
      'It will be removed from the pool immediately. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:  'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeConfession(confessionId);
              setConfessions((prev) =>
                prev.map((c) =>
                  c.id === confessionId ? { ...c, status: 'removed' as const } : c,
                ),
              );
            } catch {
              showDialog('Something went wrong', 'Could not remove the confession. Please try again.');
            }
          },
        },
      ],
    );
  }

  const hasSomething = confessions.length > 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.back}>← back</Text>
        </Pressable>
        <Text style={styles.title}>my confessions</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={color.dim} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{error}</Text>
          <View style={{ marginTop: 16 }}>
            <GhostButton label="Try again" onPress={load} />
          </View>
        </View>
      ) : !hasSomething ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            you haven't written anything yet.{'\n'}
            your confessions will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={confessions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ConfessionRow item={item} onRemove={handleRemove} />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: color.bg,
  },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: spacing.screenPadding,
    paddingBottom:     12,
  },
  back: {
    fontFamily: fontFamily.sans,
    fontSize:   14,
    color:      color.dim,
    width:      60,
  },
  title: {
    fontFamily: fontFamily.serifItalic,
    fontSize:   17,
    color:      color.paper,
  },
  center: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    padding:         spacing.screenPadding,
  },
  emptyText: {
    fontFamily: fontFamily.sans,
    fontSize:   14,
    color:      color.dim,
    textAlign:  'center',
    lineHeight: 22,
  },
  list: {
    padding:       spacing.screenPadding,
    paddingBottom: 32,
    gap:           12,
  },
  card: {
    backgroundColor: color.ink,
    borderRadius:    radius.card,
    padding:         16,
    gap:             10,
  },
  cardRemoved: {
    opacity: 0.5,
  },
  cardHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  badge: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             5,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius:    99,
  },
  badgeDot: {
    width:        6,
    height:       6,
    borderRadius: 3,
  },
  badgeText: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  felt: {
    fontFamily: fontFamily.sans,
    fontSize:   11,
    color:      color.dim,
  },
  text: {
    fontFamily: fontFamily.serif,
    fontSize:   15,
    lineHeight: 22,
    color:      color.paper,
  },
  textDim: {
    color: color.dim,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop:     2,
  },
  removeLink: {
    fontFamily:         fontFamily.sans,
    fontSize:           12,
    color:              '#C25450',
    textDecorationLine: 'underline',
  },
});
