# You Are Not Alone — Launch Checklist

**Legend:** ✅ complete in codebase · ⚠️ requires external action before launch

---

## Safety & Moderation

- ✅ Safety pipeline runs 100% server-side in the Edge Function — client cannot skip steps
- ✅ Moderation stub blocks all submissions when `MODERATION_API_KEY` is absent in production
- ✅ OpenAI `omni-moderation-latest` wired; fails closed on non-200 response
- ✅ `sexual/minors` category triggers CSAM path (no text stored, 400 returned)
- ✅ Crisis keyword list always runs (no API cost or latency dependency)
- ✅ gpt-4o-mini crisis classifier runs after keyword list; fails open if API errors
- ✅ Crisis events stored for human review (no account_id)
- ✅ NCMEC hook logs timestamp + reference URL in `reportCsam()`
- ⚠️ **NCMEC CyberTipline API** — integrate `reportCsam()` before launch (requires platform agreement + API credentials from NCMEC: https://www.missingkids.org/gethelpnow/cybertipline)
- ⚠️ **Crisis resources verified** — all phone numbers and URLs must be checked by a mental health professional before launch (last verified: 2026-06-10 in `app/crisis.tsx` and `submit-confession/index.ts`)
- ⚠️ **Moderation thresholds** — test against real edge cases; tune before launch

---

## Identity & Data

- ✅ `author_token = HMAC-SHA256(account_id, AUTHOR_TOKEN_SECRET)` — computed in Edge Function only
- ✅ No `account_id` column in `confessions` — no join surface exists in the DB schema
- ✅ No mapping table between accounts and confessions
- ✅ `banned_tokens` caches HMAC tokens at ban time (one-way HMAC cannot be reversed)
- ✅ `REVOKE ALL ON confessions, devices, matches, crisis_events, banned_tokens FROM anon, authenticated`
- ✅ `REVOKE SELECT (author_token) ON confessions FROM anon, authenticated` — column-level guard
- ✅ `confessions_public` view (`security_invoker=true`) — excludes `author_token`
- ✅ JWTs stored in `expo-secure-store` (OS keychain) — never `AsyncStorage`
- ✅ Client bundle contains only `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- ✅ All sensitive secrets are Edge Function env vars only

---

## Age Gate

- ✅ Client-side 18+ check in `app/index.tsx` (DOB step)
- ✅ Server-side 18+ check in `submit-confession` (belt-and-suspenders)
- ✅ `dob` stored in `accounts` table; never in `confessions`
- ⚠️ **App store age rating** — submit as 17+ (Apple) / Mature 17+ (Google) for UGC content
- ⚠️ **Age assurance compliance** — verify requirements for all target jurisdictions (India DPDP, UK Age Appropriate Design Code, US COPPA)

---

## Legal & Compliance

- ⚠️ **Terms of Service** — draft at `docs/policies/TERMS_OF_SERVICE.md`; requires lawyer review, entity details, and governing-law clause before publication
- ⚠️ **Privacy Policy** — draft at `docs/policies/PRIVACY_POLICY.md`; includes honest operator re-derivation disclosure and OpenAI processing section; requires lawyer review and [CONFIRM OPENAI DPA] before publication
- ⚠️ **Data Retention Policy** — draft at `docs/policies/DATA_RETENTION.md`; all [COUNSEL-DEFINED] periods must be set by counsel before publication; engineering implementation is complete (see checklist in that file)
- ⚠️ **India DPDP Act 2023** — drafted into Privacy Policy and ToS (grievance officer, consent); requires counsel sign-off and named Grievance Officer before publication
- ⚠️ **GDPR / UK GDPR** — legal basis table in Privacy Policy is drafted with [COUNSEL] placeholders; requires DPA registration and confirmed lawful basis before publication
- ⚠️ **CCPA** — "Do Not Sell" clause required if serving California users; not yet drafted — counsel to add
- ⚠️ **IT Rules 2021 (India)** — grievance route drafted in ToS and Content Policy with 24h/15-day SLAs; requires named officer and published contact before launch
- ⚠️ **OpenAI DPA** — confirm whether OpenAI API plan includes a DPA and whether inputs are used for model training; update Privacy Policy accordingly before publication
- ✅ **DSAR deletion Edge Function** — `supabase/functions/delete-account/` + `lib/api.ts deleteAccount()`; re-derives author_token, calls `dsar_delete_author_data()` RPC, deletes Auth user
- ✅ **Scheduled purge jobs (pg_cron)** — `purge_expired_data()` in migration 006; scheduled daily at 03:30 UTC; falls back to WARNING if pg_cron unavailable

---

## App Store

- ⚠️ **Apple App Store** — UGC apps require: in-app reporting, content moderation, ability to block users (confirm YANA's no-reply design satisfies this), content policy page URL in metadata
- ⚠️ **Google Play** — User Generated Content policy: moderation system described, reporting mechanism confirmed, sensitive content handled per Play policy
- ⚠️ **Content policy page** — draft at `docs/policies/CONTENT_POLICY.md`; requires lawyer review, published URL, and grievance officer details before store submission
- ⚠️ **Mental health content** — follow Apple/Google guidance on crisis resources and helpline display in apps dealing with sensitive topics
- ⚠️ **Age rating** — Apple 17+, Google Mature 17+ for UGC with potential sensitive themes

---

## Secrets & Infrastructure

- ✅ Secret location matrix documented in `CLAUDE.md` and `.env.example`
- ✅ `ENVIRONMENT=production` flag gates hard blocking vs dev pass-through
- ⚠️ **`AUTHOR_TOKEN_SECRET` rotation** — generate a fresh 64-byte secret (`openssl rand -hex 64`) before the first production deploy; the development value must never reach production
- ⚠️ **Supabase project** — set `ENVIRONMENT=production` in Edge Function secrets for the production project
- ⚠️ **OpenAI key scoping** — confirm `MODERATION_API_KEY`, `OPENAI_API_KEY`, `EMBEDDING_API_KEY` are scoped to the minimum required endpoints
- ⚠️ **Rate limits at scale** — 5/device/hour and 10/account/day are conservative; validate against expected volume before launch

---

## Human Review

- ✅ `admin_pending_reports` view — unresolved reports joined with confession text, FIFO
- ✅ `admin_pending_crisis` view — unreviewed crisis events, FIFO
- ✅ `admin_resolve_crisis(event_id)` function
- ✅ `admin_resolve_report(report_id, restore_confession?)` function
- ✅ All admin objects restricted to `service_role` only
- ⚠️ **Review SLA** — define and publish response times: CSAM (immediate), crisis (same day), other reports (72 hours)
- ⚠️ **On-call for CSAM** — someone must be reachable 24/7 to action NCMEC reports once the real integration is wired
- ✅ **Admin review CLI** — `scripts/admin-review.mjs` covers crisis + report queues (`npm run admin -- crisis|reports|resolve-crisis|resolve-report`)
- ⚠️ **Admin UI for non-technical moderators** — build or configure a dashboard (Supabase Studio, Retool, custom) if the team needs a GUI

---

## Performance

- ✅ HNSW index (`m=16, ef_construction=64`) for cosine nearest-neighbour search
- ✅ Embedding dimension validated as 1536 on every call (mismatch throws before insert)
- ⚠️ **Load test pgvector at scale** — HNSW parameters (`m`, `ef_construction`, `ef_search`) may need tuning once the confession pool exceeds 100k rows; benchmark before launch
- ⚠️ **Embedding model migration** — if `text-embedding-3-small` is replaced, all existing embeddings must be regenerated and the `vector(1536)` column dimension updated

---

## Final Checks

- ✅ `app/preview.tsx` exists as a dev-only palette preview screen
- ✅ `npx tsc --noEmit` compiles clean
- ✅ `ENVIRONMENT` flag controls dev pass-through vs production hard blocking
- ✅ **Identity separation automated** — `npm run verify-pipeline` probes that anon cannot SELECT `confessions`, `crisis_events`, or `author_token` via any path
- ✅ **Crisis path automated** — `npm run verify-pipeline` submits a crisis phrase and asserts `{type:"crisis"}` returned, no confession stored, `crisis_events` row created (service key required for DB assertions)
- ✅ **Deletion path** — `delete-account` Edge Function + `dsar_delete_author_data()` RPC; RESTRICT FK on reports enforces legal hold; matches CASCADE on confession delete
- ✅ **Retention purge** — `purge_expired_data()` with pg_cron at 03:30 UTC; periods mirror DATA_RETENTION.md; REVOKED from anon + authenticated
- ⚠️ **Moderation block (manual)** — submit policy-violating text and confirm `200 {type:"blocked"}`; cannot be automated without embedding harmful content in the test suite
- ⚠️ **Gate `app/preview.tsx`** — add a `__DEV__` guard or remove the route from `_layout.tsx` before submitting to stores
- ⚠️ **Confirm all stubs removed** — verify `reportCsam()` is wired to NCMEC before production deploy
- ⚠️ **End-to-end test on a real device** — age gate → write → pipeline → match card → share → report → crisis path all exercised on physical iOS and Android hardware
- ⚠️ **Accessibility audit** — test with VoiceOver (iOS) and TalkBack (Android); ensure crisis resources are reachable with assistive technology
