# soulyap — Store Compliance Checklist

Last updated: 2026-06-25. Get a lawyer to review before submission.

---

## 1. NCMEC ESP Agreement (LEGAL BLOCKER — must complete before launch)

- [ ] Go to https://www.missingkids.org/gethelpnow/cybertipline
- [ ] Complete the Electronic Service Provider (ESP) agreement
- [ ] Receive `NCMEC_ESP_ID` and `NCMEC_API_KEY` from NCMEC
- [ ] Confirm the CyberTipline API endpoint (the URL in code is a placeholder)
- [ ] Set as Edge Function secrets:
      ```
      supabase secrets set NCMEC_ESP_ID=<your_id>
      supabase secrets set NCMEC_API_KEY=<your_key>
      ```
- [ ] Test with a staging CSAM signal (coordinate with NCMEC on test mode)

Status: Code is built and fail-closed. Missing: legal agreement + credentials.

---

## 2. Production Edge Function secrets

Set all of these before flipping `ENVIRONMENT=production`:

```bash
supabase secrets set MODERATION_API_KEY=<openai_key>
supabase secrets set EMBEDDING_API_KEY=<openai_key>
supabase secrets set OPENAI_API_KEY=<openai_key>
supabase secrets set AUTHOR_TOKEN_SECRET=<random_64_hex>
supabase secrets set ENVIRONMENT=production
supabase secrets set NCMEC_ESP_ID=<from_ncmec>
supabase secrets set NCMEC_API_KEY=<from_ncmec>
supabase secrets set REPORT_WEBHOOK_URL=<slack_or_discord_webhook>
```

Generate a strong `AUTHOR_TOKEN_SECRET`:
```bash
openssl rand -hex 32
```

---

## 3. Report SLA — 24h review process

**Who reviews:** [operator name / on-call contact]. Sole operator for MVP.

**How to get alerted:** Set `REPORT_WEBHOOK_URL` to a Slack/Discord webhook.
Every report fires an alert with the confession ID + a copy-paste SQL snippet.

**Fast remove path (Supabase Studio → SQL Editor):**
```sql
-- View the queue (oldest first):
SELECT * FROM operator_reports;

-- Remove a specific confession and resolve all its reports:
SELECT admin_remove_confession('<confession_id_from_alert>');

-- Or dismiss a report without removing (false positive):
SELECT admin_resolve_report('<report_id>', false);
```

**SLA commitment:**
- Harmful / violent content: remove within 24h of report
- CSAM: remove immediately (automated on report) + NCMEC filed (automated)
- Crisis: handled pre-write; not a report category

**Escalation:** If the operator is unavailable >24h, pause new confessions:
```sql
-- Temporary pause (all new submissions return 503):
-- In Supabase Dashboard → Edge Functions → submit-confession → Pause
```

---

## 4. iOS App Privacy (App Store Connect)

Fill out the App Privacy section under your app's listing:

### Data types collected:

| Data type | Collected? | Linked to identity? | Used for tracking? | Purpose |
|-----------|-----------|--------------------|--------------------|---------|
| Email address | Yes | Yes | No | Authentication |
| Date of birth | Yes | Yes | No | Age verification (not stored after account creation; only the verified status persists) |
| User-generated content (confessions) | Yes | **No** | No | Core feature; not linkable to user (HMAC, no account_id column) |
| Purchase history | Via App Store | Via Apple | No | Subscription management |
| Crash data | No (unless you add a crash SDK) | — | — | — |
| Location | No | — | — | — |
| Contacts | No | — | — | — |

> Note: The "not linked to identity" claim for confessions requires careful
> legal review. The HMAC construction means *you* cannot link them, but the
> device that submitted them locally stores a receipt. Consult a lawyer on
> how to represent this in the App Privacy label.

### Privacy policy URL: https://soulyap.me/privacy

---

## 5. Android Data Safety (Google Play Console)

### Does your app collect or share any of the required user data types?

- **Personal info (name, email, address):** Email — collected, not shared.
- **App activity:** Confession interactions (felt_count, read events) —
  collected, not shared, not linked to identity.
- **App info and performance:** No crash reporting SDK currently.
- **Device or other IDs:** Device hash (server-computed, not stored on device)
  — for rate limiting only.

### Is all of the data encrypted in transit? Yes (HTTPS/TLS).

### Can users request data deletion? Yes — in-app account deletion removes
the account row. Confessions are not linkable and cannot be attributed
post-deletion. Include a data deletion URL in the Play listing.

### Privacy policy URL: https://soulyap.me/privacy

---

## 6. Age rating

**iOS:** Request **17+** (Mature/Suggestive Themes: infrequent/mild;
Simulated Gambling: none). The 18+ server gate means no under-17 content
is reachable, but the rating should match the most conservative store slot
for a UGC app.

**Android:** Apply for **Mature 17+** content rating. In the content rating
questionnaire: select that your app allows users to share text content;
does NOT allow real-time communication; has a reporting mechanism; has
human moderation within 24h.

---

## 7. Billing (RevenueCat + stores)

- [ ] Create products in App Store Connect:
      - `soulyap_month` (1 month, auto-renew)
      - `soulyap_sixmonth` (6 months, auto-renew)
      - `soulyap_year` (1 year, auto-renew)
- [ ] Create matching products in Google Play Console
- [ ] Attach all three to RevenueCat offering `default`, entitlement `premium`
- [ ] Set `REVENUECAT_API_KEY` in your Expo environment
- [ ] Test a sandbox purchase on both platforms before submission

---

## 8. Legal pages (have a lawyer review before submission)

- [ ] `soulyap.me/privacy` — covers: data collected, HMAC non-linkability,
      retention periods, DSAR process, GDPR/CCPA/DPDP basis
- [ ] `soulyap.me/terms` — covers: age requirement, zero-tolerance clause,
      UGC ownership, moderation, account deletion
- [ ] `soulyap.me/content-policy` — visible link in app store listing
- [ ] Add a data deletion request URL/email to both store listings

---

## 9. Server-side enforcement confirmation

✅ Age check: `submit-confession` step [0] reads `account.dob` and computes
   age server-side. Returns 403 if < 18. Cannot be bypassed by client.

✅ Ban check: `submit-confession` step [0] reads `account.banned` and
   `account.temp_ban_expires_at`. Returns 403 if either applies.

✅ CSAM: `submit-confession` step [2] flags `sexual/minors` from
   omni-moderation-latest. Blocks storage, calls NCMEC hook.

✅ Crisis: `submit-confession` step [3] keyword + classifier. Never stored,
   never matched, returns resources only.

✅ Moderation: `submit-confession` step [2]. Production fail-closed:
   missing `MODERATION_API_KEY` blocks all submissions (returns 503).
