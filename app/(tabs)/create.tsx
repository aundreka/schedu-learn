import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {
  ClayCard,
  ClayPill,
  ClayScreen,
  ClaySectionHeader,
  ClayStatCard,
} from '@/components/clay-ui';
import { ThemedText } from '@/components/themed-text';
import { assessUrgency, formatUrgencyLabel, getDefaultGradeImpactPercent } from '@/lib/urgency';
import { useFirebaseBackend } from '@/providers/firebase-provider';

type TaskType = 'assignment' | 'quiz' | 'exam' | 'project' | 'reading' | 'other';
type Difficulty = 'easy' | 'medium' | 'hard';

const TASK_TYPES: TaskType[] = ['assignment', 'quiz', 'exam', 'project', 'reading', 'other'];
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

function formatDue(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function getDefaultDateParts() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(18, 0, 0, 0);

  return {
    dueDate: `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`,
    dueTime: `${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`,
  };
}

function toIsoFromDateAndTime(dueDate: string, dueTime: string) {
  const [year, month, day] = dueDate.split('-').map(Number);
  const [hour, minute] = dueTime.split(':').map(Number);

  if (
    !year || !month || !day ||
    Number.isNaN(hour) || Number.isNaN(minute)
  ) {
    throw new Error('Enter a valid due date and time.');
  }

  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

function taskCardTone(task: {
  difficulty: Difficulty;
  dueAt: string;
  estimatedMinutes: number;
  gradeImpactPercent?: number;
  remainingMinutes: number;
  scheduledMinutes: number;
  type: TaskType;
}) {
  return assessUrgency(task).color;
}

export default function CreateScreen() {
  const defaults = useMemo(() => getDefaultDateParts(), []);
  const {
    createTaskAndSchedule,
    profile,
    refreshMockLmsFeed,
    setTaskStatus,
    tasks,
    user,
  } = useFirebaseBackend();

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('assignment');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [estimatedMinutes, setEstimatedMinutes] = useState('60');
  const [gradeImpactPercent, setGradeImpactPercent] = useState(String(getDefaultGradeImpactPercent('assignment')));
  const [dueDate, setDueDate] = useState(defaults.dueDate);
  const [dueTime, setDueTime] = useState(defaults.dueTime);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const openTasks = tasks.filter((task) => task.status !== 'done');

  const previewDueIso = useMemo(() => {
    try {
      return toIsoFromDateAndTime(dueDate, dueTime);
    } catch {
      return null;
    }
  }, [dueDate, dueTime]);

  const previewUrgency = useMemo(() => {
    if (!previewDueIso) return null;
    return assessUrgency({
      type: taskType,
      dueAt: previewDueIso,
      difficulty,
      estimatedMinutes: Number(estimatedMinutes) || 0,
      gradeImpactPercent: Number(gradeImpactPercent) || undefined,
      remainingMinutes: Number(estimatedMinutes) || 0,
      scheduledMinutes: 0,
    });
  }, [difficulty, estimatedMinutes, gradeImpactPercent, previewDueIso, taskType]);

  const handleCreateTask = async () => {
    if (!user) {
      Alert.alert('Task planner', 'Sign in first to save and auto-schedule tasks.');
      return;
    }

    if (!title.trim()) {
      Alert.alert('Task planner', 'Enter what needs to be done.');
      return;
    }

    if (!subject.trim()) {
      Alert.alert('Task planner', 'Enter the subject.');
      return;
    }

    const minutes = Number(estimatedMinutes);
    if (!Number.isFinite(minutes) || minutes < 15) {
      Alert.alert('Task planner', 'Estimated time must be at least 15 minutes.');
      return;
    }

    const gradeImpact = Number(gradeImpactPercent);
    if (!Number.isFinite(gradeImpact) || gradeImpact < 0 || gradeImpact > 100) {
      Alert.alert('Task planner', 'Grade impact must be between 0 and 100.');
      return;
    }

    let dueAt: string;

    try {
      dueAt = toIsoFromDateAndTime(dueDate, dueTime);
    } catch (error) {
      Alert.alert('Task planner', error instanceof Error ? error.message : 'Invalid due date.');
      return;
    }

    if (new Date(dueAt).getTime() <= Date.now()) {
      Alert.alert('Task planner', 'Due date must be in the future.');
      return;
    }

    try {
      setSubmitting(true);

      await createTaskAndSchedule({
        title: title.trim(),
        subject: subject.trim(),
        type: taskType,
        dueAt,
        estimatedMinutes: minutes,
        difficulty,
        gradeImpactPercent: gradeImpact,
        notes: notes.trim(),
        autoSchedule: true,
      } as never);

      setTitle('');
      setSubject('');
      setTaskType('assignment');
      setDifficulty('medium');
      setEstimatedMinutes('60');
      setGradeImpactPercent(String(getDefaultGradeImpactPercent('assignment')));
      setDueDate(defaults.dueDate);
      setDueTime(defaults.dueTime);
      setNotes('');

      Alert.alert(
        'Task planned',
        'Task saved to Firebase and auto-scheduling has been triggered.'
      );
    } catch (error) {
      Alert.alert(
        'Task planner',
        error instanceof Error ? error.message : 'Unable to create and schedule task.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const markDone = async (taskId: string) => {
    try {
      await setTaskStatus(taskId, 'done');
    } catch (error) {
      Alert.alert('Tasks', error instanceof Error ? error.message : 'Unable to update task.');
    }
  };

  return (
    <ClayScreen
      greeting="Plan a task"
      title="Add Task"
      subtitle="Turn a raw school task into a scheduled study plan."
      avatarLabel={profile?.avatarInitials ?? 'SL'}
      onRefresh={async () => {
        if (user) {
          await refreshMockLmsFeed();
        }
      }}>
      <View style={styles.statsRow}>
        <ClayStatCard label="Open" value={`${openTasks.length}`} />
        <ClayStatCard label="Done" value={`${tasks.length - openTasks.length}`} />
      </View>

      <ClaySectionHeader
        icon="edit-calendar"
        title="Task intake"
        accessory={
          <Pressable onPress={handleCreateTask} disabled={submitting} style={submitting ? styles.disabled : undefined}>
            <ClayPill>
              <ThemedText style={styles.pillText}>
                {submitting ? 'Planning...' : 'Plan Task'}
              </ThemedText>
            </ClayPill>
          </Pressable>
        }
      />

      <ClayCard style={styles.formCard}>
        <View style={styles.fieldGroup}>
          <ThemedText style={styles.label}>What needs to be done?</ThemedText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Thermodynamics problem set"
            placeholderTextColor="#A899C8"
            style={styles.input}
          />
        </View>

        <View style={styles.fieldGroup}>
          <ThemedText style={styles.label}>Subject</ThemedText>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="e.g. Applied Physics"
            placeholderTextColor="#A899C8"
            style={styles.input}
          />
        </View>

        <View style={styles.fieldGroup}>
          <ThemedText style={styles.label}>Type</ThemedText>
          <View style={styles.choiceWrap}>
            {TASK_TYPES.map((option) => {
              const active = taskType === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setTaskType(option)}
                  style={[styles.choiceChip, active ? styles.choiceChipActive : null]}>
                  <ThemedText style={[styles.choiceText, active ? styles.choiceTextActive : null]}>
                    {option}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <ThemedText style={styles.label}>Difficulty</ThemedText>
          <View style={styles.choiceWrap}>
            {DIFFICULTIES.map((option) => {
              const active = difficulty === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setDifficulty(option)}
                  style={[styles.choiceChip, active ? styles.choiceChipActive : null]}>
                  <ThemedText style={[styles.choiceText, active ? styles.choiceTextActive : null]}>
                    {option}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.fieldGroup, styles.half]}>
            <ThemedText style={styles.label}>Due date</ThemedText>
            <TextInput
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#A899C8"
              style={styles.input}
              autoCapitalize="none"
            />
          </View>

          <View style={[styles.fieldGroup, styles.half]}>
            <ThemedText style={styles.label}>Due time</ThemedText>
            <TextInput
              value={dueTime}
              onChangeText={setDueTime}
              placeholder="HH:MM"
              placeholderTextColor="#A899C8"
              style={styles.input}
              autoCapitalize="none"
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <ThemedText style={styles.label}>How long will it probably take?</ThemedText>
          <TextInput
            value={estimatedMinutes}
            onChangeText={setEstimatedMinutes}
            placeholder="Minutes"
            placeholderTextColor="#A899C8"
            keyboardType="number-pad"
            style={styles.input}
          />
        </View>

        <View style={styles.fieldGroup}>
          <ThemedText style={styles.label}>Grade impact (%)</ThemedText>
          <TextInput
            value={gradeImpactPercent}
            onChangeText={setGradeImpactPercent}
            placeholder="How much of the grade depends on this?"
            placeholderTextColor="#A899C8"
            keyboardType="number-pad"
            style={styles.input}
          />
        </View>

        <View style={styles.fieldGroup}>
          <ThemedText style={styles.label}>Notes (optional)</ThemedText>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Extra context for this task"
            placeholderTextColor="#A899C8"
            style={[styles.input, styles.notesInput]}
            multiline
          />
        </View>

        <View style={styles.previewCard}>
          <View style={styles.previewRow}>
            <MaterialIcons name="auto-awesome" size={16} color="#7A55B0" />
            <ThemedText style={styles.previewTitle}>Scheduling preview</ThemedText>
          </View>

          <ThemedText style={styles.previewText}>
            {previewUrgency
              ? `This task will be treated as ${formatUrgencyLabel(previewUrgency.level).toLowerCase()} with a score of ${previewUrgency.score}/100, using both due date pressure and its ${previewUrgency.gradeImpactPercent}% grade effect.`
              : 'Enter a valid due date and time to preview scheduling behavior.'}
          </ThemedText>
        </View>
      </ClayCard>

      <ClaySectionHeader icon="checklist" title="Upcoming tasks" />

      <View style={styles.list}>
        {openTasks.map((task, index) => (
          <ClayCard
            key={task.id}
            style={[
              styles.taskCard,
              taskCardTone({
                type: task.type,
                dueAt: task.dueAt,
                difficulty: task.difficulty,
                estimatedMinutes: task.estimatedMinutes,
                remainingMinutes: task.remainingMinutes,
                scheduledMinutes: task.scheduledMinutes,
                gradeImpactPercent: (task as typeof task & { gradeImpactPercent?: number }).gradeImpactPercent,
              }) === 'red'
                ? styles.red
                : taskCardTone({
                    type: task.type,
                    dueAt: task.dueAt,
                    difficulty: task.difficulty,
                    estimatedMinutes: task.estimatedMinutes,
                    remainingMinutes: task.remainingMinutes,
                    scheduledMinutes: task.scheduledMinutes,
                    gradeImpactPercent: (task as typeof task & { gradeImpactPercent?: number }).gradeImpactPercent,
                  }) === 'yellow'
                  ? styles.orange
                  : styles.blue,
            ]}>
            <View style={styles.taskTop}>
              <View style={styles.iconBadge}>
                <MaterialIcons name="checklist" size={16} color="#2D2250" />
              </View>

              <View style={styles.taskCopy}>
                <ThemedText style={styles.taskTitle}>{task.title}</ThemedText>
                <ThemedText style={styles.taskMeta}>
                  {task.subject} • {task.type} • {task.difficulty}
                </ThemedText>
              </View>

              <Pressable onPress={() => markDone(task.id)}>
                <ClayPill>
                  <ThemedText style={styles.pillText}>Done</ThemedText>
                </ClayPill>
              </Pressable>
            </View>

            <ThemedText style={styles.taskMeta}>Due {formatDue(task.dueAt)}</ThemedText>
            <ThemedText style={styles.taskMeta}>
              {task.scheduledMinutes > 0
                ? `${task.scheduledMinutes} mins scheduled`
                : 'Awaiting study block placement'}
            </ThemedText>
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
  formCard: {
    gap: 14,
  },
  fieldGroup: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  half: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6B5B8A',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(122,85,176,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#2D2250',
    fontWeight: '600',
  },
  notesInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  choiceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(122,85,176,0.12)',
  },
  choiceChipActive: {
    backgroundColor: '#DDD0FF',
    borderColor: 'rgba(122,85,176,0.28)',
  },
  choiceText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6B5B8A',
    textTransform: 'capitalize',
  },
  choiceTextActive: {
    color: '#2D2250',
  },
  previewCard: {
    gap: 8,
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#F4EEFF',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#2D2250',
  },
  previewText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#6B5B8A',
  },
  disabled: {
    opacity: 0.7,
  },
  list: {
    gap: 10,
  },
  taskCard: {
    gap: 8,
  },
  taskTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBadge: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskCopy: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#2D2250',
  },
  taskMeta: {
    fontSize: 12,
    color: '#6B5B8A',
  },
  purple: {
    backgroundColor: '#DDD0FF',
  },
  orange: {
    backgroundColor: '#FFE4B0',
  },
  red: {
    backgroundColor: '#FFD7D7',
  },
  blue: {
    backgroundColor: '#CAE7FF',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B5B8A',
  },
});
