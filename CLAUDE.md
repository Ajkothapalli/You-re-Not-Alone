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
   **ONE sanctioned read surface: the feed (`app/explore.tsx`).**
   Owner-approved, personalized, safety-filtered in the `recommend_confessions`
   SQL RPC BEFORE scoring — filters that CANNOT be bypassed by the edge
   function. No refresh gesture, nothing loads on scroll: "Keep reading" is an
   explicit tap, never automatic.

   *Owner decision 2026-09-13 — this supersedes the 2026-06-12 and 2026-09-12
   decisions below and REMOVES the previous caps. Read this before assuming an
   older rule still holds:*
   - `app/read.tsx` (the 2-card "Before you write, read" screen) is **DELETED**,
     along with its 2-cap, the `readShown` write gate, and the "+2 reads per
     write" credit. Reading is never rationed and never earned.
   - The feed shows **however much matches the reader's chosen categories** —
     the fixed 10-per-batch cap is gone.
   - The write invite is a **PROMPT shown after a 30-day intro window**
     (`lib/introWindow.ts`), never a gate. Reading is not withheld before or
     after it.
   - AI-generated stories fill the feed while real volume is thin, and recede
     automatically as real confessions arrive (real outranks generated in
     scoring — an ordering bonus, never a filter, so a thin category fills
     rather than empties).
   - **THE FEED IS NEVER EMPTY.** This is the rule this surface lives by.
     Real confessions come first; the curated pool tops the feed up whenever
     real volume is thin (`FEED_FLOOR` in lib/api.ts). A reader must never
     open Read and find nothing, whatever their account age or subscription.
   - **Daily read allowance (owner decision 2026-09-13, LATER the same day —
     this supersedes "reading is never gated on payment", set that morning).**
     First 30 days: unlimited. After that, `DAILY_ALLOWANCE` (10) per day;
     writing a confession grants `PER_WRITE` (2) more that day; premium is
     unlimited. Resets at local midnight — a reader who hits the limit is a
     day from more, never permanently stuck, and the feed still never shows
     an empty screen.
     **This knowingly overrides §6's "supporting buys nothing another user is
     denied."** Premium now buys volume. What that override does NOT extend to:
     plans still never gate WRITING, matching, reporting, the felt counter, or
     anything on the crisis path — and a capped reader is shown a cap, never
     an empty feed pretending there is nothing there.
     Enforcement is deliberately CLIENT-SIDE (`lib/readAllowance.ts`) and
     cheap to defeat. Doing it in `recommend-confessions` would mean the
     server withholding real confessions from free readers, which is exactly
     what produced a permanently empty feed behind copy promising more were
     arriving. A conversion nudge, not DRM.

   **What the removed caps were protecting, and what still protects it:** the
   caps existed so this could not become an endless scroll of other people's
   pain. That intent still stands and is now carried by different mechanics —
   the pool is finite and bounded by the reader's own category choices, the
   feed ENDS (with an explicit end-of-feed state), nothing loads on scroll, and
   there is no refresh gesture. If a future change makes the feed refill
   automatically, continuously, or without an explicit tap, it has crossed the
   line this invariant exists to hold, regardless of what the cap numbers say.

   *Superseded history:* 2026-06-12 read screen shown every launch;
   2026-09-12 read screen limited to outside-D7 + explore made a scrollable
   list. Both are obsolete — the screen they governed no longer exists.

   No other read surface may be added.

3. **Anonymity is user-facing (owner decision 2026-07-05; supersedes the original
   "no stored link" rule).** `confessions.account_id` exists for ownership,
   moderation, "My confessions", and deletion ONLY. It is NEVER exposed:
   not in `confessions_public`, not in any API response, not in match payloads,
   not in analytics, not in share cards. Personas stay random per-confession.
   No public profiles, no author pages, no "more from this writer" — no user can
   ever tie a confession to a person. Legacy rows keep `author_token`
   (`HMAC-SHA256(account_id, AUTHOR_TOKEN_SECRET)`, Edge-Function-derived) and
   stay unlinked forever; seeds keep `account_id NULL`. Account deletion must
   erase or permanently unlink (`account_id NULL`) the user's confessions.

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
| Another user links author→confession | account_id never in any client payload or view; random per-confession personas; no profiles, replies, or author pages |
| Mod or crisis step bypassed | Steps 2+3 are hard early-returns; STORE is code-unreachable if either fires |
| Dev bypass via missing key | Stub BLOCKS (never passes) when MODERATION_API_KEY is absent |
| Leaked service-role key | Service role stays in Edge Function runtime only |
| User targets another | Zero reply surface; no profiles; enforced at schema level |
| Underage CSAM submission | Age gate + CSAM classifier + keyword list + human review, all pre-write |
| DB breach leaks authorship | ACCEPTED RISK (owner decision 2026-07-05): account_id is stored. Mitigations: column-level REVOKEs, no client join surface, service-role-only access, encryption at rest, content erased/unlinked on account deletion |
| Confession text in logs | Analytics carry IDs only; crisis_events is the only text store (service_role) |
| Rate-limit bypass via new accounts | Limits enforced at both server-computed device hash AND account layer |
| JWT stolen from storage | JWTs in expo-secure-store (OS keychain), never AsyncStorage |

---

## Security architecture

### Ownership & anonymity (Layer 3 — most critical invariant)
Owner decision 2026-07-05: confessions are account-linked internally; anonymity
is a USER-FACING guarantee.
- New rows: `confessions.account_id` set at INSERT (Edge Function, from the JWT).
  Used only for ownership checks (My confessions / edit / delete), moderation,
  and account deletion. NEVER exposed to clients in any view or payload.
