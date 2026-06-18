# You Are Not Alone — Project Rules

@AGENTS.md

---

## NON-NEGOTIABLES (never violate — checked in every PR)

1. **Safety gate runs on every submission BEFORE anything is stored, matched, or shown.**
   No exceptions. No fast paths. No dev-mode skipping.
   Stubs MUST BLOCK — a missing classifier key blocks all submissions and logs a warning.
   It NEVER silently passes everything through.

2. **No messaging, no replies, no DMs, no public profiles, no following.**
   The absence of a reply channel is the core safety design, not a missing feature.
   Never add one. ("No profiles" = no user-visible/author profiles linkable to
   confessions. The PRIVATE reader profile — character + name in the `profiles`
   table, owner-RLS, account-synced for iOS↔Android since 2026-06-14 — is allowed:
   it is never shown on confessions, which always carry a random per-confession
   persona, so author-identity separation is unaffected.)
   **Two sanctioned read surfaces only:**
   - The onboarding read screen (`app/read.tsx`): hard-capped at 2 confessions
     (enforced server-side in `get_onboarding_confessions`), shown every launch,
     with a report control on every card. Never expand into a feed, add pagination,
     add a refresh gesture, or raise the cap.
   - The explore screen (`app/explore.tsx`): owner-approved, personalized,
     capped at 10 confessions per session, one at a time, no infinite scroll,
     no refresh gesture. Safety filters in `recommend_confessions` SQL RPC are
     applied BEFORE scoring and CANNOT be bypassed by the edge function.
   No other read surface may be added.

3. **Identity is stored separately from confessions.**
   `author_token = HMAC-SHA256(account_id, AUTHOR_TOKEN_SECRET)` — computed in
   Edge Functions only, never stored in the DB, never returned to clients.
   No `account_id` column in `confessions`. No mapping table. No join surface.

4. **Adults only.** Age gate (18+) enforced server-side. CSAM detection, reporting
   (NCMEC hook), and human review stay on permanently in all environments.

5. **Recommender hard rules (owner-approved expansion 2026-06-13).**
   - The recommender models the user as a READER (consumption), keyed to
     `account_id` in `reader_preferences`/`read_events`. It MUST NEVER join to
     `author_token` or reveal what a user authored. Reader identity and author
     identity are separate.
   - Categories are assigned SERVER-SIDE by the classifier at submission.
     Safety tags can NEVER be downgraded by the author.
   - Crisis content is never a category — always routes to the crisis screen.
   - **Sexual / adult category is REMOVED for now (owner decision 2026-06-13).**
     No `sexuality_intimacy` category, no adult opt-in, no adult content in the
     pool. CSAM detection + reporting stay on regardless (invariant 4). If adult
     content is reintroduced later it requires: server-side adult-sexual tagging,
     off-by-default opt-in, SQL hard-filtering for non-opted-in readers, and
     Apple 1.1.4 / Play UGC + legal sign-off BEFORE it ships.

6. **Never monetize a crisis moment.**
   Crisis path returns resources only — no card, no counter, no upsell, no plans.
   *Owner decision 2026-06-12:* the original "never paywall relief" rule was
   deliberately overridden — the felt-counter pill on the match screen opens
   supporter plans (`app/plans.tsx`). Boundaries that still hold:
   - Plans NEVER gate matching, reading, writing, or the counter itself —
     supporting buys nothing another user is denied.
   - No plans, prompts, or upsells anywhere on the crisis path.
   - Purchases go through App Store / Play Billing (Apple 3.1.1) — wire
     RevenueCat or store billing before launch; `handleContinue()` is a stub.

---

## Threat model

| Threat | Mitigation |
|---|---|
| Client tampers with pipeline order | Pipeline runs 100% server-side; client cannot call steps individually |
| Account linked to confession via traffic | HMAC token; no account_id in confessions; no join surface |
| Mod or crisis step bypassed | Steps 2+3 are hard early-returns; STORE is code-unreachable if either fires |
| Dev bypass via missing key | Stub BLOCKS (never passes) when MODERATION_API_KEY is absent |
| Leaked service-role key | Service role stays in Edge Function runtime only |
| User targets another | Zero reply surface; no profiles; enforced at schema level |
| Underage CSAM submission | Age gate + CSAM classifier + keyword list + human review, all pre-write |
| DB breach leaks authorship | No account_id in confessions; HMAC without secret reveals nothing |
| Confession text in logs | Analytics carry IDs only; crisis_events is the only text store (service_role) |
| Rate-limit bypass via new accounts | Limits enforced at both server-computed device hash AND account layer |
| JWT stolen from storage | JWTs in expo-secure-store (OS keychain), never AsyncStorage |

---

## Security architecture

