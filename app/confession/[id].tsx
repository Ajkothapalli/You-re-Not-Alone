/**
 * Owner confession detail screen — view + edit with atomic seal guard.
 *
 * Reached from app/my-confessions.tsx (the "edit" action on a confession you
 * own). Editing in place preserves felt_count while the confession is unfelt;
 * once someone has felt it the confession seals and only deletion remains.
 *
 * Route params: id, text, feltCount, canEdit, createdAt, updatedAt, status.
 * The BODY, though, comes from lib/confessionHandoff — route params strip
 * newlines, and this screen seeds the edit composer, so a flattened copy would
 * be saved back over the author's own paragraphs. Params are the deep-link
 * fallback only.
 *
 * States:
 *   View — shows text, date, felt count, actions.
 *          can_edit=true  → [Edit] [Delete]
 *          can_edit=false → sealed note + [Delete]
 *   Edit — Write composer prefilled; Save runs the edit-confession pipeline.
 *
 * Motion: cross-fade (base 220ms, standard easing) between view ↔ edit.
 *         Gate with useReducedMotion() → instant end-state.
 * Haptics: save success → Success; genuine error → Error;
 *          sealed race  → Light impact (informational, NOT an error buzz).
 */

import ConfessionInput from '@/components/ConfessionInput';
import { GhostButton, PrimaryButton } from '@/components/Buttons';
import { ScrawlIcon } from '@/components/ScrawlIcon';
import { BackgroundPattern } from '@/components/BackgroundPattern';
import { showDialog } from '@/components/AppDialog';
import { showToast } from '@/components/Toast';
import VoicePlayButton from '@/components/VoicePlayButton';
import { getConfessionHandoff } from '@/lib/confessionHandoff';
import { editConfession, retireConfession } from '@/lib/api';
import { useReducedMotion } from '@/lib/a11y';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily, radius, spacing } from '@/theme/tokens';
import { DURATION, EASING } from '@/theme/motion';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useRef, useState, useMemo } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Brand copy (exact strings from spec — do not alter) ─────────────────────
const EDIT_NOTE       = 'Edited confessions are checked again before they go back out.';
const SEALED_NOTE     = "Someone real has felt this now — so it's sealed. You can delete it, but the words stay as they were.";
const SEALED_RACE_MSG = "Someone just felt this while you were editing — it's sealed now, so your change wasn't saved.";

const BLOCK_CRISIS_COPY =
  "This sounds like a moment that deserves real support. " +
  "If you're struggling, the people on the crisis screen are ready to listen.";
const BLOCK_POLICY_COPY =
  "This confession didn't pass our safety review. " +
  "Try rewording it, or cancel to keep the original.";

const SHADOW = 4;

type Mode = 'view' | 'edit';

