import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Alert, Pressable, StyleSheet } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFirebaseBackend } from '@/providers/firebase-provider';

export default function CreateScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const { createQuickTask, user } = useFirebaseBackend();

  const handleQuickTask = async () => {
    try {
      await createQuickTask();
    } catch (error) {
      Alert.alert('Create task', error instanceof Error ? error.message : 'Unable to create task.');
    }
  };

  return (
    <AppScreen
      eyebrow="Create"
      title="Capture a task, note, or study plan in seconds."
      description="Use this space to add assignments, plan review sessions, and turn ideas into organized work."
      summary={[
        { label: 'Firestore', value: user ? 'Connected' : 'Waiting' },
        { label: 'Quick add', value: '1 tap' },
        { label: 'Sync', value: 'Realtime' },
        { label: 'Backend', value: 'Firebase' },
      ]}
      agenda={[
        {
          title: 'Quick assignment',
          subtitle: 'Create a task with due date, subject, and reminder in one flow.',
          icon: 'add-task',
        },
        {
          title: 'Study plan builder',
          subtitle: 'Break large exams into smaller review sessions automatically.',
          icon: 'edit-calendar',
        },
        {
          title: 'Idea inbox',
          subtitle: 'Store loose thoughts now and organize them when you are ready.',
          icon: 'lightbulb',
        },
      ]}>
      <Pressable
        accessibilityRole="button"
        onPress={handleQuickTask}
        style={({ pressed }) => [
          styles.quickTaskButton,
          { backgroundColor: pressed ? palette.icon : palette.tint },
        ]}>
        <MaterialIcons name="add-task" size={20} color="#FFFFFF" />
        <ThemedText style={styles.quickTaskText}>
          {user ? 'Add quick Firestore task' : 'Sign in to add Firestore task'}
        </ThemedText>
      </Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  quickTaskButton: {
    borderRadius: 18,
    minHeight: 54,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  quickTaskText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
