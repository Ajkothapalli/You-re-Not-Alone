import { useReducedMotion } from '@/lib/a11y';
import { SPRING } from '@/theme/motion';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily, radius } from '@/theme/tokens';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export type DialogButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void | Promise<void>;
  keepOpenWhilePending?: boolean;
};

type DialogSpec = {
  title:      string;
  message?:   string;
  buttons:    DialogButton[];
  cancelable: boolean;
};

const SHAD = 4;

const queue: DialogSpec[] = [];
let listener: ((q: DialogSpec[]) => void) | null = null;

function enqueue(spec: DialogSpec) {
  queue.push(spec);
  listener?.([...queue]);
}

function dequeue() {
  queue.shift();
  listener?.([...queue]);
}

/** For testing only — resets module-level queue state. */
export function _resetDialogQueue(): void {
  queue.length = 0;
  listener = null;
}

export function showDialog(
  title:    string,
  message?: string,
  buttons?: DialogButton[],
  options?: { cancelable?: boolean },
): void {
  enqueue({
    title,
    message,
    buttons:   buttons && buttons.length > 0 ? buttons : [{ text: 'OK', style: 'default' }],
    cancelable: options?.cancelable !== false,
  });
}

export function DialogHost(): React.ReactElement {
  const color   = useThemeColors();
  const styles  = useMemo(() => createStyles(color), [color]);
  const reduced = useReducedMotion();

  const [currentQueue, setCurrentQueue] = useState<DialogSpec[]>([...queue]);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);

  const scaleAnim = useRef(new Animated.Value(reduced ? 1 : 0.92)).current;
  const animating = useRef(false);

  useEffect(() => {
    listener = setCurrentQueue;
    return () => { listener = null; };
  }, []);

  const current = currentQueue[0] ?? null;
  const visible = current !== null;

  useEffect(() => {
    if (visible && !reduced && !animating.current) {
      animating.current = true;
      scaleAnim.setValue(0.92);
      Animated.spring(scaleAnim, {
        toValue: 1, useNativeDriver: true, ...SPRING.pop,
      }).start(() => { animating.current = false; });
    }
    if (!visible) {
      scaleAnim.setValue(reduced ? 1 : 0.92);
      animating.current = false;
    }
  }, [visible, current?.title]);

  useEffect(() => {
    if (visible && current) {
      AccessibilityInfo.announceForAccessibility(current.title);
    }
    setPendingIndex(null);
  }, [current?.title]);

  function dismiss() {
    setPendingIndex(null);
    dequeue();
  }

  function handleBack() {
    if (current?.cancelable) dismiss();
  }

  function handleScrimPress() {
    if (current?.cancelable) dismiss();
  }

  async function handleButtonPress(btn: DialogButton, index: number) {
    if (pendingIndex !== null) return;

    if (btn.keepOpenWhilePending && btn.onPress) {
      setPendingIndex(index);
      try {
        await btn.onPress();
      } finally {
        dismiss();
      }
    } else {
      dismiss();
      btn.onPress?.();
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleBack}
      accessibilityViewIsModal
    >
      <Pressable testID="dialog-scrim" style={styles.scrim} onPress={handleScrimPress}>
        <Animated.View style={[styles.cardWrap, { transform: [{ scale: scaleAnim }] }]}>

          {/* Neo-brutal hard shadow */}
          <View style={styles.cardShadow} />

          {/* Card */}
          <Pressable onPress={() => {}} style={styles.card}>
            <Text style={styles.title} accessibilityRole="header">
              {current?.title ?? ''}
            </Text>
            {current?.message ? (
              <Text style={styles.message}>{current.message}</Text>
            ) : null}

            <View style={styles.buttons}>
              {(current?.buttons ?? []).map((btn, i) => {
                const isPending  = pendingIndex === i;
                const isDisabled = pendingIndex !== null;

                if (btn.style === 'default' || !btn.style) {
                  return (
                    <View key={i} style={styles.btnPrimaryWrap}>
                      <View style={styles.btnPrimaryShadow} />
                      <Pressable
                        testID={`btn-${btn.style ?? 'default'}`}
                        onPress={() => handleButtonPress(btn, i)}
                        disabled={isDisabled}
                        style={[styles.btnPrimary, isDisabled && styles.btnDisabled]}
                        accessibilityRole="button"
                        accessibilityLabel={btn.text}
                        accessibilityState={{ disabled: isDisabled, busy: isPending }}
                      >
                        {isPending
                          ? <ActivityIndicator testID="btn-pending-indicator" color="#1A1A1A" />
                          : <Text style={styles.btnPrimaryText}>{btn.text}</Text>}
                      </Pressable>
                    </View>
                  );
                }

                if (btn.style === 'destructive') {
                  return (
                    <Pressable
                      key={i}
                      testID={`btn-${btn.style}`}
                      onPress={() => handleButtonPress(btn, i)}
                      disabled={isDisabled}
                      style={[styles.btnDestructive, isDisabled && styles.btnDisabled]}
                      accessibilityRole="button"
                      accessibilityLabel={btn.text}
                      accessibilityState={{ disabled: isDisabled, busy: isPending }}
                    >
                      {isPending
                        ? <ActivityIndicator testID="btn-pending-indicator" color="#C25450" />
                        : <Text style={styles.btnDestructiveText}>{btn.text}</Text>}
                    </Pressable>
                  );
                }

                // cancel
                return (
                  <Pressable
                    key={i}
                    testID={`btn-${btn.style}`}
                    onPress={() => handleButtonPress(btn, i)}
                    disabled={isDisabled}
                    style={[styles.btnCancel, isDisabled && styles.btnDisabled]}
                    accessibilityRole="button"
                    accessibilityLabel={btn.text}
                    accessibilityState={{ disabled: isDisabled, busy: isPending }}
                  >
                    {isPending
                      ? <ActivityIndicator color={color.dim} />
                      : <Text style={styles.btnCancelText}>{btn.text}</Text>}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    scrim: {
      flex:            1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems:      'center',
      justifyContent:  'center',
      padding:         28,
    },
    cardWrap: {
      width:         '100%',
      maxWidth:      340,
      paddingRight:  SHAD,
      paddingBottom: SHAD,
    },
    cardShadow: {
      position:        'absolute',
      top:             SHAD,
      left:            SHAD,
      right:           0,
      bottom:          0,
      borderRadius:    radius.card,
      backgroundColor: color.border,
    },
    card: {
      backgroundColor: color.ink,
      borderRadius:    radius.card,
      borderWidth:     2,
      borderColor:     color.border,
      padding:         22,
      gap:             4,
    },
    title: {
      fontFamily: fontFamily.sansBold,
      fontSize:   18,
      lineHeight: 24,
      color:      color.paper,
    },
    message: {
      fontFamily: fontFamily.sans,
      fontSize:   14,
      lineHeight: 21,
      color:      color.dim,
      marginTop:  4,
    },
    buttons: {
      marginTop: 16,
      gap:       10,
    },

    // Primary (default) — yellow neo-brutal
    btnPrimaryWrap: {
      paddingRight:  SHAD,
      paddingBottom: SHAD,
    },
    btnPrimaryShadow: {
      position:        'absolute',
      top:             SHAD,
      left:            SHAD,
      right:           0,
      bottom:          0,
      borderRadius:    radius.pill,
      backgroundColor: color.border,
    },
    btnPrimary: {
      minHeight:         48,
      borderRadius:      radius.pill,
      borderWidth:       2,
      borderColor:       color.border,
      backgroundColor:   '#FFE500',
      alignItems:        'center',
      justifyContent:    'center',
      paddingHorizontal: 16,
      paddingVertical:   12,
    },
    btnPrimaryText: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      12,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color:         '#1A1A1A',
    },

    // Destructive — red outline
    btnDestructive: {
      height:         48,
      borderRadius:   radius.pill,
      borderWidth:    2,
      borderColor:    '#C25450',
      alignItems:     'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    btnDestructiveText: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      12,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color:         '#C25450',
    },

    // Cancel — ghost, uses app border color
    btnCancel: {
      height:         48,
      borderRadius:   radius.pill,
      borderWidth:    2,
      borderColor:    color.border,
      alignItems:     'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    btnCancelText: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      12,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color:         color.dim,
    },

    btnDisabled: { opacity: 0.5 },
  });
}
