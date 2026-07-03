# soulyap — Subscription Pricing Setup

Products: `soulyap_month` · `soulyap_6month` · `soulyap_year`
Entitlement: `premium` · Offering: `default`
RevenueCat: wire all three to the `default` offering before launch.

---

## Price table (enter verbatim in both stores)

| Territory   | Currency | Monthly   | 6-month    | Yearly     |
|-------------|----------|-----------|------------|------------|
| India       | INR      | ₹79       | ₹299       | ₹499       |
| Brazil      | BRL      | R$5.90    | R$19.90    | R$34.90    |
| Japan       | JPY      | ¥500      | ¥1,700     | ¥2,500     |
| Euro zone   | EUR      | €3.49     | €11.99     | €16.99     |
| UK          | GBP      | £3.49     | £11.99     | £16.99     |
| UAE         | AED      | 12.99     | 44.99      | 64.99      |
| Canada      | CAD      | C$4.99    | C$16.99    | C$24.99    |
| New Zealand | NZD      | NZ$5.99   | NZ$19.99   | NZ$29.99   |
| Australia   | AUD      | A$5.99    | A$19.99    | A$29.99    |
| **US**      | USD      | **$3.99** | **$12.99** | **$19.99** |

All other territories: USD prices above apply (store default).
Invariant: per-month cost must decrease month → 6-month → year in every currency.

---

## App Store Connect

### 1. Create the three products

Go to: **App Store Connect → your app → Monetization → Subscriptions**

Create a subscription group (e.g. "soulyap Premium") if one doesn't exist.
Add three auto-renewable subscriptions:

| Product ID         | Reference name     | Duration        |
|--------------------|--------------------|-----------------|
| `soulyap_month`    | soulyap Monthly    | 1 Month         |
| `soulyap_6month`   | soulyap 6-Month    | 6 Months        |
| `soulyap_year`     | soulyap Yearly     | 1 Year          |

For each product, set **Display Name** and **Description** in English (US).

### 2. Set territory prices

For each product → **Pricing** → **By territory**:

Set the US price first (Apple uses it as the base to suggest other prices — reject those suggestions and enter the values from the table above manually for each territory).

**Territory selection path:** Pricing → Edit price → Add territory → select country → enter price.

Territories to set explicitly (all others inherit USD):

| Territory | App Store storefront name |
|-----------|--------------------------|
| India     | India                    |
| Brazil    | Brazil                   |
| Japan     | Japan                    |
| Germany   | Germany (sets EUR for entire euro zone) |
| UK        | United Kingdom           |
| UAE       | United Arab Emirates     |
| Canada    | Canada                   |
| New Zealand | New Zealand            |
| Australia | Australia                |

> Note: Setting Germany sets EUR for most euro-zone countries. Check that
> France, Italy, Spain etc. inherit the EUR price — add them individually if not.

### 3. Subscription display order

In the subscription group, drag `soulyap_year` to the top (App Store shows it first — best-value anchor).

---

## Google Play Console

### 1. Create the three products

Go to: **Play Console → your app → Monetize → Subscriptions → Create subscription**

| Product ID         | Name               | Billing period  |
|--------------------|--------------------|-----------------|
| `soulyap_month`    | soulyap Monthly    | 1 month         |
| `soulyap_6month`   | soulyap 6-Month    | 6 months        |
| `soulyap_year`     | soulyap Yearly     | 1 year          |

For each, add one base plan (auto-renewing).

### 2. Set territory prices

For each subscription → **Base plan** → **Pricing**:

Set the default price in USD first: $3.99 / $12.99 / $19.99.

Then click **Set prices by country** and override:

| Country       | Code | Monthly   | 6-month    | Yearly     |
|---------------|------|-----------|------------|------------|
| India         | IN   | 79        | 299        | 499        |
| Brazil        | BR   | 5.90      | 19.90      | 34.90      |
| Japan         | JP   | 500       | 1700       | 2500       |
| Germany       | DE   | 3.49      | 11.99      | 16.99      |
| France        | FR   | 3.49      | 11.99      | 16.99      |
| Italy         | IT   | 3.49      | 11.99      | 16.99      |
| Spain         | ES   | 3.49      | 11.99      | 16.99      |
| Netherlands   | NL   | 3.49      | 11.99      | 16.99      |
| United Kingdom| GB   | 3.49      | 11.99      | 16.99      |
| UAE           | AE   | 12.99     | 44.99      | 64.99      |
| Canada        | CA   | 4.99      | 16.99      | 24.99      |
| New Zealand   | NZ   | 5.99      | 19.99      | 29.99      |
| Australia     | AU   | 5.99      | 19.99      | 29.99      |

> Tip: Play Console has a "Convert to local prices" button — ignore it and
> type the values from this table directly.

### 3. Activate each base plan

After saving prices, each base plan stays inactive until you click **Activate**.
Activate all three before submitting the app for review.

---

## RevenueCat setup

1. **Entitlement:** Create entitlement `premium`.
2. **Products:** Add all six store products (3 iOS + 3 Android) to RevenueCat.
   Attach all three to the `premium` entitlement.
3. **Offering:** Create offering `default`. Add a single package per duration:
   - `$rc_monthly` package → `soulyap_month` (iOS + Android)
   - `$rc_six_month` package → `soulyap_6month` (iOS + Android)
   - `$rc_annual` package → `soulyap_year` (iOS + Android)
4. **API key:** Set `REVENUECAT_API_KEY` in `app.json` / EAS secrets.
5. **Sandbox test:** Make a sandbox purchase on both platforms before submission.

On-device, the app reads `product.priceString` from RevenueCat — it always shows
the live localized store price, not the values in `lib/pricing.ts`.
`lib/pricing.ts` is the preview table only (shown before RevenueCat loads).

---

## Sanity check (verify before submission)

For each currency, confirm this holds:

```
yearly_per_month < sixmonth_per_month < monthly_price
```

| Currency | Monthly | 6-mo per-month | Yearly per-month |
|----------|---------|----------------|------------------|
| INR      | ₹79     | ₹49.83         | ₹41.58           |
| BRL      | R$5.90  | R$3.32         | R$2.91           |
| JPY      | ¥500    | ¥283           | ¥208             |
| EUR      | €3.49   | €2.00          | €1.42            |
| GBP      | £3.49   | £2.00          | £1.42            |
| AED      | 12.99   | 7.50           | 5.42             |
| CAD      | C$4.99  | C$2.83         | C$2.08           |
| NZD      | NZ$5.99 | NZ$3.33        | NZ$2.50          |
| AUD      | A$5.99  | A$3.33         | A$2.50           |
| USD      | $3.99   | $2.17          | $1.67            |

All pass. ✅
