import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFirebaseBackend } from '@/providers/firebase-provider';

export default function CalendarScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const { schedules, tasks } = useFirebaseBackend();

  const agenda = schedules.slice(0, 3).map((item) => ({
    title: item.title,
    subtitle: `${item.location} - ${new Date(item.startsAt).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })}`,
    icon: (
      item.type === 'class' ? 'calendar-month' : item.type === 'study' ? 'groups' : 'event-note'
    ) as keyof typeof MaterialIcons.glyphMap,
  }));

  return (
    <AppScreen
      eyebrow="Calendar"
      title="See your learning week at a glance."
      description="Track upcoming classes, deadlines, and review blocks without leaving your main workflow."
      summary={[
        { label: 'Schedule items', value: `${schedules.length}` },
        { label: 'Deadlines', value: `${tasks.length}` },
        { label: 'Focus blocks', value: `${schedules.filter((item) => item.type === 'study').length}` },
        { label: 'Sync mode', value: 'Realtime' },
      ]}
      agenda={
        agenda.length
          ? agenda
          : [
              {
                title: 'Connect Firebase',
                subtitle: 'Your schedule will stream in here with Firestore listeners.',
                icon: 'calendar-month',
              },
            ]
      }>
      <Link href="/lms-sync" asChild>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.syncButton,
            { backgroundColor: pressed ? palette.icon : palette.tint },
          ]}>
          <MaterialIcons name="sync" size={20} color="#FFFFFF" />
          <ThemedText style={styles.syncButtonText}>LMS Sync</ThemedText>
        </Pressable>
      </Link>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  syncButton: {
    borderRadius: 18,
    minHeight: 54,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  syncButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
