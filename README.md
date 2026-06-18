# You Are Not Alone

An anonymous, adults-only app where people write private confessions that are
matched to semantically similar past confessions via pgvector cosine similarity.
No replies. No profiles. No messaging. The absence of a reply channel is the
core safety design.

---

## Architecture

- **Client** — Expo SDK 56, React Native, TypeScript, expo-router
- **Backend** — Supabase: Postgres + pgvector + Auth + Edge Functions (Deno)
- **Safety pipeline** — 8 server-side steps; client cannot skip or reorder them
- **Identity separation** — `author_token = HMAC-SHA256(account_id, SECRET)`
  computed in Edge Functions only; no `account_id` column in `confessions`

See `CLAUDE.md` for the full non-negotiables and threat model.

---

## Configure sign-in providers

Both Apple and Google must be configured in two places: the provider's own
developer console, and the Supabase dashboard. Neither works without the other.

### Apple Sign-In (iOS only)

1. In the [Apple Developer portal](https://developer.apple.com), open your App
   ID (`com.anonymous.you-are-not-alone`) and enable the **Sign in with Apple**
   capability. The bundle ID must match `ios.bundleIdentifier` in `app.json`.
2. In the Supabase dashboard → **Authentication → Providers → Apple**, enable
   the provider and add your bundle ID to the **Client IDs** list.

### Google Sign-In

1. In [Google Cloud Console](https://console.cloud.google.com), create a
   **Web OAuth 2.0 client ID** for your project.
2. Add the following **Authorised redirect URI**:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
3. Copy the **Client ID** and **Client Secret** into Supabase dashboard →
   **Authentication → Providers → Google**.

### Allowed redirect URL (both providers)

In Supabase dashboard → **Authentication → URL Configuration → Allowed Redirect
URLs**, add:
```
yana://auth
```
Without this entry the OAuth consent succeeds but the redirect back to the app
is rejected by Supabase.

> **App Store guideline 4.8** — as long as Google sign-in is offered on iOS,
> Apple sign-in must be offered alongside it. Never remove the Apple button
> while the Google button exists.

> **Development builds** — native sign-in requires a development build (not
> Expo Go). Run `npx expo run:ios` / `npx expo run:android` or use EAS Build
> to test both providers on real devices.

---

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill environment files
cp .env.example .env
cp supabase/functions/.env.example supabase/functions/.env

# 3. Apply migrations to your local Supabase instance
npx supabase db push

# 4. Deploy Edge Functions
npx supabase functions deploy submit-confession
npx supabase functions deploy report

# 5. Verify the safety pipeline
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_ANON_KEY=your-anon-key \
TEST_JWT=your-test-account-jwt \
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
npm run verify-pipeline

# 6. Start the Expo dev server
npm start
```

### Safety verification — manual checks

`npm run verify-pipeline` covers identity separation, crisis path, benign flow,
and (with `--rate-limit`) rate limiting. One check cannot be automated:

| Check | How to verify |
|---|---|
| Moderation block | Submit policy-violating text (e.g. hate speech). Confirm `200 {type:"blocked"}`. |

---

## Operating the review queue

The admin CLI uses your `SUPABASE_SERVICE_ROLE_KEY` to query the
`admin_pending_crisis` and `admin_pending_reports` views and call the
`admin_resolve_*` RPCs. Run it locally — never expose `SERVICE_ROLE_KEY` in CI.

```bash
# Set once per terminal session
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# List unreviewed crisis events
npm run admin -- crisis

# List unresolved reports
npm run admin -- reports

# Mark a crisis event as reviewed (after a human has read it)
npm run admin -- resolve-crisis <uuid>

# Resolve a report (confession stays removed)
npm run admin -- resolve-report <uuid>

# Resolve a report AND restore the confession to live
npm run admin -- resolve-report <uuid> --restore
```

### Review SLAs (set before launch)

| Type | Target response |
|---|---|
| CSAM | Immediate — report to NCMEC, remove content |
| Crisis event | Same business day |
| Abuse/spam report | Within 72 hours |

---

## Secrets

See `.env.example` for the full list and where each secret lives.
The client bundle contains only `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY`. All other secrets are Edge Function env vars.

Generate `AUTHOR_TOKEN_SECRET` before your first production deploy:

```bash
openssl rand -hex 64
# then: supabase secrets set AUTHOR_TOKEN_SECRET=<value>
```

---

## Launch checklist

See `docs/LAUNCH_CHECKLIST.md` for the complete pre-launch checklist
(safety, legal, app store, infrastructure, and human review SLAs).
