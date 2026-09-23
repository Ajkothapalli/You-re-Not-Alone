/**
 * AnimatedSplash — takes over from the static native splash and animates
 * ONLY the two quote glyphs. No halo, no background elements.
 *
 * The logo is split into QuoteLeft (the warm ") and QuoteRight (the cool ")
 * at the exact gap column, so rendering them side by side at LEFT/RIGHT
 * widths reconstructs the native splash pixel-for-pixel. The choreography
 * starts from that exact pose — the native → JS handoff is invisible.
 *
 * Both halves are now VECTOR (components/brand/SoulyapLogo). They keep the
 * frames of the PNGs they replaced — viewBox "0 0 421 1024" and
 * "421 0 603 1024" with preserveAspectRatio="none", which is exactly what
 * the old <Image resizeMode="stretch"> did — so LEFT_RATIO and every width
 * derived from it still land the seam on the same column.
 *
 * Choreography:
 *   1. hold      — identical to the native splash (handoff)
 *   2. breathe   — the glyphs lean apart, like two people taking a breath
 *   3. the meeting — they swing back with a spring overshoot, crossing
 *                    slightly inward and pulsing as they "meet"
 *   4. idle      — a slow off-phase float, alive until the overlay melts
 *   5. hold & fade — wordmark visible briefly, then overlay melts to onDone()
 *
 * Architecture notes (not obvious from the code):
 *   - Rendered as an in-tree absolute overlay (NOT a Modal) so the overlay
 *     is in the same native window as the Stack. Modal attaches asynchronously
 *     on Android/MIUI and could never be guaranteed to arrive before
 *     SplashScreen.hideAsync() fires.
 *   - SplashScreen.hideAsync() is deferred to onLayout + requestAnimationFrame
 *     so the first painted frame of this overlay is pixel-identical to the
 *     native splash before the native one disappears.
 *   - finish() and hideSplash() are guarded by refs so they are idempotent
 *     regardless of how many timers or callbacks fire.
 *   - The 6 s last-resort timer calls finish() unconditionally — if every
 *     animation is frozen the app still appears by 6 s.
 */

import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useThemeColors } from '../theme/ThemeProvider';
import { type ColorSet, fontFamily } from '../theme/tokens';
import { DURATION, EASING, SPRING } from '../theme/motion';
import { useReducedMotion } from '../lib/a11y';
import { QuoteLeft, QuoteRight } from '@/components/brand/SoulyapLogo';

const LOGO_SIZE  = 220;            // must match app.json imageWidth
const LEFT_RATIO = 0.4111;         // split column from the asset (421/1024)
const LEFT_W     = LOGO_SIZE * LEFT_RATIO;
const RIGHT_W    = LOGO_SIZE * (1 - LEFT_RATIO);

/**
 * Keep in lockstep with app.json → plugins → expo-splash-screen →
 * backgroundColor. A mismatch flashes one colour to another during the
 * handoff, which is what this constant exists to prevent.
 *
 * #F7F4EF, not #FFFFFF: it is lightColors.bg — the exact background the app
 * opens on. Pure white would be a hair brighter than the first screen and the
 * handoff would show a step. The point of matching is that nothing changes.
 */
const NATIVE_SPLASH_BG = '#F7F4EF';

interface Props {
  onDone: () => void;
}

