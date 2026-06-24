# soulyap — Incident Response Runbook

> **Crisis path is always exempt from security actions.** Never suspend, block,
> or degrade the crisis flow. If forced to take the app offline, leave static
> crisis resources reachable.

---

## Severity definitions

| Sev | Description | Response time |
|-----|-------------|---------------|
| P0 | Identity separation broken; CSAM confirmed; live data exfiltration | Immediate (< 15 min) |
| P1 | Moderation/crisis pipeline bypassed in production; mass ban bypass | < 1 hour |
| P2 | Rate-limit bypass; bulk scraping; elevated abuse reports | < 4 hours |
| P3 | Single account abuse; spam; non-critical bug with workaround | < 24 hours |

---

## P0 — Identity breach / CSAM / active exfiltration

1. **Revoke service-role key** — Supabase Dashboard → Settings → API → regenerate `service_role`.
2. **Rotate `AUTHOR_TOKEN_SECRET`** — this invalidates all existing author tokens; re-derive via HMAC at next function deploy. All confessions become author-unlinkable (this is always true from DB, HMAC just changes).
3. **Rotate `MODERATION_API_KEY`** and `EMBEDDING_API_KEY` at the provider.
4. **Pause Edge Functions** — Supabase Dashboard → Edge Functions → pause `submit-confession`.
5. **Preserve evidence** — export Supabase logs, Cloudflare logs, and admin audit trail BEFORE making changes.
6. **CSAM** — if CSAM is confirmed: NCMEC CyberTipline report is mandatory (18 U.S.C. § 2258A). Do not delay for legal review. Preserve hash of flagged content; do not view or distribute.
7. **Notify users** if personal data was exposed — check GDPR/DPDP timelines (72 hours).
8. **Post-mortem** — timeline, root cause, fix, controls added. Store in `/docs/incidents/`.

---

## P1 — Safety pipeline bypass in production

1. Check Supabase Edge Function logs for the bypass path.
2. If moderation is down: pause `submit-confession` immediately (nothing gets stored without moderation).
3. If crisis is bypassed: identify the route, deploy a hotfix, re-run any stored confessions through the crisis check.
4. Increase WAF sensitivity on Cloudflare for the relevant endpoint.
5. Record all affected confession IDs for human review.

---

## P2 — Rate-limit bypass / bulk scraping

1. Identify IPs / ASNs from Cloudflare / Supabase logs.
2. Add Cloudflare firewall rule: block or challenge identified ranges.
3. Tighten Supabase per-IP rate limit for `submit-confession`.
4. If abuse is via new accounts: temporarily lower the per-account day limit in the Edge Function env (`ENVIRONMENT=strict` or similar flag).
5. Review whether any real confessions were affected; if seeds or dummy data was accessed at scale, no user data was exposed.

---

## P3 — Single account abuse / spam

1. In admin dashboard: navigate to Accounts → find user → Permanent Ban or Temp Ban.
2. The Edge Function's ban check (step [0]) blocks future submissions immediately.
3. Set `confessions.status = 'removed'` for any violating content via admin SQL or dashboard.
4. If escalation is needed: insert into `banned_tokens` to exclude existing confessions from the match pool.

---

## Key rotation checklist

Run whenever a secret is suspected compromised, or on the quarterly rotation schedule.

| Secret | Where to rotate | Impact |
|--------|-----------------|--------|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → API → regenerate | All Edge Functions need redeploy with new key |
| `AUTHOR_TOKEN_SECRET` | Supabase Edge Function secrets | Invalidates existing author tokens — confessions stay but author_tokens are now detached (safe; by design) |
| `MODERATION_API_KEY` | OpenAI / moderation provider | Rotate at provider, update Edge Function secret |
| `EMBEDDING_API_KEY` | OpenAI | Rotate at provider, update Edge Function secret |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → API | New app build required |

---

## Contacts

| Role | Contact |
|------|---------|
| Security reports (external) | security@soulyap.me |
| NCMEC CyberTipline | https://www.missingkids.org/gethelpnow/cybertipline |
| Supabase support | https://supabase.com/support |
| Apple security | https://developer.apple.com/contact/ |
| Google Play policy | https://support.google.com/googleplay/android-developer/ |

---

## Quarterly hygiene checklist

- [ ] Rotate all secrets (see table above)
- [ ] Run `npm audit` and update vulnerable deps
- [ ] Review Supabase RLS policies — confirm deny-by-default on all tables
- [ ] Review Cloudflare WAF rules and rate limits
- [ ] Review admin audit log for anomalies
- [ ] Test the crisis path end-to-end (must never be blocked)
- [ ] Verify NCMEC hook is live (test with a synthetic signal in staging)
- [ ] Check for leaked secrets: `gitleaks detect --source .`
