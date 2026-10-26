import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import FeltButton from './FeltButton';
import { Icon } from './Icon';
import { getPersona, PersonaBadge } from './Persona';
import VoicePlayButton from './VoicePlayButton';
import Waveform from './Waveform';
import { ScrawlIcon, iconAtOffset } from './ScrawlIcon';
import type { Palette } from '../theme/palettes';
import { useTheme } from '../theme/ThemeProvider';
import { type ColorSet, font, fontFamily, radius } from '../theme/tokens';
import { DURATION, EASING, RISE } from '../theme/motion';
import { useReducedMotion } from '../lib/a11y';

const SHADOW = 5;

interface Props {
  text:               string;
  /**
   * [H1] A 2-8 word phrase the writer wrote, set in bold above the text.
   *
   * Always a literal substring of `text` — the server validates that on
   * every write and cuts the stored value out of the text itself, so this
   * component can render it as the writer's own words without checking.
   *
   * Absent on plenty of confessions (short ones never get one, and the
   * writer can remove theirs), and a card without one must look exactly as
   * it did before this feature existed.
   */
  headline?:          string;
  feltCount:          number;
  /** Set only for voice confessions. The transcript above always renders. */
  confessionId?:      string;
  audioDurationMs?:   number;
  audioWaveform?:     number[];
  palette:            Palette;
  /**
   * Take the confession id rather than closing over it.
   *
   * This is what makes React.memo on this component actually work: a parent
   * can hold ONE useCallback per action for the whole list, instead of
   * minting three new closures per card per render — which would change the
   * props every time and defeat the memo silently.
   */
  onReport:           (id: string) => void;
  /**
   * Opt-in: no handler, no control.
   *
   * app/read-detail.tsx does NOT pass one today, so the full-text screen —
   * the most engaged a reader gets with a confession — has no way to share
   * it. That is a gap, not a design: flagged rather than quietly widened.
   */
  onShare?:           (id: string) => void;
  onPress?:           (id: string) => void;
  onFelt?:            (id: string) => void;
  delay?:             number;
  personaSeed:        string;
  iconSessionOffset?: number;
}

const MAX_LINES = 6;

/**
 * Memoized: switching tabs re-renders the feed's parent, and without this
 * every mounted card re-rendered with identical props — each one a persona
 * lookup, two roughened SVG icons and a waveform.
 *
 * The comparison is the default shallow one, which is only correct because
 * the callbacks below are stable per confession id in app/explore.tsx. If a
 * caller ever passes a freshly-created closure, this silently stops working.
 */
