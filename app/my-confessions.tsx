/**
 * My Confessions — server-backed list of the user's own confessions.
 *
 * Opens as a formSheet from the profile screen.
 * Cross-device: loaded from the server by account_id (not local receipts).
 *
 * Actions per card:
 *   Edit   — retires the old confession, then navigates to write.tsx pre-filled
 *            so the user can refine and resubmit through the full pipeline.
 *            The new submission goes through safety review and gets a fresh match;
 *            felt_count resets. User is warned before proceeding.
 *   Remove — soft-deletes (retire) with a destructive confirm dialog. The
 *            confession leaves the pool immediately.
 *
 * This is the user's OWN content only — invariant #2 (no new read surface) is
 * unaffected: no other users' confessions appear here.
 */

import { GhostButton } from '@/components/Buttons';
import { showDialog } from '@/components/AppDialog';
import { getMyConfessions, retireConfession, type OwnConfession } from '@/lib/api';
import { color, fontFamily, radius, spacing } from '@/theme/tokens';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
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
  retired:      'retired',
  deleted:      'deleted',
};

const STATUS_COLOR: Record<string, string> = {
  live:         '#4ADE80',
  approved:     '#4ADE80',
  under_review: '#FBBF24',
  removed:      '#6B7280',
  retired:      '#6B7280',
  deleted:      '#6B7280',
};

function ConfessionRow({
  item,
  onEdit,
  onRemove,
}: {
  item:     OwnConfession;
  onEdit:   (item: OwnConfession) => void;
  onRemove: (id: string) => void;
}) {
  const statusLabel = STATUS_LABEL[item.status] ?? item.status;
  const statusColor = STATUS_COLOR[item.status] ?? color.dim;
  const isGone      = item.status === 'retired' || item.status === 'removed' || item.status === 'deleted';

  return (
    <View style={[styles.card, isGone && styles.cardGone]}>
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: statusColor + '22' }]}>
          <View style={[styles.badgeDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.badgeText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        <Text style={styles.felt}>{item.felt_count} felt this</Text>
      </View>

      <Text style={[styles.text, isGone && styles.textDim]} numberOfLines={5}>
        {item.text}
      </Text>

      {!isGone && (
        <View style={styles.actions}>
          <Pressable
            onPress={() => onEdit(item)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Edit this confession"
          >
            <Text style={styles.editLink}>edit</Text>
          </Pressable>
          <Text style={styles.actionSep}>·</Text>
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

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyConfessions();
      setConfessions(data);
    } catch {
      setError('Could not load your confessions. Check your connection.');
    } finally {
      setLoading(false);
    }
  }

  function markRetired(confessionId: string) {
    setConfessions((prev) =>
      prev.map((c) =>
        c.id === confessionId ? { ...c, status: 'retired' as const } : c,
      ),
    );
  }

  function handleEdit(item: OwnConfession) {
    showDialog(
      'Edit this confession?',
      'Editing retires this version immediately and releases a new one. ' +
      'Its count starts fresh and it finds a new match.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:  'Edit',
          style: 'default',
          onPress: async () => {
            try {
              await retireConfession(item.id);
              markRetired(item.id);
              router.back(); // close the sheet first
              router.push({
                pathname: '/write',
                params:   { prefillText: item.text },
              });
            } catch {
              showDialog('Something went wrong', 'Could not retire the confession. Please try again.');
            }
          },
          keepOpenWhilePending: true,
        },
      ],
    );
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
              await retireConfession(confessionId);
              markRetired(confessionId);
            } catch {
              showDialog('Something went wrong', 'Could not remove the confession. Please try again.');
            }
          },
          keepOpenWhilePending: true,
        },
      ],
    );
  }

  const hasSomething = confessions.length > 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
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
            <ConfessionRow item={item} onEdit={handleEdit} onRemove={handleRemove} />
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
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    padding:        spacing.screenPadding,
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
  cardGone: { opacity: 0.5 },
  cardHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  badge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    paddingVertical:   3,
    paddingHorizontal: 8,
    borderRadius:      99,
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
  textDim: { color: color.dim },
  actions: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'flex-end',
    gap:            8,
    marginTop:      2,
  },
  actionSep: {
    fontFamily: fontFamily.sans,
    fontSize:   12,
    color:      color.dim,
  },
  editLink: {
    fontFamily:         fontFamily.sans,
    fontSize:           12,
    color:              color.dim,
    textDecorationLine: 'underline',
  },
  removeLink: {
    fontFamily:         fontFamily.sans,
    fontSize:           12,
    color:              '#C25450',
    textDecorationLine: 'underline',
  },
});
