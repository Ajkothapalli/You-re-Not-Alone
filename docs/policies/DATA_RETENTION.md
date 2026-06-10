> ⚠️ **DRAFT — NOT LEGAL ADVICE.**
> This document requires review and approval by qualified legal counsel before
> publication. Do not publish this draft. All periods marked [COUNSEL-DEFINED]
> must be set by legal counsel based on applicable law (DPDP Act 2023,
> GDPR, IT Rules 2021, NCMEC obligations) and business requirements.

---

# Data Retention Policy — You Are Not Alone

**Last updated:** [DATE]

---

## Retention schedule

| Data | Table / store | Proposed retention | Rationale | Deletion mechanism |
|---|---|---|---|---|
| Live confession text + embedding | `confessions` (status='live') | Until account deleted or confession removed | Core service content | DSAR job; moderation action; user report |
| Removed confession text + embedding | `confessions` (status='removed') | [COUNSEL-DEFINED: 90 days recommended] after removal | Audit trail for moderation appeals | Scheduled purge job (pg_cron) |
| Crisis-held confession text | `confessions` (status='crisis_held') | [COUNSEL-DEFINED: 30 days] | Pending human review | Purge after review resolved |
| `author_token` (on confessions) | `confessions.author_token` | Same lifecycle as confession row | Required to identify authored content for deletion | Deleted with confession row |
| Crisis event text | `crisis_events` | [COUNSEL-DEFINED: 12 months] | Safety review; improving detection; regulatory compliance | Scheduled purge job; NOT linked to accounts — cannot be selectively deleted per DSAR |
| Reports | `reports` | [COUNSEL-DEFINED: 24 months] after resolution | Legal audit trail; appeals | Scheduled purge job |
| Match log | `matches` | [COUNSEL-DEFINED: 90 days] | Rate limit verification; abuse investigation | Scheduled purge job |
| Account row | `accounts` | Until account deleted | Authentication; age gate; ban enforcement | DSAR deletion job |
| Device hash | `devices` | Until account deleted, or [COUNSEL: 12 months] since last seen | Rate limiting; device-level bans | Cascade on account delete; or purge by last_seen |
| Banned token | `banned_tokens` | [COUNSEL-DEFINED: permanent or until no live confessions remain] | Enforcing bans without reversing HMAC | Manual admin action (removing a ban is exceptional) |
| CSAM reports (NCMEC filings) | External — NCMEC CyberTipline records | [COUNSEL-DEFINED — likely statutory minimum, e.g. 5–7 years] | Legal obligation; law enforcement cooperation | Legal hold; counsel must define |
| Analytics events | [Analytics provider / table] | [COUNSEL-DEFINED: 24 months raw; aggregated indefinitely] | Product metrics | Purge raw events; retain aggregates |
| Server / Edge Function logs | [Hosting provider log store] | [COUNSEL-DEFINED: 90 days recommended] | Security; debugging | Log rotation / hosting provider setting |
| Email address (Auth) | Supabase Auth | Until account deleted | Sign-in; DSAR identity verification | DSAR deletion job (Supabase Auth API) |
| Date of birth | `accounts.dob` | Until account deleted | Age gate enforcement | Cascade on account delete |

---

## DSAR deletion flow

When a verified data subject access or deletion request is received:

1. **Verify identity** — Confirm the requester controls the email address
   on the account (re-send OTP or equivalent challenge). Do not proceed
   without verification.

2. **Derive author token** — On the server (Edge Function), compute:
   ```
   author_token = HMAC-SHA256(account_id, AUTHOR_TOKEN_SECRET)
   ```
   This is the only way to locate authored confessions. The derivation uses
   the same secret as submission; it must run server-side.

3. **Delete authored content** — Using `SUPABASE_SERVICE_ROLE_KEY`:
   ```sql
   DELETE FROM matches     WHERE seeker_token = :author_token;
   DELETE FROM confessions WHERE author_token = :author_token;
   DELETE FROM devices     WHERE account_id   = :account_id;
   ```

4. **Delete account** — Delete from `accounts` and Supabase Auth.

5. **Respond to requester** — Confirm deletion with a summary of what was
   deleted and what was retained (see exceptions below).

### What cannot be deleted

| Data | Reason |
|---|---|
| `crisis_events` rows | Stored without any account link. Cannot be attributed to a specific account and therefore cannot be selectively deleted. We cannot confirm or deny whether a specific user's text appears there. |
| CSAM report records | Retained under legal obligation. Counsel must define the mechanism. |
| Felt count on matched confessions | Aggregate integer; not personal data once the confession itself is deleted. |
| Aggregated / anonymised analytics | Not personal data at the aggregate level. |
| Backup snapshots | [COUNSEL: define backup retention and whether backups are subject to DSAR deletion timelines.] |

---

## Engineering follow-ups required before launch

The following retention controls must be built before this policy can be
honoured in practice. These are not yet implemented:

- [x] **Scheduled purge job (pg_cron)** — `purge_expired_data()` in
  `supabase/migrations/20260609000006_retention.sql` purges resolved reports,
  removed confessions (post-legal-hold), reviewed crisis events, old matches,
  and stale device records. Scheduled daily at 03:30 UTC via pg_cron; falls
  back to a WARNING if pg_cron is unavailable.

- [x] **DSAR deletion Edge Function** — `supabase/functions/delete-account/`
  re-derives `author_token` via HMAC, calls `dsar_delete_author_data()` RPC,
  then deletes the Supabase Auth user. Requires `{"confirm":"DELETE"}` body
  and a valid Bearer JWT. Client wrapper: `lib/api.ts deleteAccount()`.

- [x] **Legal-hold mechanism** — The `reports.confession_id` FK is `RESTRICT`;
  confessions with active reports cannot be hard-deleted. The DSAR function
  sets `status='removed'` (hidden immediately); `purge_expired_data()` deletes
  them once their reports age out. No separate `legal_hold` column needed for
  the current data model.

- [ ] **Log retention verification** — Confirm the log retention period
  configured in Supabase and any hosting/CDN provider matches the
  counsel-defined policy. Set up automatic log rotation if not already in place.

- [ ] **Backup retention alignment** — Confirm Supabase backup retention period
  and whether point-in-time recovery snapshots are subject to DSAR timelines.
  Discuss with counsel.

- [ ] **crisis_events disclosure** — Finalise the wording in the Privacy Policy
  explaining that crisis event text cannot be attributed or deleted. Have
  counsel confirm this is adequate disclosure.

---

## Review cadence

This schedule should be reviewed:
- Before launch (counsel sign-off required).
- Annually thereafter.
- Whenever a new jurisdiction is added as a target market.
- Whenever a third-party processor changes their data retention terms.

[COUNSEL: confirm all periods against DPDP Act 2023, GDPR Art. 5(1)(e)
storage limitation, IT Rules 2021, and NCMEC reporting obligations before
finalising.]
