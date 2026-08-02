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
import { getDobOrder, maskDob, dobToISO, isAdultISO } from '@/lib/dobFormat';
import { createOrUpdateAccount, getReaderPreferences } from '@/lib/api';
import { resetFtue } from '@/lib/onboarding';
import { hydrateProfile } from '@/lib/profile';
import { evaluateRtue } from '@/lib/rtue';
import { signInWithGoogle } from '@/lib/oauth';
import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/withTimeout';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import { GhostButton, PrimaryButton } from '@/components/Buttons';
import { usePalette, useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily, radius, spacing } from '@/theme/tokens';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Step = 'loading' | 'email' | 'otp' | 'dob' | 'retry';


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
    if (routingRef.current) return;
    routingRef.current = true;
    const t0 = Date.now();

    try {
      // Non-blocking — failure is irrelevant to the routing decision.
      void hydrateProfile().catch(() => {});

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
        await resetFtue().catch(() => {});
        setStep('dob');
        return;
      }

      // acct exists — wait for prefs (already in-flight).
      const prefs = await prefsP;
      const prefsMs = Date.now() - t0;
      if (prefsMs > 2_000) console.warn('[boot] prefs', prefsMs, 'ms');

      // Network failure / timeout — don't restart FTUE for an onboarded user.
      if (!prefs.ok) {
        router.replace('/read');
        return;
      }

      if ((prefs.p?.categories.length ?? 0) === 0) {
        await resetFtue().catch(() => {});
        router.replace('/welcome');
        return;
      }

      const rtue = await withTimeout(evaluateRtue(), 2_500, 'rtue').catch(() => null);
      const rtueMs = Date.now() - t0;
      if (rtueMs > 2_000) console.warn('[boot] rtue', rtueMs, 'ms');

      router.replace(rtue ? '/rtue' : '/read');
    } catch (err) {
      // Reset so a retry attempt can call routeAfterAuth again.
      routingRef.current = false;
      throw err;
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
        // Session established — show branded loading screen while routing queries run.
        // This replaces the frozen-button-spinner the user would otherwise see.
        setStep('loading');
        setBusy(false);
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
    void runBoot();

    // Last-resort watchdog: catches any hang not covered by the per-call timeouts
    // (e.g. getInitialURL wedging, or an unforeseen Expo API freeze).
    const watchdog = setTimeout(() => {
      if (stepRef.current === 'loading') {
        console.warn('[boot] watchdog fired after 10s');
        setStep('retry');
      }
    }, 10_000);

    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    return () => {
      clearTimeout(watchdog);
      sub.remove();
    };
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
        <View style={styles.logoRow}>
          <Image source={require('../assets/splash-quote-left.png')}  style={styles.logoLeft}  resizeMode="stretch" />
          <Image source={require('../assets/splash-quote-right.png')} style={styles.logoRight} resizeMode="stretch" />
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
            <Image source={require('../assets/splash-quote-left.png')}  style={styles.logoLeft}  resizeMode="stretch" />
            <Image source={require('../assets/splash-quote-right.png')} style={styles.logoRight} resizeMode="stretch" />
          </View>
          <Text style={styles.wordmark} accessibilityRole="header">soulyap</Text>
          <Text style={styles.sub}>
            {step === 'email' && 'A private place to share what you carry.'}
            {step === 'otp'   && `Check your email — we sent a code to ${email}`}
            {step === 'dob'   && 'Adults only. Your age is verified once.'}
            {step === 'retry' && ''}
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
              maxLength={10}
              autoFocus
              onSubmitEditing={handleDob}
              returnKeyType="done"
              accessibilityLabel="Date of birth"
              accessibilityHint={
                dobOrder.map(p => p === 'year' ? 'four digit year' : `two digit ${p}`).join(', ') +
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
