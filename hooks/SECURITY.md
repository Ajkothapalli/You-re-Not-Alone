# soulyap — client security hooks

**Read this first.** These hooks are **defense-in-depth on the client only**. The
client runs on the attacker's device, so nothing here is a primary control — it
can all be bypassed by a determined attacker. The real protection lives at the
edge and server:

```
┌─ EDGE / CDN (Cloudflare in front of Supabase) ── stops DDoS, bots, floods
│   • DDoS mitigation, WAF rules, network rate-limiting, bot management
│   • request size limits, timeouts, geo/IP rules
├─ SERVER (Supabase / Edge Functions) ───────────── stops data theft, abuse
│   • RLS on every table, JWT verification, the safety pipeline
│   • HMAC author_token identity separation (no account_id in confessions)
│   • app-layer rate limits + ban escalation (already implemented)
│   • input validation + size caps, least-privilege service role, secrets in
│     Edge Function env only — never in the client bundle or logs
└─ CLIENT (this folder) ──────────────────────────── defense-in-depth only
    • device/app attestation, tamper detection, screen-capture guard,
      app lock, hardened fetch. Advisory signals — verified server-side.
```

## Hooks

| Hook | What it does | Needs (dev/EAS build) |
|---|---|---|
| `useAppLock` | Locks the UI when the app is backgrounded so an open confession isn't exposed if the phone is handed over. | none (works now) |
| `useScreenCaptureGuard(active)` | Blocks screenshots / screen recording on sensitive screens (write, match). | register `expo-screen-capture` |
| `useAppIntegrity()` | App Attest (iOS) / Play Integrity (Android) — proves the request is from the genuine app on a real device (defeats emulators, tampered clients, bots). **Token MUST be verified server-side.** | register a native attestation provider |
| `useTamperGuard()` | Jailbreak/root + debugger detection. Advisory → reduce trust / gate sensitive actions; never the only defense. | register `jail-monkey` (or similar) |
| `useSecureFetch()` | Hardened fetch: forces HTTPS, timeout + abort, standard headers, never logs bodies (confession text must never hit logs). | none (works now) |

## Native wiring (in a dev/EAS build — these no-op safely until registered)

```ts
// app/_layout.tsx (once, at startup) — only in a real build, behind billingAvailable()-style guards
import * as ScreenCapture from 'expo-screen-capture';
import { registerScreenCaptureControls, registerIntegrityProvider, registerTamperChecker } from '../hooks';

registerScreenCaptureControls({
  prevent: () => ScreenCapture.preventScreenCaptureAsync().catch(() => {}),
  allow:   () => ScreenCapture.allowScreenCaptureAsync().catch(() => {}),
});

registerIntegrityProvider(async () => {
  // iOS: App Attest via a native module; Android: Play Integrity.
  // Return { available, attested, token }. Send token to submit-confession;
  // the Edge Function verifies it with Apple/Google before trusting the request.
  return { available: false, attested: false };
});

registerTamperChecker(() => /* JailMonkey.isJailBroken() || JailMonkey.isDebuggedMode */ false);
```

## Server-side companions (NOT in this folder — see the hardening prompt)
- Verify the App Attest / Play Integrity token in `submit-confession` before
  trusting a submission; feed result into the authenticity/fraud score.
- Keep app-layer rate limits + ban escalation (done) AND add edge/WAF DDoS
  protection in front of Supabase.
- Security headers on the website + Edge Functions; dependency scanning;
  secret rotation; monitoring + incident response.

> Rule: a client signal (attested / not-tampered / locked) may **reduce trust or
> add friction**, but the server must never *rely* on it. Fail safe, verify
> server-side, and treat the crisis path as sacred (never gated, never blocked).
