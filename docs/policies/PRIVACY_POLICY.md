> ⚠️ **DRAFT — NOT LEGAL ADVICE.**
> This document requires review and approval by qualified legal counsel before
> publication. Do not publish this draft. All [PLACEHOLDERS] must be replaced
> with accurate information. Bracketed notes like [CONFIRM ...] identify items
> that require independent legal or technical verification.

---

# Privacy Policy — You Are Not Alone

**App name:** You Are Not Alone  
**Operator:** [ENTITY LEGAL NAME], [REGISTERED ADDRESS]  
**Contact:** [privacy@yourdomain.com]  
**Last updated:** [DATE]  
**Effective date:** [DATE]

---

## Short version (plain language summary)

- You sign in with your email address. We never show it to other users.
- You write a confession. Before it is stored, it is checked by automated
  moderation (including an AI service — see below). If it passes, it is stored
  with a one-way token, not your email address.
- **Your confession cannot be linked to your account by another user or by
  inspecting the database alone.** However — and we must be transparent about
  this — the operator (us) can re-derive the link server-side using a secret
  key that never leaves our servers. We disclose this, and we use this ability
  only to honour deletion requests.
- Your confession text is sent to OpenAI for moderation and matching before
  it is stored. It is not sent to any other third party.
- If your text indicates a crisis, it is never published or matched. It is
  held in a restricted internal queue for human review, and you are shown
  crisis resources.
- You can ask us to delete your data at any time.

---

## 1. Who we are

[ENTITY LEGAL NAME] ("we", "us", "our") operates the You Are Not Alone
mobile application ("App"). [REGISTERED ADDRESS, JURISDICTION].

---

## 2. Data we collect

| Data | Why we collect it | Where it is stored |
|---|---|---|
| Email address | OTP sign-in authentication | Supabase Auth |
| Date of birth | 18+ age gate (server-enforced) | `accounts` table |
| Confession text | Core service — anonymous matching | `confessions` table |
| Sentence embedding (vector) | Semantic similarity matching | `confessions` table |
| Account link on confessions (`account_id`) | Lets you view, edit, and delete your own confessions; moderation and banning. Never exposed to other users or in any client-facing view | `confessions` table |
| Author token (HMAC) | Legacy rows only (pre-2026-07-05): proves authorship for deletion/banning without a stored account ID | `confessions` table |
| Hashed device identifier | Rate limiting; abuse prevention | `devices` table |
| Crisis-flagged text | Human review; directing users to resources | `crisis_events` table (no account link) |
| Report reasons | Moderation; content review | `reports` table |
| Analytics events | Aggregate product metrics (IDs and counts only — never confession text) | [ANALYTICS PROVIDER / `analytics_events` table] |
| Server/function logs | Security; debugging | [HOSTING PROVIDER log infrastructure] |

We do **not** collect: real name, location, phone number, contacts, biometric
data, or payment information.

---

## 3. How anonymity actually works — and its limits

### What we built (updated 2026-07-05)

Anonymity on soulyap is a **user-facing guarantee**: no other user can ever
connect a confession to you.

- Confessions are stored with an internal link to your account (`account_id`).
  We keep this link so that you can see, edit, and delete your own confessions,
  so we can moderate content and enforce bans, and so account deletion can
  remove everything you wrote.
- That link is **never exposed**: not to other users, not in the app's public
  views or API responses, not on share cards, not in analytics. Every
  confession is displayed under a random per-confession persona.
- There are no public profiles, no author pages, no replies, and no DMs —
  there is no way for another user to find, follow, or re-identify you.
- Confessions written before 2026-07-05 carry no account link at all (only a
  one-way HMAC token) and are never retro-linked.

### The honest limitation

Because we store the account link, **we — the operator — can connect your
confessions to your account.** Your anonymity is protected from other users,
but not from the operator under legal compulsion, a valid court order, or an
authenticated request from you. We use the link only for:
(a) showing you, and letting you edit or delete, your own confessions;
(b) moderation, safety review, and ban enforcement;
(c) honouring your deletion request;
(d) compliance with a valid legal order.

[COUNSEL: confirm this is adequate disclosure under GDPR Art. 13/14 and DPDP
Act 2023 consent requirements.]

---

## 4. How we use your data

| Purpose | Legal basis |
|---|---|
| Providing the anonymous matching service | [COUNSEL: legitimate interests / contract performance] |
| Safety pipeline (moderation, crisis detection) | [COUNSEL: legitimate interests / legal obligation] |
| Age verification and account management | [COUNSEL: legal obligation / contract] |
| Abuse prevention and banning | [COUNSEL: legitimate interests] |
| Analytics (aggregate, no personal data) | [COUNSEL: legitimate interests] |
| Honouring deletion requests | Legal obligation |
| Child safety reporting (CSAM) | Legal obligation |

---

## 5. Third-party processing

### Supabase (database and authentication)

We use Supabase for hosted Postgres, authentication, and serverless functions.
Your data is stored on Supabase infrastructure.

