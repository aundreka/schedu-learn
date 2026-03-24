import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ClayCard, ClayPill, ClayScreen, ClaySectionHeader, ClayStatCard } from '@/components/clay-ui';
import { ThemedText } from '@/components/themed-text';
import { useFirebaseBackend } from '@/providers/firebase-provider';

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function CalendarScreen() {
  const router = useRouter();
  const { profile, refreshMockLmsFeed, schedules, tasks, user } = useFirebaseBackend();
  const upcoming = schedules.slice(0, 6);

  return (
    <ClayScreen
      greeting="Calendar view"
      title="Your Learning Week"
      subtitle="A softer planner view for classes, study blocks, and reschedules."
      avatarLabel={profile?.avatarInitials ?? 'SL'}
      onAvatarPress={() => router.push('/profile')} onRefresh={async () => { if (user) { await refreshMockLmsFeed(); } }}>
      <View style={styles.statsRow}>
        <ClayStatCard label="Events" value={`${schedules.length}`} />
        <ClayStatCard label="Deadlines" value={`${tasks.filter((task) => task.status !== 'done').length}`} />
      </View>

      <ClaySectionHeader
        icon="calendar-month"
        title="Upcoming Agenda"
        accessory={
          <ClayPill>
            <ThemedText style={styles.pillText}>Realtime</ThemedText>
          </ClayPill>
        }
      />

      <View style={styles.list}>
        {upcoming.map((item, index) => (
          <ClayCard
            key={item.id}
            style={[
              styles.eventCard,
              index % 4 === 0
                ? styles.purple
                : index % 4 === 1
                  ? styles.blue
                  : index % 4 === 2
                    ? styles.green
                    : styles.orange,
            ]}>
            <View style={styles.eventHeader}>
              <View style={styles.iconBadge}>
                <MaterialIcons
                  name={item.type === 'class' ? 'groups' : item.type === 'study' ? 'menu-book' : 'event-note'}
                  size={16}
                  color="#2D2250"
                />
              </View>
              <ThemedText style={styles.eventTitle}>{item.title}</ThemedText>
            </View>
            <ThemedText style={styles.eventMeta}>{formatDateTime(item.startsAt)}</ThemedText>
            <ThemedText style={styles.eventTag}>{item.location}</ThemedText>
          </ClayCard>
        ))}
      </View>

      <ClaySectionHeader icon="sync" title="LMS" />
      <ClayCard style={styles.whiteCard}>
        <ThemedText style={styles.cardTitle}>Keep calendar and LMS in sync</ThemedText>
        <ThemedText style={styles.cardText}>
          Review imported changes and pushed schedule updates from one place.
        </ThemedText>
        <ClayPill style={styles.actionPill}>
          <ThemedText style={styles.pillText} onPress={() => router.push('/lms-sync')}>
            Open LMS Sync
          </ThemedText>
        </ClayPill>
      </ClayCard>
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
  eventCard: {
    gap: 8,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#2D2250',
  },
  eventMeta: {
    fontSize: 12,
    color: '#6B5B8A',
  },
  eventTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    color: '#6B5B8A',
    fontWeight: '800',
  },
  purple: { backgroundColor: '#DDD0FF' },
  blue: { backgroundColor: '#CAE7FF' },
  green: { backgroundColor: '#C8F3D7' },
  orange: { backgroundColor: '#FFE4B0' },
  whiteCard: { backgroundColor: '#FFFFFF' },
  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#2D2250',
  },
  cardText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#6B5B8A',
    marginTop: 6,
  },
  actionPill: {
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B5B8A',
  },
});
