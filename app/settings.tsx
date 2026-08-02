import { supabase } from '@/lib/supabase';
import { GhostButton } from '@/components/Buttons';
import { ScrawlIcon } from '@/components/ScrawlIcon';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, font, fontFamily, radius, spacing } from '@/theme/tokens';
import { router } from 'expo-router';
import { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SHADOW = 4;

const POLICY_ROUTES = [
  { label: 'Privacy Policy',   type: 'privacy'  },
  { label: 'Terms of Service', type: 'terms'    },
  { label: 'Content Policy',   type: 'content'  },
] as const;

const PRIVACY_POINTS = [
  'No profiles, no replies. Nobody can see who wrote what.',
  'Every submission is checked before it goes live. Crisis signals return support resources — nothing is published.',
  'Your account link is severed permanently if you delete your account.',
] as const;

export default function SettingsScreen() {
  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);
  const insets = useSafeAreaInsets();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={[styles.scroll, { paddingBottom: 40 + insets.bottom }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Text style={styles.heading}>Privacy & policies</Text>
      <Text style={styles.sub}>How your information works in this app.</Text>

      {/* Privacy card */}
      <View style={styles.cardOuter}>
        <View pointerEvents="none" style={styles.cardShadow} />
        <View style={styles.card}>
          <Text style={styles.cardLabel}>How your privacy works</Text>
          {PRIVACY_POINTS.map((point, i) => (
            <View key={i} style={styles.bullet}>
              <Text style={styles.bulletDot}>·</Text>
              <Text style={styles.bulletText}>{point}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Policies */}
      <Text style={styles.sectionLabel}>Policies</Text>
      <View style={styles.policyCard}>
        {POLICY_ROUTES.map(({ label, type }, i, arr) => (
          <TouchableOpacity
            key={label}
            onPress={() => router.push({ pathname: '/policy', params: { type } })}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel={label}
            style={[styles.policyRow, i < arr.length - 1 && styles.policyRowBorder]}
          >
            <Text style={styles.policyLink}>{label}</Text>
            <ScrawlIcon name="arrow_right" size={16} color={color.dim} roughen={false} strokeWidth={2.5} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Sign out */}
      <View style={styles.actions}>
        <GhostButton label="Sign out" onPress={handleSignOut} />
      </View>
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
      gap:        20,
    },

    // Header
    heading: {
      fontFamily: fontFamily.sansBold,
      fontSize:   26,
      color:      color.paper,
      lineHeight: 34,
    },
    sub: {
      fontFamily: fontFamily.sans,
      fontSize:   14,
      color:      color.dim,
      lineHeight: 21,
      marginTop:  -8,
    },

    // Privacy card
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
      borderRadius:    radius.input,
      backgroundColor: color.border,
    },
    card: {
      backgroundColor: color.ink,
      borderRadius:    radius.input,
      borderWidth:     2,
      borderColor:     color.border,
      padding:         20,
      gap:             12,
    },
    cardLabel: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      font.labelSize,
      letterSpacing: font.labelLetterSpacing,
      textTransform: 'uppercase',
      color:         color.dim,
      marginBottom:  4,
    },
    bullet: {
      flexDirection: 'row',
      gap:           10,
      alignItems:    'flex-start',
    },
    bulletDot: {
      fontFamily: fontFamily.sansBold,
      fontSize:   16,
      color:      color.dim,
      lineHeight: 20,
    },
    bulletText: {
      flex:       1,
      fontFamily: fontFamily.sans,
      fontSize:   13,
      color:      color.paper,
      lineHeight: 20,
    },

    // Section label
    sectionLabel: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      font.labelSize,
      letterSpacing: font.labelLetterSpacing,
      textTransform: 'uppercase',
      color:         color.dim,
      marginBottom:  -8,
    },

    // Policy card
    policyCard: {
      backgroundColor: color.ink,
      borderRadius:    radius.input,
      borderWidth:     2,
      borderColor:     color.border,
      overflow:        'hidden',
    },
    policyRow: {
      flexDirection:     'row',
      justifyContent:    'space-between',
      alignItems:        'center',
      paddingHorizontal: 18,
      paddingVertical:   16,
    },
    policyRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: color.border + '28',
    },
    policyLink: {
      fontFamily: fontFamily.sans,
      fontSize:   15,
      color:      color.paper,
    },
    policyArrow: {
      fontFamily: fontFamily.sans,
      fontSize:   15,
      color:      color.dim,
    },

    // Sign out
    actions: {
      gap: 12,
    },
  });
}
