/**
 * The two cards that close out a reading surface: an invitation to write, and
 * the supporter upsell. Shared by app/read.tsx (after its 2 onboarding cards)
 * and app/explore.tsx (at the end of the feed) so the two screens can't drift.
 *
 * PremiumCard is an upsell, never a gate — per CLAUDE.md invariant 6, plans
 * never gate reading, writing, matching or the counter.
 */

import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Release } from '@/components/illustrations';
import { ScrawlIcon } from '@/components/ScrawlIcon';
import { deriveHeightFromWidth } from '@/hooks/useAspectFit';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily, radius, spacing } from '@/theme/tokens';
import { useMemo } from 'react';

const SHADOW = 4;

export function WriteInviteCard({ onPress }: { onPress: () => void }) {
  const color = useThemeColors();
  const { width: screenW } = useWindowDimensions();
  const cardW = screenW - spacing.screenPadding * 2;
  // Release's <Svg viewBox="0 0 400 300"> is 4:3 — matching the hero box to
  // that ratio (instead of a fixed 160) lets preserveAspectRatio="xMidYMid
  // meet" fill the box edge-to-edge rather than letterboxing inside a
  // shallower one. cardW is already known synchronously here (derived from
  // useWindowDimensions, not a layout measurement), so this uses the same
  // pure arithmetic hooks/useAspectFit.ts exports for every other
  // illustration mount site, without needing an onLayout pass.
  const illH  = deriveHeightFromWidth(cardW, 4 / 3);

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
        <Release style={{ width: '100%', height: illH }} />

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
            <ScrawlIcon name="arrow_right" size={14} color={color.paper} roughen={false} strokeWidth={2.5} />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

export function PremiumCard({ onPress, matchCount = 0 }: { onPress: () => void; matchCount?: number }) {
  const color  = useThemeColors();
  const styles = useMemo(() => createPromoStyles(color), [color]);

  return (
    <View style={styles.promoOuter}>
      <View pointerEvents="none" style={styles.promoShadow} />
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.promoCard, pressed && styles.promoCardPressed]}
        accessibilityRole="button"
        accessibilityLabel="Unlock unlimited reads"
      >
        <View style={styles.promoTop}>
          <Text style={styles.promoEyebrow}>PREMIUM</Text>
          {matchCount > 0 && (
            <Text style={styles.promoStat}>{matchCount.toLocaleString()}+ waiting</Text>
          )}
        </View>
        <Text style={styles.promoTitle}>Read without limits</Text>
        <Text style={styles.promoBody}>
          Right now, hundreds of confessions match what you carry.
          Premium readers see every one — no writing, no waiting.
        </Text>
        <View style={styles.promoCta}>
          <Text style={styles.promoCtaText}>Unlock unlimited reads</Text>
          <ScrawlIcon name="arrow_right" size={16} color="#0A0A0A" roughen={false} strokeWidth={2.5} />
        </View>
      </Pressable>
    </View>
  );
}

function createPromoStyles(color: ColorSet) {
  return StyleSheet.create({
    promoOuter:       { paddingRight: SHADOW, paddingBottom: SHADOW },
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
