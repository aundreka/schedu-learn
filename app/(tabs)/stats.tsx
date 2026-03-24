import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ClayCard, ClayPill, ClayScreen, ClaySectionHeader } from '@/components/clay-ui';
import { ThemedText } from '@/components/themed-text';
import { useFirebaseBackend } from '@/providers/firebase-provider';

export default function StatsScreen() {
  const router = useRouter();
  const { profile, refreshMockLmsFeed, user } = useFirebaseBackend();

  return (
    <ClayScreen
      greeting="Control center"
      title="Settings"
      subtitle="The same clay design formula, now applied to account and app controls."
      avatarLabel={profile?.avatarInitials ?? 'SL'}
      onAvatarPress={() => router.push('/profile')} onRefresh={async () => { if (user) { await refreshMockLmsFeed(); } }}>
      <ClaySectionHeader icon="settings" title="Quick access" />
      <View style={styles.list}>
        <ClayCard style={[styles.card, styles.purple]}>
          <View style={styles.row}>
            <MaterialIcons name="person" size={18} color="#2D2250" />
            <View style={styles.copy}>
              <ThemedText style={styles.title}>Profile</ThemedText>
              <ThemedText style={styles.text}>Identity, semester, and session details.</ThemedText>
            </View>
            <ClayPill style={styles.pressablePill}>
              <ThemedText style={styles.pillText} onPress={() => router.push('/profile')}>Open</ThemedText>
            </ClayPill>
          </View>
        </ClayCard>
        <ClayCard style={[styles.card, styles.blue]}>
          <View style={styles.row}>
            <MaterialIcons name="tune" size={18} color="#2D2250" />
            <View style={styles.copy}>
              <ThemedText style={styles.title}>Preferences</ThemedText>
              <ThemedText style={styles.text}>Notifications, compact view, and daily digest.</ThemedText>
            </View>
            <ClayPill style={styles.pressablePill}>
              <ThemedText style={styles.pillText} onPress={() => router.push('/settings')}>Open</ThemedText>
            </ClayPill>
          </View>
        </ClayCard>
        <ClayCard style={[styles.card, styles.orange]}>
          <View style={styles.row}>
            <MaterialIcons name="cloud-sync" size={18} color="#2D2250" />
            <View style={styles.copy}>
              <ThemedText style={styles.title}>LMS Sync</ThemedText>
              <ThemedText style={styles.text}>Review LMS items and keep imported deadlines up to date.</ThemedText>
            </View>
            <ClayPill style={styles.pressablePill}>
              <ThemedText style={styles.pillText} onPress={() => router.push('/lms-sync')}>Open</ThemedText>
            </ClayPill>
          </View>
        </ClayCard>
      </View>
    </ClayScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 10,
  },
  card: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '900',
    color: '#2D2250',
  },
  text: {
    fontSize: 12,
    lineHeight: 18,
    color: '#6B5B8A',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B5B8A',
  },
  pressablePill: {
    alignSelf: 'center',
  },
  purple: { backgroundColor: '#DDD0FF' },
  blue: { backgroundColor: '#CAE7FF' },
  orange: { backgroundColor: '#FFE4B0' },
});

