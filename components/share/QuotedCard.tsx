/**
 * QuotedCard — the 360×640 card that becomes a 1080×1920 PNG.
 *
 * The idea: the logo's two quote marks HOLD the confession, because sharing
 * someone's words is quoting them. Every look is a different way of setting
 * that quotation.
 *
 * ── Why this renders theme-independently ────────────────────────────────────
 * Nothing here reads useTheme(). The card is rasterised and sent to strangers,
 * so it must look identical whether the sender had light or dark mode on — a
 * card whose colours depended on the sender's settings would ship two different
 * products. Icon tones are therefore passed explicitly per look.
 *
 * ── What may never be in these pixels ───────────────────────────────────────
 * No token, no confession id, no account id, no persona, no timestamp. The
 * image outlives every control we have over it: it can be saved, forwarded and
 * reverse-searched forever, and anything identifying baked into it is
 * identifying forever. The card carries words, a category, a count and the
 * brand — nothing that points at a person.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { Icon } from '@/components/Icon';
import {
  QuoteOpen, QuoteClose, QUOTE_H_RATIO,
} from '@/components/brand/SoulyapLogo';
import { fontFamily } from '@/theme/tokens';
import {
  LOOKS, type LookId, type Look, type QuotePlacement,
  CARD_W, CARD_H, px, INK, PAPER,
  backgroundFor, categoryLabel, textMultiplier, jitterFor,
  cardText, pillText, showPill,
} from '@/lib/shareLooks';
import type { IconName } from '@/components/Icon';

export interface QuotedCardProps {
  text:         string;
  category:     string | null;
  feltCount:    number;
  look:         LookId;
  /** Per-share seed; drives the small rotation jitter. */
  seed:         string;
  /** The writer's own confession — sealed unless they include their words. */
  own?:         boolean;
  includeWords?: boolean;
  /** Rendered at preview scale on screen; capture always uses 1. */
  scale?:       number;
  /**
   * A line under the words. Used by the weekly-question card, where the words
   * are a question and the card has to say what to do with it.
   */
  tagline?:     string;
}

function serif(weight: '400' | '600' | '700', italic?: boolean): string {
  if (italic) return fontFamily.serifItalic;
  return weight === '400' ? fontFamily.serif : fontFamily.serifBold;
}

/** A quote, placed and rotated. Rotates about its own top-left corner. */
function Quote({
  place, jitter, Glyph, solid, dieCut,
}: {
  place:  QuotePlacement;
  jitter: number;
  Glyph:  typeof QuoteOpen;
  solid?: string;
  dieCut?: boolean;
}) {
  const w = px(place.w);
  const h = w * QUOTE_H_RATIO;
  const box = { position: 'absolute' as const, width: w, height: h };

  const body = (
    <>
      {/* Sticker's die-cut: four white copies make the outline, then one ink
          copy offset down-right is the hard shadow, then the artwork on top. */}
      {dieCut && (
        <>
          {[[-2.5, 0], [2.5, 0], [0, -2.5], [0, 2.5]].map(([dx, dy], i) => (
            <Glyph key={i} solid="#FFFFFF"
              style={[box, { left: px(dx), top: px(dy) }]} />
          ))}
          <Glyph solid={INK} style={[box, { left: px(4), top: px(4) }]} />
        </>
      )}
      <Glyph solid={solid} style={[box, { left: 0, top: 0 }]} />
    </>
  );

  return (
    <View
      pointerEvents="none"
      style={{
        position:  'absolute',
        left:      px(place.x),
        top:       px(place.y),
        width:     w,
        height:    h,
        transform: [{ rotate: `${place.r + jitter}deg` }],
      }}
    >
      {body}
    </View>
  );
}