export default function ConfessionDetailScreen() {
  const color        = useThemeColors();
  const insets       = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const styles       = useMemo(() => createStyles(color), [color]);

  const params = useLocalSearchParams<{
    id:        string;
    text:      string;
    feltCount: string;
    canEdit:   string;
    createdAt: string;
    updatedAt: string;
    status:    string;
    audioDurationMs: string;
  }>();

  // A voice confession reached this screen as its transcript alone — no way to
  // play back what was actually recorded, on the one screen whose job is to
  // show the owner their own confession in full. get-audio-url serves 'live'
  // and 'approved' only, so anything else gets no play control.
  const audioDurationMs = Number(params.audioDurationMs ?? 0);
  const canPlayAudio    = params.status === 'live' || params.status === 'approved';

  // ── Mutable UI state ─────────────────────────────────────────────────────────
  const [mode,       setMode]       = useState<Mode>('view');
  // Prefer the in-memory handoff: route params lose newlines, and this screen
  // seeds the edit composer — a flattened copy here gets saved back over the
  // author's real text. Params remain the deep-link fallback.
  const initialText = getConfessionHandoff(params.id)?.text ?? params.text ?? '';

  const [text,       setText]       = useState(initialText);
  const [canEdit,    setCanEdit]    = useState(params.canEdit === 'true');
  const [updatedAt,  setUpdatedAt]  = useState<string | null>(params.updatedAt || null);
  const [draftText,  setDraftText]  = useState(initialText);
  const [saving,     setSaving]     = useState(false);
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null);
  const [sealedRace, setSealedRace] = useState(false);

  // ── Animation values ─────────────────────────────────────────────────────────
  const viewOpacity = useRef(new Animated.Value(1)).current;
  const editOpacity = useRef(new Animated.Value(0)).current;

  function crossFadeTo(target: Mode) {
    setMode(target); // update pointerEvents immediately (no accidental taps during fade)

    if (reducedMotion) {
      viewOpacity.setValue(target === 'view' ? 1 : 0);
      editOpacity.setValue(target === 'edit' ? 1 : 0);
      return;
    }

    Animated.parallel([
      Animated.timing(viewOpacity, {
        toValue:         target === 'view' ? 1 : 0,
        duration:        DURATION.base,
        easing:          EASING.standard,
        useNativeDriver: true,
      }),
      Animated.timing(editOpacity, {
        toValue:         target === 'edit' ? 1 : 0,
        duration:        DURATION.base,
        easing:          EASING.standard,
        useNativeDriver: true,
      }),
    ]).start();
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleEnterEdit() {
    setDraftText(text);
    setBlockedMsg(null);
    crossFadeTo('edit');
  }

  function handleCancel() {
    setBlockedMsg(null);
    crossFadeTo('view');
  }

  async function handleSave() {
    const trimmed = draftText.trim();
    if (trimmed.length < 10) {
      showDialog('Too short', 'Write a little more — at least a sentence or two.');
      return;
    }
    setSaving(true);
    setBlockedMsg(null);
    try {
      const result = await editConfession(params.id, trimmed);

      if (result.sealed) {
        // Sealed race — informational, not an error.
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCanEdit(false);
        setSealedRace(true);
        crossFadeTo('view');
        return;
      }

      if (result.blocked) {
        // Moderation or crisis rejected the new text.
        // Keep composer open; user can revise or cancel.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setBlockedMsg(result.reason ?? 'policy_violation');
        return;
      }

      if (result.success && result.confession) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setText(result.confession.text);
        setUpdatedAt(result.confession.updated_at);
        setCanEdit(result.confession.can_edit);
        showToast('Successfully edited');
        // Return to the list — the edit is done, there's nothing left to do
        // here. my-confessions reloads on focus so the new text shows.
        //
        // Navigation gets its own try: the save has already succeeded at this
        // point, so a routing problem must never fall through to the outer
        // catch and tell the author their edit failed when it didn't.
        try {
          if (router.canGoBack?.()) router.back();
          else router.replace('/my-confessions');
        } catch {
          router.replace('/my-confessions');
        }
      }
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showDialog('Something went wrong', 'Could not save your changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    showDialog(
      'Delete this confession?',
      'It will be removed from the pool immediately. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:  'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await retireConfession(params.id);
              router.back();
            } catch {
              showDialog('Something went wrong', 'Could not delete the confession. Please try again.');
            }
          },
          keepOpenWhilePending: true,
        },
      ],
    );
  }

  // ── Display helpers ───────────────────────────────────────────────────────────
  const dateStr  = params.createdAt
    ? new Date(params.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : '';
  const wasEdited = !!updatedAt;
  const feltCount = Number(params.feltCount ?? 0);

  const blockedCopy = blockedMsg === 'crisis' ? BLOCK_CRISIS_COPY : BLOCK_POLICY_COPY;

  // No paddingTop on root: both panes are position:absolute and would ignore
  // it. The safe-area inset goes on each pane's top bar instead.
  return (
    <View style={styles.root} testID="detail-root">
      <BackgroundPattern />

      {/* ── VIEW PANE ─────────────────────────────────────────────────────────── */}
      <Animated.View
        style={[styles.pane, { opacity: viewOpacity }]}
        pointerEvents={mode === 'view' ? 'auto' : 'none'}
        testID="view-pane"
      >
        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <View style={styles.backRow}>
              <View style={{ transform: [{ scaleX: -1 }] }}>
                <ScrawlIcon name="arrow_right" size={16} color={color.dim} roughen={false} strokeWidth={2.5} />
              </View>
              <Text style={styles.backLabel}>back</Text>
            </View>
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Date + edited marker */}
          <View style={styles.metaRow}>
            <Text style={styles.meta}>
              {dateStr}
              {wasEdited ? <Text style={styles.editedMark}> · edited</Text> : null}
            </Text>
            <Text style={styles.feltLabel}>
              {feltCount === 1 ? '1 felt this' : `${feltCount} felt this`}
            </Text>
          </View>

          {/* Confession card */}
          <View style={styles.cardOuter}>
            <View pointerEvents="none" style={styles.cardShadow} />
            <View style={styles.card}>
              <Text style={styles.confessionText}>{text}</Text>
              {audioDurationMs > 0 && canPlayAudio && (
                <VoicePlayButton confessionId={params.id} durationMs={audioDurationMs} />
              )}
            </View>
          </View>

          {/* Sealed note */}
          {!canEdit && (
            <Text style={styles.sealedNote} testID="sealed-note">{SEALED_NOTE}</Text>
          )}

          {/* Sealed-race informational message */}
          {sealedRace && (
            <View style={styles.infoBanner} testID="sealed-race-banner">
              <Text style={styles.infoBannerText}>{SEALED_RACE_MSG}</Text>
            </View>
          )}
        </ScrollView>

        {/* Actions */}
        <View style={[styles.actionsBar, { paddingBottom: insets.bottom + 16 }]}>
          {canEdit && (
            <PrimaryButton
              label="Edit"
              onPress={handleEnterEdit}
              testID="edit-btn"
            />
          )}
          <GhostButton
            label="Delete"
            onPress={handleDelete}
            testID="delete-btn"
          />
        </View>
      </Animated.View>

      {/* ── EDIT PANE ─────────────────────────────────────────────────────────── */}
      <Animated.View
        style={[styles.pane, { opacity: editOpacity }]}
        pointerEvents={mode === 'edit' ? 'auto' : 'none'}
        testID="edit-pane"
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Cancel */}
          <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
            <Pressable
              onPress={handleCancel}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Cancel editing"
              testID="cancel-btn"
            >
              <View style={styles.backRow}>
                <View style={{ transform: [{ scaleX: -1 }] }}>
                  <ScrawlIcon name="arrow_right" size={16} color={color.dim} roughen={false} strokeWidth={2.5} />
                </View>
                <Text style={styles.backLabel}>cancel</Text>
              </View>
            </Pressable>
          </View>

          {/* Blocked banner — reuses brand copy for moderation/crisis blocks */}
          {blockedMsg !== null && (
            <View style={styles.blockedBanner} testID="blocked-banner">
              <Text style={styles.blockedBannerText}>{blockedCopy}</Text>
            </View>
          )}

          {/* Composer */}
          <ConfessionInput
            value={draftText}
            onChangeText={setDraftText}
            placeholder="Write it here. It stays private."
            autoFocus
            style={styles.inputArea}
            testID="confession-input"
          />

          {/* Edit note */}
          <Text style={styles.editNote}>{EDIT_NOTE}</Text>

          {/* Save */}
          <View style={[styles.actionsBar, { paddingBottom: insets.bottom + 16 }]}>
            <PrimaryButton
              label="Save"
              onPress={handleSave}
              loading={saving}
              disabled={draftText.trim().length < 10}
              testID="save-btn"
            />
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    root: {
      flex:            1,
      backgroundColor: color.bg,
    },
    // Both panes fill the root absolutely so the cross-fade works correctly.
    pane: {
      position: 'absolute',
      top:      0,
      left:     0,
      right:    0,
      bottom:   0,
    },
    topBar: {
      paddingHorizontal: spacing.screenPadding,
      paddingTop:        12,
      paddingBottom:     8,
    },
    backRow: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:           4,
    },
    backLabel: {
      fontFamily: fontFamily.sans,
      fontSize:   14,
      color:      color.dim,
    },
    scrollContent: {
      padding:       spacing.screenPadding,
      paddingTop:    8,
      paddingBottom: 32,
      gap:           16,
    },
    metaRow: {
      flexDirection:  'row',
      alignItems:     'center',
      justifyContent: 'space-between',
    },
    meta: {
      fontFamily: fontFamily.sans,
      fontSize:   12,
      color:      color.dim,
    },
    editedMark: {
      fontFamily: fontFamily.sans,
      fontSize:   12,
      color:      color.dim,
    },
    feltLabel: {
      fontFamily: fontFamily.sans,
      fontSize:   11,
      color:      color.dim,
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
      padding:         spacing.cardPadding,
    },
    confessionText: {
      fontFamily: fontFamily.serif,
      fontSize:   19,
      lineHeight: 28.5,
      color:      color.paper,
    },
    sealedNote: {
      fontFamily: fontFamily.sans,
      fontSize:   13,
      color:      color.dim,
      lineHeight: 20,
      fontStyle:  'italic',
    },
    infoBanner: {
      backgroundColor: color.accent + '22',
      borderRadius:    radius.input,
      borderWidth:     1.5,
      borderColor:     color.accent,
      padding:         12,
    },
    infoBannerText: {
      fontFamily: fontFamily.sans,
      fontSize:   13,
      color:      color.paper,
      lineHeight: 20,
    },
    actionsBar: {
      paddingHorizontal: spacing.screenPadding,
      paddingTop:        16,
      gap:               10,
    },
    inputArea: {
      flex:             1,
      marginHorizontal: spacing.screenPadding,
    },
    editNote: {
      fontFamily:        fontFamily.sans,
      fontSize:          12,
      color:             color.dim,
      marginHorizontal:  spacing.screenPadding,
      marginTop:         8,
      lineHeight:        18,
    },
    blockedBanner: {
      marginHorizontal: spacing.screenPadding,
      marginBottom:     8,
      backgroundColor:  '#C2545022',
      borderRadius:     radius.input,
      borderWidth:      1.5,
      borderColor:      '#C25450',
      padding:          12,
    },
    blockedBannerText: {
      fontFamily: fontFamily.sans,
      fontSize:   13,
      color:      '#C25450',
      lineHeight: 20,
    },
  });
}
