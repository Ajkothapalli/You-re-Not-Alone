/**
 * Plans — premium subscription. Day / Week / Month / 6-month / Year tiers,
 * yearly flagged as best value. Opened from the felt-counter pill and from
 * the "read more" unlock on the read screen.
 *
 * Real prices and the purchase come from RevenueCat (App Store / Play
 * Billing, Apple 3.1.1). When billing is unavailable (Expo Go / no keys)
 * the screen falls back to lib/pricing preview prices and a stub purchase.
 * Plans NEVER appear on, or gate, the crisis path.
 */

import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import BottomSheet from '../components/BottomSheet';
import { showDialog } from '../components/AppDialog';
import { LinearGradient } from 'expo-linear-gradient';
import type { PurchasesPackage } from 'react-native-purchases';
import { PrimaryButton } from '../components/Buttons';
import { getLocalPricing, type TierId } from '../lib/pricing';
import {
  billingAvailable, getPackages, isUserCancelled, packageForTier, purchasePackage, restorePurchases,
} from '../lib/purchases';
import { usePremium } from '../lib/premiumContext';
import { color, font, fontFamily, radius, spacing } from '../theme/tokens';

const GOLD: [string, string] = ['#FBBF24', '#FB7185'];

interface Tier {
  id:      TierId;
  label:   string;
  price:   string;
  period:  string;
  note?:   string;   // per-month equivalent / savings
  best?:   boolean;
}

const TIER_META: { id: TierId; label: string; period: string; best?: boolean }[] = [
  { id: 'month',    label: 'Monthly',  period: '/ month' },
  { id: 'sixmonth', label: '6 months', period: '/ 6 mo' },
  { id: 'year',     label: 'Yearly',   period: '/ year', best: true },
];

const PERKS = [
  'Unlimited reading across your categories',
  'Explore, tuned to what resonates with you',
  'Funds human review & keeps crisis resources current',
];