Supabase privacy information: [CONFIRM SUPABASE DPA URL]  
Data residency: [CONFIRM SUPABASE REGION SELECTED]

### OpenAI (moderation and matching)

**Before a confession is stored**, its text is sent to OpenAI for:

1. **Automated content moderation** — OpenAI `omni-moderation-latest` model.
   Confessions flagged as policy-violating are blocked and never stored.
2. **Crisis detection** — OpenAI `gpt-4o-mini` model. Text classified as
   indicating crisis is never stored in the public pool; you are shown
   resources instead.
3. **Semantic matching** — OpenAI `text-embedding-3-small` model. A numerical
   vector (1536 dimensions) is computed and stored; the original text is never
   sent again for matching.

OpenAI receives confession text for these three purposes only. We do not
send email addresses, account IDs, or any other identifier to OpenAI.

[CONFIRM OPENAI DATA-RETENTION TERMS AND DPA — specifically whether OpenAI
retains API inputs for model training under your plan, and whether a DPA is
in place that satisfies GDPR Art. 28 / DPDP requirements. Review OpenAI's
enterprise/API terms before finalising this section.]

### Analytics

[ANALYTICS PROVIDER NAME, if any, or confirm data stays in Supabase]  
Events sent: event name, confession ID or report ID, felt count. Never
confession text. [CONFIRM DPA with provider.]

---

## 6. Child safety

We operate an adults-only (18+) service. We have zero tolerance for
child sexual abuse material (CSAM).

Every submission is screened by automated classifiers before storage. Content
identified as CSAM is:
1. Blocked and not stored.
2. Reported to the National Center for Missing and Exploited Children (NCMEC)
   CyberTipline [TO BE INTEGRATED BEFORE LAUNCH — see engineering checklist]
   and to applicable authorities under the IT Act (India) and equivalent laws.

No CSAM material is stored by us. Reports to NCMEC may be retained as legally
required.

---

## 7. Crisis content

If a submission is identified as indicating possible crisis (suicidal ideation,
self-harm, abuse, or severe distress), it is:

1. **Not published** and not matched to other users.
2. Stored in a restricted `crisis_events` table for human review to identify
   systemic issues and improve detection. This table contains the text only —
   no account identifier is stored (see Section 3).
3. Handled by showing you information about crisis support services.

**You Are Not Alone is not a crisis service, a medical service, or an emergency
service. It does not provide real-time monitoring or intervention. If you are
in immediate danger, contact emergency services.**

---

## 8. Data retention

See `docs/policies/DATA_RETENTION.md` for the full retention schedule.

Summary:
- Live confessions: retained while your account is active and the confession
  has not been removed by you, moderation, or a successful report.
- Your account and device records: deleted on account deletion.
- Crisis events: retained for [COUNSEL-DEFINED PERIOD] for safety review.
  Cannot be attributed to you (no account link stored).
- CSAM records: retained as required by law and NCMEC reporting obligations.
- Analytics: aggregated / anonymised after [COUNSEL-DEFINED PERIOD].

---

## 9. Your rights

Depending on your jurisdiction, you may have rights including:

- **Access** — obtain a copy of personal data we hold about you.
- **Deletion** — request deletion of your account and associated data.
- **Correction** — correct inaccurate data.
- **Portability** — receive your data in a machine-readable format.
- **Restriction/objection** — restrict or object to certain processing.
- **Withdraw consent** — where processing is based on consent.

**How to submit a request:**  
Email [privacy@yourdomain.com] from the email address linked to your account.
We will verify your identity and respond within [COUNSEL: 30 days for GDPR /
30 days for DPDP] of a verified request.

**How deletion works technically:**  
On account deletion we remove your confessions by their stored account link
(and, for pre-2026-07-05 rows, by deriving the legacy HMAC `author_token`),
along with associated rows in `matches` and `devices`, then delete your
`accounts` row. You may instead choose to leave your confessions live in
anonymised form — in that case the account link is permanently removed
(`account_id` set to NULL) so they can never again be connected to anyone.

**What cannot be deleted:**  
Crisis events in `crisis_events` are stored without any account identifier and
therefore cannot be attributed to you or selectively deleted on your request.
CSAM reports held under legal obligation are retained as required by law.
Aggregate analytics (counts without personal data) may be retained.

---

## 10. Grievance Officer (India — DPDP Act 2023 / IT Rules 2021)

Name: [GRIEVANCE OFFICER NAME]  
Email: [grievance@yourdomain.com]  
Address: [REGISTERED ADDRESS]  
Response time: [COUNSEL: 24 hours to acknowledge / 15 days to resolve under
IT Rules 2021]

---

## 11. Changes to this policy

We will notify you of material changes by [email / in-app notice] at least
[COUNSEL: confirm notice period] before the changes take effect.

---

## 12. Contact

[ENTITY LEGAL NAME]  
[REGISTERED ADDRESS]  
[privacy@yourdomain.com]
