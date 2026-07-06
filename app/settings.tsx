import { deleteAccount, type DeleteMode } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { GhostButton } from '@/components/Buttons';
import { color, font, fontFamily, radius, spacing } from '@/theme/tokens';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { showDialog } from '@/components/AppDialog';

// [REPLACE BEFORE LAUNCH] — Apple and Google require live, publicly accessible
// policy URLs at review time. Placeholder URLs will cause app rejection.
const POLICY_URLS = {
  privacy: 'https://example.com/privacy',
  terms:   'https://example.com/terms',
  content: 'https://example.com/content-policy',
} as const;

export default function SettingsScreen() {
  const [deleting, setDeleting] = useState(false);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  function handleDeletePress() {
    if (deleting) return;
    showDialog(
      'Delete your account?',
      'Choose what happens to your confessions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:    'Erase everything',
          style:   'destructive',
          onPress: () => confirmDelete('erase'),
        },
        {
          text:    'Leave my words anonymously',
          style:   'default',
          onPress: () => confirmDelete('anonymize'),
        },
      ],
    );
  }

  function confirmDelete(mode: DeleteMode) {
    const isErase = mode === 'erase';
    showDialog(
      isErase ? 'Erase everything?' : 'Leave words anonymously?',
      isErase
        ? 'Your account and every confession will be permanently deleted. This cannot be undone.'
        : 'Your account is deleted. Your confessions stay live, unlinked from any identity — forever anonymous.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:              isErase ? 'Yes, erase everything' : 'Yes, leave them',
          style:             'destructive',
          onPress:           () => runDelete(mode),
          keepOpenWhilePending: true,
        },
      ],
    );
  }

  async function runDelete(mode: DeleteMode) {
    setDeleting(true);
    try {
      await deleteAccount(mode);
      router.replace('/');
    } catch {
      setDeleting(false);
      showDialog(
        'Something went wrong',
        'Deletion failed. Please try again, or contact nani.ajay@gmail.com.',
        [{ text: 'OK' }],
      );
    }
  }

  return (
    <View style={styles.root}>
    <ScrollView style={styles.scroller} contentContainerStyle={styles.scroll}>

      {/* Anonymity explainer */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>how your privacy works</Text>
        <Text style={styles.cardBody}>
          Your confessions are never shown with your identity. Other users cannot see who
          wrote what — there are no profiles, no replies, and no way to link a confession
          to a person.
        </Text>
        <Text style={styles.cardBody}>
          Every submission passes through automated safety checks before storage. If you
          describe a crisis, you receive support resources instead — nothing is published.
        </Text>
        <Text style={styles.cardBody}>
          Internally, your confessions are linked to your account for ownership and moderation
          only. This link is severed permanently when you delete your account. See the Privacy
          Policy for full details.
        </Text>
      </View>

      {/* Policy links */}
      <View style={styles.policySection}>
        <Text style={styles.sectionLabel}>policies</Text>
        <TouchableOpacity
          onPress={() => Linking.openURL(POLICY_URLS.privacy)}
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel="Privacy Policy"
          accessibilityHint="Opens in your browser"
        >
          <Text style={styles.policyLink}>Privacy Policy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => Linking.openURL(POLICY_URLS.terms)}
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel="Terms of Service"
          accessibilityHint="Opens in your browser"
        >
          <Text style={styles.policyLink}>Terms of Service</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => Linking.openURL(POLICY_URLS.content)}
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel="Content Policy"
          accessibilityHint="Opens in your browser"
        >
          <Text style={styles.policyLink}>Content Policy</Text>
        </TouchableOpacity>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <GhostButton label="Sign out" onPress={handleSignOut} />
      </View>

      {/* Account deletion — Apple guideline 5.1.1(v) */}
      <TouchableOpacity
        onPress={handleDeletePress}
        disabled={deleting}
        hitSlop={12}
        style={styles.deleteRow}
        accessibilityRole="button"
        accessibilityState={{ disabled: deleting, busy: deleting }}
        accessibilityLabel="Delete account"
        accessibilityHint="Choose to erase everything or leave your words anonymously."
      >
        <Text style={[styles.deleteLink, deleting && styles.deleteLinkMuted]}>
          {deleting ? 'deleting…' : 'delete account'}
        </Text>
      </TouchableOpacity>

    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: color.bg,
  },
  scroller: { flex: 1 },
  scroll: {
    padding:       spacing.screenPadding,
    paddingTop:    20,
    paddingBottom: 24,
    gap:           24,
  },
  card: {
    backgroundColor: '#1A1720',
    borderRadius:    radius.input,
    padding:         20,
    gap:             12,
  },
  cardLabel: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      font.labelSize,
    letterSpacing: font.labelLetterSpacing,
    textTransform: 'uppercase',
    color:         color.dim,
    marginBottom:  2,
  },
  cardBody: {
    fontFamily: fontFamily.sans,
    fontSize:   15,
    color:      color.paper,
    lineHeight: 23,
  },
  policySection: {
    gap: 10,
  },
  sectionLabel: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      font.labelSize,
    letterSpacing: font.labelLetterSpacing,
    textTransform: 'uppercase',
    color:         color.dim,
    marginBottom:  2,
  },
  policyLink: {
    fontFamily:          fontFamily.sans,
    fontSize:            15,
    color:               color.paper,
    textDecorationLine:  'underline',
    textDecorationColor: 'rgba(243,238,232,0.35)',
  },
  actions: {
    gap: 12,
  },
  deleteRow: {
    alignItems: 'center',
    paddingTop: 8,
  },
  deleteLink: {
    fontFamily:         fontFamily.sans,
    fontSize:           13,
    color:              '#B85555',
    textDecorationLine: 'underline',
  },
  deleteLinkMuted: {
    opacity: 0.45,
  },
});
