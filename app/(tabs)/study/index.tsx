import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ClayCard, ClayPill, ClayScreen, ClaySectionHeader, ClayStatCard } from '@/components/clay-ui';
import { ThemedText } from '@/components/themed-text';
import { useFirebaseBackend } from '@/providers/firebase-provider';

export default function StudyScreen() {
  const router = useRouter();
  const { profile, refreshMockLmsFeed, schedules, tasks, user } = useFirebaseBackend();
  const focusBlocks = schedules.filter((item) => item.type === 'study').length;
  const openTasks = tasks.filter((task) => task.status !== 'done').length;
  const preferredSessionMinutes = profile?.preferences.preferredSessionMinutes ?? 0;
  const studyGoalHours = profile?.preferences.studyGoalHours ?? 0;
  const studyRoutes = [
    {
      title: 'Flashcards',
      description: 'Flip through quick memory reps and cue-based recall.',
      icon: 'style',
      route: '/study/flashcards' as const,
      color: styles.orange,
    },
    {
      title: 'Focus',
      description: 'Start a dedicated focus flow for your next deep-work block.',
      icon: 'center-focus-strong',
      route: '/study/focus' as const,
      color: styles.green,
    },
    {
      title: 'Quiz',
      description: 'Test yourself with a structured check before the real thing.',
      icon: 'quiz',
      route: '/study/quiz' as const,
      color: styles.blue,
    },
    {
      title: 'Reviewer',
      description: 'Review material in a slower pass and spot weak areas early.',
      icon: 'fact-check',
      route: '/study/reviewer' as const,
      color: styles.purple,
    },
  ];

  return (
    <ClayScreen
      greeting="Study space"
      title="Study"
      subtitle="Your current focus plan, study cadence, and next rhythm at a glance."
      avatarLabel={profile?.avatarInitials ?? 'SL'}
      onRefresh={async () => {
        if (user) {
          await refreshMockLmsFeed();
        }
      }}>
      <View style={styles.statsRow}>
        <ClayStatCard label="Focus blocks" value={`${focusBlocks}`} />
        <ClayStatCard label="Open tasks" value={`${openTasks}`} />
      </View>
      <View style={styles.statsRow}>
        <ClayStatCard label="Goal" value={`${studyGoalHours}h`} />
        <ClayStatCard label="Session" value={`${preferredSessionMinutes}m`} />
      </View>

      <ClaySectionHeader icon="menu-book" title="Study flow" />
      <View style={styles.list}>
        <ClayCard style={[styles.card, styles.purple]}>
          <ThemedText style={styles.cardTitle}>Daily target</ThemedText>
          <ThemedText style={styles.cardText}>{studyGoalHours} hours per day is your current study goal.</ThemedText>
        </ClayCard>
        <ClayCard style={[styles.card, styles.green]}>
          <ThemedText style={styles.cardTitle}>Session pacing</ThemedText>
          <ThemedText style={styles.cardText}>
            Each focus block is tuned around {preferredSessionMinutes} minute sessions.
          </ThemedText>
        </ClayCard>
        <ClayCard style={[styles.card, styles.blue]}>
          <ThemedText style={styles.cardTitle}>Planner load</ThemedText>
          <ThemedText style={styles.cardText}>
            You currently have {focusBlocks} study blocks mapped across {schedules.length} total schedule items.
          </ThemedText>
          <ClayPill style={styles.inlinePill}>
            <ThemedText style={styles.pillText}>Keep the rhythm going</ThemedText>
          </ClayPill>
        </ClayCard>
      </View>

      <ClaySectionHeader icon="apps" title="Study tools" />
      <View style={styles.list}>
        {studyRoutes.map((item) => (
          <Pressable key={item.title} onPress={() => router.push(item.route)}>
            <ClayCard style={[styles.routeCard, item.color]}>
              <View style={styles.routeRow}>
                <View style={styles.routeIconWrap}>
                  <MaterialIcons name={item.icon as never} size={20} color="#2D2250" />
                </View>
                <View style={styles.routeCopy}>
                  <ThemedText style={styles.cardTitle}>{item.title}</ThemedText>
                  <ThemedText style={styles.cardText}>{item.description}</ThemedText>
                </View>
                <ClayPill style={styles.routePill}>
                  <ThemedText style={styles.pillText}>Open</ThemedText>
                </ClayPill>
              </View>
            </ClayCard>
          </Pressable>
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
    gap: 8,
  },
  routeCard: {
    gap: 8,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  routeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  routeCopy: {
    flex: 1,
    gap: 2,
  },
  routePill: {
    alignSelf: 'center',
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
  orange: { backgroundColor: '#FFE4B0' },
  inlinePill: { alignSelf: 'flex-start', marginTop: 4 },
  pillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B5B8A',
  },
});
