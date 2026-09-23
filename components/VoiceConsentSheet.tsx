/**
 * The consent a writer gives before their first recording.
 *
 * Owner decision 2026-09-23 (CLAUDE.md invariant 3): voice is RAW. This sheet
 * is the whole of the mitigation, so its construction is deliberate:
 *
 *   - The sentence is the HEADING, not body text. It is the first thing read,
 *     at the largest size on the screen.
 *   - The accept button is NOT the default-styled primary. A writer must not be
 *     able to dismiss this the way they dismiss every other sheet — by tapping
 *     the bright thing without reading.
 *   - "Type instead" is equally prominent, because it is an equally good
 *     answer and the flow should not imply otherwise.
 *   - No "Learn more", no link, no pre-tick. Everything that matters is on
 *     this screen.
 *
 * Someone confessing about an abusive partner needs this in the moment. A
 * policy page they will never open is not consent.
 */

import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { VOICE_CONSENT_LINE, VOICE_CONSENT_POINTS } from '@/lib/voiceConsent';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily, radius, spacing } from '@/theme/tokens';

export interface VoiceConsentSheetProps {
  visible:  boolean;
  onAccept: () => void;
  onCancel: () => void;
}

export default function VoiceConsentSheet({ visible, onAccept, onCancel }: VoiceConsentSheetProps) {
  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Hardware back must not count as consent.
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="voice-consent-sheet">
          <Text style={styles.heading} accessibilityRole="header">
            {VOICE_CONSENT_LINE}
          </Text>

          <View style={styles.points}>
            {VOICE_CONSENT_POINTS.map((p) => (
              <View key={p} style={styles.pointRow}>
                <Text style={styles.bullet}>·</Text>
                <Text style={styles.pointText}>{p}</Text>
              </View>
            ))}
          </View>

          {/* Order matters: typing is offered first and styled equally. The
              recording option is not the visually dominant choice. */}
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [styles.btn, styles.btnQuiet, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Type instead"
            testID="voice-consent-decline"
          >
            <Text style={styles.btnQuietText}>Type instead</Text>
          </Pressable>

          <Pressable
            onPress={onAccept}
            style={({ pressed }) => [styles.btn, styles.btnAccept, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="I understand — record my voice"
            testID="voice-consent-accept"
          >
            <Text style={styles.btnAcceptText}>I understand — record my voice</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    backdrop: {
      flex:            1,
      backgroundColor: 'rgba(0,0,0,0.62)',
      justifyContent:  'center',
      padding:         spacing.screenPadding,
    },
    sheet: {
      backgroundColor: color.ink,
      borderRadius:    radius.card,
      borderWidth:     2,
      borderColor:     color.border,
      padding:         24,
      gap:             18,
    },
    heading: {
      fontFamily: fontFamily.sansBold,
      fontSize:   23,
      lineHeight: 31,
      color:      color.paper,
    },
    points: { gap: 12 },
    pointRow: {
      flexDirection: 'row',
      gap:           10,
      alignItems:    'flex-start',
    },
    bullet: {
      fontFamily: fontFamily.sansBold,
      fontSize:   16,
      lineHeight: 21,
      color:      color.dim,
    },
    pointText: {
      flex:       1,
      fontFamily: fontFamily.sans,
      fontSize:   14,
      lineHeight: 21,
      color:      color.dim,
    },
    btn: {
      borderRadius:    radius.pill,
      borderWidth:     2,
      borderColor:     color.border,
      paddingVertical: 14,
      alignItems:      'center',
    },
    // Both buttons are outlined. Neither is the bright, thoughtless tap.
    btnQuiet:     { backgroundColor: 'transparent' },
    btnAccept:    { backgroundColor: 'transparent' },
    pressed:      { opacity: 0.7 },
    btnQuietText: {
      fontFamily: fontFamily.sansBold,
      fontSize:   14,
      color:      color.paper,
    },
    btnAcceptText: {
      fontFamily: fontFamily.sansBold,
      fontSize:   14,
      color:      color.paper,
    },
  });
}
