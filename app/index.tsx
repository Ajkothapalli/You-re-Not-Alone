/**
 * Entry point / auth gate.
 * Steps: email → otp (enter 6-digit code) → dob
 *        OR: apple/google → dob (new user) / /write (existing user)
 *
 * Age gate: ALL auth paths land on the DOB step for new users.
 * An existing account row bypasses DOB and routes straight to the feed
 * (/explore) — the only read surface (owner decision 2026-09-13, CLAUDE.md §2).
 *
 * App Store guideline 4.8: Apple Sign-In is offered whenever Google is offered on iOS.
 */

import { announce } from '@/lib/a11y';
import { claimAuthCredential } from '@/lib/authCallback';
import { markInstall } from '@/lib/introWindow';
import { getDobOrder, maskDob, dobToISO, isAdultISO } from '@/lib/dobFormat';
import { createOrUpdateAccount, getReaderPreferences } from '@/lib/api';
import { resetFtue } from '@/lib/onboarding';
import { hydrateProfile } from '@/lib/profile';
import { evaluateRtue } from '@/lib/rtue';
import { signInWithGoogle } from '@/lib/oauth';
import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/withTimeout';
import { Lantern, IllustrationGround } from '@/components/illustrations';
import { useAspectFitWidth } from '@/hooks/useAspectFit';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import { GhostButton, PrimaryButton } from '@/components/Buttons';
import { usePalette, useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily, radius, spacing } from '@/theme/tokens';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { QuoteLeft, QuoteRight } from '@/components/brand/SoulyapLogo';

type Step = 'loading' | 'email' | 'otp' | 'password' | 'dob' | 'retry';

/**
 * The one account that signs in with a password instead of an emailed code.
 *
 * Google Play REJECTED the app (2026-09-14, "Multi-factor authentication
 * blocks access") because a reviewer cannot complete either sign-in route we
 * offer: Google OAuth needs a Google account we cannot hand over, and the
 * email OTP needs access to an inbox. Play's policy is explicit that reviewers
 * must not be asked to reach an external mailbox for a code, so the app has to
 * expose reusable credentials for one account.
 *
 * This is NOT a backdoor. It is ordinary Supabase email+password auth, offered
 * only for this address, against an account with no special privileges — every
 * gate a normal reader passes still applies to it: age verification, the
 * moderation pipeline, rate limits, bans. Knowing the address gets you a
 * password prompt and nothing else; the password lives in Play Console and the
 * Supabase user list, never in this bundle.
 *
 * Empty (the default) disables the branch entirely, so a build without the
 * variable behaves exactly as before.
 */
const REVIEW_EMAIL = (process.env.EXPO_PUBLIC_REVIEW_EMAIL ?? '').trim().toLowerCase();


function parseAuthTokens(url: string): { accessToken?: string; refreshToken?: string } {
  const hash = url.split('#')[1];
  if (!hash) return {};
  const p = new URLSearchParams(hash);
  return {
    accessToken:  p.get('access_token')  ?? undefined,
    refreshToken: p.get('refresh_token') ?? undefined,
  };
}

