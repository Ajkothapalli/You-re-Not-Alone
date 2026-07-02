/**
 * Entry point / auth gate.
 * Steps: email → otp (enter 6-digit code) → dob
 *        OR: apple/google → dob (new user) / /write (existing user)
 *
 * Age gate: ALL auth paths land on the DOB step for new users.
 * An existing account row bypasses DOB and routes directly to /read.
 * Owner decision 2026-06-12: read screen shows every launch (see CLAUDE.md §2).
 *
 * App Store guideline 4.8: Apple Sign-In is offered whenever Google is offered on iOS.
 */

import { announce } from '@/lib/a11y';
import { createOrUpdateAccount, getReaderPreferences } from '@/lib/api';
import { resetFtue } from '@/lib/onboarding';
import { hydrateProfile } from '@/lib/profile';
import { evaluateRtue } from '@/lib/rtue';
import { signInWithGoogle } from '@/lib/oauth';
import { supabase } from '@/lib/supabase';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import { GhostButton, PrimaryButton } from '@/components/Buttons';
import { usePalette } from '@/theme/ThemeProvider';
import { color, fontFamily, radius, spacing } from '@/theme/tokens';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Step = 'loading' | 'email' | 'otp' | 'dob';

function isAdult(dobStr: string): boolean {
  const dob = new Date(dobStr);
  if (isNaN(dob.getTime())) return false;
  return Date.now() - dob.getTime() >= 18 * 365.25 * 24 * 60 * 60 * 1000;
}

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

  const [step,           setStep]           = useState<Step>('loading');
  const [email,          setEmail]          = useState('');
  const [otp,            setOtp]            = useState('');
  const [dob,            setDob]            = useState('');
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState('');

  const stepRef     = useRef(step);
  const routingRef  = useRef(false);   // prevents concurrent routeAfterAuth calls
  useEffect(() => { stepRef.current = step; }, [step]);

  // Announce errors to the screen reader as they appear.
  useEffect(() => { if (error) announce(error); }, [error]);

  function clearError() { setError(''); }

  // ── Routing helper (reused by email OTP and OAuth paths) ─────────────────────
  async function routeAfterAuth(userId: string) {
    if (routingRef.current) return;   // guard against concurrent calls
    routingRef.current = true;
    const { data: acct } = await supabase
      .from('accounts').select('id').eq('id', userId).maybeSingle();
    // Pull the account's character/name/release-count so they're identical
    // on every device the user signs into (iOS ↔ Android). Non-blocking on failure.
    await hydrateProfile().catch(() => {});
    if (acct) {
      // reader_preferences is a server-side signal: if missing, the user
      // hasn't completed onboarding regardless of any stale on-device flag.
      // Route to /welcome (FTUE) which includes category selection in beat 4.
      const prefs = await getReaderPreferences().catch((): null => null);
      if ((prefs?.categories.length ?? 0) === 0) {
        await resetFtue().catch(() => {});
        router.replace('/welcome');
        return;
      }
      // Check for a meaningful return moment before landing on read.
      const rtue = await evaluateRtue().catch((): null => null);
      if (rtue) {
        router.replace('/rtue');
      } else {
        router.replace('/read');
      }
    } else {
      // New account row — clear stale on-device FTUE flag before DOB step.
      await resetFtue().catch(() => {});
      setStep('dob');
    }
  }

  // ── Deep link handler (magic-link + Google OAuth PKCE redirect) ──────────────
  async function handleDeepLink(url: string) {
    // PKCE code flow — Google OAuth on Android fires this BEFORE (or instead of)
    // openAuthSessionAsync resolving. Dismiss the browser first so it doesn't
    // block, then exchange the code for a session.
    const codeMatch = url.match(/[?&#]code=([^&#]+)/);
    if (codeMatch) {
      WebBrowser.dismissBrowser();
      setBusy(true);
      try {
        const { error: exchErr } = await supabase.auth.exchangeCodeForSession(
          decodeURIComponent(codeMatch[1]),
        );
        if (exchErr) throw exchErr;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('No user after sign-in');
        await routeAfterAuth(user.id);
      } catch (err: any) {
        // Code may have already been exchanged by openAuthSessionAsync path —
        // check for an existing session before surfacing an error.
        const { data: { session } } = await supabase.auth.getSession().catch(
          () => ({ data: { session: null } }),
        );
        if (!session?.user) {
          setError(err.message ?? 'Sign-in failed. Try again.');
          setStep('email');
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    // Implicit flow — magic link with #access_token= in the fragment
    const { accessToken, refreshToken } = parseAuthTokens(url);
    if (!accessToken || !refreshToken) return;

    setBusy(true);
    try {
      const { error: err } = await supabase.auth.setSession({
        access_token:  accessToken,
        refresh_token: refreshToken,
      });
      if (err) throw err;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user after setSession');
      await routeAfterAuth(user.id);
    } catch (err: any) {
      setError(err.message ?? 'Sign-in failed. Try again.');
      setStep('email');
    } finally {
      setBusy(false);
    }
  }

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        // Handle both PKCE (?code=) and implicit (#access_token=) initial URLs.
        // On Android the process can be killed during OAuth and the deep link
        // restarts it — without this check the code param is silently dropped.
        if (initialUrl && (initialUrl.includes('access_token') || initialUrl.includes('code='))) {
          await handleDeepLink(initialUrl);
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) { setStep('email'); return; }

        await routeAfterAuth(session.user.id);
      } catch {
        setStep('email');
      }
    })();

    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, []);

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
        // Android dismiss path — deep link will complete auth.
        waitingForDeepLink = true;
        setTimeout(() => {
          // Fires only if user truly cancelled (no deep link arrived).
          setBusy(false);
        }, 15_000);
        return;
      }
      // iOS / success-URL path — session is already established.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user after sign-in');
      await routeAfterAuth(user.id);
    } catch (err: any) {
      setError('Sign-in didn\'t complete. Try again.');
    } finally {
      if (!waitingForDeepLink) setBusy(false);
    }
  }

  // ── Step 1: email ─────────────────────────────────────────────────────────────
  async function handleEmail() {
    clearError();
    if (!email.trim()) { setError('Enter your email address.'); return; }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
      });
      if (err) throw err;
      setStep('otp');
    } catch (err: any) {
      setError(err.message ?? 'Could not send code. Try again.');
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
    if (!dob.match(/^\d{4}-\d{2}-\d{2}$/)) {
      setError('Enter your date of birth as YYYY-MM-DD.');
      return;
    }
    if (!isAdult(dob)) {
      setError('You must be 18 or older to use this app.');
      return;
    }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const authProvider = (user?.app_metadata?.provider as string) ?? 'email';
      await createOrUpdateAccount(new Date(dob), authProvider);
      // New account row just created — always show FTUE regardless of any
      // stale on-device flag left over from a previous deleted account.
      await resetFtue().catch(() => {});
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
        <Text style={styles.wordmark} accessibilityRole="header">you're not alone</Text>
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
        <Text style={styles.wordmark} accessibilityRole="header">you're not alone</Text>
        <Text style={styles.sub}>
          {step === 'email' && 'A private place to share what you carry.'}
          {step === 'otp'   && `Check your email — we sent a code to ${email}`}
          {step === 'dob'   && 'Adults only. Your age is verified once.'}
        </Text>

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
            <Text style={styles.label}>your email</Text>
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
            <Text style={styles.otpHint}>
              Open your email and enter the 6-digit code.
            </Text>
            <PrimaryButton label="Verify" onPress={handleOtp} loading={busy} />
            <GhostButton
              label="Use a different email"
              onPress={() => { setStep('email'); setOtp(''); clearError(); }}
            />
          </View>
        )}

        {/* ── DOB step ── */}
        {step === 'dob' && (
          <View style={styles.form}>
            <Text style={styles.label}>date of birth</Text>
            <TextInput
              style={styles.input}
              value={dob}
              onChangeText={setDob}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={color.dim}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              autoFocus
              onSubmitEditing={handleDob}
              returnKeyType="done"
              accessibilityLabel="Date of birth"
              accessibilityHint="Format: four digit year, dash, month, dash, day"
            />
            <Text style={styles.dobHint}>
              This is checked once and is never linked to your confessions.
            </Text>
            <PrimaryButton label="Enter" onPress={handleDob} loading={busy} />
          </View>
        )}

        {!!error && (
          <Text
            style={styles.errorText}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            {error}
          </Text>
        )}

        <Text style={styles.legal}>
          By continuing you agree to our{'\n'}Terms of Service and Privacy Policy.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
    flexGrow:        1,
    justifyContent:  'center',
    padding:         spacing.screenPadding,
    paddingVertical: 64,
    gap:             20,
  },
  wordmark: {
    fontFamily:   fontFamily.serifItalic,
    fontSize:     30,
    color:        color.paper,
    textAlign:    'center',
    marginBottom: 4,
  },
  sub: {
    fontFamily:   fontFamily.sans,
    fontSize:     15,
    color:        color.dim,
    textAlign:    'center',
    marginBottom: 12,
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
    backgroundColor: '#1A1720',
    borderRadius:    radius.input,
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
  errorText: {
    fontFamily: fontFamily.sans,
    fontSize:   14,
    color:      '#F5996E',
    textAlign:  'center',
  },
  legal: {
    fontFamily: fontFamily.sans,
    fontSize:   11,
    textAlign:  'center',
    marginTop:  8,
    color:      color.dim,
    opacity:    0.45,
  },
});
