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
import { StackNavigationProp } from '@react-navigation/stack';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';

type Props = {
  navigation: StackNavigationProp<any>;
};

export default function RegisterScreen({ navigation }: Props) {
  const { register } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  const handleRegister = async () => {
    if (!email || !password) {
      Alert.alert('Missing Fields', 'Email and password are required');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Weak Password', 'Password must be at least 8 characters long');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      await register({
        email: email.trim().toLowerCase(),
        password,
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
      });
    } catch (error: any) {
      Alert.alert('Registration Failed', error.message || 'Could not create account');
    } finally {
      setIsLoading(false);
    }
  };

  const renderInput = (
    placeholder: string,
    value: string,
    onChangeText: (text: string) => void,
    key: string,
    options?: {
      secureTextEntry?: boolean;
      keyboardType?: 'email-address' | 'default';
      autoCapitalize?: 'none' | 'sentences';
      label?: string;
    }
  ) => (
    <View style={styles.inputGroup}>
      {options?.label && <Text style={styles.inputLabel}>{options.label}</Text>}
      <TextInput
        style={[
          styles.input,
          focusedInput === key && styles.inputFocused,
        ]}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocusedInput(key)}
        onBlur={() => setFocusedInput(null)}
        secureTextEntry={options?.secureTextEntry}
        keyboardType={options?.keyboardType || 'default'}
        textContentType={
          key === 'email'
            ? 'emailAddress'
            : key === 'password' || key === 'confirmPassword'
            ? 'password'
            : 'none'
        }
        autoComplete={
          key === 'email'
            ? 'email'
            : key === 'password' || key === 'confirmPassword'
            ? 'password'
            : 'off'
        }
        autoCapitalize={options?.autoCapitalize || 'sentences'}
        autoCorrect={false}
        returnKeyType={key === 'confirmPassword' ? 'done' : 'next'}
        editable={!isLoading}
      />
    </View>
  );

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
          <View style={styles.content}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.logo}>vera</Text>
              <Text style={styles.title}>Create account</Text>
              <Text style={styles.subtitle}>
                Start building better financial habits today
              </Text>
            </View>

            {/* Form */}
            <View style={styles.form}>
              <View style={styles.nameRow}>
                <View style={styles.nameField}>
                  {renderInput('First name', firstName, setFirstName, 'firstName', {
                    label: 'First name',
                  })}
                </View>
                <View style={styles.nameField}>
                  {renderInput('Last name', lastName, setLastName, 'lastName', {
                    label: 'Last name',
                  })}
                </View>
              </View>

              {renderInput('you@example.com', email, setEmail, 'email', {
                label: 'Email',
                keyboardType: 'email-address',
                autoCapitalize: 'none',
              })}

              {renderInput('Min 8 characters', password, setPassword, 'password', {
                label: 'Password',
                secureTextEntry: true,
              })}

              {renderInput('Confirm your password', confirmPassword, setConfirmPassword, 'confirmPassword', {
                label: 'Confirm password',
                secureTextEntry: true,
              })}

              <TouchableOpacity
                style={[styles.button, isLoading && styles.buttonDisabled]}
                onPress={handleRegister}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={styles.buttonText}>Create Account</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account?</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('Login')}
                disabled={isLoading}
                activeOpacity={0.7}
              >
                <Text style={styles.footerLink}>Sign in</Text>
              </TouchableOpacity>
            </View>
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
  },
  content: {
    flex: 1,
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
  form: {
    gap: spacing.md,
  },
  nameRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  nameField: {
    flex: 1,
  },
  inputGroup: {
    gap: spacing.sm,
  },
  inputLabel: {
    fontSize: typography.subhead,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
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
  button: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
    ...shadows.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
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
