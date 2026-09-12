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

import { EmptyBench } from '@/components/illustrations';
import { useAspectFitWidth } from '@/hooks/useAspectFit';
import { GhostButton } from '@/components/Buttons';
import { showDialog } from '@/components/AppDialog';
import { PERSONAS, PersonaBadge, getPersonaById } from '@/components/Persona';
import { deleteAccount, getMyConfessions, type OwnConfession, type DeleteMode } from '@/lib/api';
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

export default function YouScreen() {
  const { isPremium, refresh } = usePremium();
  const insets                 = useSafeAreaInsets();
  const { colors: color, setTheme, isDark } = useTheme();
  const styles                 = useMemo(() => createStyles(color), [color]);
  const emptyBenchFit          = useAspectFitWidth(4 / 3);

  // Profile state
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [name, setName]           = useState('');
  const [deleting, setDeleting]   = useState(false);
  const nameRef   = useRef(name);
  const bustScale = useRef(new Animated.Value(1)).current;
  useEffect(() => { nameRef.current = name; }, [name]);

  // My confessions state
  const [confessions,        setConfessions]        = useState<OwnConfession[]>([]);
  const [confessionsLoading, setConfessionsLoading] = useState(false);
  const [confessionsError,   setConfessionsError]   = useState<string | null>(null);


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
    setConfessionsError(null);
    try {
      const data = await getMyConfessions();
      setConfessions(data);
    } catch (err) {
      console.error('[you] loadConfessions error:', err);
      setConfessionsError('Could not load confessions. Tap to retry.');
    } finally {
      setConfessionsLoading(false);
    }
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
  const totalFelt       = confessions.reduce((sum, c) => sum + (c.felt_count ?? 0), 0);

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
      ) : confessionsError ? (
        <Text style={[styles.emptyConfessions, { color: '#E57373' }]} onPress={loadConfessions}>
          {confessionsError}
        </Text>
      ) : confessions.length === 0 ? (
        // Conversion moment: zero confessions is our one chance to turn a
        // reader into a writer. The whole card is one Pressable (illustration
        // + heading + body), same neo-brutal chrome + tap pattern as
        // read.tsx's WriteInviteCard — not a small button buried below text.
        <View style={{ paddingRight: SHADOW, paddingBottom: SHADOW }}>
          <View pointerEvents="none" style={styles.emptyCardShadow} />
          <Pressable
            onPress={() => router.navigate('/(tabs)/write')}
            style={({ pressed }) => [styles.emptyCard, pressed && styles.emptyCardPressed]}
            accessibilityRole="button"
            accessibilityLabel="Write your first confession"
          >
            <View style={{ width: '100%' }} onLayout={emptyBenchFit.onLayout}>
              {emptyBenchFit.ready && (
                <EmptyBench style={{ width: emptyBenchFit.width, height: emptyBenchFit.height }} />
              )}
            </View>
            <View style={styles.emptyCardText}>
              <Text style={styles.emptyCardHeading}>Say the one true thing</Text>
              <Text style={styles.emptyCardBody}>
                You haven't written anything yet — someone out there is carrying
                the exact same thing. This is where you'll watch it land.
              </Text>
              <View style={styles.emptyCardCta}>
                <Text style={styles.emptyCardCtaText}>Write it now</Text>
                <ScrawlIcon name="arrow_right" size={14} color={color.paper} roughen={false} strokeWidth={2.5} />
              </View>
            </View>
          </Pressable>
        </View>
      ) : (
        // Summary card only — the full list lives on its own page (app/my-confessions.tsx).
        // The profile shouldn't dump every confession inline; it should hand you
        // a door into them.
        <View style={{ paddingRight: SHADOW, paddingBottom: SHADOW }}>
          <View pointerEvents="none" style={styles.emptyCardShadow} />
          <Pressable
            onPress={() => router.navigate('/my-confessions')}
            style={({ pressed }) => [styles.listCard, pressed && styles.emptyCardPressed]}
            accessibilityRole="button"
            accessibilityLabel={`My confessions — ${confessions.length} total. Opens the full list.`}
          >
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.emptyCardHeading}>
                {confessions.length} {confessions.length === 1 ? 'confession' : 'confessions'}
              </Text>
              <Text style={styles.emptyCardBody}>
                {liveConfessions.length > 0 && `${liveConfessions.length} live · `}
                {totalFelt} {totalFelt === 1 ? 'person' : 'people'} felt them
              </Text>
            </View>
            <ScrawlIcon name="arrow_right" size={18} color={color.paper} roughen={false} strokeWidth={2.5} />
          </Pressable>
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
    emptyCardShadow:  { position: 'absolute', top: SHADOW, left: SHADOW, right: 0, bottom: 0, borderRadius: radius.card, backgroundColor: color.border },
    emptyCard:        { borderRadius: radius.card, borderWidth: 2, borderColor: color.border, overflow: 'hidden', backgroundColor: color.ink },
    emptyCardPressed: { opacity: 0.9 },
    emptyCardText:    { padding: 20, gap: 6 },
    emptyCardHeading: { fontFamily: fontFamily.sansBold, fontSize: 18, color: color.paper, lineHeight: 24 },
    emptyCardBody:    { fontFamily: fontFamily.sans, fontSize: 13, color: color.dim, lineHeight: 19 },
    emptyCardCta:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    emptyCardCtaText: { fontFamily: fontFamily.sansBold, fontSize: 13, color: color.paper, letterSpacing: 0.3 },
    // Summary card that drills into app/my-confessions.tsx
    listCard:         { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: color.ink, borderRadius: radius.card, borderWidth: 2, borderColor: color.border, paddingVertical: 16, paddingHorizontal: 18 },

    // Settings list
    moreList:  { backgroundColor: color.ink, borderRadius: radius.input, borderWidth: 2, borderColor: color.border, overflow: 'hidden' },
    moreRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
    moreLabel: { fontFamily: fontFamily.sans, fontSize: 14, color: color.paper },
    moreHint:  { fontFamily: fontFamily.sans, fontSize: 11, color: color.dim },

    // Appearance
    themeRow:            { flexDirection: 'row', gap: 10 },
    themeChip:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: radius.pill, borderWidth: 2, borderColor: color.border, backgroundColor: 'transparent' },
    // Selection convention app-wide is yellow (see welcome.tsx's category
    // chips / theme picker), not red — red reads as danger, not "chosen."
    themeChipActive:     { backgroundColor: '#FFE500', borderColor: '#000000' },
    themeChipText:       { fontFamily: fontFamily.sansBold, fontSize: 13, letterSpacing: 0.18 * 13, textTransform: 'uppercase', color: color.dim },
    themeChipTextActive: { color: '#1A1A1A' },

    // Actions
    actions:    { gap: 12, marginTop: 8 },
    deleteRow:  { alignItems: 'center', paddingVertical: 10 },
    deleteLink: { fontFamily: fontFamily.sans, fontSize: 12, color: '#C25450', textDecorationLine: 'underline' },
    version:    { fontFamily: fontFamily.sans, fontSize: 11, color: color.dim, textAlign: 'center', opacity: 0.7, marginTop: 4 },

  });
}
