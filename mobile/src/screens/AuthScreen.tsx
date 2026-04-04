import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';

type Mode = 'signin' | 'signup';

export default function AuthScreen() {
  const { login, loginWithOAuth, register } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'AppleOAuth' | 'GoogleOAuth' | null>(null);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  const handleOAuth = async (provider: 'AppleOAuth' | 'GoogleOAuth') => {
    setOauthLoading(provider);
    try {
      await loginWithOAuth(provider);
    } catch (error: any) {
      Alert.alert('Sign In Failed', error.message || 'Could not complete sign in');
    } finally {
      setOauthLoading(null);
    }
  };

  const handleEmailAuth = async () => {
    if (!email || !password) {
      Alert.alert('Missing Fields', 'Please enter your email and password');
      return;
    }

    if (mode === 'signup') {
      if (password.length < 8) {
        Alert.alert('Weak Password', 'Password must be at least 8 characters');
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert('Password Mismatch', 'Passwords do not match');
        return;
      }
    }

    setIsLoading(true);
    try {
      if (mode === 'signin') {
        await login(email.trim().toLowerCase(), password);
      } else {
        await register({
          email: email.trim().toLowerCase(),
          password,
          first_name: firstName.trim() || undefined,
          last_name: lastName.trim() || undefined,
        });
      }
    } catch (error: any) {
      Alert.alert(
        mode === 'signin' ? 'Sign In Failed' : 'Registration Failed',
        error.message || 'Something went wrong'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const isDisabled = isLoading || oauthLoading !== null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.logo}>vera</Text>
            <Text style={styles.title}>
              {mode === 'signin' ? 'Welcome back' : 'Create account'}
            </Text>
            <Text style={styles.subtitle}>
              {mode === 'signin'
                ? 'Sign in to continue building better financial habits'
                : 'Start building better financial habits today'}
            </Text>
          </View>

          {/* OAuth Buttons */}
          <View style={styles.oauthSection}>
            <TouchableOpacity
              style={[styles.oauthButton, styles.appleButton, isDisabled && styles.buttonDisabled]}
              onPress={() => handleOAuth('AppleOAuth')}
              disabled={isDisabled}
              activeOpacity={0.85}
            >
              {oauthLoading === 'AppleOAuth' ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.appleIcon}></Text>
                  <Text style={styles.appleButtonText}>Continue with Apple</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.oauthButton, styles.googleButton, isDisabled && styles.buttonDisabled]}
              onPress={() => handleOAuth('GoogleOAuth')}
              disabled={isDisabled}
              activeOpacity={0.85}
            >
              {oauthLoading === 'GoogleOAuth' ? (
                <ActivityIndicator color={colors.textPrimary} />
              ) : (
                <>
                  <Text style={styles.googleIcon}>G</Text>
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Email Form */}
          <View style={styles.form}>
            {mode === 'signup' && (
              <View style={styles.nameRow}>
                <View style={styles.nameField}>
                  <Text style={styles.inputLabel}>First name</Text>
                  <TextInput
                    style={[styles.input, focusedInput === 'firstName' && styles.inputFocused]}
                    placeholder="First"
                    placeholderTextColor={colors.textTertiary}
                    value={firstName}
                    onChangeText={setFirstName}
                    onFocus={() => setFocusedInput('firstName')}
                    onBlur={() => setFocusedInput(null)}
                    editable={!isDisabled}
                    autoCapitalize="words"
                  />
                </View>
                <View style={styles.nameField}>
                  <Text style={styles.inputLabel}>Last name</Text>
                  <TextInput
                    style={[styles.input, focusedInput === 'lastName' && styles.inputFocused]}
                    placeholder="Last"
                    placeholderTextColor={colors.textTertiary}
                    value={lastName}
                    onChangeText={setLastName}
                    onFocus={() => setFocusedInput('lastName')}
                    onBlur={() => setFocusedInput(null)}
                    editable={!isDisabled}
                    autoCapitalize="words"
                  />
                </View>
              </View>
            )}

            <View>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={[styles.input, focusedInput === 'email' && styles.inputFocused]}
                placeholder="you@example.com"
                placeholderTextColor={colors.textTertiary}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocusedInput('email')}
                onBlur={() => setFocusedInput(null)}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                editable={!isDisabled}
                onSubmitEditing={() => {
                  // Move focus to password on submit
                  // (works with keyboard on iOS/Android)
                  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                  null;
                }}
              />
            </View>

            <View>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={[styles.input, focusedInput === 'password' && styles.inputFocused]}
                placeholder={mode === 'signup' ? 'Min 8 characters' : 'Enter your password'}
                placeholderTextColor={colors.textTertiary}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusedInput('password')}
                onBlur={() => setFocusedInput(null)}
                secureTextEntry
                textContentType={mode === 'signup' ? 'newPassword' : 'password'}
                autoComplete={mode === 'signup' ? 'password' : 'password'}
                returnKeyType="done"
                editable={!isDisabled}
              />
            </View>

            {mode === 'signup' && (
              <View>
                <Text style={styles.inputLabel}>Confirm password</Text>
                <TextInput
                  style={[styles.input, focusedInput === 'confirm' && styles.inputFocused]}
                  placeholder="Confirm your password"
                  placeholderTextColor={colors.textTertiary}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  onFocus={() => setFocusedInput('confirm')}
                  onBlur={() => setFocusedInput(null)}
                  secureTextEntry
                  editable={!isDisabled}
                />
              </View>
            )}

            <TouchableOpacity
              style={[styles.submitButton, isDisabled && styles.buttonDisabled]}
              onPress={handleEmailAuth}
              disabled={isDisabled}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.submitButtonText}>
                  {mode === 'signin' ? 'Sign In' : 'Create Account'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Toggle Mode */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setPassword('');
                setConfirmPassword('');
              }}
              disabled={isDisabled}
              activeOpacity={0.7}
            >
              <Text style={styles.footerLink}>
                {mode === 'signin' ? 'Create one' : 'Sign in'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    justifyContent: 'center',
  },
  header: {
    marginBottom: spacing.xl,
  },
  logo: {
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.largeTitle,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.body,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  oauthSection: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  oauthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    gap: spacing.sm,
    ...shadows.sm,
  },
  appleButton: {
    backgroundColor: '#000000',
  },
  appleIcon: {
    fontSize: 18,
    color: '#FFFFFF',
    lineHeight: 22,
  },
  appleButtonText: {
    color: '#FFFFFF',
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
  },
  googleButton: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  googleIcon: {
    fontSize: 17,
    fontWeight: typography.weights.bold,
    color: '#4285F4',
  },
  googleButtonText: {
    color: colors.textPrimary,
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: typography.subhead,
    color: colors.textTertiary,
  },
  form: {
    gap: spacing.md,
  },
  nameRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  nameField: {
    flex: 1,
    gap: spacing.sm,
  },
  inputLabel: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputFocused: {
    borderColor: colors.accent,
    backgroundColor: colors.background,
  },
  submitButton: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
    ...shadows.md,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: colors.background,
    fontSize: typography.headline,
    fontWeight: typography.weights.semibold,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
    gap: spacing.xs,
  },
  footerText: {
    fontSize: typography.subhead,
    color: colors.textSecondary,
  },
  footerLink: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.semibold,
    color: colors.accent,
  },
});
