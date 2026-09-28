/**
 * The invite that arrives at the right moment: after a reader has felt three
 * confessions about the same thing.
 *
 * Deliberately smaller than WriteInviteCard — no illustration, two short lines.
 * It sits BETWEEN confessions in a feed someone is already reading, and the
 * full card at this position reads as an advert dropped into the middle of
 * other people's grief. The generic card earns its size at the end of the feed,
 * where the reading has stopped; this one has to be a passing offer.
 *
 * Both actions end the asking for the session (see lib/writeInvite.ts) — "Not
 * now" is a real answer, not a snooze.
 */

import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, font, fontFamily, radius, spacing } from '@/theme/tokens';
import { analytics } from '@/lib/analytics';
import { markInviteSeen, type TargetedInvite } from '@/lib/writeInvite';

interface Props {
  invite:    TargetedInvite;
  onAccept:  (invite: TargetedInvite) => void;
  onDismiss: () => void;
}

export default function TargetedWriteInvite({ invite, onAccept, onDismiss }: Props) {
  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);

  useEffect(() => {
    analytics.writeInviteShown('targeted');
  }, []);

  return (
    <View style={styles.wrap} testID="targeted-write-invite">
      <Text style={styles.heading} accessibilityRole="header">
        Say yours about {invite.label}?
      </Text>

      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            analytics.writeInviteTapped('targeted');
            onAccept(invite);
          }}
          hitSlop={6}
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Write about ${invite.label}, starting with: ${invite.starter}`}
        >
          <Text style={styles.chipLabel} numberOfLines={1}>{invite.starter}</Text>
        </Pressable>

        <Pressable
          onPress={onDismiss}
          hitSlop={10}
          style={({ pressed }) => pressed && styles.pressed}
          accessibilityRole="button"
          accessibilityLabel="Not now"
        >
          <Text style={styles.dismiss}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    wrap: {
      marginHorizontal: spacing.screenPadding,
      paddingVertical:  16,
      paddingHorizontal: 18,
      borderRadius:     radius.card,
      borderWidth:      StyleSheet.hairlineWidth,
      borderColor:      color.line,
      backgroundColor:  color.ink,
      gap:              12,
    },
    heading: {
      fontFamily: fontFamily.serif,
      fontSize:   17,
      color:      color.paper,
    },
    actions: {
      flexDirection: 'row',
      alignItems:    'center',
      flexWrap:      'wrap',
      gap:           12,
    },
    chip: {
      paddingVertical:   8,
      paddingHorizontal: 14,
      borderRadius:      radius.pill,
      borderWidth:       StyleSheet.hairlineWidth,
      borderColor:       color.border,
      flexShrink:        1,
    },
    chipLabel: {
      fontFamily: fontFamily.serif,
      fontSize:   15,
      color:      color.paper,
    },
    dismiss: {
      fontFamily:    fontFamily.sans,
      fontSize:      font.labelSize,
      letterSpacing: font.labelLetterSpacing,
      textTransform: 'uppercase',
      color:         color.dim,
    },
    pressed: { opacity: 0.6 },
  });
}

/**
 * Fires one `write_invite_shown` for a placement, once per session.
 *
 * A component rather than a call in the middle of JSX: an impression is a
 * side-effect, and a side-effect evaluated during render runs again on every
 * re-render and on React's double-invoked renders in development. useEffect is
 * the only place it counts once.
 */
export function InviteImpression({ kind }: { kind: 'interstitial' | 'footer' }) {
  useEffect(() => {
    if (markInviteSeen(kind)) analytics.writeInviteShown(kind);
  }, [kind]);
  return null;
}
