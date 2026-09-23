import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily, spacing } from '@/theme/tokens';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PolicyScreen() {
  const { type } = useLocalSearchParams<{ type: 'terms' | 'privacy' | 'content' }>();
  const color   = useThemeColors();
  const styles  = useMemo(() => createStyles(color), [color]);
  const insets  = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={[styles.scroll, { paddingBottom: 48 + insets.bottom }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.heading} accessibilityRole="header">
        {type === 'terms' ? 'Terms of Service' : type === 'content' ? 'Content Policy' : 'Privacy Policy'}
      </Text>

      {type === 'content' ? (
        <>
          <Text style={styles.section}>What you can share</Text>
          <Text style={styles.body}>
            soulyap is a space for honest, personal expression. You may share thoughts, feelings,
            and experiences that you carry privately — things that are real and your own.
          </Text>

          <Text style={styles.section}>What is not allowed</Text>
          <Text style={styles.body}>
            {'• Content that targets, identifies, or threatens any person.\n'}
            {'• Hate speech, slurs, or content designed to demean a group.\n'}
            {'• Graphic violence or self-harm instructions.\n'}
            {'• Spam, advertising, or content you did not write.\n'}
            {'• Any content involving minors in a sexual or exploitative context.\n'}
            {'• Illegal content of any kind.'}
          </Text>

          <Text style={styles.section}>Moderation</Text>
          <Text style={styles.body}>
            Every submission is reviewed by automated safety systems before it is stored or shown
            to anyone. Content that violates this policy is blocked immediately. Repeated violations
            may result in account suspension.
          </Text>

          <Text style={styles.section}>Crisis content</Text>
          <Text style={styles.body}>
            Submissions that signal a mental health crisis are never published. Instead, the app
            returns crisis support resources. This is intentional and permanent.
          </Text>

          <Text style={styles.section}>Reporting</Text>
          <Text style={styles.body}>
            Every confession you read has a report control. We review all reports and act on
            violations within 24 hours.
          </Text>
        </>
      ) : type === 'terms' ? (

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
            {'• Confession text — submitted anonymously; never linked to your name or profile.\n'}
            {'• Voice recordings — only if you choose to record one instead of typing. Stored privately and played back exactly as you said it.'}
          </Text>

          <Text style={styles.section}>Your anonymity</Text>
          <Text style={styles.body}>
            Every confession carries a random persona, not your name or account. There are no
            public profiles, no replies, and no direct messages. Nothing we show alongside a
            written confession can be traced back to you.
          </Text>

          {/* This section exists because the sentence above used to end "no one
              can trace a confession back to you", full stop — which stopped
              being true the moment raw voice shipped (owner decision
              2026-09-23). A privacy policy that overstates anonymity is worse
              than one that says nothing: it is the document someone relies on
              when deciding whether it is safe to speak. */}
          <Text style={styles.section}>Voice recordings</Text>
          <Text style={styles.body}>
            A recording is different, and you should decide about it differently.
            {'\n\n'}
            Your voice is not disguised or altered. People who know you may recognise it.
            That is true however carefully we protect the file, because the thing that
            identifies you is the recording itself.
            {'\n\n'}
            {'• Recordings are stored privately and are never public or shareable by link.\n'}
            {'• Shared cards never include audio — only text.\n'}
            {'• A written transcript is always shown, so your confession can be read without playing it.\n'}
            {'• Deleting the confession, or your account, deletes the recording itself.\n'}
            {'• We may keep a recording that has been reported, so a human can review it.'}
            {'\n\n'}
            Voice recordings may be treated as personal data of a sensitive kind under laws
            including the GDPR and India's DPDP Act. You never have to record one — typing is
            always available and is treated exactly the same everywhere else in the app.
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
            Deleting your account permanently removes or unlinks all confessions you submitted,
            and deletes any voice recordings with them. If you choose to keep your confessions
            in the pool but unlink them from you, recordings are deleted rather than kept —
            a voice cannot be made anonymous.
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
