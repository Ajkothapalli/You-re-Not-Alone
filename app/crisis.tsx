/**
 * Crisis screen — shown when the submission triggers the crisis check.
 *
 * INVARIANT: no ConfessionCard, no felt counter, no match, no upsell.
 * Per the non-negotiables: never monetize or gamify a crisis moment.
 *
 * Resources last verified: 2026-06-14
 */
import { analytics } from '@/lib/analytics';
import { GhostButton } from '@/components/Buttons';
import { color, fontFamily, font, radius, spacing } from '@/theme/tokens';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface Resource {
  name:   string;
  label:  string;
  uri:    string;
  note?:  string;
}

const RESOURCES: Resource[] = [
  {
    name:  'iCall',
    label: '9152987821',
    uri:   'tel:9152987821',
    note:  'Mon–Sat, 8 am–10 pm IST',
  },
  {
    name:  'Vandrevala Foundation',
    label: '1860-2662-345',
    uri:   'tel:18602662345',
    note:  '24/7',
  },
  {
    name:  'Crisis Text Line',
    label: 'Text HOME to 741741',
    uri:   'sms:741741?body=HOME',
    note:  '24/7 · Free',
  },
  {
    name:  'Befrienders Worldwide',
    label: 'befrienders.org',
    uri:   'https://www.befrienders.org',
    note:  'Find a helpline near you',
  },
];

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
        What you shared sounds really heavy. There are people trained to listen — right now, for
        free. You don't have to explain everything. Just say you need someone to talk to.
      </Text>

      <View style={styles.resourceList}>
        <Text style={styles.sectionLabel}>reach out</Text>
        {RESOURCES.map((r) => (
          <Pressable
            key={r.name}
            style={styles.resourceCard}
            onPress={() => Linking.openURL(r.uri)}
            accessibilityRole="link"
            accessibilityLabel={`${r.name}: ${r.label}${r.note ? `, ${r.note}` : ''}`}
          >
            <Text style={styles.resourceName}>{r.name}</Text>
            <Text style={styles.resourceAction}>{r.label}</Text>
            {r.note && <Text style={styles.resourceNote}>{r.note}</Text>}
          </Pressable>
        ))}
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
  sectionLabel: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      font.labelSize,
    letterSpacing: font.labelLetterSpacing,
    textTransform: 'uppercase',
    color:         color.dim,
    marginBottom:  4,
  },
  resourceList: {
    gap: 10,
  },
  resourceCard: {
    backgroundColor: 'rgba(243,238,232,0.05)',
    borderRadius:    radius.input,
    padding:         16,
    gap:             4,
  },
  resourceName: {
    fontFamily: fontFamily.sansBold,
    fontSize:   15,
    color:      color.paper,
  },
  resourceAction: {
    fontFamily:         fontFamily.sans,
    fontSize:           15,
    color:              '#6E96FF',
    textDecorationLine: 'underline',
  },
  resourceNote: {
    fontFamily: fontFamily.sans,
    fontSize:   13,
    color:      color.dim,
  },
});
