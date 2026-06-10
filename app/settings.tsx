import { deleteAccount } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { GhostButton } from '@/components/Buttons';
import { color, font, fontFamily, radius, spacing } from '@/theme/tokens';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

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
    Alert.alert(
      'Delete your account?',
      'This permanently removes your account and all your confessions. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: handleDeleteConfirm },
      ],
    );
  }

  function handleDeleteConfirm() {
    Alert.alert(
      'Are you sure?',
      'This is your last chance. Your account and all your confessions will be gone forever.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete everything', style: 'destructive', onPress: runDelete },
      ],
    );
  }

  async function runDelete() {
    setDeleting(true);
    try {
      await deleteAccount();
      router.replace('/');
    } catch (err: any) {
      setDeleting(false);
      Alert.alert(
        'Something went wrong',
        'Deletion failed. Please try again, or contact support@example.com.',
        [{ text: 'OK' }],
      );
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <Text style={styles.heading}>about this place</Text>

      {/* Anonymity explainer */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>how your privacy works</Text>
        <Text style={styles.cardBody}>
          Your confessions are stored without your account attached to them. There are no
          profiles, no replies, and no way for other users to identify who wrote what.
        </Text>
        <Text style={styles.cardBody}>
          Every submission passes through automated safety checks before storage. If you
          describe a crisis, you receive support resources instead — nothing is published.
        </Text>
        <Text style={styles.cardBody}>
          Full anonymity cannot be guaranteed. The operator can re-derive a link between an
          account and its confessions using a private server-side secret. This is disclosed
          in the Privacy Policy.
        </Text>
      </View>

      {/* Policy links */}
      <View style={styles.policySection}>
        <Text style={styles.sectionLabel}>policies</Text>
        <TouchableOpacity onPress={() => Linking.openURL(POLICY_URLS.privacy)} hitSlop={8}>
          <Text style={styles.policyLink}>Privacy Policy</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openURL(POLICY_URLS.terms)} hitSlop={8}>
          <Text style={styles.policyLink}>Terms of Service</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openURL(POLICY_URLS.content)} hitSlop={8}>
          <Text style={styles.policyLink}>Content Policy</Text>
        </TouchableOpacity>
      </View>

      {/* Navigation */}
      <View style={styles.actions}>
        <GhostButton label="Back"     onPress={() => router.back()} />
        <GhostButton label="Sign out" onPress={handleSignOut} />
      </View>

      {/* Account deletion — Apple guideline 5.1.1(v) */}
      <TouchableOpacity
        onPress={handleDeletePress}
        disabled={deleting}
        hitSlop={12}
        style={styles.deleteRow}
      >
        <Text style={[styles.deleteLink, deleting && styles.deleteLinkMuted]}>
          {deleting ? 'deleting…' : 'delete my account and confessions'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: color.ink,
  },
  scroll: {
    padding:        spacing.screenPadding,
    paddingTop:     60,
    paddingBottom:  48,
    gap:            24,
  },
  heading: {
    fontFamily: fontFamily.serifItalic,
    fontSize:   26,
    color:      color.paper,
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