function ReadCardInner({ text, headline, feltCount, palette, onReport, onShare, onPress, onFelt, delay = 0, personaSeed, iconSessionOffset = 0, confessionId, audioDurationMs, audioWaveform }: Props) {
  const { colors: color, isDark } = useTheme();
  const styles = useMemo(() => createStyles(color), [color]);

  const [isTruncated, setIsTruncated] = useState(false);
  const persona = getPersona(personaSeed);
  const iconBR  = iconAtOffset(personaSeed, 0, iconSessionOffset);
  const iconTL  = iconAtOffset(personaSeed, 2, iconSessionOffset);

  const entranceAnim = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) { entranceAnim.setValue(1); return; }
    entranceAnim.setValue(0);
    Animated.timing(entranceAnim, {
      toValue:         1,
      duration:        DURATION.entrance,
      delay,
      easing:          EASING.enter,
      useNativeDriver: true,
    }).start();
  }, [text, reduceMotion]);

  const translateY = entranceAnim.interpolate({ inputRange: [0, 1], outputRange: [RISE.md, 0] });

  return (
    <Animated.View style={{ opacity: entranceAnim, transform: [{ translateY }] }}>
      {/* Neo-brutalist shadow wrapper */}
      <View style={styles.outerShell}>
        {/* Hard offset shadow block */}
        <View style={[styles.shadowBlock, { backgroundColor: palette.you }]} />

        {/* Card — whole card is tappable when onPress is provided */}
        <Pressable
          onPress={onPress ? () => onPress(confessionId ?? '') : undefined}
          disabled={!onPress}
          accessibilityRole={onPress ? 'button' : 'none'}
          accessibilityLabel={onPress ? `${persona.name} wrote: ${text}` : undefined}
          accessibilityHint={onPress ? 'Opens the full confession' : undefined}
          style={({ pressed }) => [styles.card, onPress && pressed && styles.cardPressed]}
        >
          {/* Scrawl decorative graphics — scattered positions */}
          <View pointerEvents="none" style={[styles.decor, { top: 14, right: 14, opacity: 0.13 }]}>
            <ScrawlIcon name={iconBR} size={44} color={color.paper} roughen />
          </View>
          <View pointerEvents="none" style={[styles.decor, { bottom: 50, left: 12, opacity: 0.10, transform: [{ rotate: '-42deg' }] }]}>
            <ScrawlIcon name={iconTL} size={36} color={color.paper} roughen />
          </View>

          <View style={styles.content}>
            <View style={styles.bodyArea}>
              <View style={styles.personaRow}>
                <PersonaBadge persona={persona} />
              </View>
              {/* The writer's own words, quoted back. Two lines at most: a
                  headline that wraps to three has stopped being a headline
                  and started being the confession, which is directly below
                  it anyway. */}
              {headline ? (
                <Text
                  style={styles.headline}
                  numberOfLines={2}
                  ellipsizeMode="tail"
                  /* Not a heading role. The card is one continuous quote from
                     one person, and announcing a heading inside it would tell
                     a screen-reader user there is structure here that a
                     sighted reader can see and they cannot. */
                >
                  {headline}
                </Text>
              ) : null}
              <Text
                style={styles.body}
                numberOfLines={onPress ? MAX_LINES : undefined}
                ellipsizeMode={onPress ? 'tail' : undefined}
                /* Guarded: onTextLayout fires on every layout pass, and an
                   unconditional setState with the SAME value still schedules a
                   render. On a list this turned one scroll into a render per
                   visible card, repeatedly. */
                onTextLayout={onPress
                  ? (e) => {
                      const next = e.nativeEvent.lines.length >= MAX_LINES;
                      setIsTruncated((prev) => (prev === next ? prev : next));
                    }
                  : undefined}
              >
                {text}
              </Text>
              {isTruncated && onPress && (
                <Text style={styles.readMore}>read more</Text>
              )}

              {/* BELOW the text, never in place of it. A reader who cannot play
                  sound — deaf, hard of hearing, no headphones, dead battery —
                  still has the entire confession. */}
              {confessionId && audioDurationMs ? (
                <View style={{ marginTop: 10 }}>
                  <VoicePlayButton
                    confessionId={confessionId}
                    durationMs={audioDurationMs}
                  />
                  {/* The shape the writer saw while recording. Decorative only —
                      it is never the affordance, and it carries no meaning the
                      transcript above does not already give. */}
                  {audioWaveform && audioWaveform.length > 0 ? (
                    <Waveform levels={audioWaveform} height={20} style={{ marginTop: 8 }} />
                  ) : null}
                </View>
              ) : null}
            </View>

            <View style={styles.spacer} />

            <View style={styles.footer}>
              <FeltButton
                confessionId={confessionId ?? ''}
                feltCount={feltCount}
                palette={palette}
                onFelt={onFelt}
              />

              <View style={styles.footerRight}>
                {/**
                 * Share, on every card.
                 *
                 * It was reachable only through a nudge that appears ONCE a
                 * session, and only on a confession already past 50 felts —
                 * so the overwhelming majority of confessions could not be
                 * shared at all, and the ones that could were the ones that
                 * least needed the help.
                 *
                 * Icon-only, and quieter than the heart: passing something
                 * on is a real action but it is not the one this card is
                 * asking for.
                 */}
                {onShare && (
                  <Pressable
                    onPress={() => onShare(confessionId ?? '')}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Share this confession"
                    accessibilityHint="Opens the share card"
                    testID={confessionId ? `share-${confessionId}` : undefined}
                    style={({ pressed }) => pressed && styles.pressedAction}
                  >
                    <Icon name="share" size={18} />
                  </Pressable>
                )}

                <Pressable
                  onPress={() => onReport(confessionId ?? '')}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Report this confession"
                  accessibilityHint="Hides it and sends it for review"
                >
                  <Text style={styles.reportLink}>report</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Pressable>
      </View>
    </Animated.View>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    outerShell: {
      alignSelf:     'stretch',
      paddingRight:  SHADOW,
      paddingBottom: SHADOW,
      position:      'relative',
    },
    shadowBlock: {
      position:     'absolute',
      top:          SHADOW,
      left:         SHADOW,
      right:        0,
      bottom:       0,
      borderRadius: radius.card,
    },
    card: {
      minHeight:       220,
      backgroundColor: color.ink,
      borderRadius:    radius.card,
      borderWidth:     2,
      borderColor:     color.border,
      overflow:        'hidden',
    },
    cardPressed: {
      opacity: 0.88,
    },
    decor: {
      position:  'absolute',
      transform: [{ rotate: '45deg' }],
    },
    content: {
      flex:    1,
      padding: 28,
    },
    bodyArea: {
      flexShrink: 1,
    },
    personaRow: {
      marginBottom: 14,
    },
    headline: {
      fontFamily:   fontFamily.sansBold,
      fontSize:     19,
      lineHeight:   24,
      color:        color.paper,
      marginBottom: 8,
    },
    body: {
      fontFamily: fontFamily.serif,
      fontSize:   font.confessionSize,
      lineHeight: font.confessionLineHeight,
      color:      color.paper,
    },
    readMore: {
      fontFamily:         fontFamily.sans,
      fontSize:           12,
      color:              color.dim,
      textDecorationLine: 'underline',
      marginTop:          6,
    },
    spacer: {
      minHeight: 32,
      flex:      1,
    },
    footer: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'center',
      paddingTop:     16,
    },
    footerRight:   { flexDirection: 'row', alignItems: 'center', gap: 14 },
    pressedAction: { opacity: 0.6 },
    reportLink: {
      fontFamily:         fontFamily.sans,
      fontSize:           12,
      color:              color.dim,
      textDecorationLine: 'underline',
    },
  });
}

const ReadCard = React.memo(ReadCardInner);
export default ReadCard;
