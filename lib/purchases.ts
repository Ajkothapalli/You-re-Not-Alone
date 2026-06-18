/**
 * RevenueCat billing wrapper.
 *
 * All in-app subscriptions go through Apple IAP / Google Play Billing
 * underneath (Apple 3.1.1). RevenueCat handles StoreKit 2 / Play Billing,
 * receipt validation, entitlements, and restore.
 *
 * SETUP (external — not code):
 *  1. Create a RevenueCat project; add iOS + Android apps.
 *  2. Configure 3 subscription products in App Store Connect + Play Console:
 *     yana_month (₹79 / $1.99), yana_6month (₹299 / $7.99), yana_year
 *     (₹499 / $11.99) — and add them to a RevenueCat Offering named "default".
 *  3. Create an entitlement called "premium" attached to all three products.
 *  4. Put the public SDK keys in env:
 *       EXPO_PUBLIC_RC_IOS_KEY, EXPO_PUBLIC_RC_ANDROID_KEY
 *  5. Point a RevenueCat webhook at the revenuecat-webhook Edge Function so
 *     the server (not just the client) knows who is premium.
 *
 * Native module — requires a dev/EAS build. No-ops safely in Expo Go and
 * when keys are absent, so the rest of the app still runs.
 */

import { Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  type PurchasesPackage,
  LOG_LEVEL,
} from 'react-native-purchases';
import type { TierId } from './pricing';

const IOS_KEY     = process.env.EXPO_PUBLIC_RC_IOS_KEY     ?? '';
const ANDROID_KEY = process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? '';
const ENTITLEMENT = 'premium';
const OFFERING    = 'default';

// Map our tiers to the RevenueCat product identifiers configured in the stores.
export const PRODUCT_IDS: Record<TierId, string> = {
  month:    'yana_month',
  sixmonth: 'yana_6month',
  year:     'yana_year',
};

let configured = false;

/** True only when an SDK key is present (i.e. a real build with billing). */
export function billingAvailable(): boolean {
  return !!(Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY);
}

/**
 * Configure RevenueCat once, keyed to the Supabase user id so server-side
 * webhooks can match the subscription to the account. Safe to call repeatedly.
 */
export async function initPurchases(appUserId: string): Promise<void> {
  if (configured || !billingAvailable()) return;
  try {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({
      apiKey: Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY,
      appUserID: appUserId,
    });
    configured = true;
  } catch {
    // Native module missing (Expo Go) — leave unconfigured; callers no-op.
  }
}

/** Current packages for the default offering, or [] when billing is off. */
export async function getPackages(): Promise<PurchasesPackage[]> {
  if (!configured) return [];
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.all[OFFERING]?.availablePackages ?? offerings.current?.availablePackages ?? [];
  } catch {
    return [];
  }
}

/** Look up the package for a tier from the loaded offering. */
export function packageForTier(packages: PurchasesPackage[], tier: TierId): PurchasesPackage | undefined {
  const productId = PRODUCT_IDS[tier];
  return packages.find(
    (p) => p.product.identifier === productId || p.product.identifier.startsWith(productId),
  );
}

function hasPremium(info: CustomerInfo): boolean {
  return info.entitlements.active[ENTITLEMENT] !== undefined;
}

/** Purchase a package. Returns true if it leaves the user premium. */
export async function purchasePackage(pkg: PurchasesPackage): Promise<boolean> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return hasPremium(customerInfo);
}

/** Restore prior purchases (store-required control). Returns premium status. */
export async function restorePurchases(): Promise<boolean> {
  if (!configured) return false;
  const info = await Purchases.restorePurchases();
  return hasPremium(info);
}

/** Current premium entitlement state. False when billing is unavailable. */
export async function checkPremium(): Promise<boolean> {
  if (!configured) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return hasPremium(info);
  } catch {
    return false;
  }
}

/** Is the error a user-cancelled purchase (don't show an error for it)? */
export function isUserCancelled(err: unknown): boolean {
  return !!(err as { userCancelled?: boolean })?.userCancelled;
}
