import { Link, router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFirebaseBackend } from '@/providers/firebase-provider';

export default function LoginScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const cardBackground = colorScheme === 'dark' ? '#1E2428' : '#F4F7FB';
  const inputBackground = colorScheme === 'dark' ? '#11181C' : '#FFFFFF';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { authMessage, signInWithEmail } = useFirebaseBackend();

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Login', 'Enter both your email and password.');
      return;
    }

    try {
      setSubmitting(true);
      await signInWithEmail(email, password);
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert('Login failed', error instanceof Error ? error.message : 'Unable to log in.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={[styles.eyebrow, { color: palette.tint }]}>SchedU Learn</ThemedText>
        <ThemedText style={styles.title}>Log in</ThemedText>
        <ThemedText style={[styles.subtitle, { color: palette.icon }]}>
          Use email and password for now while Google sign-in is paused.
        </ThemedText>
      </View>

      <View style={[styles.card, { backgroundColor: cardBackground }]}>
        <View style={styles.fieldGroup}>
          <ThemedText style={styles.label}>Email</ThemedText>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="student@example.com"
            placeholderTextColor={palette.icon}
            style={[
              styles.input,
              {
                backgroundColor: inputBackground,
                borderColor: palette.icon,
                color: palette.text,
              },
            ]}
            value={email}
          />
        </View>

        <View style={styles.fieldGroup}>
          <ThemedText style={styles.label}>Password</ThemedText>
          <TextInput
            autoCapitalize="none"
            onChangeText={setPassword}
            placeholder="Enter your password"
            placeholderTextColor={palette.icon}
            secureTextEntry
            style={[
              styles.input,
              {
                backgroundColor: inputBackground,
                borderColor: palette.icon,
                color: palette.text,
              },
            ]}
            value={password}
          />
        </View>

        {authMessage ? (
          <ThemedText style={[styles.helperText, { color: palette.icon }]}>{authMessage}</ThemedText>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={handleLogin}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: pressed ? palette.icon : palette.tint },
          ]}>
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <ThemedText style={styles.primaryButtonText}>Log in</ThemedText>
          )}
        </Pressable>

        <Link href="/signup" asChild>
          <Pressable style={styles.linkButton}>
            <ThemedText style={[styles.linkText, { color: palette.tint }]}>
              Need an account? Create one
            </ThemedText>
          </Pressable>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 24,
  },
  header: {
    gap: 10,
  },
  eyebrow: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: Fonts.rounded,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    borderRadius: 24,
    padding: 20,
    gap: 16,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  helperText: {
    fontSize: 13,
    lineHeight: 18,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  linkButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