export default function PlansScreen() {
  const { refresh } = usePremium();
  const [selected, setSelected] = useState<TierId>('year');
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [busy,     setBusy]     = useState(false);

  // Load live store offerings (real localized prices); empty when billing is off.
  useEffect(() => {
    getPackages().then(setPackages).catch(() => {});
  }, []);

  // Prices: prefer the store's localized price string; fall back to the
  // device-currency preview table when billing isn't available.
  const TIERS: Tier[] = useMemo(() => {
    const pricing = getLocalPricing();
    return TIER_META.map((m) => {
      const pkg   = packageForTier(packages, m.id);
      const price = pkg?.product.priceString ?? pricing.tiers[m.id].price;
      const t     = pricing.tiers[m.id];
      const note  = t.perMonth ? `${t.perMonth} / mo · save ${t.savePct}%` : undefined;
      return { ...m, price, note };
    });
  }, [packages]);

  async function handleContinue() {
    if (busy) return;
    if (!billingAvailable()) {
      showDialog(
        'Almost there',
        'Subscriptions run on a device build with the store keys set. This is the preview.',
      );
      return;
    }
    const pkg = packageForTier(packages, selected);
    if (!pkg) {
      showDialog('Unavailable', "That plan isn't available right now. Please try again later.");
      return;
    }
    setBusy(true);
    try {
      const premium = await purchasePackage(pkg);
      await refresh();
      if (premium) {
        showDialog('You\'re in', 'Thank you for supporting this place.');
        router.back();
      }
    } catch (err) {
      if (!isUserCancelled(err)) {
        showDialog('Purchase failed', 'Something went wrong. You were not charged. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    if (busy) return;
    if (!billingAvailable()) {
      showDialog('Restore purchases', 'Available on a device build. Your plan is tied to your app store account and is never lost.');
      return;
    }
    setBusy(true);
    try {
      const premium = await restorePurchases();
      await refresh();
      showDialog(
        premium ? 'Restored' : 'Nothing to restore',
        premium ? 'Your subscription is active again.' : 'No previous subscription was found for this account.',
      );
      if (premium) router.back();
    } catch {
      showDialog('Restore failed', 'Could not restore purchases. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet title="go premium">
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >

        {/* Premium header */}
        <LinearGradient colors={GOLD} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.badge}>
          <Text style={styles.badgeText}>Premium</Text>
        </LinearGradient>
        <Text style={styles.heading} accessibilityRole="header">read every voice that matches yours</Text>
        <Text style={styles.sub}>
          Your first reads are on us. Go deeper — unlimited confessions, tuned
          to the categories you chose. Cancel anytime.
        </Text>

        {/* Perks */}
        <View style={styles.perks}>
          {PERKS.map((p) => (
            <View key={p} style={styles.perkRow}>
              <Text style={styles.perkCheck}>✓</Text>
              <Text style={styles.perkText}>{p}</Text>
            </View>
          ))}
        </View>

        {/* Tiers */}
        <View style={styles.tierList}>
          {TIERS.map((t) => {
            const isSelected = selected === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setSelected(t.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${t.label}, ${t.price} ${t.period}${t.note ? `, ${t.note}` : ''}${t.best ? ', best value' : ''}`}
              >
                <LinearGradient
                  colors={isSelected || t.best ? GOLD : [color.line, color.line]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[styles.tierBorder, isSelected && styles.tierBorderActive]}
                >
                  <View style={styles.tierInner}>
                    {t.best && (
                      <View style={styles.ribbon}>
                        <Text style={styles.ribbonText}>Best value</Text>
                      </View>
                    )}
                    <View style={styles.tierMain}>
                      <View style={styles.radio}>
                        {isSelected && <View style={styles.radioDot} />}
                      </View>
                      <View style={styles.tierTextWrap}>
                        <Text style={styles.tierLabel}>{t.label}</Text>
                        {t.note && <Text style={[styles.tierNote, t.best && styles.tierNoteGold]}>{t.note}</Text>}
                      </View>
                      <View style={styles.tierPriceWrap}>
                        <Text style={styles.tierPrice}>{t.price}</Text>
                        <Text style={styles.tierPeriod}>{t.period}</Text>
                      </View>
                    </View>
                  </View>
                </LinearGradient>
              </Pressable>
            );
          })}
        </View>

        <PrimaryButton label="Continue" onPress={handleContinue} loading={busy} style={styles.cta} />

        <Pressable onPress={handleRestore} hitSlop={8} accessibilityRole="button" accessibilityLabel="Restore purchases">
          <Text style={styles.restore}>Restore purchases</Text>
        </Pressable>

        <Text style={styles.footnote}>
          Billed through the app store. Cancel anytime. Reading never replaces
          support — crisis resources are always free and never behind a plan.
        </Text>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: {
    padding:       spacing.screenPadding,
    paddingTop:    16,
    paddingBottom: 48,
    gap:           14,
  },
  back: {
    fontFamily: fontFamily.sans,
    fontSize:   14,
    color:      color.dim,
    marginBottom: 8,
  },
  badge: {
    alignSelf:         'flex-start',
    borderRadius:      radius.pill,
    paddingHorizontal: 12,
    paddingVertical:   5,
  },
  badgeText: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      11,
    letterSpacing: 0.18 * 11,
    textTransform: 'uppercase',
    color:         '#3A0A14',
  },
  heading: {
    fontFamily: fontFamily.serifItalic,
    fontSize:   27,
    color:      color.paper,
    lineHeight: 36,
  },
  sub: {
    fontFamily:   fontFamily.sans,
    fontSize:     14,
    lineHeight:   21,
    color:        color.dim,
    marginBottom: 6,
  },
  perks: {
    gap:          10,
    marginBottom: 8,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           10,
  },
  perkCheck: {
    fontFamily: fontFamily.sansBold,
    fontSize:   14,
    color:      '#FBBF24',
    lineHeight: 21,
  },
  perkText: {
    flex:       1,
    fontFamily: fontFamily.sans,
    fontSize:   14,
    color:      color.paper,
    lineHeight: 21,
  },
  tierList: {
    gap:       10,
    marginTop: 4,
  },
  tierBorder: {
    borderRadius: radius.input,
    padding:      1,
  },
  tierBorderActive: {
    padding: 2,
  },
  tierInner: {
    backgroundColor: color.ink,
    borderRadius:    radius.input - 1,
    paddingVertical:   16,
    paddingHorizontal: 16,
  },
  ribbon: {
    position:          'absolute',
    top:               -1,
    right:             14,
    backgroundColor:   '#FBBF24',
    borderBottomLeftRadius:  8,
    borderBottomRightRadius: 8,
    paddingHorizontal: 10,
    paddingVertical:   3,
  },
  ribbonText: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color:         '#3A0A14',
  },
  tierMain: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
  },
  radio: {
    width:        20,
    height:       20,
    borderRadius: 10,
    borderWidth:  1.5,
    borderColor:  color.dim,
    alignItems:     'center',
    justifyContent: 'center',
  },
  radioDot: {
    width:           10,
    height:          10,
    borderRadius:    5,
    backgroundColor: '#FBBF24',
  },
  tierTextWrap: { flex: 1, gap: 2 },
  tierLabel: {
    fontFamily: fontFamily.sansBold,
    fontSize:   15,
    color:      color.paper,
  },
  tierNote: {
    fontFamily: fontFamily.sans,
    fontSize:   12,
    color:      color.dim,
  },
  tierNoteGold: {
    color: '#FBBF24',
  },
  tierPriceWrap: {
    alignItems: 'flex-end',
  },
  tierPrice: {
    fontFamily: fontFamily.serif,
    fontSize:   19,
    color:      color.paper,
  },
  tierPeriod: {
    fontFamily: fontFamily.sans,
    fontSize:   11,
    color:      color.dim,
  },
  cta: {
    marginTop: 18,
  },
  restore: {
    fontFamily: fontFamily.sans,
    fontSize:   13,
    color:      color.dim,
    textAlign:  'center',
    textDecorationLine: 'underline',
    marginTop:  14,
  },
  footnote: {
    fontFamily: fontFamily.sans,
    fontSize:   11,
    lineHeight: 17,
    color:      color.dim,
    textAlign:  'center',
    marginTop:  10,
  },
});