- Legacy rows (pre-2026-07-05): `account_id NULL`; authorship provable only via
  `author_token = HMAC-SHA256(account_id, AUTHOR_TOKEN_SECRET)` derived in the
  Edge Function per request. Never backfill legacy rows. Seeds: `account_id NULL`.
- `banned_tokens` remains for legacy-row ban enforcement; new rows ban via
  `accounts.banned` + `account_id`.

### Environments

**One Supabase project serves every environment: `tmpqadweifuwbmktbmzg`**
(ap-northeast-1). All three build profiles — `development`, `preview`,
`production` — point at it.

*Owner decision 2026-09-13:* the environment split is DEFERRED on cost
grounds, to be done before real users arrive. A migrated, empty production
project exists at `sjywjerlqxwfniwqjojs` (ap-south-1, Mumbai — chosen for
latency and the DPDP data-residency item) and is not referenced by any build.

Consequences to carry until the split happens, none of them hypothetical:
- The live database holds test confessions. A public release puts real users'
  writing in the same table, and dev testing touches real user data.
- `ENVIRONMENT=development` on the Edge Functions, so rate limits are the dev
  values (500/hour, 1000/day) rather than 5/hour and 10/day. The moderation
  gate is NOT affected — it fails closed in every environment (see below).
- One `AUTHOR_TOKEN_SECRET` across dev and prod, so author tokens are
  derivable across environments.

Before any public release: purge the test rows, set `ENVIRONMENT=production`,
and rotate `AUTHOR_TOKEN_SECRET` — or complete the split.

NOTE: `eas.json`'s inline `env` block overrides the EAS remote environment
variables of the same name. Both currently agree; if the inline block is ever
removed, check the remote values still point where you expect.

### Stub rule (hard requirement)
If `MODERATION_API_KEY` is not set in the Edge Function environment:
- The function returns 503 with `{"error":"moderation_unavailable"}`
- Logs: `[SAFETY] MODERATION_API_KEY not set — blocking all submissions`
- Does NOT pass the submission through under any circumstances

**This applies in EVERY environment. There is no development exemption.**
*Incident 2026-09-13:* `submit-confession`, `edit-confession` and `report` all
carried an `if (IS_PRODUCTION)` bypass that returned `{ pass: true }` when the
key was missing. The live project ran `ENVIRONMENT=development` with
`MODERATION_API_KEY=""`, so every submission was stored, matched and shown with
no classification at all, and the CSAM branch was unreachable. It went unseen
because the only test was `it.todo(...)`, which never executes, and
`scripts/verify-pipeline.mjs` treats a 503 as failure — so a passing pipeline
reported healthy while the gate was off. An environment variable is not a
safety boundary. Invariant tests now assert all three functions fail closed.

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
- `confessions_public` view (no `author_token`, no `account_id`, `security_invoker=true`): SELECT for anon+authenticated
- Column-level: `REVOKE SELECT (author_token, account_id) ON confessions FROM anon, authenticated`
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
    ├─[4] EMBED  (best-effort — see below; never blocks; category is what matches)
    ├─[5] INSERT confessions
    │       account_id = auth user id (never exposed to clients)
    │       author_token = HMAC(account_id, AUTHOR_TOKEN_SECRET)  [transition/legacy]
    │       status = 'live'
    ├─[6] MATCH by CATEGORY  (match_confession_by_category — owner decision 2026-09-13)
    │       WHERE status = 'live'
    │         AND (account_id IS NULL OR account_id != seeker_id)
    │         AND author_token != seeker_token          [legacy rows]
    │         AND author_token NOT IN banned_tokens
    │         AND categories overlap (empty categories → full pool, never stranded)
    ├─[7] INCREMENT felt_count (atomic UPDATE, no read-then-write)
    └─[8] Return { match: { id, text, felt_count } }
          — no author_token, no account data
```

*Owner decision 2026-09-13:* matching runs on the confession's CATEGORY, not on
embedding similarity, until `EMBEDDING_API_KEY` is funded. `match_confession`
(cosine-based) is unchanged and unused, not deleted — switching back later is a
matter of which RPC step [6] calls, not a schema change. `EMBEDDING_API_KEY`
absent no longer throws anywhere (`submit-confession`, `edit-confession`): the
embedding is stored when a key is present and simply skipped (`NULL`) when it
isn't, in every environment. **This decision is scoped to EMBEDDING_API_KEY
only.** `MODERATION_API_KEY` is unaffected and still fails closed
unconditionally — see the non-negotiables above; do not read this section as
license to soften that gate too.

Because categories now decide who gets matched with whom (not just feed
ordering), `classifyCategories()` in both functions gained a keyword-list
Layer 1 that always runs, mirroring the crisis check's own two-layer shape —
the `gpt-4o-mini` classifier (`OPENAI_API_KEY`) is Layer 2, additive, and
still fully optional.

---

## Analytics events (IDs and counts only — never confession text)

- `confession_submitted` `{ confession_id }`
- `blocked_by_moderation` `{ reason_code }` — no text
- `crisis_flagged` `{ }` — no id, no text
- `match_shown` `{ confession_id, felt_count }`
- `card_shared` `{ source }` — source is bucket only (`match` | `rtue` | `read`); no ids or tokens
- `share_click` `{ bucket }` — fired client-side on the share landing page before redirect
- `install_attributed` `{ source }` — fired on first app open when install referrer is available
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