export default function QuotedCard({
  text, category, feltCount, look: lookId, seed,
  own = false, includeWords = false, scale = 1, tagline,
}: QuotedCardProps) {
  const look: Look = LOOKS[lookId];
  const bg    = backgroundFor(look, category);
  const label = categoryLabel(category);

  const body = cardText({ text, own, includeWords, feltCount });
  const mult = textMultiplier(body);

  // A dark ground needs the light icon set and vice versa. Decided per look
  // rather than per theme, for the reason in the header.
  const darkGround = lookId === 'midnight' || lookId === 'hush';

  const jOpen  = useMemo(() => jitterFor(seed, 'open'),  [seed]);
  const jClose = useMemo(() => jitterFor(seed, 'close'), [seed]);

  const pillBg = look.pillBg ?? PAPER;
  const pillFg = look.pillFg ?? INK;
  const chipBg = look.chipBg ?? PAPER;
  const brand  = look.brandColor ?? INK;

  return (
    <View
      style={{
        width:           CARD_W,
        height:          CARD_H,
        borderRadius:    px(20),
        borderWidth:     px(2.5),
        borderColor:     INK,
        backgroundColor: bg,
        overflow:        'hidden',
        transform:       scale === 1 ? undefined : [{ scale }],
      }}
      // The card is decorative in the app; its content is announced by the
      // composer around it, so a screen reader is not read the whole image.
      accessible={false}
    >
      {/* Split's orange field. A polygon, so the diagonal is exact rather than
          a rotated rectangle that would need its own overflow handling. */}
      {look.field && (
        <Svg
          width={CARD_W} height={CARD_H}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Polygon
            points={look.field.points
              .map(([x, y]) => `${(x / 100) * CARD_W},${(y / 100) * CARD_H}`)
              .join(' ')}
            fill={look.field.color}
          />
        </Svg>
      )}

      {/* Paper slip (Sticker, Split) — its hard offset shadow first. */}
      {look.slip && (
        <>
          {look.slip.shadow > 0 && (
            <View
              pointerEvents="none"
              style={{
                position:        'absolute',
                left:            px(look.slip.x + look.slip.shadow),
                top:             px(look.slip.y + look.slip.shadow),
                width:           px(look.slip.w),
                height:          px(look.slip.h),
                borderRadius:    px(look.slip.radius),
                backgroundColor: INK,
                transform:       [{ rotate: `${look.slip.r}deg` }],
              }}
            />
          )}
          <View
            pointerEvents="none"
            style={{
              position:        'absolute',
              left:            px(look.slip.x),
              top:             px(look.slip.y),
              width:           px(look.slip.w),
              height:          px(look.slip.h),
              borderRadius:    px(look.slip.radius),
              backgroundColor: look.slip.bg,
              borderWidth:     px(look.slip.border),
              borderColor:     INK,
              transform:       [{ rotate: `${look.slip.r}deg` }],
            }}
          />
        </>
      )}

      <Quote place={look.open}  jitter={jOpen}  Glyph={QuoteOpen}
             solid={look.quoteSolid} dieCut={look.quoteDieCut} />
      <Quote place={look.close} jitter={jClose} Glyph={QuoteClose}
             solid={look.quoteSolid} dieCut={look.quoteDieCut} />

      {/* The words. */}
      <Text
        testID="quoted-card-text"
        style={{
          position:   'absolute',
          left:       px(look.text.x),
          top:        px(look.text.y),
          width:      px(look.text.w),
          fontFamily: serif(look.text.weight, look.text.italic),
          fontSize:   px(look.text.size) * mult,
          lineHeight: px(look.text.size) * mult * look.text.lineHeight,
          color:      look.text.color,
          textAlign:  look.text.align ?? 'left',
        }}
      >
        {body}
      </Text>

      {tagline && (
        <Text
          testID="quoted-card-tagline"
          style={{
            position:   'absolute',
            left:       px(look.text.x),
            top:        px(look.text.y) + px(look.text.size) * mult * look.text.lineHeight * 3.2,
            width:      px(look.text.w),
            fontFamily: fontFamily.sans,
            fontSize:   px(13),
            color:      look.text.color,
            opacity:    0.75,
            textAlign:  look.text.align ?? 'left',
          }}
        >
          {tagline}
        </Text>
      )}

      {/* Category chip, top-right. */}
      {label !== '' && (
        <View
          testID="quoted-card-chip"
          style={{
            position:        'absolute',
            right:           px(16),
            top:             px(16),
            flexDirection:   'row',
            alignItems:      'center',
            gap:             px(5),
            paddingVertical: px(5),
            paddingHorizontal: px(9),
            borderRadius:    px(999),
            borderWidth:     px(2),
            borderColor:     INK,
            backgroundColor: chipBg,
          }}
        >
          <Icon
            name={`cat_${category}` as IconName}
            size={px(22)}
            tone="light"
          />
          <Text style={{
            fontFamily:    fontFamily.sansBold,
            fontSize:      px(12),
            color:         INK,
          }}>{label}</Text>
        </View>
      )}

      {/* Felt pill, bottom-left. Hidden at zero. */}
      {showPill(feltCount) && (
        <View
          testID="quoted-card-pill"
          style={{
            position:        'absolute',
            left:            px(16),
            bottom:          px(18),
            flexDirection:   'row',
            alignItems:      'center',
            gap:             px(5),
            paddingVertical: px(5),
            paddingHorizontal: px(9),
            borderRadius:    px(999),
            borderWidth:     px(2),
            borderColor:     look.pillFg ?? INK,
            backgroundColor: pillBg,
          }}
        >
          <Icon name="heart" size={px(18)} tone={darkGround ? 'dark' : 'light'} />
          <Text style={{
            fontFamily: fontFamily.sansBold,
            fontSize:   px(12),
            color:      pillFg,
          }}>
            {pillText({ own, includeWords, feltCount })}
          </Text>
        </View>
      )}

      <Text
        testID="quoted-card-brand"
        style={{
          position:      'absolute',
          right:         px(16),
          bottom:        px(18),
          fontFamily:    fontFamily.sansBold,
          fontSize:      px(12),
          letterSpacing: px(12) * 0.04,
          color:         brand,
        }}
      >
        soulyap.me
      </Text>
    </View>
  );
}
