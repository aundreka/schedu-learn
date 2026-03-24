import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, View } from 'react-native';

import { ClayCard, ClayPill, ClayScreen, ClaySectionHeader, ClayStatCard } from '@/components/clay-ui';
import { ThemedText } from '@/components/themed-text';
import { useFirebaseBackend } from '@/providers/firebase-provider';

export default function StatsScreen() {
  const { profile, refreshMockLmsFeed, schedules, tasks, user } = useFirebaseBackend();
  const completedTasks = tasks.filter((task) => task.status === 'done').length;
  const openTasks = tasks.filter((task) => task.status !== 'done').length;
  const studyBlocks = schedules.filter((item) => item.type === 'study').length;
  const completionRate = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

  return (
    <ClayScreen
      greeting="Progress view"
      title="Stats"
      subtitle="A softer analytics snapshot for workload, momentum, and study volume."
      avatarLabel={profile?.avatarInitials ?? 'SL'}
      onRefresh={async () => {
        if (user) {
          await refreshMockLmsFeed();
        }
      }}>
      <View style={styles.statsRow}>
        <ClayStatCard label="Completed" value={`${completedTasks}`} />
        <ClayStatCard label="Open tasks" value={`${openTasks}`} />
      </View>
      <View style={styles.statsRow}>
        <ClayStatCard label="Study blocks" value={`${studyBlocks}`} />
        <ClayStatCard label="Completion" value={`${completionRate}%`} />
      </View>

      <ClaySectionHeader icon="bar-chart" title="Insights" />
      <View style={styles.list}>
        <ClayCard style={[styles.card, styles.purple]}>
          <View style={styles.row}>
            <MaterialIcons name="check-circle" size={18} color="#2D2250" />
            <View style={styles.copy}>
              <ThemedText style={styles.title}>Task momentum</ThemedText>
              <ThemedText style={styles.text}>
                {completedTasks === 0
                  ? 'No finished tasks yet, so your trend line is still warming up.'
                  : `You have already cleared ${completedTasks} task${completedTasks === 1 ? '' : 's'}.`}
              </ThemedText>
            </View>
            <ClayPill style={styles.pressablePill}>
              <ThemedText style={styles.pillText}>{`${completionRate}% done`}</ThemedText>
            </ClayPill>
          </View>
        </ClayCard>
        <ClayCard style={[styles.card, styles.blue]}>
          <View style={styles.row}>
            <MaterialIcons name="menu-book" size={18} color="#2D2250" />
            <View style={styles.copy}>
              <ThemedText style={styles.title}>Study load</ThemedText>
              <ThemedText style={styles.text}>
                {studyBlocks === 0
                  ? 'No study blocks are scheduled yet.'
                  : `${studyBlocks} study block${studyBlocks === 1 ? '' : 's'} are currently on your planner.`}
              </ThemedText>
            </View>
            <ClayPill style={styles.pressablePill}>
              <ThemedText style={styles.pillText}>Planner</ThemedText>
            </ClayPill>
          </View>
        </ClayCard>
        <ClayCard style={[styles.card, styles.orange]}>
          <View style={styles.row}>
            <MaterialIcons name="event-note" size={18} color="#2D2250" />
            <View style={styles.copy}>
              <ThemedText style={styles.title}>Calendar coverage</ThemedText>
              <ThemedText style={styles.text}>
                {schedules.length} total calendar item{schedules.length === 1 ? '' : 's'} are feeding your current
                view.
              </ThemedText>
            </View>
            <ClayPill style={styles.pressablePill}>
              <ThemedText style={styles.pillText}>Live</ThemedText>
            </ClayPill>
          </View>
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
