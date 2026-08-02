/**
 * You tab — profile block + your confessions.
 *
 * Profile block: persona badge, editable name, premium card, character picker.
 * Confessions: server-loaded list with Edit (retire+resubmit full pipeline,
 *   felt_count resets, user warned) and Delete (confirm → retire).
 *
 * Identity invariants (CLAUDE.md §3): account_id never in any client payload.
 * Edit re-runs the full safety pipeline — no bypass.
 */

import { GhostButton } from '@/components/Buttons';
import { showDialog } from '@/components/AppDialog';
import { PERSONAS, PersonaBadge, getPersonaById } from '@/components/Persona';
import { deleteAccount, getMyConfessions, retireConfession, type OwnConfession, type DeleteMode } from '@/lib/api';
import { clearProfile, getProfile, setProfileName, setProfilePersona } from '@/lib/profile';
import { usePremium } from '@/lib/premiumContext';
import { billingAvailable, restorePurchases } from '@/lib/purchases';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { type ColorSet, font, fontFamily, radius, spacing } from '@/theme/tokens';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackgroundPattern } from '@/components/BackgroundPattern';
import { ScrawlIcon } from '@/components/ScrawlIcon';

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

export default function YouScreen() {
  const { isPremium, refresh } = usePremium();
  const insets                 = useSafeAreaInsets();
  const { colors: color, setTheme, isDark } = useTheme();
  const styles                 = useMemo(() => createStyles(color), [color]);

  // Profile state
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [name, setName]           = useState('');
  const [deleting, setDeleting]   = useState(false);
  const nameRef   = useRef(name);
  const bustScale = useRef(new Animated.Value(1)).current;
  useEffect(() => { nameRef.current = name; }, [name]);

  // My confessions state
  const [confessions,       setConfessions]       = useState<OwnConfession[]>([]);
  const [confessionsLoading, setConfessionsLoading] = useState(false);


  useEffect(() => {
    getProfile().then((p) => {
      setPersonaId(p.personaId);
      setName(p.name);
      nameRef.current = p.name;
    });
    return () => {
      const trimmed = nameRef.current.trim();
      if (trimmed) setProfileName(trimmed).catch(() => {});
    };
  }, []);

  useFocusEffect(useCallback(() => {
    loadConfessions();
  }, []));

  async function loadConfessions() {
    setConfessionsLoading(true);
    try {
      const data = await getMyConfessions();
      setConfessions(data);
    } catch { /* fail silently */ }
    finally { setConfessionsLoading(false); }
  }

  async function handleNameDone() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await setProfileName(trimmed);
  }

  function handleShufflePersona() {
    const others = PERSONAS.filter(p => p.id !== personaId);
    const next   = others[Math.floor(Math.random() * others.length)];
    Animated.sequence([
      Animated.timing(bustScale, { toValue: 0.80, duration: 70, useNativeDriver: true }),
      Animated.spring(bustScale,  { toValue: 1, damping: 6, stiffness: 200, mass: 0.8, useNativeDriver: true }),
    ]).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    handlePickPersona(next.id);
  }

  async function handlePickPersona(id: string) {
    setPersonaId(id);
    await setProfilePersona(id);
  }

  function markRetired(confessionId: string) {
    setConfessions((prev) =>
      prev.map((c) => c.id === confessionId ? { ...c, status: 'retired' as const } : c),
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
              router.navigate('/(tabs)/write');
              // prefillText is picked up by the write tab via params
              router.setParams({ prefillText: item.text });
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

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  async function handleRestorePurchases() {
    if (!billingAvailable()) {
      showDialog('Restore purchases', 'Available on a device build. Your plan is tied to your app store account.');
      return;
    }
    try {
      const premium = await restorePurchases();
      await refresh();
      showDialog(
        premium ? 'Restored' : 'Nothing to restore',
        premium ? 'Your subscription is active again.' : 'No previous subscription was found.',
      );
    } catch {
      showDialog('Restore failed', 'Could not restore purchases. Please try again.');
    }
  }

  function handleDeletePress() {
    if (deleting) return;
    showDialog(
      'Delete your account?',
      'Choose what happens to your confessions when you leave.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:  'Erase everything',
          style: 'destructive',
          onPress: () =>
            showDialog(
              'Erase everything?',
              'Your account and every confession are permanently deleted. This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Yes, erase everything', style: 'destructive', onPress: () => runDelete('erase'), keepOpenWhilePending: true },
              ],
            ),
        },
        {
          text:  'Leave anonymously',
          style: 'default',
          onPress: () =>
            showDialog(
              'Leave anonymously?',
              'Your account is deleted. Your confessions stay with no name attached. Cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Yes, leave anonymously', style: 'destructive', onPress: () => runDelete('anonymize'), keepOpenWhilePending: true },
              ],
            ),
        },
      ],
    );
  }

  async function runDelete(mode: DeleteMode) {
    setDeleting(true);
    try {
      await deleteAccount(mode);
      await clearProfile();
      router.replace('/');
    } catch {
      setDeleting(false);
      showDialog('Something went wrong', 'Deletion failed. Please try again.');
    }
  }

  if (!personaId) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <BackgroundPattern />
        <ActivityIndicator color={color.dim} />
      </View>
    );
  }

  const persona  = getPersonaById(personaId);
  const liveConfessions = confessions.filter(c => c.status === 'live' || c.status === 'approved');
  const otherConfessions = confessions.filter(c => c.status !== 'live' && c.status !== 'approved');

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
    <BackgroundPattern />
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 70 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Identity card ────────────────────────── */}
      <View style={styles.cardOuter}>
        <View pointerEvents="none" style={styles.cardShadow} />
        <View style={styles.identityCard}>
          <Animated.View style={{ transform: [{ scale: bustScale }] }}>
            <Pressable
              onPress={handleShufflePersona}
              accessibilityRole="button"
              accessibilityLabel={`Your character: ${persona.name}. Tap to change.`}
              hitSlop={8}
            >
              <PersonaBadge persona={persona} size={64} showName={false} />
            </Pressable>
          </Animated.View>
          <TextInput
            value={name}
            onChangeText={setName}
            onEndEditing={handleNameDone}
            onBlur={handleNameDone}
            maxLength={32}
            style={[styles.nameInput, { color: persona.colors[0] }]}
            placeholder="Your name here"
            placeholderTextColor={color.dim}
            autoCorrect={false}
            accessibilityLabel="Your display name"
            accessibilityHint="Only you see this."
          />
          <Text style={styles.editHint}>Tap the avatar to switch · tap name to edit</Text>
        </View>
      </View>

      {/* ── Premium card ─────────────────────────── */}
      <View style={styles.premiumOuter}>
        <View pointerEvents="none" style={styles.premiumShadow} />
        <Pressable
          onPress={() => router.push('/plans')}
          accessibilityRole="button"
          accessibilityLabel={isPremium ? 'Premium active' : 'Go Premium'}
        >
          <View style={styles.premiumCard}>
            <View style={styles.premiumTextWrap}>
              <View style={styles.premiumTopRow}>
                <ScrawlIcon name="star" size={16} color="#0A0A0A" roughen={false} strokeWidth={2.5} />
                <Text style={styles.premiumTitle}>{isPremium ? 'Premium active' : 'Go Premium'}</Text>
              </View>
              <Text style={styles.premiumSub}>
                {isPremium ? 'Thank you for holding this place up' : 'Unlimited reading, tuned to you'}
              </Text>
            </View>
            <ScrawlIcon name="arrow_right" size={20} color="#0A0A0A" roughen={false} strokeWidth={2.5} />
          </View>
        </Pressable>
      </View>

      {/* ── Character picker ──────────────────────── */}
      <Text style={styles.sectionLabel}>Choose your character</Text>
      <View style={styles.grid}>
        {PERSONAS.map((p) => {
          const selected = p.id === personaId;
          return (
            <Pressable
              key={p.id}
              onPress={() => handlePickPersona(p.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Character ${p.name}`}
              style={[
                styles.gridItem,
                selected && { borderColor: p.colors[0] },
              ]}
            >
              {selected && (
                <View
                  style={[StyleSheet.absoluteFill, { backgroundColor: p.colors[0] + '14' }]}
                  pointerEvents="none"
                />
              )}
              <PersonaBadge persona={p} size={44} showName={false} />
              <Text
                style={[styles.gridName, { color: selected ? p.colors[0] : color.paper }]}
                numberOfLines={1}
              >
                {p.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.privacyNote}>
        Your character is just for you. Confessions always appear under a random character — never this one.
      </Text>

      {/* ── My confessions ───────────────────────── */}
      <Text style={styles.sectionLabel}>My confessions</Text>
      {confessionsLoading ? (
        <ActivityIndicator color={color.dim} style={{ marginVertical: 16 }} />
      ) : confessions.length === 0 ? (
        <Text style={styles.emptyConfessions}>
          You haven't written anything yet.{'\n'}Your confessions will appear here.
        </Text>
      ) : (
        <View style={{ gap: 12 }}>
          {[...liveConfessions, ...otherConfessions].map((item) => {
            const statusLabel = STATUS_LABEL[item.status] ?? item.status;
            const statusColor = STATUS_COLOR[item.status] ?? color.dim;
            const isGone      = item.status === 'retired' || item.status === 'removed' || item.status === 'deleted';
            return (
              <View key={item.id} style={[styles.confessionOuter, isGone && styles.confessionGone]}>
                <View pointerEvents="none" style={styles.confessionShadow} />
                <View style={styles.confessionCard}>
                  <View style={styles.confessionHeader}>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor + '22' }]}>
                      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                      <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                    <Text style={styles.feltText}>{item.felt_count} felt this</Text>
                  </View>
                  <Text style={[styles.confessionText, isGone && styles.confessionDim]} numberOfLines={4}>
                    {item.text}
                  </Text>
                  {!isGone && (
                    <View style={styles.confessionActions}>
                      <Pressable onPress={() => handleEdit(item)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit">
                        <Text style={styles.editLink}>edit</Text>
                      </Pressable>
                      <Text style={styles.actionSep}>·</Text>
                      <Pressable onPress={() => handleRemove(item.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove">
                        <Text style={styles.removeLink}>remove</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Settings ─────────────────────────────── */}
      <Text style={styles.sectionLabel}>Settings</Text>
      <View style={styles.moreList}>
        {[
          { label: 'Reading categories', hint: 'What you want to read', onPress: () => router.push('/categories?mode=edit') },
          { label: 'Support resources',  hint: 'If tonight is heavy',   onPress: () => router.push('/crisis') },
          { label: 'About & policies',   hint: 'Privacy, terms',        onPress: () => router.push('/settings') },
          { label: 'Restore purchases',  hint: 'After reinstall',       onPress: handleRestorePurchases },
          { label: 'Contact support',    hint: 'We read everything',    onPress: () => router.push('/contact') },
        ].map(({ label, hint, onPress }) => (
          <TouchableOpacity
            key={label}
            style={styles.moreRow}
            onPress={onPress}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            <Text style={styles.moreLabel}>{label}</Text>
            <Text style={styles.moreHint}>{hint}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Appearance ───────────────────────────── */}
      <Text style={styles.sectionLabel}>Appearance</Text>
      <View style={styles.themeRow}>
        {([
          { mode: 'light' as const, icon: 'sun',  label: 'Light', active: !isDark },
          { mode: 'dark'  as const, icon: 'moon', label: 'Dark',  active: isDark  },
        ]).map(({ mode, icon, label, active }) => (
          <TouchableOpacity
            key={mode}
            onPress={() => setTheme(mode)}
            style={[styles.themeChip, active && styles.themeChipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${label} theme`}
          >
            <ScrawlIcon
              name={icon}
              size={22}
              color={active ? '#1A1A1A' : color.dim}
              roughen={false}
              strokeWidth={2.5}
            />
            <Text style={[styles.themeChipText, active && styles.themeChipTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Actions ──────────────────────────────── */}
      <View style={styles.actions}>
        <GhostButton label="Sign out" onPress={handleSignOut} />
      </View>

      <TouchableOpacity
        onPress={handleDeletePress}
        disabled={deleting}
        hitSlop={12}
        style={styles.deleteRow}
        accessibilityRole="button"
        accessibilityState={{ disabled: deleting, busy: deleting }}
        accessibilityLabel="Delete my account and confessions"
      >
        <Text style={[styles.deleteLink, deleting && { opacity: 0.5 }]}>
          {deleting ? 'Deleting…' : 'Delete my account and confessions'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.version}>
        you're not alone · v{Constants.expoConfig?.version ?? '1.0.0'}
      </Text>
    </ScrollView>

    </View>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    root:   { flex: 1, backgroundColor: color.bg },
    center: { flex: 1, backgroundColor: color.bg, justifyContent: 'center', alignItems: 'center' },
    scroll: {
      padding:       spacing.screenPadding,
      paddingTop:    16,
      paddingBottom: 40,
      gap:           16,
    },

    // Identity card
    cardOuter:    { paddingRight: SHADOW, paddingBottom: SHADOW },
    cardShadow:   { position: 'absolute', top: SHADOW, left: SHADOW, right: 0, bottom: 0, borderRadius: radius.card, backgroundColor: color.border },
    identityCard: { backgroundColor: color.ink, borderRadius: radius.card, borderWidth: 2, borderColor: color.border, padding: 24, alignItems: 'center', gap: 12 },
    nameInput:    { fontFamily: fontFamily.sansBold, fontSize: 22, textAlign: 'center', minWidth: 200, padding: 4 },
    editHint:     { fontFamily: fontFamily.sans, fontSize: 11, color: color.dim },

    // Premium card
    premiumOuter:   { paddingRight: SHADOW, paddingBottom: SHADOW },
    premiumShadow:  { position: 'absolute', top: SHADOW, left: SHADOW, right: 0, bottom: 0, borderRadius: radius.input, backgroundColor: '#0A0A0A' },
    premiumCard:    { backgroundColor: '#FFE500', borderRadius: radius.input, borderWidth: 2, borderColor: '#0A0A0A', paddingVertical: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center' },
    premiumTextWrap: { flex: 1, gap: 3 },
    premiumTopRow:  { flexDirection: 'row', alignItems: 'center', gap: 7 },
    premiumStar:    {},
    premiumTitle:   { fontFamily: fontFamily.sansBold, fontSize: font.labelSize, letterSpacing: font.labelLetterSpacing, textTransform: 'uppercase', color: '#0A0A0A' },
    premiumSub:     { fontFamily: fontFamily.sans, fontSize: 13, color: '#333333' },
    premiumArrow:   {},

    // Section label
    sectionLabel: { fontFamily: fontFamily.sansBold, fontSize: font.labelSize, letterSpacing: font.labelLetterSpacing, textTransform: 'uppercase', color: color.dim, marginTop: 8 },

    // Character picker
    grid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    gridItem:     { width: '30.5%', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 4, borderRadius: radius.input, borderWidth: 2, borderColor: color.border, backgroundColor: color.ink, overflow: 'hidden' },
    gridName:     { fontFamily: fontFamily.sans, fontSize: 10, textAlign: 'center' },
    privacyNote:  { fontFamily: fontFamily.sans, fontSize: 12, lineHeight: 18, color: color.dim },

    // My confessions
    emptyConfessions: { fontFamily: fontFamily.sans, fontSize: 14, color: color.dim, lineHeight: 22 },
    confessionOuter:  { paddingRight: SHADOW, paddingBottom: SHADOW },
    confessionShadow: { position: 'absolute', top: SHADOW, left: SHADOW, right: 0, bottom: 0, borderRadius: radius.card, backgroundColor: color.border },
    confessionCard:   { backgroundColor: color.ink, borderRadius: radius.card, borderWidth: 2, borderColor: color.border, padding: 16, gap: 10 },
    confessionGone:   { opacity: 0.5 },
    confessionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    statusBadge:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 99 },
    statusDot:        { width: 6, height: 6, borderRadius: 3 },
    statusText:       { fontFamily: fontFamily.sansBold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
    feltText:         { fontFamily: fontFamily.sans, fontSize: 11, color: color.dim },
    confessionText:   { fontFamily: fontFamily.serif, fontSize: 15, lineHeight: 22, color: color.paper },
    confessionDim:    { color: color.dim },
    confessionActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 2 },
    actionSep:        { fontFamily: fontFamily.sans, fontSize: 12, color: color.dim },
    editLink:         { fontFamily: fontFamily.sans, fontSize: 12, color: color.dim, textDecorationLine: 'underline' },
    removeLink:       { fontFamily: fontFamily.sans, fontSize: 12, color: '#C25450', textDecorationLine: 'underline' },

    // Settings list
    moreList:  { backgroundColor: color.ink, borderRadius: radius.input, borderWidth: 2, borderColor: color.border, overflow: 'hidden' },
    moreRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
    moreLabel: { fontFamily: fontFamily.sans, fontSize: 14, color: color.paper },
    moreHint:  { fontFamily: fontFamily.sans, fontSize: 11, color: color.dim },

    // Appearance
    themeRow:            { flexDirection: 'row', gap: 10 },
    themeChip:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: radius.pill, borderWidth: 2, borderColor: color.border, backgroundColor: 'transparent' },
    themeChipActive:     { backgroundColor: '#FFE500', borderColor: '#1A1A1A' },
    themeChipText:       { fontFamily: fontFamily.sansBold, fontSize: 13, letterSpacing: 0.18 * 13, textTransform: 'uppercase', color: color.dim },
    themeChipTextActive: { color: '#1A1A1A' },

    // Actions
    actions:    { gap: 12, marginTop: 8 },
    deleteRow:  { alignItems: 'center', paddingVertical: 10 },
    deleteLink: { fontFamily: fontFamily.sans, fontSize: 12, color: '#C25450', textDecorationLine: 'underline' },
    version:    { fontFamily: fontFamily.sans, fontSize: 11, color: color.dim, textAlign: 'center', opacity: 0.7, marginTop: 4 },

  });
}
