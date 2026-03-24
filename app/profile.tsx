import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Link } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFirebaseBackend } from '@/providers/firebase-provider';

export default function ProfileScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const cardBackground = colorScheme === 'dark' ? '#1E2428' : '#F4F7FB';
  const accentBackground = colorScheme === 'dark' ? '#143647' : '#DDF2FF';
  const {
    authMessage,
    authReady,
    loadingData,
    profile,
    schedules,
    signOut,
    tasks,
    user,
  } = useFirebaseBackend();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      Alert.alert('Sign out', error instanceof Error ? error.message : 'Unable to sign out.');
    }
  };

  const activeTasks = tasks.filter((task) => task.status !== 'done').length;

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={[styles.heroCard, { backgroundColor: cardBackground }]}>
        <View style={[styles.avatar, { backgroundColor: accentBackground }]}>
          <ThemedText style={[styles.avatarText, { color: palette.tint }]}>
            {profile?.avatarInitials ?? 'SL'}
          </ThemedText>
        </View>
        <View style={styles.profileCopy}>
          <ThemedText style={styles.name}>{profile?.displayName ?? 'Connect your account'}</ThemedText>
          <ThemedText style={[styles.role, { color: palette.icon }]}>
            {profile?.role ?? 'Firebase Auth + Firestore profile'}
          </ThemedText>
          <ThemedText style={[styles.bio, { color: palette.icon }]}>
            {user?.email ?? 'Log in with your email and password to sync profile, tasks, schedules, and LMS updates.'}
          </ThemedText>
        </View>
      </ThemedView>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Overview</ThemedText>
        <ThemedView style={[styles.infoCard, { backgroundColor: cardBackground }]}>
          <View style={styles.infoRow}>
            <MaterialIcons name="calendar-month" size={20} color={palette.tint} />
            <ThemedText style={styles.infoLabel}>Current semester</ThemedText>
            <ThemedText style={[styles.infoValue, { color: palette.icon }]}>
              {profile?.semester ?? 'Waiting'}
            </ThemedText>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="school" size={20} color={palette.tint} />
            <ThemedText style={styles.infoLabel}>Schedule items</ThemedText>
            <ThemedText style={[styles.infoValue, { color: palette.icon }]}>{schedules.length}</ThemedText>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="emoji-events" size={20} color={palette.tint} />
            <ThemedText style={styles.infoLabel}>Open tasks</ThemedText>
            <ThemedText style={[styles.infoValue, { color: palette.icon }]}>{activeTasks}</ThemedText>
          </View>
        </ThemedView>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Auth</ThemedText>
        <ThemedView style={[styles.infoCard, { backgroundColor: cardBackground }]}>
          <View style={styles.infoRow}>
            <MaterialIcons name="cloud-done" size={20} color={palette.tint} />
            <ThemedText style={styles.infoLabel}>Realtime sync</ThemedText>
            <ThemedText style={[styles.infoValue, { color: palette.icon }]}>
              {user ? 'Connected' : 'Signed out'}
            </ThemedText>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="mail-outline" size={20} color={palette.tint} />
            <ThemedText style={styles.infoLabel}>Email auth</ThemedText>
            <ThemedText style={[styles.infoValue, { color: palette.icon }]}>
              {user ? 'Active session' : 'Sign in required'}
            </ThemedText>
          </View>
          {!authReady || loadingData ? <ActivityIndicator color={palette.tint} /> : null}
          {authMessage ? (
            <ThemedText style={[styles.helperText, { color: palette.icon }]}>{authMessage}</ThemedText>
          ) : null}
          {user ? (
            <Pressable
              accessibilityRole="button"
              onPress={handleSignOut}
              style={({ pressed }) => [
                styles.secondaryButton,
                { borderColor: pressed ? palette.tint : palette.icon },
              ]}>
              <MaterialIcons name="logout" size={20} color={palette.text} />
              <ThemedText style={styles.secondaryButtonText}>Sign out</ThemedText>
            </Pressable>
          ) : (
            <Link href="/callback" asChild>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: pressed ? palette.icon : palette.tint },
                ]}>
                <MaterialIcons name="login" size={20} color="#FFFFFF" />
                <ThemedText style={styles.primaryButtonText}>Go to login</ThemedText>
              </Pressable>
            </Link>
          )}
        </ThemedView>
      </View>

      <Link href="/settings" asChild>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.settingsButton,
            { backgroundColor: pressed ? palette.icon : palette.tint },
          ]}>
          <MaterialIcons name="settings" size={20} color="#FFFFFF" />
          <ThemedText style={styles.settingsText}>Open settings</ThemedText>
        </Pressable>
      </Link>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 24,
  },
  heroCard: {
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    gap: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: Fonts.rounded,
    fontSize: 24,
    fontWeight: '700',
  },
  profileCopy: {
    flex: 1,
    gap: 6,
  },
  name: {
    fontFamily: Fonts.rounded,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '700',
  },
  role: {
    fontSize: 15,
  },
  bio: {
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  infoCard: {
    borderRadius: 22,
    padding: 18,
    gap: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 14,
  },
  helperText: {
    fontSize: 13,
    lineHeight: 18,
  },
  primaryButton: {
    marginTop: 6,
    borderRadius: 18,
    minHeight: 52,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 6,
    borderRadius: 18,
    minHeight: 52,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  settingsButton: {
    marginTop: 'auto',
    borderRadius: 18,
    minHeight: 56,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  settingsText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
