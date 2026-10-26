# [N1] Push — the setup that is NOT in the repo

Everything in the app is built. Three things live outside it, and until all
three are done **no push can be delivered**, however correct the code is.

The APK you have now exercises the whole flow up to the moment a message
would be sent. What it cannot do is receive one.

---

## 1. Firebase / FCM  — *blocks push delivery entirely*

Android push goes through Firebase Cloud Messaging. Expo's push service is a
relay in front of it; without FCM credentials the relay has nowhere to hand
the message to.

1. Create a Firebase project (or use the existing one) and add an **Android
   app** with package name `me.soulyap.app`.
2. Download `google-services.json`.
3. **Do not commit it.** It identifies the project that can deliver push to
   every install. Put it in EAS as a *file* variable, once per environment:

   ```
   eas env:create --scope project --name GOOGLE_SERVICES_JSON \
     --type file --value ./google-services.json \
     --visibility secret --environment development
   ```
   Repeat with `--environment preview` and `--environment production`.

   For a LOCAL build, add to `.env` instead — gradle reads `.env`, not
   `eas.json`:
   ```
   GOOGLE_SERVICES_JSON=./google-services.json
   ```

4. Upload the **FCM v1 service account key** to EAS so Expo can send:
   Firebase console → Project settings → Service accounts → *Generate new
   private key*, then:
   ```
   eas credentials --platform android
   # → Push Notifications: Manage your FCM V1 service account key
   ```

`app.config.js` already reads `process.env.GOOGLE_SERVICES_JSON` and omits
the key when it is absent, so builds keep working without it — push is just
inert.

**Until this is done:** the permission dialog appears and can be granted,
but `getExpoPushTokenAsync` fails, no token is registered, and
`push_devices` stays empty. That is handled (the grant still succeeds and
the toast still shows) but it means nothing will ever arrive.

---

## 2. The cron — *blocks sending, even with FCM working*

`pg_cron` and `pg_net` are now enabled on DEV. The schedules were **not**
created, because `ALTER DATABASE … SET` needs a superuser connection that
the pooler does not give.

Run these three in the Supabase **SQL editor** (which runs as `postgres`),
then re-apply `supabase/migrations/20260930000004_push_cron.sql`:

```sql
ALTER DATABASE postgres SET app.service_role_key = '<dev service role key>';
ALTER DATABASE postgres SET app.cron_secret      = '<SEED_CRON_SECRET>';
ALTER DATABASE postgres SET app.functions_url    =
  'https://tmpqadweifuwbmktbmzg.supabase.co/functions/v1';
```

`app.functions_url` is already set on DEV. The other two are not — only you
have the secret values.

Verify with:
```sql
SELECT jobname, schedule FROM cron.job WHERE jobname LIKE 'push-%';
```
Expect three rows: `push-send` (*/10), `push-receipts` (*/15),
`push-question` (hourly).

**Kill switch**, any time:
```sql
SELECT cron.unschedule('push-send');
SELECT cron.unschedule('push-receipts');
SELECT cron.unschedule('push-question');
```
That stops sending without touching a device row, so nobody's preferences
are lost.

Optional: set `EXPO_ACCESS_TOKEN` as a function secret. Not required — the
sender works without it — but it raises Expo's rate limit and becomes
mandatory if you switch on Expo's "enhanced security" for push.

---

## 3. W3 — *blocks the felt push for FEED felts*

Verified on DEV, unchanged: the feed-felt path (`recommend-confessions`,
signal handler) writes only to `read_events`. It does not call
`increment_felt_count` and does not insert a `'felt'` notification. Only
`submit-confession` does — i.e. match-screen felts.

The N1 trigger fires on `notifications` INSERT where `type='felt'`, so it
will fire for match felts and **never for feed felts**. Since S1 made the
swipe stack the main read surface, that is most felts.

Not fixed here: W3 is blocked on three product decisions you have not
answered (match-path felts, milestone thresholds, unfelt-and-seal).

---

## What the current APK CAN test

- All three ask moments and their exact copy
- The Arrival illustration: idle drift, and the landing beat on tap
- The real system permission dialog, and both outcomes
- The granted / denied toasts
- "Not now", the 14-day cooldown, the 3-decline stop
- No card on day one, and none on crisis or blocked
- Settings → Notifications, including the blocked state and *Open settings*
- That nothing anywhere triggers the dialog on its own

## What it cannot

- Receiving a push (needs §1)
- Anything being sent (needs §1 + §2)
- Tapping a push to open Alerts (needs a push to tap)
- A felt from the feed producing anything at all (needs §3)
