import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily, spacing } from '@/theme/tokens';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PolicyScreen() {
  const { type } = useLocalSearchParams<{ type: 'terms' | 'privacy' }>();
  const color   = useThemeColors();
  const styles  = useMemo(() => createStyles(color), [color]);
  const insets  = useSafeAreaInsets();
  const isTerms = type === 'terms';

  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={[styles.scroll, { paddingBottom: 48 + insets.bottom }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.heading} accessibilityRole="header">
        {isTerms ? 'Terms of Service' : 'Privacy Policy'}
      </Text>

      {isTerms ? (
        <>
          <Text style={styles.section}>How soulyap works</Text>
          <Text style={styles.body}>
            soulyap is a space to share what you carry — anonymously, safely, and without judgment.
            By using the app you agree to the following.
          </Text>

          <Text style={styles.section}>Who can use it</Text>
          <Text style={styles.body}>
            You must be 18 or older. Age is verified once at sign-up and never stored beyond
            what is needed to confirm eligibility.
          </Text>

          <Text style={styles.section}>What you agree to</Text>
          <Text style={styles.body}>
            {'• Share only content you wrote or have the right to share.\n'}
            {'• Not submit content that is illegal, threatening, abusive, or harmful to others.\n'}
            {'• Not attempt to identify, contact, or target other users.\n'}
            {'• Not use the app to distribute spam, malware, or commercial solicitations.'}
          </Text>

          <Text style={styles.section}>Content & moderation</Text>
          <Text style={styles.body}>
            All submissions pass through automated safety checks before anything is stored or shown.
            We reserve the right to remove content or suspend accounts that violate these terms
            without prior notice.
          </Text>

          <Text style={styles.section}>Changes</Text>
          <Text style={styles.body}>
            These terms will be finalised and published at soulyap.com before public launch.
            Continued use of the app after changes constitutes acceptance.
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.section}>What we collect</Text>
          <Text style={styles.body}>
            {'• Your email address — used only to sign you in.\n'}
            {'• Your date of birth — verified once to confirm you are 18+, then used only for compliance.\n'}
            {'• Confession text — submitted anonymously; never linked to your name or profile.'}
          </Text>

          <Text style={styles.section}>Your anonymity</Text>
          <Text style={styles.body}>
            Every confession carries a random persona, not your name or account. There are no
            public profiles, no replies, and no direct messages. No one — including other users
            or our team — can trace a confession back to you from what they see in the app.
          </Text>

          <Text style={styles.section}>What we don't do</Text>
          <Text style={styles.body}>
            {'• We do not sell your data.\n'}
            {'• We do not show ads.\n'}
            {'• We do not share your identity with third parties.\n'}
            {'• We do not store your email alongside your confessions.'}
          </Text>

          <Text style={styles.section}>Deletion</Text>
          <Text style={styles.body}>
            Deleting your account permanently removes or unlinks all confessions you submitted.
            You can request full deletion from the Settings screen.
          </Text>

          <Text style={styles.section}>Full policy</Text>
          <Text style={styles.body}>
            A complete privacy policy will be published at soulyap.com before public launch.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    fill: {
      flex:            1,
      backgroundColor: color.bg,
    },
    scroll: {
      padding:    spacing.screenPadding,
      paddingTop: 20,
      gap:        6,
    },
    heading: {
      fontFamily:   fontFamily.sansBold,
      fontSize:     27,
      color:        color.paper,
      lineHeight:   36,
      marginBottom: 8,
    },
    section: {
      fontFamily: fontFamily.sansBold,
      fontSize:   15,
      color:      color.paper,
      marginTop:  16,
      marginBottom: 4,
    },
    body: {
      fontFamily: fontFamily.sans,
      fontSize:   14,
      lineHeight: 22,
      color:      color.dim,
    },
  });
}
