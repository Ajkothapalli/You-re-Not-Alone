/**
 * Age gate — entry point.
 * Three steps rendered as a single screen with local state:
 *   email → OTP → DOB
 *
 * If a valid session + account already exist, redirects straight to /write.
 */

import { createOrUpdateAccount } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { GhostButton, PrimaryButton } from '@/components/Buttons';
import { usePalette } from '@/theme/ThemeProvider';
import { color, fontFamily, radius, spacing } from '@/theme/tokens';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  const ageMsec = Date.now() - dob.getTime();
  return ageMsec / (1000 * 60 * 60 * 24 * 365.25) >= 18;
}

export default function IndexScreen() {
  const palette = usePalette();

  const [step,    setStep]    = useState<Step>('loading');
  const [email,   setEmail]   = useState('');
  const [otp,     setOtp]     = useState('');
  const [dob,     setDob]     = useState('');
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState('');

  // Bootstrap — check existing session on mount
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) { setStep('email'); return; }

        const { data: acct } = await supabase
          .from('accounts')
          .select('id')
          .eq('id', session.user.id)
          .maybeSingle();

        if (acct) {
          router.replace('/write');
        } else {
          setStep('dob');
        }
      } catch {
        // Supabase not configured or unreachable — show the email step anyway
        setStep('email');
      }
    })();
  }, []);

  function clearError() { setError(''); }

  // ── Step 1: email ────────────────────────────────────────────────────────────
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

  // ── Step 2: OTP ──────────────────────────────────────────────────────────────
  async function handleOtp() {
    clearError();
    if (otp.trim().length !== 6) { setError('Enter the 6-digit code from your email.'); return; }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otp.trim(),
        type:  'email',
      });
      if (err) throw err;
      setStep('dob');
    } catch (err: any) {
      setError(err.message ?? 'Invalid code. Check your email and try again.');
    } finally {
      setBusy(false);
    }
  }

  // ── Step 3: DOB ──────────────────────────────────────────────────────────────
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
      await createOrUpdateAccount(new Date(dob));
      router.replace('/write');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (step === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={color.paper} />
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
        {/* Wordmark */}
        <Text style={styles.wordmark}>you're not alone</Text>
        <Text style={styles.sub}>
          {step === 'email' && 'A private place to share what you carry.'}
          {step === 'otp'   && `We sent a code to ${email}`}
          {step === 'dob'   && 'Adults only. Your age is verified once.'}
        </Text>

        {/* ── Email step ── */}
        {step === 'email' && (
          <View style={styles.form}>
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
            />
            <PrimaryButton label="Continue" onPress={handleEmail} loading={busy} />
          </View>
        )}

        {/* ── OTP step ── */}
        {step === 'otp' && (
          <View style={styles.form}>
            <Text style={styles.label}>6-digit code</Text>
            <TextInput
              style={styles.input}
              value={otp}
              onChangeText={setOtp}
              placeholder="123456"
              placeholderTextColor={color.dim}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              onSubmitEditing={handleOtp}
              returnKeyType="done"
            />
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
            />
            <Text style={styles.dobHint}>
              This is checked once and is never linked to your confessions.
            </Text>
            <PrimaryButton label="Enter" onPress={handleDob} loading={busy} />
          </View>
        )}

        {/* Inline error */}
        {!!error && <Text style={styles.errorText}>{error}</Text>}

        {/* Legal note */}
        <Text style={[styles.legal, { color: palette.them }]}>
          By continuing you agree to our Terms of Service and Privacy Policy.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: color.ink,
  },
  center: {
    flex:            1,
    backgroundColor: color.ink,
    justifyContent:  'center',
    alignItems:      'center',
  },
  scroll: {
    flexGrow:       1,
    justifyContent: 'center',
    padding:        spacing.screenPadding,
    paddingVertical: 64,
    gap:            20,
  },
  wordmark: {
    fontFamily:  fontFamily.serifItalic,
    fontSize:    30,
    color:       color.paper,
    textAlign:   'center',
    marginBottom: 4,
  },
  sub: {
    fontFamily:  fontFamily.sans,
    fontSize:    15,
    color:       color.dim,
    textAlign:   'center',
    marginBottom: 12,
  },
  form: {
    gap: 12,
  },
  label: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      11,
    letterSpacing: 0.18 * 11,
    textTransform: 'uppercase',
    color:         color.dim,
  },
  input: {
    backgroundColor: 'rgba(243,238,232,0.05)',
    borderRadius:    radius.input,
    borderWidth:     StyleSheet.hairlineWidth,
    borderColor:     color.line,
    padding:         16,
    fontFamily:      fontFamily.sans,
    fontSize:        16,
    color:           color.paper,
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
