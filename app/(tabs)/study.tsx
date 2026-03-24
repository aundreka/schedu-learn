import { StyleSheet, View } from 'react-native';

import { ClayCard, ClayPill, ClayScreen, ClaySectionHeader, ClayStatCard } from '@/components/clay-ui';
import { ThemedText } from '@/components/themed-text';
import { useFirebaseBackend } from '@/providers/firebase-provider';

export default function StudyScreen() {
  const { profile, refreshMockLmsFeed, schedules, tasks, user } = useFirebaseBackend();
  const completed = tasks.filter((task) => task.status === 'done').length;
  const focusBlocks = schedules.filter((item) => item.type === 'study').length;

  return (
    <ClayScreen
      greeting="Progress view"
      title="Study Stats"
      subtitle="A soft, visual overview instead of a plain analytics page."
      avatarLabel={profile?.avatarInitials ?? 'SL'} onRefresh={async () => { if (user) { await refreshMockLmsFeed(); } }}>
      <View style={styles.statsRow}>
        <ClayStatCard label="Completed" value={`${completed}`} />
        <ClayStatCard label="Focus blocks" value={`${focusBlocks}`} />
      </View>
      <View style={styles.statsRow}>
        <ClayStatCard label="Open tasks" value={`${tasks.filter((task) => task.status !== 'done').length}`} />
        <ClayStatCard label="Events" value={`${schedules.length}`} />
      </View>

      <ClaySectionHeader icon="bar-chart" title="Insights" />
      <View style={styles.list}>
        <ClayCard style={[styles.card, styles.purple]}>
          <ThemedText style={styles.cardTitle}>Weekly trend</ThemedText>
          <ThemedText style={styles.cardText}>Your streak and completed tasks are holding steady this week.</ThemedText>
        </ClayCard>
        <ClayCard style={[styles.card, styles.green]}>
          <ThemedText style={styles.cardTitle}>Best window</ThemedText>
          <ThemedText style={styles.cardText}>Your planner has the most open focus space in the late afternoon.</ThemedText>
        </ClayCard>
        <ClayCard style={[styles.card, styles.blue]}>
          <ThemedText style={styles.cardTitle}>Study goal</ThemedText>
          <ThemedText style={styles.cardText}>{profile?.preferences.studyGoalHours ?? 0} hours per day is your current target.</ThemedText>
          <ClayPill style={styles.inlinePill}>
            <ThemedText style={styles.pillText}>Adjust in Settings</ThemedText>
          </ClayPill>
        </ClayCard>
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
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#2D2250',
  },
  cardText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#6B5B8A',
  },
  purple: { backgroundColor: '#DDD0FF' },
  green: { backgroundColor: '#C8F3D7' },
  blue: { backgroundColor: '#CAE7FF' },
  inlinePill: { alignSelf: 'flex-start', marginTop: 4 },
  pillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B5B8A',
  },
});
