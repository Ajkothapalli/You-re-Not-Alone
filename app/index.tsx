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
import { hydrateProfile } from '@/lib/profile';
import { signInWithGoogle } from '@/lib/oauth';
import { supabase } from '@/lib/supabase';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import { GhostButton, PrimaryButton } from '@/components/Buttons';
import { usePalette } from '@/theme/ThemeProvider';
import { color, fontFamily, radius, spacing } from '@/theme/tokens';
import * as Linking from 'expo-linking';
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

  const stepRef = useRef(step);
  useEffect(() => { stepRef.current = step; }, [step]);

  // Announce errors to the screen reader as they appear.
  useEffect(() => { if (error) announce(error); }, [error]);

  function clearError() { setError(''); }

  // ── Routing helper (reused by email OTP and OAuth paths) ─────────────────────
  async function routeAfterAuth(userId: string) {
    const { data: acct } = await supabase
      .from('accounts').select('id').eq('id', userId).maybeSingle();
    // Pull the account's character/name/release-count so they're identical
    // on every device the user signs into (iOS ↔ Android). Non-blocking on failure.
    await hydrateProfile().catch(() => {});
    if (acct) {
      // Existing account: check whether categories have been picked.
      // If not, route to the category picker before the read screen.
      const prefs = await getReaderPreferences().catch(() => null);
      if (!prefs || prefs.categories.length === 0) {
        router.replace('/categories');
      } else {
        // Always show the read screen first — owner decision 2026-06-12.
        router.replace('/read');
      }
    } else {
      setStep('dob');
    }
  }

  // ── Deep link handler (magic-link email tap) ─────────────────────────────────
  async function handleDeepLink(url: string) {
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
        if (initialUrl?.includes('access_token')) {
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
    try {
      const success = await signInWithGoogle();
      if (!success) return; // user cancelled — no error shown

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user after sign-in');
      await routeAfterAuth(user.id);
    } catch (err: any) {
      setError('Sign-in didn\'t complete. Try again.');
    } finally {
      setBusy(false);
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
        options: { emailRedirectTo: Linking.createURL('/') },
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
      // New user: pick categories before seeing the read screen.
      router.replace('/categories');
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

        <Text style={[styles.legal, { color: palette.them }]}>
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
    fontSize:   12,
    textAlign:  'center',
    marginTop:  8,
  },
});
