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

import { ClayCard, ClayPill, ClayScreen } from '@/components/clay-ui';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFirebaseBackend } from '@/providers/firebase-provider';

export default function SignupScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { authMessage, signUpWithEmail } = useFirebaseBackend();

  const handleSignup = async () => {
    if (!email.trim() || !password || !confirmPassword) {
      Alert.alert('Sign up', 'Please fill in the required fields.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Sign up', 'Password should be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Sign up', 'Passwords do not match.');
      return;
    }

    try {
      setSubmitting(true);
      await signUpWithEmail(email, password, name);
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert('Sign up failed', error instanceof Error ? error.message : 'Unable to create account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ClayScreen greeting="Create your planner" title="Sign Up" subtitle="New accounts start empty and continue into setup after sign up." onRefresh={async () => {}}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ClayCard style={styles.card}>
          <View style={styles.fieldGroup}>
            <ThemedText style={styles.label}>Name</ThemedText>
            <TextInput onChangeText={setName} placeholder="Aundreka Learner" placeholderTextColor={palette.icon} style={styles.input} value={name} />
          </View>
          <View style={styles.fieldGroup}>
            <ThemedText style={styles.label}>Email</ThemedText>
            <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={setEmail} placeholder="student@example.com" placeholderTextColor={palette.icon} style={styles.input} value={email} />
          </View>
          <View style={styles.fieldGroup}>
            <ThemedText style={styles.label}>Password</ThemedText>
            <TextInput autoCapitalize="none" onChangeText={setPassword} placeholder="At least 6 characters" placeholderTextColor={palette.icon} secureTextEntry style={styles.input} value={password} />
          </View>
          <View style={styles.fieldGroup}>
            <ThemedText style={styles.label}>Confirm Password</ThemedText>
            <TextInput autoCapitalize="none" onChangeText={setConfirmPassword} placeholder="Repeat your password" placeholderTextColor={palette.icon} secureTextEntry style={styles.input} value={confirmPassword} />
          </View>
          {authMessage ? <ThemedText style={styles.helper}>{authMessage}</ThemedText> : null}
          <Pressable onPress={handleSignup} style={styles.primaryButton}>
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.primaryText}>Create account</ThemedText>}
          </Pressable>
          <Link href="../" asChild>
            <Pressable>
              <ClayPill style={styles.centerPill}>
                <ThemedText style={styles.linkText}>Already have an account? Log in</ThemedText>
              </ClayPill>
            </Pressable>
          </Link>
        </ClayCard>
      </KeyboardAvoidingView>
    </ClayScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2D2250',
  },
  input: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(168,153,200,0.45)',
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#2D2250',
  },
  helper: {
    fontSize: 12,
    color: '#6B5B8A',
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7A55B0',
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  centerPill: {
    alignSelf: 'center',
  },
  linkText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6B5B8A',
  },
});

