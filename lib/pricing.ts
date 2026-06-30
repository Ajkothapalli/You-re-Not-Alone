/**
 * Country-specific pricing for the subscription plans.
 *
 * PREVIEW ONLY. At launch, prices MUST come from the store: App Store /
 * Play return a localized price string (StoreKit `localizedPriceString`,
 * RevenueCat `product.priceString`) for each product per the user's
 * storefront, and you set per-territory prices in App Store Connect /
 * Play Console. Do NOT ship hand-maintained FX — this table exists only so
 * the plans screen previews believable local prices before billing is wired.
 *
 * Detection: locale region via Intl (pure JS, no native module); falls back to USD.
 */

// Monthly / 6-month / Yearly. The core relief loop stays free; premium is
// "unlimited reading · support this place". Graded by per-capita income / PPP:
// India is the cheapest anchor (₹79 / ₹499); emerging markets (Brazil) stay low;
// high-income markets scale up with per-capita, US at the top ($3.99 / $19.99).
// Per-month MUST decrease month→6mo→year (yearly best value) in every currency.
export type TierId = 'month' | 'sixmonth' | 'year';
type Amounts = Record<TierId, number>;

// Store-tier-style local prices (not raw FX) — what these would plausibly
// cost in each market. Keep in sync with App Store Connect tiers at launch.
// Graded low → high by per-capita income / PPP.
const TABLE: Record<string, Amounts> = {
  INR: { month: 79,    sixmonth: 299,   year: 499 },   // India — cheapest anchor (unchanged)
  BRL: { month: 5.90,  sixmonth: 19.90, year: 34.90 }, // Brazil — just above India
  JPY: { month: 500,   sixmonth: 1700,  year: 2500 },  // Japan
  EUR: { month: 3.49,  sixmonth: 11.99, year: 16.99 }, // Eurozone
  GBP: { month: 3.49,  sixmonth: 11.99, year: 16.99 }, // UK
  AED: { month: 12.99, sixmonth: 44.99, year: 64.99 }, // UAE
  CAD: { month: 4.99,  sixmonth: 16.99, year: 24.99 }, // Canada
  NZD: { month: 5.99,  sixmonth: 19.99, year: 29.99 }, // New Zealand
  AUD: { month: 5.99,  sixmonth: 19.99, year: 29.99 }, // Australia
  USD: { month: 3.99,  sixmonth: 12.99, year: 19.99 }, // US — top per-capita
};
const FALLBACK = 'USD';

export interface TierPrice {
  price:     string;   // formatted, e.g. "$1.99" / "₹79" / "¥300"
  perMonth?: string;   // 6-month & year only
  savePct?:  number;   // 6-month & year only, vs paying monthly
}
export interface LocalPricing {
  currency: string;
  tiers:    Record<TierId, TierPrice>;
}

function fmt(amount: number, currency: string): string {
  const whole = Number.isInteger(amount);
  try {
    return new Intl.NumberFormat(undefined, {
      style:                 'currency',
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

// region → currency, covering the markets in TABLE
const REGION_CURRENCY: Record<string, string> = {
  US: 'USD', GB: 'GBP', IN: 'INR', CA: 'CAD', AU: 'AUD', NZ: 'NZD',
  JP: 'JPY', BR: 'BRL', AE: 'AED',
  // Euro-zone
  DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR',
  PT: 'EUR', AT: 'EUR', BE: 'EUR', IE: 'EUR', FI: 'EUR',
};

function detectCurrency(): string {
  try {
    // e.g. "en-IN" → region "IN"
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = locale.split('-').pop()?.toUpperCase() ?? '';
    const code = REGION_CURRENCY[region];
    if (code && TABLE[code]) return code;
  } catch {
    // Intl unavailable — fall through
  }
  return FALLBACK;
}

export function getLocalPricing(): LocalPricing {
  const currency = detectCurrency();
  const a = TABLE[currency] ?? TABLE[FALLBACK];
  const wholeCurrency = Number.isInteger(a.month);
  const monthly = a.month;

  const perMonth = (total: number, months: number) =>
    fmt(wholeCurrency ? Math.round(total / months) : total / months, currency);

  const savePct = (total: number, months: number) =>
    Math.round((1 - total / (monthly * months)) * 100);

  return {
    currency,
    tiers: {
      month:    { price: fmt(a.month, currency) },
      sixmonth: { price: fmt(a.sixmonth, currency), perMonth: perMonth(a.sixmonth, 6), savePct: savePct(a.sixmonth, 6) },
      year:     { price: fmt(a.year, currency),     perMonth: perMonth(a.year, 12),    savePct: savePct(a.year, 12) },
    },
  };
}
