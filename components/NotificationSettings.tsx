/**
 * [N1] Settings → Notifications.
 *
 * Five switches, and one of them is not really a switch: the master. It
 * behaves differently depending on what the OS currently thinks, and
 * getting that wrong is how a settings screen ends up lying to somebody.
 *
 *   undetermined → the master runs the SAME flow as the card's primary
 *                  button (dialog, token, toast), with no card. This is the
 *                  second and last place allowed to trigger the dialog.
 *   granted      → the master registers/removes the token.
 *   blocked      → nothing here can help. The row becomes a line of text
 *                  and a button that opens the phone's own settings,
 *                  because a toggle that silently does nothing is worse
 *                  than no toggle.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { GhostButton } from '@/components/Buttons';
import { showToast } from '@/components/Toast';
import { analytics } from '@/lib/analytics';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, font, fontFamily, spacing } from '@/theme/tokens';
import { currentPermission, requestAndRegister, existingToken } from '@/lib/pushPermission';
import {
  registerPushToken, unregisterPushToken, updatePushPrefs, type PushPrefs,
} from '@/lib/pushRegistration';
import { TOAST_GRANTED, TOAST_DENIED } from '@/components/PushAskCard';
import type { PermissionState } from '@/lib/pushAsk';

/**
 * The OS has blocked us and will not ask again. Exact wording, per §4d.
 */
export const BLOCKED_LINE = 'Notifications are off for soulyap in your phone settings.';

const DEFAULTS: PushPrefs = {
  felt_on: true, question_on: true, quiet_hours: true, discreet: false,
};

export default function NotificationSettings() {
  const color  = useThemeColors();
  const styles = React.useMemo(() => createStyles(color), [color]);

  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [on, setOn]                 = useState(false);
  const [prefs, setPrefs]           = useState<PushPrefs>(DEFAULTS);
  const [busy, setBusy]             = useState(false);

  useEffect(() => {
    // Reads only. Never prompts — see currentPermission.
    void (async () => {
      const p = await currentPermission();
      setPermission(p);
      setOn(p === 'granted');
    })();
  }, []);

  const setPref = useCallback(async (key: keyof PushPrefs, value: boolean) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));   // optimistic
    analytics.pushPrefsChanged(key);
    const ok = await updatePushPrefs({ [key]: value } as Partial<PushPrefs>);
    if (!ok) {
      // Put it back rather than leaving the switch lying about the server.
      setPrefs((prev) => ({ ...prev, [key]: !value }));
      showToast('Could not save that. Check your connection.', 'error');
    }
  }, []);

  const toggleMaster = useCallback(async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    analytics.pushPrefsChanged('master');
    try {
      if (!next) {
        // Off removes the token. A flag would leave a live registration on
        // a device belonging to somebody who has said no.
        const token = await existingToken();
        if (token) await unregisterPushToken(token);
        await updatePushPrefs({ master: false });
        setOn(false);
        return;
      }

      if (permission === 'granted') {
        const token = await existingToken();
        if (token) await registerPushToken(token);
        setOn(true);
        return;
      }

      // The same flow as the card's primary button, with no card — this is
      // the second and last caller allowed to show the dialog.
      const res = await requestAndRegister();
      analytics.pushPermission('settings', res.granted ? 'granted' : 'denied');
      if (res.granted && res.token) {
        await registerPushToken(res.token);
        setOn(true);
        setPermission('granted');
        showToast(TOAST_GRANTED);
      } else {
        setOn(false);
        setPermission(await currentPermission());
        showToast(TOAST_DENIED);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, permission]);

  // ── The OS has shut the door ───────────────────────────────────────────────
  if (permission === 'blocked') {
    return (
      <View style={styles.block} testID="push-settings-blocked">
        <Text style={styles.sectionLabel}>Notifications</Text>
        <Text style={styles.blockedLine}>{BLOCKED_LINE}</Text>
        <GhostButton
          label="Open settings"
          onPress={() => { void Linking.openSettings(); }}
        />
      </View>
    );
  }

  return (
    <View style={styles.block} testID="push-settings">
      <Text style={styles.sectionLabel}>Notifications</Text>

      <Row
        label="Notifications"
        hint="Two things only: when someone feels your words, and Monday’s question."
        value={on}
        onChange={toggleMaster}
        disabled={busy}
        styles={styles}
        color={color}
        testID="push-master"
      />

      {on && (
        <>
          <Row
            label="Felt"
            hint="When someone feels what you wrote."
            value={prefs.felt_on}
            onChange={(v) => void setPref('felt_on', v)}
            styles={styles} color={color} testID="push-felt"
          />
          <Row
            label="Weekly question"
            hint="Monday evening, one question for everyone."
            value={prefs.question_on}
            onChange={(v) => void setPref('question_on', v)}
            styles={styles} color={color} testID="push-question"
          />
          <Row
            label="Quiet hours"
            hint="Nothing between 10pm and 8am. Anything waiting arrives in the morning."
            value={prefs.quiet_hours}
            onChange={(v) => void setPref('quiet_hours', v)}
            styles={styles} color={color} testID="push-quiet"
          />
          <Row
            label="Discreet"
            hint="Shows “Something new for you” instead of any detail."
            value={prefs.discreet}
            onChange={(v) => void setPref('discreet', v)}
            styles={styles} color={color} testID="push-discreet"
          />
        </>
      )}
    </View>
  );
}

function Row({
  label, hint, value, onChange, disabled, styles, color, testID,
}: {
  label: string; hint: string; value: boolean;
  onChange: (v: boolean) => void; disabled?: boolean;
  styles: ReturnType<typeof createStyles>; color: ColorSet; testID: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        accessibilityHint={hint}
        trackColor={{ false: color.border, true: color.accent }}
        testID={testID}
      />
    </View>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    block: { gap: 10, marginTop: 24 },
    sectionLabel: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      font.labelSize,
      letterSpacing: font.labelLetterSpacing,
      textTransform: 'uppercase',
      color:         color.dim,
    },
    row: {
      flexDirection:  'row',
      alignItems:     'center',
      justifyContent: 'space-between',
      gap:            14,
      paddingVertical: 8,
    },
    rowText:  { flex: 1, gap: 2 },
    rowLabel: { fontFamily: fontFamily.sansBold, fontSize: 15, color: color.paper },
    rowHint:  { fontFamily: fontFamily.sans, fontSize: 12, lineHeight: 17, color: color.dim },
    blockedLine: {
      fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 20, color: color.paper,
    },
  });
}
