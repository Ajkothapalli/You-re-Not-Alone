/**
 * AnimatedSplash — takes over from the static native splash and animates
 * ONLY the two quote glyphs. No halo, no background elements.
 *
 * The logo PNG is pre-split into assets/splash-quote-left.png (the warm ")
 * and assets/splash-quote-right.png (the cool ") at the exact gap column,
 * so rendering them side by side at LEFT/RIGHT widths reconstructs the
 * native splash pixel-for-pixel. The choreography starts from that exact
 * pose — the native → JS handoff is invisible.
 *
 * Choreography:
 *   1. hold      — identical to the native splash (handoff)
 *   2. breathe   — the glyphs lean apart, like two people taking a breath
 *   3. the meeting — they swing back with a spring overshoot, crossing
 *                    slightly inward and pulsing as they "meet"
 *   4. idle      — a slow off-phase float, alive until the overlay melts
 *   5. hold & fade — wordmark visible briefly, then overlay melts to onDone()
 */

import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text } from 'react-native';
import { color, fontFamily } from '../theme/tokens';
import { useReducedMotion } from '../lib/a11y';

const LOGO_SIZE  = 220;            // must match app.json imageWidth
const LEFT_RATIO = 0.4111;         // split column from the asset (421/1024)
const LEFT_W     = LOGO_SIZE * LEFT_RATIO;
const RIGHT_W    = LOGO_SIZE * (1 - LEFT_RATIO);

const LEFT_SRC   = require('../assets/splash-quote-left.png');
const RIGHT_SRC  = require('../assets/splash-quote-right.png');

interface Props {
  onDone: () => void;
}

export default function AnimatedSplash({ onDone }: Props) {
  const [modalVisible, setModalVisible] = useState(true);
  const spread   = useRef(new Animated.Value(0)).current; // 0 = together, 1 = apart
  const pulse    = useRef(new Animated.Value(0)).current; // meeting heartbeat
  const floatL   = useRef(new Animated.Value(0)).current; // idle bob, left
  const floatR   = useRef(new Animated.Value(0)).current; // idle bob, right
  const wordmark = useRef(new Animated.Value(0)).current;
  const overlay  = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // First JS frame matches the native splash exactly — swap is invisible.
    SplashScreen.hideAsync().catch(() => {});

    if (reduceMotion) {
      // No breathe/pulse/float — show the wordmark and hand off briefly.
      wordmark.setValue(1);
      const t = setTimeout(() => {
        Animated.timing(overlay, { toValue: 0, duration: 300, useNativeDriver: true })
          .start(({ finished }) => { if (finished) { setModalVisible(false); onDone(); } });
      }, 1100);
      return () => clearTimeout(t);
    }

    let done = false;
    const dismissNow = () => {
      if (done) return;
      done = true;
      Animated.timing(overlay, {
        toValue:         0,
        duration:        450,
        easing:          Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) { setModalVisible(false); onDone(); }
      });
    };

    // 2. breathe apart → 3. spring back together (overshoot = the meeting)
    Animated.sequence([
      Animated.delay(200),
      Animated.timing(spread, {
        toValue:         1,
        duration:        480,
        easing:          Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(spread, {
        toValue:         0,
        speed:           9,
        bounciness:      16,
        useNativeDriver: true,
      }),
    ]).start();

    // heartbeat pulse timed to the moment they cross back together
    Animated.sequence([
      Animated.delay(820),
      Animated.timing(pulse, {
        toValue:         1,
        duration:        170,
        easing:          Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(pulse, {
        toValue:         0,
        duration:        260,
        easing:          Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    // 4. idle float — slow, slightly out of phase, alive until dismissal
    const bob = (v: Animated.Value, up: number, down: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: up,   easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: down, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      );
    const floatLoopL = bob(floatL, 1150, 1150);
    const floatLoopR = bob(floatR, 1350, 1350);
    const floatStart = setTimeout(() => { floatLoopL.start(); floatLoopR.start(); }, 1500);

    Animated.timing(wordmark, {
      toValue:         1,
      duration:        600,
      delay:           1100,
      easing:          Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    // 5. hold briefly after wordmark is fully visible, then fade out
    // wordmark fully visible at ~1700ms; hold 800ms before dismissing
    const dismissTimer = setTimeout(dismissNow, 2500);

    // safety net — splash can never hang
    const hardStop = setTimeout(dismissNow, 4000);

    return () => {
      clearTimeout(dismissTimer);
      clearTimeout(hardStop);
      clearTimeout(floatStart);
      floatLoopL.stop();
      floatLoopR.stop();
    };
  }, [reduceMotion]);

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });

  const leftStyle = {
    width:  LEFT_W,
    height: LOGO_SIZE,
    transform: [
      { translateX: spread.interpolate({ inputRange: [0, 1], outputRange: [0, -20] }) },
      { translateY: floatL.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) },
      { rotate: spread.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-9deg'] }) },
      { scale: pulseScale },
    ],
  };

  const rightStyle = {
    width:  RIGHT_W,
    height: LOGO_SIZE,
    transform: [
      { translateX: spread.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) },
      { translateY: floatR.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) },
      { rotate: spread.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '9deg'] }) },
      { scale: pulseScale },
    ],
  };

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
    >
      <Animated.View
        pointerEvents="auto"
        accessible
        accessibilityRole="image"
        accessibilityLabel="soulyap — a private place to say what you can't."
        style={[styles.overlay, { opacity: overlay }]}
      >
        <Animated.View
          style={styles.logoRow}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Animated.Image
            source={LEFT_SRC}
            style={leftStyle}
            resizeMode="stretch"
          />
          <Animated.Image
            source={RIGHT_SRC}
            style={rightStyle}
            resizeMode="stretch"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.wordmarkContainer,
            {
              opacity:   wordmark,
              transform: [{ translateY: wordmark.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
            },
          ]}
        >
          <Text style={styles.wordmarkText}>soulyap</Text>
          <Text style={styles.subText}>a private place to say what you can't</Text>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex:            1,
    backgroundColor: color.ink,
    alignItems:      'center',
    justifyContent:  'center',
  },
  logoRow: {
    flexDirection: 'row',
    width:         LOGO_SIZE,
    height:        LOGO_SIZE,
  },
  wordmarkContainer: {
    alignItems: 'center',
    gap:        8,
    marginTop:  28,
  },
  wordmarkText: {
    fontFamily: fontFamily.serifItalic,
    fontSize:   24,
    color:      color.paper,
  },
  subText: {
    fontFamily:    fontFamily.sans,
    fontSize:      12,
    color:         color.dim,
    letterSpacing: 0.3,
  },
});
