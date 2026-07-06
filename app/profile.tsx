/**
 * Profile — the user's own corner: a character, an editable name,
 * sign out, and account deletion.
 *
 * The character + name are PROFILE-ONLY (owner decision 2026-06-12):
 * stored on-device, never sent to the server, never shown on
 * confessions. Confessions always carry a random per-confession
 * persona so nobody's writing can be linked together.
 *
 * Deletion wipes everything from our servers (account, confessions,
 * seek history, devices) except purchase records, which the app
 * stores retain for billing/refunds.
 */

import { deleteAccount, type DeleteMode } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { GhostButton } from '@/components/Buttons';
import { PERSONAS, PersonaBadge, getPersonaById } from '@/components/Persona';
import { clearProfile, getProfile, setProfileName, setProfilePersona } from '@/lib/profile';
import { usePremium } from '@/lib/premiumContext';
import { billingAvailable, restorePurchases } from '@/lib/purchases';
import { color, font, fontFamily, radius, spacing } from '@/theme/tokens';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { router } from 'expo-router';

const GOLD: [string, string] = ['#FBBF24', '#FB7185'];
import { useEffect, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { showDialog } from '@/components/AppDialog';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ProfileScreen() {
  const { isPremium, refresh } = usePremium();
  const insets = useSafeAreaInsets();
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [name, setName]           = useState('');
  const [deleting, setDeleting]   = useState(false);

  // Keep a ref in sync so the unmount cleanup can save the latest value
  // even if onBlur never fires (e.g. when router.back() unmounts the screen).
  const nameRef = useRef(name);
  useEffect(() => { nameRef.current = name; }, [name]);

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

  async function handleNameDone() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await setProfileName(trimmed);
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
      showDialog(
        'Restore purchases',
        'Available on a device build. Your plan is tied to your app store account and is never lost.',
      );
      return;
    }
    try {
      const premium = await restorePurchases();
      await refresh();
      showDialog(
        premium ? 'Restored' : 'Nothing to restore',
        premium
          ? 'Your subscription is active again.'
          : 'No previous subscription was found for this account.',
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
              'Your account, confessions, and history are deleted from our servers permanently. ' +
              'Purchase records are kept by the app store for billing. This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text:               'Yes, erase everything',
                  style:              'destructive',
                  onPress:            () => runDelete('erase'),
                  keepOpenWhilePending: true,
                },
              ],
            ),
        },
        {
          text:  'Keep confessions, leave anonymously',
          style: 'default',
          onPress: () =>
            showDialog(
              'Leave anonymously?',
              'Your account is deleted. Your confessions stay in the pool with no name attached — ' +
              'truly anonymous. Others can still feel them. This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text:               'Yes, leave anonymously',
                  style:              'destructive',
                  onPress:            () => runDelete('anonymize'),
                  keepOpenWhilePending: true,
                },
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

  if (!personaId) return <View style={{ flex: 1 }} />;

  const persona = getPersonaById(personaId);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={styles.backRow}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Text style={styles.backLabel}>← back</Text>
      </Pressable>
    <ScrollView style={styles.scroller} contentContainerStyle={styles.scroll}>

      {/* Current character + editable name */}
      <View style={styles.identityCard}>
        <PersonaBadge persona={persona} size={64} showName={false} />
        <TextInput
          value={name}
          onChangeText={setName}
          onEndEditing={handleNameDone}
          onBlur={handleNameDone}
          maxLength={32}
          style={[styles.nameInput, { color: persona.colors[0] }]}
          placeholder="your name here"
          placeholderTextColor={color.dim}
          autoCorrect={false}
          accessibilityLabel="Your display name"
          accessibilityHint="Only you see this. Edit it freely."
        />
        <Text style={styles.editHint}>tap the name to edit it</Text>
      </View>

      {/* Premium — reflects live entitlement; opens plans to subscribe/manage */}
      <Pressable
        onPress={() => router.push('/plans')}
        accessibilityRole="button"
        accessibilityLabel={isPremium ? 'Premium active' : 'Go Premium'}
        accessibilityHint={isPremium ? 'Manage your subscription' : 'Unlimited reading across your categories. Opens plans.'}
      >
        <LinearGradient
          colors={GOLD}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.premiumCard}
        >
          <View style={styles.premiumTextWrap}>
            <View style={styles.premiumTopRow}>
              <Text style={styles.premiumStar}>★</Text>
              <Text style={styles.premiumTitle}>{isPremium ? 'Premium active' : 'Go Premium'}</Text>
            </View>
            <Text style={styles.premiumSub}>
              {isPremium ? 'Thank you for holding this place up' : 'Unlimited reading, tuned to you'}
            </Text>
          </View>
          <Text style={styles.premiumArrow}>›</Text>
        </LinearGradient>
      </Pressable>

      {/* Character picker */}
      <Text style={styles.sectionLabel}>choose your character</Text>
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
              accessibilityHint={selected ? 'Currently selected' : 'Select this character'}
              style={[
                styles.gridItem,
                selected && { borderColor: p.colors[0], backgroundColor: p.colors[0] + '14' },
              ]}
            >
              <PersonaBadge persona={p} size={44} showName={false} />
              <Text
                style={[styles.gridName, { color: selected ? p.colors[0] : color.dim }]}
                numberOfLines={1}
              >
                {p.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.privacyNote}>
        Your character is just for you. Confessions you share always appear
        under a random character — never this one, never your name. Nothing
        here leaves your device.
      </Text>

      {/* More */}
      <Text style={styles.sectionLabel}>more</Text>
      <View style={styles.moreList}>
        <TouchableOpacity
          style={styles.moreRow}
          onPress={() => router.push('/my-confessions')}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="My confessions"
          accessibilityHint="See and manage your own confessions"
        >
          <Text style={styles.moreLabel}>My confessions</Text>
          <Text style={styles.moreHint}>what you've shared</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.moreRow}
          onPress={() => router.push('/categories?mode=edit')}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Reading categories"
          accessibilityHint="Edit what kinds of confessions you see"
        >
          <Text style={styles.moreLabel}>Reading categories</Text>
          <Text style={styles.moreHint}>what you want to read</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.moreRow}
          onPress={() => router.push('/explore')}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Explore confessions"
          accessibilityHint="Read personalized confessions from others"
        >
          <Text style={styles.moreLabel}>Explore</Text>
          <Text style={styles.moreHint}>read what others carry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.moreRow}
          onPress={() => router.push('/crisis')}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Support resources"
          accessibilityHint="If tonight is heavy"
        >
          <Text style={styles.moreLabel}>Support resources</Text>
          <Text style={styles.moreHint}>if tonight is heavy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.moreRow}
          onPress={() => router.push('/settings')}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="About and policies"
          accessibilityHint="Privacy and terms"
        >
          <Text style={styles.moreLabel}>About & policies</Text>
          <Text style={styles.moreHint}>privacy, terms</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.moreRow}
          onPress={handleRestorePurchases}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Restore purchases"
          accessibilityHint="After reinstall"
        >
          <Text style={styles.moreLabel}>Restore purchases</Text>
          <Text style={styles.moreHint}>after reinstall</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.moreRow}
          onPress={() => Linking.openURL('mailto:nani.ajay@gmail.com?subject=You%20Are%20Not%20Alone')}
          hitSlop={4}
          accessibilityRole="link"
          accessibilityLabel="Contact support"
          accessibilityHint="Opens your email app"
        >
          <Text style={styles.moreLabel}>Contact support</Text>
          <Text style={styles.moreHint}>we read everything</Text>
        </TouchableOpacity>
      </View>

      {/* Actions */}
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
        accessibilityHint="Permanently erases everything from our servers. Cannot be undone."
      >
        <Text style={[styles.deleteLink, deleting && { opacity: 0.5 }]}>
          {deleting ? 'deleting…' : 'delete my account and confessions'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.version}>
        you're not alone · v{Constants.expoConfig?.version ?? '1.0.0'}
      </Text>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: color.bg,
  },
  backRow: {
    paddingHorizontal: spacing.screenPadding,
    paddingVertical:   14,
  },
  backLabel: {
    fontFamily: fontFamily.sans,
    fontSize:   14,
    color:      color.dim,
  },
  scroller: { flex: 1 },
  scroll: {
    padding:       spacing.screenPadding,
    paddingTop:    8,
    paddingBottom: 32,
    gap:           16,
  },
  identityCard: {
    backgroundColor: color.ink,
    borderRadius:    radius.card,
    padding:         24,
    alignItems:      'center',
    gap:             12,
  },
  nameInput: {
    fontFamily: fontFamily.serifItalic,
    fontSize:   22,
    textAlign:  'center',
    minWidth:   200,
    padding:    4,
  },
  premiumCard: {
    borderRadius:      radius.input,
    paddingVertical:   16,
    paddingHorizontal: 18,
    flexDirection:     'row',
    alignItems:        'center',
  },
  premiumTextWrap: { flex: 1, gap: 3 },
  premiumTopRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           7,
  },
  premiumStar: {
    fontFamily: fontFamily.sansBold,
    fontSize:   14,
    color:      '#3A0A14',
  },
  premiumTitle: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      font.labelSize,
    letterSpacing: font.labelLetterSpacing,
    textTransform: 'uppercase',
    color:         '#3A0A14',
  },
  premiumSub: {
    fontFamily: fontFamily.sans,
    fontSize:   13,
    color:      '#5A1426',
  },
  premiumArrow: {
    fontFamily: fontFamily.serif,
    fontSize:   26,
    color:      '#3A0A14',
  },
  editHint: {
    fontFamily: fontFamily.sans,
    fontSize:   11,
    color:      color.dim,
  },
  sectionLabel: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      font.labelSize,
    letterSpacing: font.labelLetterSpacing,
    textTransform: 'uppercase',
    color:         color.dim,
    marginTop:     8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           10,
  },
  gridItem: {
    width:          '30.5%',
    alignItems:     'center',
    gap:            8,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius:   radius.input,
    borderWidth:    1,
    borderColor:    color.line,
  },
  gridName: {
    fontFamily: fontFamily.sans,
    fontSize:   10,
    textAlign:  'center',
  },
  privacyNote: {
    fontFamily: fontFamily.sans,
    fontSize:   12,
    lineHeight: 18,
    color:      color.dim,
  },
  actions: {
    gap:       12,
    marginTop: 8,
  },
  moreList: {
    backgroundColor: color.ink,
    borderRadius:    radius.input,
    overflow:        'hidden',
  },
  moreRow: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  moreLabel: {
    fontFamily: fontFamily.sans,
    fontSize:   14,
    color:      color.paper,
  },
  moreHint: {
    fontFamily: fontFamily.sans,
    fontSize:   11,
    color:      color.dim,
  },
  deleteRow: {
    alignItems:    'center',
    paddingVertical: 10,
  },
  deleteLink: {
    fontFamily:         fontFamily.sans,
    fontSize:           12,
    color:              '#C25450',
    textDecorationLine: 'underline',
  },
  version: {
    fontFamily: fontFamily.sans,
    fontSize:   11,
    color:      color.dim,
    textAlign:  'center',
    opacity:    0.7,
    marginTop:  4,
  },
});
