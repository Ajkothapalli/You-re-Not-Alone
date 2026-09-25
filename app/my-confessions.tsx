/**
 * My Confessions — server-backed list of the user's own confessions.
 *
 * Opens as a formSheet from the profile screen.
 * Cross-device: loaded from the server by account_id (not local receipts).
 *
 * Actions per card:
 *   Edit / View — navigates to confession/[id].tsx for full owner detail.
 *                 can_edit=true shows Edit+Delete; can_edit=false shows sealed note+Delete.
 *   Remove      — quick retire inline; the confession leaves the pool immediately.
 *
 * This is the user's OWN content only — invariant #2 (no new read surface) is
 * unaffected: no other users' confessions appear here.
 */

import { GhostButton, PrimaryButton } from '@/components/Buttons';
import { Icon } from '@/components/Icon';
import VoicePlayButton from '@/components/VoicePlayButton';
import { formatDuration } from '@/lib/voiceRecorder';
import { showDialog } from '@/components/AppDialog';
import { BackgroundPattern } from '@/components/BackgroundPattern';
import { EmptyBench, IllustrationGround } from '@/components/illustrations';
import { useAspectFitWidth } from '@/hooks/useAspectFit';
import { getMyConfessions, retireConfession, type OwnConfession } from '@/lib/api';
import { setConfessionHandoff } from '@/lib/confessionHandoff';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily, radius, spacing } from '@/theme/tokens';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SHADOW = 4;

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
  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);

  const statusLabel = STATUS_LABEL[item.status] ?? item.status;
  const statusColor = STATUS_COLOR[item.status] ?? color.dim;
  const isGone      = item.status === 'retired' || item.status === 'removed' || item.status === 'deleted';
  const hasAudio    = (item.audio_duration_ms ?? 0) > 0;
  const canPlayAudio = item.status === 'live' || item.status === 'approved';

  return (
    <View style={[styles.cardOuter, isGone && styles.cardGone]}>
      <View pointerEvents="none" style={styles.cardShadow} />
      <View style={styles.card}>
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

      {/* A voice confession showed up here as its transcript and nothing else,
          so the owner had no way to tell it carried a recording at all, let
          alone hear it back. The text always renders either way — the audio is
          an addition to the card, never the card itself (VoicePlayButton).

          get-audio-url serves 'live' and 'approved' only, so anything else
          gets the duration as a plain label rather than a play control that
          would fail on tap and read as "your recording is gone". */}
      {hasAudio && (canPlayAudio ? (
        <VoicePlayButton confessionId={item.id} durationMs={item.audio_duration_ms!} />
      ) : (
        <Text style={[styles.audioNote, isGone && styles.textDim]}>
          Voice · {formatDuration(item.audio_duration_ms!)}
        </Text>
      ))}

      {!isGone && (
        <View style={styles.actions}>
          <Pressable
            onPress={() => onEdit(item)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={item.can_edit ? 'Edit this confession' : 'View this confession'}
          >
            <Text style={styles.editLink}>{item.can_edit ? 'edit' : 'view'}</Text>
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
    </View>
  );
}

export default function MyConfessionsScreen() {
  const insets = useSafeAreaInsets();
  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);
  const emptyBenchFit = useAspectFitWidth(4 / 3);

  const [confessions, setConfessions] = useState<OwnConfession[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error,   setError]           = useState<string | null>(null);

  // Reload on focus, not just mount — returning from an edit must show the
  // new text rather than the copy we loaded before navigating away.
  useFocusEffect(useCallback(() => { load(); }, []));

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
    // Route params strip newlines (see lib/confessionHandoff.ts). That matters
    // more here than anywhere else: the edit composer seeds from this text, so
    // a flattened copy would be written straight back to the database and the
    // author's paragraphs lost for good.
    setConfessionHandoff({
      id:           item.id,
      text:         item.text,
      feltCount:    item.felt_count,
      paletteIndex: 0,
    });
    router.push({
      pathname: '/confession/[id]',
      params:   {
        id:        item.id,
        text:      item.text,
        feltCount: String(item.felt_count),
        canEdit:   String(item.can_edit),
        createdAt: item.created_at,
        updatedAt: item.updated_at ?? '',
        status:    item.status,
        audioDurationMs: String(item.audio_duration_ms ?? 0),
      },
    });
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
      <BackgroundPattern />
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="arrow_left" size={16} />
            <Text style={styles.back}>back</Text>
          </View>
        </Pressable>
        <Text style={styles.title}>My confessions</Text>
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
          <View style={styles.emptyCard}>
            <View pointerEvents="none" style={styles.emptyCardShadow} />
            <View style={styles.emptyCardInner}>
              <View style={{ width: '100%' }} onLayout={emptyBenchFit.onLayout}>
                {emptyBenchFit.ready && (
                  <IllustrationGround style={{ width: emptyBenchFit.width, height: emptyBenchFit.height }}>
                    <EmptyBench style={{ width: emptyBenchFit.width, height: emptyBenchFit.height }} />
                  </IllustrationGround>
                )}
              </View>
              <Text style={styles.emptyHeading}>Say the one true thing</Text>
              <Text style={styles.emptyText}>
                Somewhere out there, someone is carrying something like it —
                write it down, anonymously, and this is where you'll watch it land.
              </Text>
              <PrimaryButton
                label="Write it now"
                onPress={() => router.back()}
              />
            </View>
          </View>
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

function createStyles(color: ColorSet) {
  return StyleSheet.create({
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
      fontFamily: fontFamily.sansBold,
      fontSize:   17,
      color:      color.paper,
    },
    center: {
      flex:           1,
      alignItems:     'center',
      justifyContent: 'center',
      padding:        spacing.screenPadding,
    },
    emptyCard: {
      width:         '100%',
      paddingRight:  SHADOW,
      paddingBottom: SHADOW,
    },
    emptyCardShadow: {
      position:        'absolute',
      top:             SHADOW,
      left:            SHADOW,
      right:           0,
      bottom:          0,
      borderRadius:    radius.card,
      backgroundColor: color.border,
    },
    emptyCardInner: {
      backgroundColor: color.ink,
      borderRadius:    radius.card,
      borderWidth:     2,
      borderColor:     color.border,
      padding:         20,
      gap:             12,
      alignItems:      'center',
    },
    emptyHeading: {
      fontFamily: fontFamily.sansBold,
      fontSize:   18,
      color:      color.paper,
      textAlign:  'center',
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
    cardOuter: {
      paddingRight:  SHADOW,
      paddingBottom: SHADOW,
    },
    cardShadow: {
      position:        'absolute',
      top:             SHADOW,
      left:            SHADOW,
      right:           0,
      bottom:          0,
      borderRadius:    radius.card,
      backgroundColor: color.border,
    },
    card: {
      backgroundColor: color.ink,
      borderRadius:    radius.card,
      borderWidth:     2,
      borderColor:     color.border,
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
    audioNote: {
      fontFamily: fontFamily.sans,
      fontSize:   12,
      color:      color.dim,
    },
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
}