export default function AnimatedSplash({ onDone }: Props) {
  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);

  const spread    = useRef(new Animated.Value(0)).current; // 0 = together, 1 = apart
  const pulse     = useRef(new Animated.Value(0)).current; // meeting heartbeat
  const floatL    = useRef(new Animated.Value(0)).current; // idle bob, left
  const floatR    = useRef(new Animated.Value(0)).current; // idle bob, right
  const wordmark  = useRef(new Animated.Value(0)).current;
  const overlay   = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReducedMotion();

  // Idempotent: hides the native splash once — called from onLayout and 3 s fallback.
  const hiddenRef = useRef(false);
  function hideSplash() {
    if (hiddenRef.current) return;
    hiddenRef.current = true;
    // Wait for the next paint frame so the overlay pixels are committed first.
    requestAnimationFrame(() => SplashScreen.hideAsync().catch(() => {}));
  }

  // Idempotent: signals completion — called from animation callbacks and 6 s last-resort.
  const finishedRef = useRef(false);
  function finish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onDone();
  }

  // Called once the overlay has laid out its first frame — safe to swap native splash.
  function onOverlayLayout() {
    hideSplash();
  }

  useEffect(() => {
    // 3 s fallback: ensures the native splash is hidden even if onLayout is late.
    const splashFallback = setTimeout(hideSplash, 3_000);
    // 6 s absolute last-resort: finishes even if every animation is frozen.
    const lastResort = setTimeout(finish, 6_000);

    if (reduceMotion) {
      wordmark.setValue(1);
      const t = setTimeout(() => {
        Animated.timing(overlay, { toValue: 0, duration: DURATION.screen, useNativeDriver: true })
          .start(() => finish());
      }, 1_100);
      return () => {
        clearTimeout(t);
        clearTimeout(splashFallback);
        clearTimeout(lastResort);
      };
    }

    let done = false;
    function dismissNow() {
      if (done) return;
      done = true;
      Animated.timing(overlay, {
        toValue:         0,
        duration:        DURATION.screen,
        easing:          EASING.exit,
        useNativeDriver: true,
      }).start(() => finish());
    }

    // 2. breathe apart → 3. spring back together (overshoot = the meeting)
    Animated.sequence([
      Animated.delay(200),
      Animated.timing(spread, {
        toValue:         1,
        duration:        480,        // intentional choreography timing — breathe-apart phase
        easing:          EASING.enter,
        useNativeDriver: true,
      }),
      Animated.spring(spread, {
        toValue:         0,
        ...SPRING.meeting,           // the signature overshoot — two souls meeting
        useNativeDriver: true,
      }),
    ]).start();

    // heartbeat pulse timed to the moment they cross back together
    Animated.sequence([
      Animated.delay(820),
      Animated.timing(pulse, {
        toValue:         1,
        duration:        170,        // intentional choreography timing — meeting beat in
        easing:          EASING.enter,
        useNativeDriver: true,
      }),
      Animated.timing(pulse, {
        toValue:         0,
        duration:        260,        // intentional choreography timing — meeting beat out
        easing:          EASING.exit,
        useNativeDriver: true,
      }),
    ]).start();

    // 4. idle float — slow, slightly out of phase, alive until dismissal
    const bob = (v: Animated.Value, up: number, down: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: up,   easing: EASING.breathe, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: down, easing: EASING.breathe, useNativeDriver: true }),
        ]),
      );
    const floatLoopL = bob(floatL, 1_150, 1_150);
    const floatLoopR = bob(floatR, 1_350, 1_350);
    const floatStart = setTimeout(() => { floatLoopL.start(); floatLoopR.start(); }, 1_500);

    // Text appears after logo spring animation settles (~1300ms), not during
    Animated.timing(wordmark, {
      toValue:         1,
      duration:        DURATION.entrance,
      delay:           1_400,
      easing:          EASING.enter,
      useNativeDriver: true,
    }).start();

    // 5. hold after wordmark is fully visible (~1700ms), then fade out
    const dismissTimer = setTimeout(dismissNow, 2_800);
    // hard-stop — cannot rely on the Animated callback alone
    const hardStop     = setTimeout(dismissNow, 4_500);

    return () => {
      clearTimeout(dismissTimer);
      clearTimeout(hardStop);
      clearTimeout(floatStart);
      clearTimeout(splashFallback);
      clearTimeout(lastResort);
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
    <Animated.View
      testID="splash-overlay"
      onLayout={onOverlayLayout}
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
        {/* Vector halves. leftStyle/rightStyle carry only width, height and
            transform, so they apply to an Animated.View unchanged — the
            choreography is untouched. The Svg fills its parent, and the two
            viewBoxes are the exact frames of the retired PNGs, so the seam
            still lands on the same column at LEFT_RATIO. */}
        <Animated.View style={leftStyle}>
          <QuoteLeft style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View style={rightStyle}>
          <QuoteRight style={StyleSheet.absoluteFill} />
        </Animated.View>
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
        <Text style={styles.subText}>A private place to say what you can't</Text>
      </Animated.View>
    </Animated.View>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    overlay: {
      position:        'absolute',
      top:             0,
      right:           0,
      bottom:          0,
      left:            0,
      // Must equal app.json's expo-splash-screen backgroundColor. This read
      // color.ink — #FFFFFF in light, #141414 in dark — so the handoff from
      // the native splash (#0E0C13) flashed to a different colour in BOTH
      // themes, hardest in light where it jumped near-black to white. The
      // splash is one brand moment, deliberately the same in both themes; the
      // two logo marks are transparent-backed and read against it either way.
      backgroundColor: NATIVE_SPLASH_BG,
      alignItems:      'center',
      justifyContent:  'center',
      zIndex:          999,
      elevation:       999,
    },
    logoRow: {
      flexDirection: 'row',
      width:         LOGO_SIZE,
      height:        LOGO_SIZE,
    },
    wordmarkContainer: {
      alignItems: 'center',
      gap:        4,
      marginTop:  -44,
    },
    // Fixed INK, not theme type: the splash ground is always NATIVE_SPLASH_BG,
    // which is light. These were '#F3EEE8' and a light rgba while the splash
    // was #0E0C13 — correct then, invisible the moment the ground turned white.
    // They are pinned rather than themed for the same reason the ground is: the
    // splash is one brand moment and does not follow the reader's theme.
    wordmarkText: {
      fontFamily: fontFamily.sansBold,
      fontSize:   24,
      color:      '#1A1A1A',
    },
    subText: {
      fontFamily:    fontFamily.sans,
      fontSize:      12,
      color:         'rgba(26,26,26,0.62)',
      letterSpacing: 0.3,
    },
  });
}