export default function IndexScreen() {
  const palette = usePalette();
  const color   = useThemeColors();
  const styles  = useMemo(() => createStyles(color), [color]);
  const { order: dobOrder, placeholder: dobPlaceholder } = useMemo(() => getDobOrder(), []);

  // Width-anchored measured fit (hooks/useAspectFit.ts) — this header sits in
  // a plain ScrollView with natural content flow, so only the width is known
  // up front (50% of the screen); height is derived arithmetically rather
  // than via RN's own `aspectRatio` style prop, for consistency with every
  // other illustration mount site in the app.
  const lanternFit = useAspectFitWidth(4 / 3);

  const [step,           setStep]           = useState<Step>('loading');
  const [email,          setEmail]          = useState('');
  const [otp,            setOtp]            = useState('');
  const [password,       setPassword]       = useState('');
  const [dob,            setDob]            = useState('');
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState('');

  const stepRef     = useRef(step);
  const routingRef  = useRef(false);   // prevents concurrent routeAfterAuth calls
  useEffect(() => { stepRef.current = step; }, [step]);

  // The OAuth callback route (app/auth.tsx) hands the redirect URL here rather
  // than trying to complete the sign-in itself — see that file for why it must
  // not keep the screen. Present only on the sign-in-return navigation.
  const search = useLocalSearchParams<{ authUrl?: string | string[] }>();
  const handedOffUrl = Array.isArray(search.authUrl) ? search.authUrl[0] : search.authUrl;

  // Announce errors to the screen reader as they appear.
  useEffect(() => { if (error) announce(error); }, [error]);

  function clearError() { setError(''); }

  // ── Routing helper (reused by email OTP and OAuth paths) ─────────────────────
  async function routeAfterAuth(userId: string) {
    if (routingRef.current) return;
    routingRef.current = true;
    const t0 = Date.now();

    try {
      void hydrateProfile().catch(() => {});
      void markInstall().catch(() => {});

      // Fire both queries in parallel so acct lookup doesn't gate prefs.
      const acctP = withTimeout(
        supabase.from('accounts').select('id').eq('id', userId).maybeSingle(),
        5_000, 'acct',
      );
      const prefsP = withTimeout(getReaderPreferences(), 5_000, 'prefs')
        .then(p  => ({ ok: true  as const, p }))
        .catch(() => ({ ok: false as const, p: null }));

      const { data: acct } = await acctP;
      const acctMs = Date.now() - t0;
      if (acctMs > 2_000) console.warn('[boot] acct', acctMs, 'ms');

      if (!acct) {
        // resetFtue() is pure on-device AsyncStorage (no network call) so there's
        // no confirmed hang mechanism here — but it's the one awaited call in this
        // whole path that had no bound of its own (acctP/prefsP/rtue below all do).
        // Wrapped for defense-in-depth/consistency: an onboarding-flag reset is
        // never worth blocking sign-in on, whatever the reason it stalled.
        await withTimeout(resetFtue(), 3_000, 'resetFtue').catch(() => {});
        setStep('dob');
        return;
      }

      // acct exists — wait for prefs (already in-flight).
      const prefs = await prefsP;
      const prefsMs = Date.now() - t0;
      if (prefsMs > 2_000) console.warn('[boot] prefs', prefsMs, 'ms');

      // Network failure / timeout — don't restart FTUE for an onboarded user.
      if (!prefs.ok) {
        router.replace('/explore');
        return;
      }

      if ((prefs.p?.categories.length ?? 0) === 0) {
        await withTimeout(resetFtue(), 3_000, 'resetFtue').catch(() => {});
        router.replace('/welcome');
        return;
      }

      const rtue = await withTimeout(evaluateRtue(), 2_500, 'rtue').catch(() => null);
      const rtueMs = Date.now() - t0;
      if (rtueMs > 2_000) console.warn('[boot] rtue', rtueMs, 'ms');

      if (rtue) { router.replace('/rtue'); return; }

      // The feed is the read surface, always (owner decision 2026-09-13).
      // No window check here any more: the intro window only decides whether
      // the WRITE PROMPT appears at the end of the feed, never whether someone
      // is allowed to read.
      router.replace('/explore');
    } catch (err) {
      // Reset so a retry attempt can call routeAfterAuth again.
      routingRef.current = false;
      throw err;
    }
  }

  /**
   * Route from whatever session already exists, without exchanging anything.
   *
   * Reached when a callback credential turns out to be already claimed. That is
   * NOT always a harmless duplicate: on the warm path /auth's replace can mount
   * a FRESH IndexScreen over the one that did the exchange, so this instance
   * holds none of the resulting state. Returning early there would leave it on
   * the loading splash until the watchdog gave up — the same shape of bug this
   * whole change exists to remove.
   *
   * The exchange that claimed the code may still be in flight, so a single
   * getSession() can legitimately come back empty. Poll briefly rather than
   * dropping the user on the email screen a beat before their session lands.
   */
  async function resumeFromSession() {
    for (let attempt = 0; attempt < 8; attempt++) {
      // Someone else's routeAfterAuth is already in flight (or has finished);
      // it owns the step and the navigation. Deliberately NOT clearing
      // routingRef here — every other caller does, because it has a fresher
      // signal than whatever set it. This one does not: it holds no credential
      // and knows nothing the in-flight call doesn't.
      if (routingRef.current) return;

      const { data } = await supabase.auth.getSession().catch(
        () => ({ data: { session: null } }),
      );
      if (data.session?.user) {
        try { await routeAfterAuth(data.session.user.id); }
        catch { setStep('retry'); }
        return;
      }
      await new Promise(r => setTimeout(r, 500));
    }
    // ~4s and still nothing: the exchange failed rather than raced.
    setStep('email');
  }

  // ── Deep link handler (magic-link + Google OAuth PKCE redirect) ──────────────
  //
  // This function can be invoked several times, concurrently, for the same URL:
  // from runBoot() via Linking.getInitialURL(), from the Linking 'url' event
  // listener (the native side doesn't suppress the event just because
  // getInitialURL() already returned it), and now from the /auth handoff param.
  // All of them race to exchange the SAME single-use PKCE code; whichever loses
  // gets "code already used" and lands in the catch block.
  //
  // The claim is taken synchronously, before any await, so only the first
  // caller ever attempts the exchange — JS's single-threaded execution is what
  // makes the check-and-claim safe. Later callers become true no-ops.
  //
  // The claim lives at module scope (lib/authCallback.ts), NOT in a useRef as
  // it did before. A per-component ref is the wrong lifetime for the cold-start
  // path: the callback arrives on /auth, IndexScreen mounts afterwards, and a
  // fresh ref would happily re-claim a code another screen already spent.
  //
  // NOTE: this race was previously recorded here as the root cause of the
  // Android "stuck loading" report. It was not — it is a real race, and the
  // de-dupe is worth keeping, but the actual cause was app/auth.tsx keeping the
  // screen forever on the new-user path. See that file.
  async function handleDeepLink(url: string) {
    // PKCE code flow — Google OAuth on Android fires this BEFORE (or instead of)
    // openAuthSessionAsync resolving. Dismiss the browser first so it doesn't
    // block, then exchange the code for a session.
    const codeMatch = url.match(/[?&#]code=([^&#]+)/);
    if (codeMatch) {
      const code = decodeURIComponent(codeMatch[1]);
      if (!claimAuthCredential(code)) { await resumeFromSession(); return; }

      WebBrowser.dismissBrowser();
      setBusy(true);
      try {
        const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exchErr) throw exchErr;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('No user after sign-in');
        // Session established — show branded loading screen while routing queries run.
        // This replaces the frozen-button-spinner the user would otherwise see.
        setStep('loading');
        setBusy(false);
        // A deep-link-driven sign-in is the freshest, most authoritative signal
        // we'll get — it must always route, regardless of any stale routingRef
        // left by runBoot's own (now-irrelevant) session check.
        routingRef.current = false;
        await routeAfterAuth(user.id);
      } catch (err: any) {
        // With the de-dupe above, reaching here means a genuine failure (expired
        // code, network error) — not a duplicate-code race. A session may still
        // exist (e.g. a prior attempt already succeeded), so try to route once
        // more before giving up — the retry screen should be a last resort, not
        // the primary recovery path.
        const { data: { session } } = await supabase.auth.getSession().catch(
          () => ({ data: { session: null } }),
        );
        if (!session?.user) {
          console.warn('[auth] code exchange failed:', err?.message ?? err);
          setError(err.message ?? 'Sign-in failed. Try again.');
          setStep('email');
        } else {
          routingRef.current = false;
          try {
            await routeAfterAuth(session.user.id);
          } catch {
            setStep('retry');
          }
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    // Implicit flow — magic link with #access_token= in the fragment
    const { accessToken, refreshToken } = parseAuthTokens(url);
    if (!accessToken || !refreshToken) return;

    // Same double-dispatch risk as the PKCE branch above (a magic link can
    // also cold-start the app) — de-dupe by the access token.
    if (!claimAuthCredential(accessToken)) { await resumeFromSession(); return; }

    setBusy(true);
    try {
      const { error: err } = await supabase.auth.setSession({
        access_token:  accessToken,
        refresh_token: refreshToken,
      });
      if (err) throw err;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user after setSession');
      routingRef.current = false;
      await routeAfterAuth(user.id);
    } catch (err: any) {
      setError(err.message ?? 'Sign-in failed. Try again.');
      setStep('email');
    } finally {
      setBusy(false);
    }
  }

  // ── Bootstrap (named so retryBoot can re-invoke it) ─────────────────────────
  async function runBoot() {
    routingRef.current = false;
    let hadSession = false;
    try {
      const initialUrl = await Linking.getInitialURL();
      // Handle PKCE (?code=) and implicit (#access_token=) initial URLs.
      if (initialUrl && (initialUrl.includes('access_token') || initialUrl.includes('code='))) {
        await handleDeepLink(initialUrl);
        return;
      }

      // Bound getSession so a wedged Supabase client doesn't hang forever.
      let session = null;
      try {
        const { data } = await withTimeout(supabase.auth.getSession(), 4_000, 'session');
        session = data.session;
      } catch {
        setStep('email');
        return;
      }

      if (!session?.user) { setStep('email'); return; }
      hadSession = true;
      await routeAfterAuth(session.user.id);
    } catch {
      setStep(hadSession ? 'retry' : 'email');
    }
  }

  function retryBoot() {
    setStep('loading');
    void runBoot();
  }

  useEffect(() => {
    // A handoff from /auth IS the boot for this launch — runBoot's own
    // getInitialURL() branch would only rediscover the same URL, and on a warm
    // deep link Android may hand it the stale launching intent instead.
    if (handedOffUrl) void handleDeepLink(handedOffUrl);
    else void runBoot();
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, []);

  // Warm path: IndexScreen was already mounted underneath /auth, so the
  // mount effect above has long since run and will not run again. The handoff
  // arrives as a param change instead, and has to be picked up here.
  //
  // This deliberately overlaps with the mount effect on the cold path — both
  // fire with the same URL. That is safe by construction rather than by
  // ordering: handleDeepLink claims the code synchronously, so exactly one of
  // them does the exchange and the other returns having touched nothing.
  useEffect(() => {
    if (handedOffUrl) void handleDeepLink(handedOffUrl);
  }, [handedOffUrl]);

  // Last-resort watchdog: catches any hang not covered by the per-call timeouts
  // (e.g. getInitialURL wedging, exchangeCodeForSession hanging with no timeout
  // of its own, or an unforeseen Expo API freeze).
  //
  // THIRD "stuck on loading spinner" report, root cause: this watchdog used to
  // be a single setTimeout created once at mount (inside the effect above) —
  // it fired exactly once, 10s after first render, and then was permanently
  // spent for the rest of the component's lifetime. Concretely:
  //   t=0     mount, step='loading' (initial state), one-shot timer armed for t=10s
  //   t=0.3s  runBoot() finds no session → setStep('email'); user reads the screen
  //   t=10s   the one-shot timer fires; stepRef.current is 'email', not 'loading'
  //           → the check is false, nothing happens, and the timer is now gone
  //           for good — clearTimeout/setTimeout is never called again by that
  //           effect (empty dep array, runs once).
  //   t=25s   user taps "Continue with Google" → setStep('loading'). From here
  //           on, ANY hang in the OAuth → handleDeepLink → routeAfterAuth chain
  //           (e.g. exchangeCodeForSession, which has no timeout wrapper at all)
  //           has zero watchdog coverage — the only net left is handleProvider's
  //           own 15s Android-only timer, which is scoped to "browser dismissed,
  //           waiting for a deep link", not to however long processing takes
  //           once the deep link *has* arrived.
  // Any user who spends more than ~10s on the email screen before signing in
  // — i.e. reads the copy, thinks about it — silently loses their safety net.
  //
  // Fix: re-arm on every transition INTO 'loading' instead of once at mount, so
  // no entry point (initial boot, OAuth, magic link, retryBoot) can ever sit in
  // 'loading' unrecovered for more than 10s, regardless of how long the user
  // dwelled on a prior screen first.
  useEffect(() => {
    if (step !== 'loading') return;
    const watchdog = setTimeout(() => {
      if (stepRef.current === 'loading') {
        console.warn('[boot] watchdog fired after 10s');
        setStep('retry');
      }
    }, 10_000);
    return () => clearTimeout(watchdog);
  }, [step]);

  // ── Provider sign-in (Google) ─────────────────────────────────────────────────
  async function handleProvider(provider: 'google') {
    clearError();
    setBusy(true);
    // On Android, signInWithGoogle always returns false (browser 'dismiss') because
    // openAuthSessionAsync is a polyfill — the real code arrives via deep link
    // (handleDeepLink below). We keep busy=true and let handleDeepLink clear it.
    // A 15-second guard cancels the spinner if no deep link ever arrives (cancelled).
    let waitingForDeepLink = false;
    try {
      const success = await signInWithGoogle();
      if (!success) {
        if (Platform.OS === 'android') {
          // Android: openAuthSessionAsync is a polyfill; real auth arrives via deep link.
          // Show the branded loading screen immediately so the user isn't staring at a
          // frozen button spinner for the ~5-10s it takes to exchange + route.
          // The 15s fallback reverts to email if no deep link ever fires (user cancelled).
          waitingForDeepLink = true;
          setStep('loading');
          setTimeout(() => {
            if (stepRef.current === 'loading') setStep('email');
          }, 15_000);
          return;
        }
        // iOS: false means the user dismissed the Safari sheet — stop spinner immediately.
        return;
      }
      // iOS / success-URL path — session is already established.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user after sign-in');
      await routeAfterAuth(user.id);
    } catch (err: any) {
      // The message stays friendly — a provider error string is no use to the
      // person signing in. But it used to be DISCARDED, which made every
      // provider failure look identical from both the screen and the logs:
      // a redirect that was never allowlisted, a cancelled browser and an
      // expired code all produced this one sentence and nothing else. Logging
      // the real reason costs nothing and is the difference between reading
      // one logcat line and guessing.
      console.warn('[auth] provider sign-in failed:', err?.message ?? err);
      setError('Sign-in didn\'t complete. Try again.');
    } finally {
      if (!waitingForDeepLink) setBusy(false);
    }
  }

  // ── Step 1: email ─────────────────────────────────────────────────────────────
  async function handleEmail() {
    clearError();
    const trimmed = email.trim();
    if (!trimmed) { setError("Add your email to continue"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("That doesn't look like an email");
      return;
    }
    // The review account signs in with a password (see REVIEW_EMAIL above).
    // Checked before the OTP send so no code is ever mailed to it.
    if (REVIEW_EMAIL && trimmed.toLowerCase() === REVIEW_EMAIL) {
      setStep('password');
      return;
    }

    setBusy(true);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: trimmed.toLowerCase(),
      });
      if (err) throw err;
      setStep('otp');
    } catch (err: any) {
      setError("Couldn't send the code — try again");
    } finally {
      setBusy(false);
    }
  }

  // ── Step 1b: password (review account only) ───────────────────────────────────
  async function handlePassword() {
    clearError();
    if (!password) { setError('Enter the password.'); return; }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email:    email.trim().toLowerCase(),
        password,
      });
      if (err) throw err;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user after sign-in');
      await routeAfterAuth(user.id);
    } catch (err: any) {
      setError('That password did not work.');
    } finally {
      setBusy(false);
    }
  }

  // ── Step 2: 6-digit OTP ───────────────────────────────────────────────────────
  async function handleOtp() {
    clearError();
    const code = otp.trim();
    if (code.length !== 6 || !/^\d+$/.test(code)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code,
        type:  'email',
      });
      if (err) throw err;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user after verify');
      await routeAfterAuth(user.id);
    } catch (err: any) {
      setError(err.message ?? 'Invalid or expired code. Request a new one.');
    } finally {
      setBusy(false);
    }
  }

  // ── Step 3: DOB ───────────────────────────────────────────────────────────────
  async function handleDob() {
    clearError();
    const iso = dobToISO(dob, dobOrder);
    if (!iso) {
      setError(`Enter your date of birth as ${dobPlaceholder}.`);
      return;
    }
    if (!isAdultISO(iso)) {
      setError('You must be 18 or older to use this app.');
      return;
    }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const authProvider = (user?.app_metadata?.provider as string) ?? 'email';
      await createOrUpdateAccount(new Date(iso), authProvider);
      // New account row just created — always show FTUE regardless of any
      // stale on-device flag left over from a previous deleted account.
      await withTimeout(resetFtue(), 3_000, 'resetFtue').catch(() => {});
      router.replace('/welcome');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  // ── Loading splash ────────────────────────────────────────────────────────────
  if (step === 'loading') {
    return (
      <View style={styles.center}>
        <View style={styles.logoRow}>
          <QuoteLeft style={styles.logoLeft} />
          <QuoteRight style={styles.logoRight} />
        </View>
        <Text style={styles.wordmark} accessibilityRole="header">soulyap</Text>
        <ActivityIndicator
          color={color.dim}
          style={{ marginTop: 20 }}
          accessibilityLabel="Loading"
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <QuoteLeft style={styles.logoLeft} />
            <QuoteRight style={styles.logoRight} />
          </View>
          <Text style={styles.wordmark} accessibilityRole="header">soulyap</Text>
          {/* First-impression-on-return only: Lantern ("come in, we're
              listening") appears on the email step — a calmer, single-figure
              return-visitor moment, distinct from Threshold's grand two-figure
              first impression on onboarding beat 0 and from EmptyBench's
              empty-inbox mood (reserved for you.tsx's My Confessions empty
              state). Skipped on otp/dob — those are mid-flow, not
              first-impression, and the compact header keeps focus on the
              code/DOB input. Deliberately modest (50%, not 100%) — this is a
              small accent, not a hero. */}
          {step === 'email' && (
            <View style={styles.illustrationWrap} onLayout={lanternFit.onLayout}>
              {lanternFit.ready && (
                <IllustrationGround style={{ width: lanternFit.width, height: lanternFit.height }}>
                  <Lantern style={{ width: lanternFit.width, height: lanternFit.height }} />
                </IllustrationGround>
              )}
            </View>
          )}
          <Text style={styles.sub}>
            {step === 'email'    && 'A private place to share what you carry.'}
            {step === 'otp'      && `Check your email — we sent a code to ${email}`}
            {step === 'password' && 'Enter the password for this account.'}
            {step === 'dob'      && 'Adults only. Your age is verified once.'}
            {step === 'retry'    && ''}
          </Text>
        </View>

        {/* ── Email step ── */}
        {step === 'email' && (
          <View style={styles.form}>
            <GoogleSignInButton
              onPress={() => handleProvider('google')}
              disabled={busy}
              loading={busy}
            />

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Email / OTP path */}
            <Text style={styles.label}>Your email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={color.dim}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              onSubmitEditing={handleEmail}
              returnKeyType="done"
              accessibilityLabel="Your email address"
            />
            {!!error && (
              <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="assertive">
                {error}
              </Text>
            )}
            <PrimaryButton label="Continue" onPress={handleEmail} loading={busy} />
          </View>
        )}

        {/* ── OTP step ── */}
        {step === 'otp' && (
          <View style={styles.form}>
            <Text style={styles.label}>6-digit code</Text>
            <TextInput
              style={[styles.input, styles.otpInput]}
              value={otp}
              onChangeText={setOtp}
              placeholder="000000"
              placeholderTextColor={color.dim}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              onSubmitEditing={handleOtp}
              returnKeyType="done"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              accessibilityLabel="6-digit verification code from your email"
            />
            {!!error ? (
              <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="assertive">
                {error}
              </Text>
            ) : (
              <Text style={styles.otpHint}>Open your email and enter the 6-digit code.</Text>
            )}
            <PrimaryButton label="Verify" onPress={handleOtp} loading={busy} />
            <GhostButton
              label="Use a different email"
              onPress={() => { setStep('email'); setOtp(''); clearError(); }}
            />
          </View>
        )}

        {/* ── Password step (review account only — see REVIEW_EMAIL) ── */}
        {step === 'password' && (
          <View style={styles.form}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={color.dim}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password"
              textContentType="password"
              autoFocus
              onSubmitEditing={handlePassword}
              returnKeyType="done"
              accessibilityLabel="Account password"
            />
            {!!error && (
              <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="assertive">
                {error}
              </Text>
            )}
            <PrimaryButton label="Sign in" onPress={handlePassword} loading={busy} />
            <GhostButton
              label="Use a different email"
              onPress={() => { setStep('email'); setPassword(''); clearError(); }}
            />
          </View>
        )}

        {/* ── DOB step ── */}
        {step === 'dob' && (
          <View style={styles.form}>
            <Text style={styles.label}>Date of birth</Text>
            <TextInput
              style={styles.input}
              value={dob}
              onChangeText={(t) => setDob(prev => maskDob(t, prev, dobOrder))}
              placeholder={dobPlaceholder}
              placeholderTextColor={color.dim}
              keyboardType="number-pad"
              maxLength={8}
              autoFocus
              onSubmitEditing={handleDob}
              returnKeyType="done"
              accessibilityLabel="Date of birth"
              accessibilityHint={
                dobOrder.map(p => `two digit ${p}`).join(', ') +
                '. Dashes are added automatically.'
              }
            />
            {!!error ? (
              <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="assertive">
                {error}
              </Text>
            ) : (
              <Text style={styles.dobHint}>Checked once. Never shown with anything you write.</Text>
            )}
            <PrimaryButton label="Enter" onPress={handleDob} loading={busy} />
          </View>
        )}

        {/* ── Retry step ── */}
        {step === 'retry' && (
          <View style={styles.form}>
            <Text style={styles.retryHeading}>Taking longer than usual</Text>
            <Text style={styles.sub}>
              we can't reach soulyap right now.{'\n'}check your connection and try again.
            </Text>
            <PrimaryButton label="Try again" onPress={retryBoot} />
            <GhostButton
              label="Use a different account"
              onPress={async () => {
                await supabase.auth.signOut().catch(() => {});
                setStep('email');
              }}
            />
          </View>
        )}

        <View style={styles.legalRow}>
          <Text style={styles.legal}>By continuing you agree to our </Text>
          <Pressable
            onPress={() => router.push({ pathname: '/policy', params: { type: 'terms' } })}
            accessibilityRole="link"
            accessibilityLabel="Terms of Service"
          >
            <Text style={styles.legalLink}>Terms of Service</Text>
          </Pressable>
          <Text style={styles.legal}> and </Text>
          <Pressable
            onPress={() => router.push({ pathname: '/policy', params: { type: 'privacy' } })}
            accessibilityRole="link"
            accessibilityLabel="Privacy Policy"
          >
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </Pressable>
          <Text style={styles.legal}>.</Text>
        </View>
      </ScrollView>

    </KeyboardAvoidingView>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    root: {
      flex:            1,
      backgroundColor: color.bg,
    },
    center: {
      flex:            1,
      backgroundColor: color.bg,
      justifyContent:  'center',
      alignItems:      'center',
    },
    scroll: {
      flexGrow:      1,
      padding:       spacing.screenPadding,
      paddingTop:    88,
      paddingBottom: 48,
      gap:           20,
    },
    header: {
      alignItems:   'center',
      gap:          4,
      marginBottom: 20,
    },
    logoRow: {
      flexDirection: 'row',
      width:         140,
      height:        140,
      marginBottom:  -28,
    },
    logoLeft: {
      width:  140 * 0.4111,
      height: 140,
    },
    illustrationWrap: {
      width:      '50%',
      alignSelf:  'center',
      marginVertical: 4,
    },
    logoRight: {
      width:  140 * (1 - 0.4111),
      height: 140,
    },
    wordmark: {
      fontFamily:     fontFamily.sansBold,
      fontSize:       30,
      color:          color.paper,
      textAlign:      'center',
      textTransform:  'none',
    },
    sub: {
      fontFamily: fontFamily.sans,
      fontSize:   15,
      color:      color.dim,
      textAlign:  'center',
    },
    form: {
      gap: 12,
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:           10,
      marginVertical: 4,
    },
    dividerLine: {
      flex:            1,
      height:          StyleSheet.hairlineWidth,
      backgroundColor: color.line,
    },
    dividerText: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      11,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color:         color.dim,
    },
    label: {
      fontFamily:    fontFamily.sansBold,
      fontSize:      11,
      letterSpacing: 0.18 * 11,
      textTransform: 'uppercase',
      color:         color.dim,
    },
    input: {
      backgroundColor: color.ink,
      borderRadius:    radius.input,
      borderWidth:     2,
      borderColor:     color.border,
      padding:         16,
      fontFamily:      fontFamily.sans,
      fontSize:        15,
      color:           color.paper,
    },
    otpInput: {
      fontSize:      28,
      letterSpacing: 8,
      textAlign:     'center',
    },
    otpHint: {
      fontFamily: fontFamily.sans,
      fontSize:   13,
      color:      color.dim,
      textAlign:  'center',
      marginTop:  -4,
    },
    dobHint: {
      fontFamily: fontFamily.sans,
      fontSize:   13,
      color:      color.dim,
      marginTop:  -4,
    },
    retryHeading: {
      fontFamily: fontFamily.sansBold,
      fontSize:   22,
      color:      color.paper,
      textAlign:  'center',
    },
    errorText: {
      fontFamily: fontFamily.sans,
      fontSize:   13,
      color:      '#EF4444',
      marginTop:  -4,
    },
    legalRow: {
      flexDirection:  'row',
      flexWrap:       'wrap',
      justifyContent: 'center',
      alignItems:     'center',
      marginTop:      8,
    },
    legal: {
      fontFamily: fontFamily.sans,
      fontSize:   11,
      color:      color.dim,
    },
    legalLink: {
      fontFamily:         fontFamily.sansBold,
      fontSize:           11,
      color:              color.dim,
      textDecorationLine: 'underline',
    },
  });
}
