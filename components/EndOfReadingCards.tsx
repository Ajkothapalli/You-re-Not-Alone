/**
 * The two cards that close out a reading surface: an invitation to write, and
 * the supporter upsell. Used by app/explore.tsx at the end of the feed
 * and app/explore.tsx (at the end of the feed) so the two screens can't drift.
 *
 * PremiumCard is an upsell, never a gate — per CLAUDE.md invariant 6, plans
 * never gate reading, writing, matching or the counter.
 */

import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Icon } from './Icon';
import { Writing, MoreWaiting } from '@/components/illustrations';
import { deriveHeightFromWidth } from '@/hooks/useAspectFit';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily, radius, spacing } from '@/theme/tokens';
import { DAILY_ALLOWANCE, PER_WRITE } from '@/lib/readAllowance';
import { useMemo } from 'react';

const SHADOW = 4;

// These cards sit BETWEEN confessions, every 10. At a full 4:3 of card width
// the drawing alone ran ~270px and the pair filled the whole screen — the
// reader hit a wall of advert mid-feed rather than a pause in it. Capped so
// the illustration reads as a banner, not a hero. preserveAspectRatio
// "xMidYMid meet" scales the whole 400x300 scene down inside the shorter box,
// so nothing is cropped — it just gets smaller.
const ILL_MAX_H = 132;

export function WriteInviteCard({ onPress }: { onPress: () => void }) {
  const color = useThemeColors();
  const { width: screenW } = useWindowDimensions();
  const cardW = screenW - spacing.screenPadding * 2;
  // Writing's <Svg viewBox="0 0 400 300"> is 4:3 — matching the hero box to
  // that ratio (instead of a fixed 160) lets preserveAspectRatio="xMidYMid
  // meet" fill the box edge-to-edge rather than letterboxing inside a
  // shallower one. cardW is already known synchronously here (derived from
  // useWindowDimensions, not a layout measurement), so this uses the same
  // pure arithmetic hooks/useAspectFit.ts exports for every other
  // illustration mount site, without needing an onLayout pass.
  const illH  = Math.min(deriveHeightFromWidth(cardW, 4 / 3), ILL_MAX_H);

  return (
    <View style={{ paddingRight: SHADOW, paddingBottom: SHADOW }}>
      {/* Neo-brutal hard shadow */}
      <View style={{
        position: 'absolute', top: SHADOW, left: SHADOW,
        right: 0, bottom: 0,
        borderRadius: 20,
        backgroundColor: color.border,
      }} />

      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          borderRadius:    20,
          borderWidth:     2,
          borderColor:     color.border,
          overflow:        'hidden',
          backgroundColor: color.ink,
          opacity:         pressed ? 0.9 : 1,
        })}
        accessibilityRole="button"
        accessibilityLabel="Now it's your turn — write a confession"
      >
        {/* Paper/ink hero scene — a person releasing their confession into
            the air, in the same illustration language as the rest of the
            app (EmptyBench, NotificationsEmpty). Replaces a one-off flat SVG
            hero (colour blobs, a heart, sparkles) that didn't share any
            visual language with the app. Release draws no background of its
            own — like EmptyBench elsewhere, it's meant to float directly on
            the card's own ink surface, so the card keeps ONE continuous
            background (set on the Pressable itself) instead of a separate
            dark rect behind just the illustration. */}
        <Writing style={{ width: '100%', height: illH }} />

        {/* ── Text area ── */}
        <View style={{
          padding: 20,
          gap:     6,
        }}>
          <Text style={{
            fontFamily: fontFamily.sansBold,
            fontSize:   20,
            color:      color.paper,
            lineHeight: 27,
          }}>
            Now it's your turn
          </Text>
          <Text style={{
            fontFamily: fontFamily.sans,
            fontSize:   13,
            color:      color.dim,
            lineHeight: 19,
          }}>
            Whenever you're ready — one true thing gets you a match
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <Text style={{
              fontFamily: fontFamily.sansBold,
              fontSize:   13,
              color:      color.paper,
              letterSpacing: 0.3,
            }}>
              Write yours
            </Text>
            <Icon name="arrow_right" size={14} />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

export function PremiumCard({ onPress, matchCount = 0 }: { onPress: () => void; matchCount?: number }) {
  const color  = useThemeColors();
  const styles = useMemo(() => createPromoStyles(color), [color]);
  const { width: screenW } = useWindowDimensions();
  // Same measured 4:3 fit as the write card — ManyWindows is a 400x300
  // viewBox, so a fixed height would letterbox it inside the box instead of
  // filling edge to edge.
  const illH = Math.min(deriveHeightFromWidth(screenW - spacing.screenPadding * 2 - 40, 4 / 3), ILL_MAX_H);

  return (
    <View style={styles.promoOuter}>
      <View pointerEvents="none" style={styles.promoShadow} />
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.promoCard, pressed && styles.promoCardPressed]}
        accessibilityRole="button"
        accessibilityLabel="Support soulyap"
      >
        <View style={styles.promoTop}>
          <Text style={styles.promoEyebrow}>PREMIUM</Text>
          {matchCount > 0 && (
            <Text style={styles.promoStat}>{matchCount.toLocaleString()}+ waiting</Text>
          )}
        </View>

        {/* The offer, drawn: one confession open in your hands, a pile beside
            you, more still arriving. Premium buys the pile you haven't reached
            — a truer picture of it than a lock icon. */}
        <View style={styles.promoIll}>
          <MoreWaiting style={{ width: '100%', height: illH }} />
        </View>

        <Text style={styles.promoTitle}>Read without the daily limit</Text>
        <Text style={styles.promoBody}>
          You get {DAILY_ALLOWANCE} a day, and writing one unlocks {PER_WRITE} more.
          Premium readers keep going — every confession that matches what you
          carry, whenever you want it.
        </Text>
        <View style={styles.promoCta}>
          <Text style={styles.promoCtaText}>Unlock unlimited reads</Text>
          <Icon name="arrow_right" size={16} />
        </View>
      </Pressable>
    </View>
  );
}

function createPromoStyles(color: ColorSet) {
  return StyleSheet.create({
    promoOuter:       { paddingRight: SHADOW, paddingBottom: SHADOW },
    // The drawing sits on its own paper ground inside the ink card, the
    // same treatment the write card gives its hero.
    promoIll:         { backgroundColor: '#FBF8F2', borderRadius: radius.input, overflow: 'hidden', marginBottom: 4 },
    promoShadow:      { position: 'absolute', top: SHADOW, left: SHADOW, right: 0, bottom: 0, borderRadius: radius.input, backgroundColor: color.border },
    promoCard:        { backgroundColor: color.ink, borderRadius: radius.input, borderWidth: 2, borderColor: color.border, padding: 20, gap: 12 },
    promoCardPressed: { opacity: 0.88 },
    promoTop:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    promoEyebrow:     { fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 1.6, color: color.paper },
    promoStat:        { fontFamily: fontFamily.sansBold, fontSize: 12, color: color.dim },
    promoTitle:       { fontFamily: fontFamily.sansBold, fontSize: 24, color: color.paper, lineHeight: 30 },
    promoBody:        { fontFamily: fontFamily.sans, fontSize: 14, color: color.dim, lineHeight: 21 },
    promoCta:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFE500', borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 11, alignSelf: 'flex-start', marginTop: 4 },
    promoCtaText:     { fontFamily: fontFamily.sansBold, fontSize: 14, color: '#0A0A0A' },
  });
}
