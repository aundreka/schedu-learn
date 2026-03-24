import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFirebaseBackend } from '@/providers/firebase-provider';

export default function SettingsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const cardBackground = colorScheme === 'dark' ? '#1E2428' : '#F4F7FB';
  const accentBackground = colorScheme === 'dark' ? '#143647' : '#DDF2FF';
  const { profile, savePreferences, user } = useFirebaseBackend();

  const settingsItems = [
    {
      icon: 'notifications-active' as const,
      title: 'Notifications',
      description: profile?.preferences.notificationsEnabled
        ? 'Task and class reminders are live.'
        : 'Reminders are turned off.',
      action: async () => {
        await savePreferences({
          notificationsEnabled: !profile?.preferences.notificationsEnabled,
        });
      },
    },
    {
      icon: 'palette' as const,
      title: 'Compact view',
      description: profile?.preferences.compactView
        ? 'Dense cards are enabled for faster scanning.'
        : 'Comfortable spacing is enabled.',
      action: async () => {
        await savePreferences({
          compactView: !profile?.preferences.compactView,
        });
      },
    },
    {
      icon: 'security' as const,
      title: 'Daily digest',
      description: profile?.preferences.dailyDigestEnabled
        ? 'Morning recap messages are enabled.'
        : 'Morning recap messages are off.',
      action: async () => {
        await savePreferences({
          dailyDigestEnabled: !profile?.preferences.dailyDigestEnabled,
        });
      },
    },
  ];

  const handleAction = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      Alert.alert('Settings', error instanceof Error ? error.message : 'Unable to save settings.');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>Settings</ThemedText>
        <ThemedText style={[styles.subtitle, { color: palette.icon }]}>
          Manage how SchedU Learn works for you.
        </ThemedText>
      </View>

      <View style={styles.list}>
        {!user ? (
          <ThemedView style={[styles.settingCard, { backgroundColor: cardBackground }]}>
            <View style={[styles.iconBadge, { backgroundColor: accentBackground }]}>
              <MaterialIcons name="lock-outline" size={20} color={palette.tint} />
            </View>
            <View style={styles.copy}>
              <ThemedText style={styles.settingTitle}>Sign in required</ThemedText>
              <ThemedText style={[styles.settingDescription, { color: palette.icon }]}>
                Preferences are stored in Firestore after you sign in with Google from the Profile
                screen.
              </ThemedText>
            </View>
          </ThemedView>
        ) : null}

        {settingsItems.map((item) => (
          <Pressable key={item.title} onPress={() => handleAction(item.action)}>
            {({ pressed }) => (
              <ThemedView
                style={[
                  styles.settingCard,
                  {
                    backgroundColor: pressed ? accentBackground : cardBackground,
                  },
                ]}>
                <View style={[styles.iconBadge, { backgroundColor: accentBackground }]}>
                  <MaterialIcons name={item.icon} size={20} color={palette.tint} />
                </View>
                <View style={styles.copy}>
                  <ThemedText style={styles.settingTitle}>{item.title}</ThemedText>
                  <ThemedText style={[styles.settingDescription, { color: palette.icon }]}>
                    {item.description}
                  </ThemedText>
                </View>
              </ThemedView>
            )}
          </Pressable>
        ))}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 24,
  },
  header: {
    gap: 8,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  list: {
    gap: 12,
  },
  settingCard: {
    borderRadius: 22,
    padding: 18,
    flexDirection: 'row',
    gap: 14,
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 6,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  settingDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
});
