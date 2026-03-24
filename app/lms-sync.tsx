import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ClayCard, ClayPill, ClayScreen, ClaySectionHeader, ClayStatCard } from '@/components/clay-ui';
import { ThemedText } from '@/components/themed-text';
import { useFirebaseBackend } from '@/providers/firebase-provider';

function formatRelativeSyncTime(iso?: string) {
  if (!iso) {
    return 'Not synced yet';
  }

  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
}

export default function LmsSyncScreen() {
  const { lmsFeed, profile, refreshMockLmsFeed, user } = useFirebaseBackend();

  const handleRefresh = async () => {
    try {
      await refreshMockLmsFeed();
      Alert.alert('LMS Sync', 'Feed refreshed.');
    } catch (error) {
      Alert.alert('LMS Sync', error instanceof Error ? error.message : 'Unable to refresh feed.');
    }
  };

  return (
    <ClayScreen
      greeting="Sync center"
      title="LMS Feed"
      subtitle="Imported changes styled with the same dashboard formula."
      avatarLabel={profile?.avatarInitials ?? 'SL'} onRefresh={async () => { if (user) { await refreshMockLmsFeed(); } }}>
      <View style={styles.statsRow}>
        <ClayStatCard label="Items" value={`${lmsFeed.length}`} />
        <ClayStatCard label="Last sync" value={formatRelativeSyncTime(lmsFeed[0]?.syncedAt)} />
      </View>

      <ClaySectionHeader
        icon="sync"
        title="Detected Changes"
        accessory={
          <Pressable onPress={handleRefresh}>
            <ClayPill>
              <ThemedText style={styles.pillText}>Refresh</ThemedText>
            </ClayPill>
          </Pressable>
        }
      />

      <View style={styles.list}>
        {lmsFeed.map((item, index) => (
          <ClayCard
            key={item.id}
            style={[styles.card, index % 3 === 0 ? styles.orange : index % 3 === 1 ? styles.red : styles.blue]}>
            <ThemedText style={styles.cardTitle}>{item.title}</ThemedText>
            <ThemedText style={styles.cardText}>{item.due}</ThemedText>
            <ThemedText style={styles.cardTag}>{item.source} · {item.status}</ThemedText>
          </ClayCard>
        ))}
      </View>
    </ClayScreen>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  list: {
    gap: 10,
  },
  card: {
    gap: 6,
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
  cardTag: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '800',
    color: '#6B5B8A',
    backgroundColor: 'rgba(255,255,255,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B5B8A',
  },
  orange: { backgroundColor: '#FFE4B0' },
  red: { backgroundColor: '#FFD7D7' },
  blue: { backgroundColor: '#CAE7FF' },
});