### Author token (Layer 3 — most critical invariant)
```
author_token = HMAC-SHA256(account_id, AUTHOR_TOKEN_SECRET)
```
- Computed in Edge Function only, using `AUTHOR_TOKEN_SECRET` (Edge Function secret)
- Never stored in DB; no mapping table
- Deterministic: same account always gets same token
- One-way: a DB dump + token cannot reverse to account_id without the secret
- `banned_tokens` table caches tokens at ban time (since HMAC is one-way, we cannot
  re-derive a banned token from accounts.banned alone)

### Stub rule (hard requirement)
If `MODERATION_API_KEY` is not set in the Edge Function environment:
- The function returns 503 with `{"error":"moderation_unavailable"}`
- Logs: `[SAFETY] MODERATION_API_KEY not set — blocking all submissions`
- Does NOT pass the submission through under any circumstances

### Client bundle
Contains ONLY: `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`
Never: MODERATION_API_KEY, EMBEDDING_API_KEY, AUTHOR_TOKEN_SECRET, service-role key

### JWT storage
`expo-secure-store` (OS keychain) — never AsyncStorage

### Device hash
Computed server-side: `HMAC-SHA256(account_id + ":" + user-agent + ":" + ip, AUTHOR_TOKEN_SECRET)`
Client cannot spoof by resetting app state or sending a fabricated hash.

### Rate limits
- 5 submissions / device / hour
- 10 submissions / account / day
- Violation escalation: 3 violations in 24h → 24h temp ban; 3 temp bans → permanent ban

### Database
- `confessions` direct table: `REVOKE ALL FROM anon, authenticated`
- `confessions_public` view (no `author_token`, `security_invoker=true`): SELECT for anon+authenticated
- Column-level: `REVOKE SELECT (author_token) ON confessions FROM anon, authenticated`
- `crisis_events`, `devices`, `matches`: `REVOKE ALL FROM anon, authenticated`
- RLS enabled on every table

---

## Secrets (location matrix)

| Secret | Location | Never in |
|---|---|---|
| `AUTHOR_TOKEN_SECRET` | Edge Function env | DB, client, logs |
| `MODERATION_API_KEY` | Edge Function env | DB, client, logs |
| `EMBEDDING_API_KEY` | Edge Function env | DB, client, logs |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function env (auto) | DB, client, logs |
| `SUPABASE_ANON_KEY` | Client bundle | — |

---

## Pipeline (server-side, non-bypassable)

```
POST /functions/v1/submit-confession  { text }  + JWT
    │
    ├─[0] Verify JWT + accounts.banned=false + age >= 18 + temp ban check
    │       FAIL → 401/403, stop
    ├─[1] Rate limit (server-computed device_hash + account day count)
    │       EXCEED → 429; record violation; escalate ban if threshold hit
    ├─[2] MODERATION  (MODERATION_API_KEY absent → 503, block all)
    │       FLAGGED → 400, nothing stored
    │       CSAM signal → NCMEC hook (no account_id, no text stored locally), 400
    ├─[3] CRISIS CHECK (keyword list always + classifier when key set)
    │       FLAGGED → INSERT crisis_events, return {type:"crisis"}, STOP
    ├─[4] EMBED  (EMBEDDING_API_KEY; server-side)
    ├─[5] INSERT confessions
    │       author_token = HMAC(account_id, AUTHOR_TOKEN_SECRET)
    │       NO account_id column; status = 'live'
    ├─[6] MATCH via pgvector cosine
    │       WHERE status = 'live'
    │         AND author_token != seeker_token
    │         AND author_token NOT IN banned_tokens
    ├─[7] INCREMENT felt_count (atomic UPDATE, no read-then-write)
    └─[8] Return { match: { id, text, felt_count } }
          — no author_token, no account data
```

---

## Analytics events (IDs and counts only — never confession text)

- `confession_submitted` `{ confession_id }`
- `blocked_by_moderation` `{ reason_code }` — no text
- `crisis_flagged` `{ }` — no id, no text
- `match_shown` `{ confession_id, felt_count }`
- `card_shared` `{ }`
- `report_submitted` `{ confession_id }`

---

## Compliance checklist (needs a lawyer — not legal advice)

- [ ] Age assurance appropriate to app stores and jurisdictions served
- [ ] CSAM: detection, blocking, mandatory reporting (NCMEC/US; IT Act/POCSO India)
- [ ] India DPDP Act 2023 — consent, data minimisation, retention, grievance officer
- [ ] GDPR / CCPA — lawful basis, DSAR handling, deletion
- [ ] IT Rules 2021 intermediary duties — grievance redressal, takedown timelines
- [ ] Terms of Service + Privacy Policy matching actual app behaviour
- [ ] App store UGC requirements — moderation, reporting, blocking, content-policy page
- [ ] Data retention policy for confessions, crisis events, and reports
