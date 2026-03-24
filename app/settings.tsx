import { Alert, Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ClayCard, ClayPill, ClayScreen, ClaySectionHeader } from '@/components/clay-ui';
import { ThemedText } from '@/components/themed-text';
import { useFirebaseBackend } from '@/providers/firebase-provider';

export default function SettingsScreen() {
  const { profile, refreshMockLmsFeed, savePreferences, user } = useFirebaseBackend();

  const items = [
    {
      title: 'Notifications',
      description: profile?.preferences.notificationsEnabled ? 'Task reminders are active.' : 'Task reminders are muted.',
      color: styles.orange,
      action: () => savePreferences({ notificationsEnabled: !profile?.preferences.notificationsEnabled }),
    },
    {
      title: 'Compact view',
      description: profile?.preferences.compactView ? 'Dense layout is on.' : 'Comfort spacing is on.',
      color: styles.blue,
      action: () => savePreferences({ compactView: !profile?.preferences.compactView }),
    },
    {
      title: 'Daily digest',
      description: profile?.preferences.dailyDigestEnabled ? 'Morning summary is active.' : 'Morning summary is off.',
      color: styles.purple,
      action: () => savePreferences({ dailyDigestEnabled: !profile?.preferences.dailyDigestEnabled }),
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
    <ClayScreen greeting="Settings" title="App Preferences" subtitle="Prototype styling, but still writing preferences back to Firebase." onRefresh={async () => { if (user) { await refreshMockLmsFeed(); } }}>
      <ClaySectionHeader icon="tune" title="Toggles" />
      <View style={styles.list}>
        {items.map((item) => (
          <Pressable key={item.title} onPress={() => handleAction(item.action)}>
            <ClayCard style={[styles.card, item.color]}>
              <MaterialIcons name="toggle-on" size={18} color="#2D2250" />
              <View style={styles.copy}>
                <ThemedText style={styles.cardTitle}>{item.title}</ThemedText>
                <ThemedText style={styles.cardText}>{item.description}</ThemedText>
              </View>
              <ClayPill>
                <ThemedText style={styles.pillText}>Toggle</ThemedText>
              </ClayPill>
            </ClayCard>
          </Pressable>
        ))}
      </View>
    </ClayScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#2D2250',
  },
  cardText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#6B5B8A',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B5B8A',
  },
  orange: { backgroundColor: '#FFE4B0' },
  blue: { backgroundColor: '#CAE7FF' },
  purple: { backgroundColor: '#DDD0FF' },
});
