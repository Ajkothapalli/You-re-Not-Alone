/**
 * Crisis screen — shown when the submission triggers the crisis check.
 *
 * INVARIANT: no ConfessionCard, no felt counter, no match, no upsell.
 * Per the non-negotiables: never monetize or gamify a crisis moment.
 *
 * No hardcoded region-specific phone numbers — those go stale and create
 * liability. Instead: a clear disclaimer, a reminder to call local
 * emergency services, and one maintained global directory.
 */
import { analytics } from '@/lib/analytics';
import { GhostButton } from '@/components/Buttons';
import { color, fontFamily, font, spacing } from '@/theme/tokens';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function CrisisScreen() {
  useEffect(() => {
    analytics.crisisFlagged();
  }, []);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.heading} accessibilityRole="header">you don't have to carry this alone</Text>

      <Text style={styles.body}>
        What you shared sounds really heavy. Please reach out to someone trained
        to listen — right now, for free. You don't have to explain everything.
      </Text>

      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          soulyap isn't a crisis or emergency service.
        </Text>
        <Text style={styles.disclaimerText}>
          If you're in immediate danger, call your local emergency number.
        </Text>
      </View>

      <View style={styles.linksSection}>
        <Text style={styles.sectionLabel}>find a helpline near you</Text>

        <Pressable
          style={styles.linkCard}
          onPress={() => Linking.openURL('https://findahelpline.com')}
          accessibilityRole="link"
          accessibilityLabel="Find A Helpline — free, confidential helplines in every country"
        >
          <Text style={styles.linkName}>Find A Helpline</Text>
          <Text style={styles.linkUrl}>findahelpline.com</Text>
          <Text style={styles.linkNote}>Free, confidential helplines in every country</Text>
        </Pressable>

        <Pressable
          style={styles.linkCard}
          onPress={() => Linking.openURL('https://www.befrienders.org')}
          accessibilityRole="link"
          accessibilityLabel="Befrienders Worldwide — emotional support helplines worldwide"
        >
          <Text style={styles.linkName}>Befrienders Worldwide</Text>
          <Text style={styles.linkUrl}>befrienders.org</Text>
          <Text style={styles.linkNote}>Emotional support helplines worldwide</Text>
        </Pressable>
      </View>

      <Text style={styles.body}>
        When you're ready, this space is still here for you.
      </Text>

      <GhostButton
        label="I'm okay — go back"
        onPress={() => router.replace('/write')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: color.bg,
  },
  scroll: {
    flexGrow:        1,
    padding:         spacing.screenPadding,
    paddingVertical: 60,
    gap:             24,
  },
  heading: {
    fontFamily: fontFamily.serifItalic,
    fontSize:   26,
    color:      color.paper,
    lineHeight: 36,
  },
  body: {
    fontFamily: fontFamily.sans,
    fontSize:   15,
    color:      color.dim,
    lineHeight: 24,
  },
  disclaimer: {
    borderLeftWidth: 3,
    borderLeftColor: '#F5996E',
    paddingLeft:     14,
    gap:             8,
  },
  disclaimerText: {
    fontFamily: fontFamily.sans,
    fontSize:   14,
    color:      color.dim,
    lineHeight: 21,
  },
  linksSection: {
    gap: 10,
  },
  sectionLabel: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      font.labelSize,
    letterSpacing: font.labelLetterSpacing,
    textTransform: 'uppercase',
    color:         color.dim,
    marginBottom:  4,
  },
  linkCard: {
    backgroundColor: 'rgba(243,238,232,0.05)',
    borderRadius:    12,
    padding:         16,
    gap:             4,
  },
  linkName: {
    fontFamily: fontFamily.sansBold,
    fontSize:   15,
    color:      color.paper,
  },
  linkUrl: {
    fontFamily:         fontFamily.sans,
    fontSize:           15,
    color:              '#6E96FF',
    textDecorationLine: 'underline',
  },
  linkNote: {
    fontFamily: fontFamily.sans,
    fontSize:   13,
    color:      color.dim,
  },
});
