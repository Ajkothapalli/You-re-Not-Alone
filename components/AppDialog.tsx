import { useReducedMotion } from '@/lib/a11y';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
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
  title: string;
  message?: string;
  buttons: DialogButton[];
  cancelable: boolean;
};

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
  title: string,
  message?: string,
  buttons?: DialogButton[],
  options?: { cancelable?: boolean },
): void {
  enqueue({
    title,
    message,
    buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK', style: 'default' }],
    cancelable: options?.cancelable !== false,
  });
}

export function DialogHost(): React.ReactElement {
  const [currentQueue, setCurrentQueue] = useState<DialogSpec[]>([...queue]);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const reduced = useReducedMotion();

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
        toValue: 1, useNativeDriver: true, tension: 180, friction: 22,
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
        <Animated.View
          style={[
            styles.cardWrap,
            { transform: [{ scale: scaleAnim }] },
          ]}
        >
          {/* Prevent scrim press propagation from the card */}
          <Pressable onPress={() => {}} style={styles.card}>
            {/* Top glow line */}
            <View style={styles.glowLine} />

            <Text style={styles.title} accessibilityRole="header">{current?.title ?? ''}</Text>
            {current?.message ? (
              <Text style={styles.message}>{current.message}</Text>
            ) : null}

            <View style={styles.buttons}>
              {(current?.buttons ?? []).map((btn, i) => {
                const isPending = pendingIndex === i;
                const isDisabled = pendingIndex !== null;

                if (btn.style === 'default' || !btn.style) {
                  return (
                    <Pressable
                      key={i}
                      testID={`btn-${btn.style ?? 'default'}`}
                      onPress={() => handleButtonPress(btn, i)}
                      disabled={isDisabled}
                      accessibilityRole="button"
                      accessibilityLabel={btn.text}
                      accessibilityState={{ disabled: isDisabled, busy: isPending }}
                    >
                      <LinearGradient
                        colors={['#FBBF24', '#FB7185']}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={[styles.btnBase, isDisabled && styles.btnDisabled]}
                      >
                        {isPending
                          ? <ActivityIndicator testID="btn-pending-indicator" color="#3A0A14" />
                          : <Text style={styles.btnTextDefault}>{btn.text}</Text>}
                      </LinearGradient>
                    </Pressable>
                  );
                }

                if (btn.style === 'destructive') {
                  return (
                    <Pressable
                      key={i}
                      testID={`btn-${btn.style}`}
                      onPress={() => handleButtonPress(btn, i)}
                      disabled={isDisabled}
                      style={[styles.btnBase, styles.btnDestructive, isDisabled && styles.btnDisabled]}
                      accessibilityRole="button"
                      accessibilityLabel={btn.text}
                      accessibilityState={{ disabled: isDisabled, busy: isPending }}
                    >
                      {isPending
                        ? <ActivityIndicator testID="btn-pending-indicator" color="#F26D6D" />
                        : <Text style={styles.btnTextDestructive}>{btn.text}</Text>}
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
                    style={[styles.btnBase, styles.btnCancel, isDisabled && styles.btnDisabled]}
                    accessibilityRole="button"
                    accessibilityLabel={btn.text}
                    accessibilityState={{ disabled: isDisabled, busy: isPending }}
                  >
                    {isPending
                      ? <ActivityIndicator color="#A29CAA" />
                      : <Text style={styles.btnTextCancel}>{btn.text}</Text>}
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

const styles = StyleSheet.create({
  scrim: {
    flex:            1,
    backgroundColor: 'rgba(4,3,6,0.72)',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         24,
  },
  cardWrap: {
    width:    '100%',
    maxWidth: 340,
  },
  card: {
    backgroundColor: '#17131F',
    borderRadius:    22,
    borderWidth:     1,
    borderColor:     'rgba(243,238,232,0.09)',
    padding:         22,
    paddingTop:      22,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 24 },
    shadowOpacity:   0.5,
    shadowRadius:    50,
    elevation:       24,
    overflow:        'hidden',
  },
  glowLine: {
    position:        'absolute',
    top:             0,
    left:            22,
    right:           22,
    height:          1,
    backgroundColor: 'rgba(245,153,110,0.5)',
  },
  title: {
    fontFamily: 'Fraunces_700Bold',
    fontSize:   19,
    lineHeight: 19 * 1.2,
    color:      '#F3EEE8',
  },
  message: {
    fontFamily: 'Inter_400Regular',
    fontSize:   13.5,
    lineHeight: 13.5 * 1.55,
    color:      '#A29CAA',
    marginTop:  9,
  },
  buttons: {
    marginTop: 18,
    gap:       8,
  },
  btnBase: {
    borderRadius:      999,
    height:            46,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 16,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnDestructive: {
    backgroundColor: 'rgba(242,109,109,0.13)',
  },
  btnCancel: {
    backgroundColor: 'transparent',
    borderWidth:     1,
    borderColor:     'rgba(243,238,252,0.14)',
  },
  btnTextDefault: {
    fontFamily: 'Inter_600SemiBold',
    fontSize:   14,
    color:      '#3A0A14',
  },
  btnTextDestructive: {
    fontFamily: 'Inter_600SemiBold',
    fontSize:   14,
    color:      '#F26D6D',
  },
  btnTextCancel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize:   14,
    color:      '#A29CAA',
  },
});
