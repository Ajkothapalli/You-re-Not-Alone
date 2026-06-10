/**
 * Age gate + auth screen.
 * Users must sign in and confirm they are 18+.
 * DOB is stored in accounts table; 18+ is verified server-side.
 */
import { createOrUpdateAccount } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { color as colors, font, fontFamily, radius, spacing } from '@/theme/tokens';
const typography = {
  body:     { fontFamily: fontFamily.sans,    fontSize: 15, lineHeight: 22 },
  footnote: { fontFamily: fontFamily.sans,    fontSize: 13, lineHeight: 18 },
  label:    { fontFamily: fontFamily.sansBold, fontSize: font.labelSize,
               letterSpacing: font.labelLetterSpacing, textTransform: 'uppercase' as const },
};
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

function isAdult(dob: Date): boolean {
  const today = new Date();
  const age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    return age - 1 >= 18;
  }
  return age >= 18;
}

type Step = 'email' | 'dob';

export default function GateScreen() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [dob, setDob] = useState<Date>(new Date(2000, 0, 1));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSendOtp() {
    if (!email.trim()) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
      if (error) throw error;
      setOtpSent(true);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not send email');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (!otp.trim()) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp.trim(),
        type: 'email',
      });
      if (error) throw error;
      setStep('dob');
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Invalid code');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmAge() {
    if (!isAdult(dob)) {
      Alert.alert('Sorry', 'You must be 18 or older to use this app.');
      return;
    }
    setLoading(true);
    try {
      await createOrUpdateAccount(dob);
      router.replace('/write');
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save account');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.wordmark}>you are not alone</Text>
        <Text style={styles.tagline}>
          A private place to share what you carry.
        </Text>

        {step === 'email' && (
          <View style={styles.form}>
            {!otpSent ? (
              <>
                <Text style={styles.fieldLabel}>enter your email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.dim}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
                <Pressable style={styles.primaryBtn} onPress={handleSendOtp} disabled={loading}>
                  {loading ? (
                    <ActivityIndicator color={colors.ink} />
                  ) : (
                    <Text style={styles.primaryBtnText}>Send code</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.fieldLabel}>check your email</Text>
                <Text style={styles.hintText}>We sent a code to {email}</Text>
                <TextInput
                  style={styles.input}
                  value={otp}
                  onChangeText={setOtp}
                  placeholder="6-digit code"
                  placeholderTextColor={colors.dim}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <Pressable style={styles.primaryBtn} onPress={handleVerifyOtp} disabled={loading}>
                  {loading ? (
                    <ActivityIndicator color={colors.ink} />
                  ) : (
                    <Text style={styles.primaryBtnText}>Verify</Text>
                  )}
                </Pressable>
                <Pressable style={styles.ghostBtn} onPress={() => setOtpSent(false)}>
                  <Text style={styles.ghostBtnText}>Use a different email</Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        {step === 'dob' && (
          <View style={styles.form}>
            <Text style={styles.fieldLabel}>confirm your date of birth</Text>
            <Text style={styles.hintText}>
              You must be 18 or older to continue. This is checked once and not linked to
              your confessions.
            </Text>

            <Pressable
              style={styles.datePicker}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.dateText}>
                {dob.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
              </Text>
            </Pressable>

            {showDatePicker && (
              <DateTimePicker
                value={dob}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onChange={(_event, date) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (date) setDob(date);
                }}
                themeVariant="dark"
              />
            )}

            <Pressable
              style={[styles.primaryBtn, { marginTop: 24 }]}
              onPress={handleConfirmAge}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.ink} />
              ) : (
                <Text style={styles.primaryBtnText}>I'm 18 or older — continue</Text>
              )}
            </Pressable>
          </View>
        )}

        <Text style={styles.legalNote}>
          By continuing you agree to our Terms of Service and Privacy Policy.
          Adults only (18+).
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.screenPadding,
    paddingVertical: 60,
  },
  wordmark: {
    fontFamily: 'Fraunces_400Regular',
    fontSize: 28,
    color: colors.paper,
    marginBottom: 12,
    textAlign: 'center',
  },
  tagline: {
    ...typography.body,
    color: colors.dim,
    textAlign: 'center',
    marginBottom: 48,
  },
  form: {
    gap: 12,
  },
  fieldLabel: {
    ...typography.label,
    color: colors.dim,
    marginBottom: 4,
  },
  hintText: {
    ...typography.footnote,
    color: colors.dim,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(243,238,232,0.05)',
    borderRadius: radius.input,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: 16,
    color: colors.paper,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  primaryBtn: {
    backgroundColor: colors.paper,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.ink,
  },
  ghostBtn: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ghostBtnText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: colors.paper,
  },
  datePicker: {
    backgroundColor: 'rgba(243,238,232,0.05)',
    borderRadius: radius.input,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: 16,
  },
  dateText: {
    color: colors.paper,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  legalNote: {
    ...typography.footnote,
    color: colors.dim,
    textAlign: 'center',
    marginTop: 48,
  },
});
