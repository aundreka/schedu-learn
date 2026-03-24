import * as DocumentPicker from 'expo-document-picker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ClayCard, ClayPill, ClayScreen, ClaySectionHeader, ClayStatCard } from '@/components/clay-ui';
import { ThemedText } from '@/components/themed-text';
import type { ExtractedClass, Weekday, YearLevel } from '@/lib/firebase/backend-reference';
import { useFirebaseBackend } from '@/providers/firebase-provider';

const YEAR_LEVELS: YearLevel[] = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year', 'Graduate'];
const WEEKDAYS: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

type QuizStep =
  | 'displayName'
  | 'yearLevel'
  | 'studyGoalHours'
  | 'preferredSessionMinutes'
  | 'shortBreakMinutes'
  | 'sleepStartHour'
  | 'sleepEndHour'
  | 'startHour'
  | 'endHour'
  | 'maxSessionsPerDay'
  | 'avoidBackToBackHard';

const QUIZ_STEPS: QuizStep[] = [
  'displayName',
  'yearLevel',
  'studyGoalHours',
  'preferredSessionMinutes',
  'shortBreakMinutes',
  'sleepStartHour',
  'sleepEndHour',
  'startHour',
  'endHour',
  'maxSessionsPerDay',
  'avoidBackToBackHard',
];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function timeParts(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new Error('Use HH:MM for class times.');
  }

  return { hour, minute };
}

function uniqueSubjectsFromClasses(classes: ExtractedClass[]) {
  return Array.from(new Set(classes.map((item) => item.subject.trim()).filter(Boolean)));
}

function toHourString(value?: number) {
  return String(value ?? 7);
}

function getQuizMeta(step: QuizStep) {
  switch (step) {
    case 'displayName':
      return {
        icon: 'badge',
        title: 'What should we call you?',
        description: 'We use this for your profile and a more personal dashboard.',
      };
    case 'yearLevel':
      return {
        icon: 'school',
        title: 'What year level are you in?',
        description: 'This helps tailor your study pacing and workload expectations.',
      };
    case 'studyGoalHours':
      return {
        icon: 'menu-book',
        title: 'How many hours do you want to study each day?',
        description: 'This becomes your default daily study target.',
      };
    case 'preferredSessionMinutes':
      return {
        icon: 'timer',
        title: 'How long do you want each study session to be?',
        description: 'We use this to split tasks into realistic focus blocks.',
      };
    case 'shortBreakMinutes':
      return {
        icon: 'coffee',
        title: 'How long should your breaks be?',
        description: 'Breaks are inserted between sessions so your plan feels sustainable.',
      };
    case 'sleepStartHour':
      return {
        icon: 'bedtime',
        title: 'What time do you usually go to bed?',
        description: 'We avoid scheduling study sessions too close to your sleep time.',
      };
    case 'sleepEndHour':
      return {
        icon: 'wb-sunny',
        title: 'What time do you usually wake up?',
        description: 'This helps us understand your realistic study window.',
      };
    case 'startHour':
      return {
        icon: 'play-circle',
        title: 'What time can studying usually start?',
        description: 'We won’t suggest blocks before this time.',
      };
    case 'endHour':
      return {
        icon: 'nightlight-round',
        title: 'What time should studying stop?',
        description: 'We use this as your latest reasonable study cutoff.',
      };
    case 'maxSessionsPerDay':
      return {
        icon: 'view-day',
        title: 'What is the most study sessions you want in one day?',
        description: 'This prevents your schedule from feeling overloaded.',
      };
    case 'avoidBackToBackHard':
      return {
        icon: 'psychology',
        title: 'Do you want to avoid back-to-back hard sessions?',
        description: 'Useful if you burn out quickly when two difficult subjects are stacked together.',
      };
    default:
      return {
        icon: 'help',
        title: 'Study preference',
        description: '',
      };
  }
}

export default function ProfileScreen() {
  const router = useRouter();
  const {
    clearImportedEafClassSchedules,
    completeOnboarding,
    createRecurringClassSchedules,
    profile,
    refreshMockLmsFeed,
    resetCurrentUserData,
    schedules,
    signOut,
    tasks,
    user,
  } = useFirebaseBackend();

  const existingClassCount = useMemo(
    () => schedules.filter((item) => item.type === 'class').length,
    [schedules]
  );

  const existingClasses = useMemo(() => schedules.filter((item) => item.type === 'class'), [schedules]);

  const [displayName, setDisplayName] = useState(profile?.displayName ?? user?.displayName ?? '');
  const [yearLevel, setYearLevel] = useState<YearLevel>(profile?.yearLevel ?? '1st Year');
  const [studyGoalHours, setStudyGoalHours] = useState(String(profile?.preferences.studyGoalHours ?? 2));
  const [preferredSessionMinutes, setPreferredSessionMinutes] = useState(String(profile?.preferences.preferredSessionMinutes ?? 45));
  const [shortBreakMinutes, setShortBreakMinutes] = useState(String(profile?.preferences.shortBreakMinutes ?? 15));
  const [startHour, setStartHour] = useState(String(profile?.preferences.startHour ?? 7));
  const [endHour, setEndHour] = useState(String(profile?.preferences.endHour ?? 22));
  const [sleepStartHour, setSleepStartHour] = useState(String(profile?.preferences.sleepStartHour ?? 23));
  const [sleepEndHour, setSleepEndHour] = useState(String(profile?.preferences.sleepEndHour ?? 7));
  const [maxSessionsPerDay, setMaxSessionsPerDay] = useState(String(profile?.preferences.maxSessionsPerDay ?? 4));
  const [avoidBackToBackHard, setAvoidBackToBackHard] = useState(profile?.preferences.avoidBackToBackHard ?? true);

  const [pickedEafName, setPickedEafName] = useState<string | null>(null);

  const [classTitle, setClassTitle] = useState('');
  const [classSubject, setClassSubject] = useState('');
  const [classWeekday, setClassWeekday] = useState<Weekday>('MON');
  const [classStart, setClassStart] = useState('08:00');
  const [classEnd, setClassEnd] = useState('09:00');
  const [classLocation, setClassLocation] = useState('');
  const [pendingClasses, setPendingClasses] = useState<ExtractedClass[]>([]);

  const [saving, setSaving] = useState(false);
  const [quizIndex, setQuizIndex] = useState(0);

  const onboardingDone = profile?.onboardingCompleted ?? false;

  const derivedSubjects = useMemo(() => {
    const pending = uniqueSubjectsFromClasses(pendingClasses);
    const existing = Array.from(
      new Set(existingClasses.map((item) => item.subject?.trim()).filter(Boolean) as string[])
    );

    return pending.length > 0 ? pending : existing;
  }, [pendingClasses, existingClasses]);

  const currentStep = QUIZ_STEPS[quizIndex];
  const quizMeta = getQuizMeta(currentStep);

  const canGoNext = useMemo(() => {
    switch (currentStep) {
      case 'displayName':
        return Boolean(displayName.trim());
      case 'yearLevel':
        return Boolean(yearLevel);
      case 'studyGoalHours':
        return Number(studyGoalHours) > 0;
      case 'preferredSessionMinutes':
        return Number(preferredSessionMinutes) >= 15;
      case 'shortBreakMinutes':
        return Number(shortBreakMinutes) >= 0;
      case 'sleepStartHour':
        return Number(sleepStartHour) >= 0 && Number(sleepStartHour) <= 23;
      case 'sleepEndHour':
        return Number(sleepEndHour) >= 0 && Number(sleepEndHour) <= 23;
      case 'startHour':
        return Number(startHour) >= 0 && Number(startHour) <= 23;
      case 'endHour':
        return Number(endHour) >= 0 && Number(endHour) <= 23;
      case 'maxSessionsPerDay':
        return Number(maxSessionsPerDay) > 0;
      case 'avoidBackToBackHard':
        return true;
      default:
        return true;
    }
  }, [
    currentStep,
    displayName,
    yearLevel,
    studyGoalHours,
    preferredSessionMinutes,
    shortBreakMinutes,
    sleepStartHour,
    sleepEndHour,
    startHour,
    endHour,
    maxSessionsPerDay,
  ]);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace('/');
    } catch (error) {
      Alert.alert('Profile', error instanceof Error ? error.message : 'Unable to sign out.');
    }
  };

  const handlePickEaf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets.length) {
        return;
      }

      const asset = result.assets[0];
      setPickedEafName(asset.name);
      Alert.alert(
        'EAF added',
        'Your EAF is attached for demo purposes. Now add the class blocks below so we can build your schedule.'
      );
    } catch (error) {
      Alert.alert('EAF', error instanceof Error ? error.message : 'Unable to pick EAF file.');
    }
  };

  const handleAddClass = () => {
    try {
      if (!classTitle.trim() || !classSubject.trim()) {
        throw new Error('Add a class name and subject first.');
      }

      const start = timeParts(classStart);
      const end = timeParts(classEnd);

      if (end.hour < start.hour || (end.hour === start.hour && end.minute <= start.minute)) {
        throw new Error('Class end time must be later than the start time.');
      }

      setPendingClasses((current) => [
        ...current,
        {
          title: classTitle.trim(),
          subject: classSubject.trim(),
          weekday: classWeekday,
          startHour: start.hour,
          startMinute: start.minute,
          endHour: end.hour,
          endMinute: end.minute,
          location: classLocation.trim() || undefined,
        },
      ]);

      setClassTitle('');
      setClassSubject('');
      setClassLocation('');
      setClassStart('08:00');
      setClassEnd('09:00');
      setClassWeekday('MON');
    } catch (error) {
      Alert.alert('Class block', error instanceof Error ? error.message : 'Unable to add class block.');
    }
  };

  const handleRemovePendingClass = (indexToRemove: number) => {
    setPendingClasses((current) => current.filter((_, index) => index !== indexToRemove));
  };

  const handleResetWorkspace = async () => {
    try {
      setSaving(true);
      await resetCurrentUserData();
      setPickedEafName(null);
      setPendingClasses([]);
      setQuizIndex(0);
      Alert.alert('Workspace reset', 'Your current account data has been cleared and onboarding was reset.');
    } catch (error) {
      Alert.alert('Reset workspace', error instanceof Error ? error.message : 'Unable to reset workspace.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOnboarding = async () => {
    if (!user) {
      Alert.alert('Profile', 'Sign in first to complete onboarding.');
      return;
    }

    if (!displayName.trim()) {
      Alert.alert('Profile', 'Enter your display name.');
      return;
    }

    if (pendingClasses.length === 0 && existingClassCount === 0) {
      Alert.alert('Profile', 'Add at least one class block before finishing onboarding.');
      return;
    }

    try {
      setSaving(true);
      if (pendingClasses.length > 0) {
        await clearImportedEafClassSchedules();
        await createRecurringClassSchedules(pendingClasses, 16);
      }

      await completeOnboarding({
        displayName: displayName.trim(),
        yearLevel,
        subjects: derivedSubjects,
        studyGoalHours: Number(studyGoalHours),
        preferredSessionMinutes: Number(preferredSessionMinutes),
        shortBreakMinutes: Number(shortBreakMinutes),
        startHour: Number(startHour),
        endHour: Number(endHour),
        maxSessionsPerDay: Number(maxSessionsPerDay),
        avoidBackToBackHard,
        sleepStartHour: Number(sleepStartHour),
        sleepEndHour: Number(sleepEndHour),
        activeEafImportId: null,
      });

      Alert.alert(
        'Profile saved',
        onboardingDone ? 'Your study profile was updated.' : 'Onboarding complete. Your account is ready.'
      );
    } catch (error) {
      Alert.alert('Profile', error instanceof Error ? error.message : 'Unable to save onboarding.');
    } finally {
      setSaving(false);
    }
  };

  const renderQuizStep = () => {
    switch (currentStep) {
      case 'displayName':
        return (
          <View style={styles.fieldGroup}>
            <ThemedText style={styles.bigEmoji}>👋</ThemedText>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              placeholderTextColor="#A899C8"
              style={styles.input}
            />
          </View>
        );

      case 'yearLevel':
        return (
          <View style={styles.fieldGroup}>
            <ThemedText style={styles.bigEmoji}>🎓</ThemedText>
            <View style={styles.choiceWrap}>
              {YEAR_LEVELS.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setYearLevel(option)}
                  style={[styles.choiceChip, yearLevel === option ? styles.choiceChipActive : null]}>
                  <ThemedText style={[styles.choiceText, yearLevel === option ? styles.choiceTextActive : null]}>
                    {option}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
        );

      case 'studyGoalHours':
        return (
          <View style={styles.fieldGroup}>
            <ThemedText style={styles.bigEmoji}>📚</ThemedText>
            <TextInput
              value={studyGoalHours}
              onChangeText={setStudyGoalHours}
              keyboardType="number-pad"
              placeholder="e.g. 2"
              placeholderTextColor="#A899C8"
              style={styles.input}
            />
          </View>
        );

      case 'preferredSessionMinutes':
        return (
          <View style={styles.fieldGroup}>
            <ThemedText style={styles.bigEmoji}>⏱️</ThemedText>
            <TextInput
              value={preferredSessionMinutes}
              onChangeText={setPreferredSessionMinutes}
              keyboardType="number-pad"
              placeholder="e.g. 45"
              placeholderTextColor="#A899C8"
              style={styles.input}
            />
          </View>
        );

      case 'shortBreakMinutes':
        return (
          <View style={styles.fieldGroup}>
            <ThemedText style={styles.bigEmoji}>☕</ThemedText>
            <TextInput
              value={shortBreakMinutes}
              onChangeText={setShortBreakMinutes}
              keyboardType="number-pad"
              placeholder="e.g. 15"
              placeholderTextColor="#A899C8"
              style={styles.input}
            />
          </View>
        );

      case 'sleepStartHour':
        return (
          <View style={styles.fieldGroup}>
            <ThemedText style={styles.bigEmoji}>🌙</ThemedText>
            <TextInput
              value={sleepStartHour}
              onChangeText={setSleepStartHour}
              keyboardType="number-pad"
              placeholder="Bedtime hour in 24h format, e.g. 23"
              placeholderTextColor="#A899C8"
              style={styles.input}
            />
          </View>
        );

      case 'sleepEndHour':
        return (
          <View style={styles.fieldGroup}>
            <ThemedText style={styles.bigEmoji}>🌅</ThemedText>
            <TextInput
              value={sleepEndHour}
              onChangeText={setSleepEndHour}
              keyboardType="number-pad"
              placeholder="Wake-up hour in 24h format, e.g. 7"
              placeholderTextColor="#A899C8"
              style={styles.input}
            />
          </View>
        );

      case 'startHour':
        return (
          <View style={styles.fieldGroup}>
            <ThemedText style={styles.bigEmoji}>🚀</ThemedText>
            <TextInput
              value={startHour}
              onChangeText={setStartHour}
              keyboardType="number-pad"
              placeholder="Earliest study hour, e.g. 8"
              placeholderTextColor="#A899C8"
              style={styles.input}
            />
          </View>
        );

      case 'endHour':
        return (
          <View style={styles.fieldGroup}>
            <ThemedText style={styles.bigEmoji}>🌃</ThemedText>
            <TextInput
              value={endHour}
              onChangeText={setEndHour}
              keyboardType="number-pad"
              placeholder="Latest study hour, e.g. 21"
              placeholderTextColor="#A899C8"
              style={styles.input}
            />
          </View>
        );

      case 'maxSessionsPerDay':
        return (
          <View style={styles.fieldGroup}>
            <ThemedText style={styles.bigEmoji}>🗓️</ThemedText>
            <TextInput
              value={maxSessionsPerDay}
              onChangeText={setMaxSessionsPerDay}
              keyboardType="number-pad"
              placeholder="e.g. 4"
              placeholderTextColor="#A899C8"
              style={styles.input}
            />
          </View>
        );

      case 'avoidBackToBackHard':
        return (
          <View style={styles.fieldGroup}>
            <ThemedText style={styles.bigEmoji}>🧠</ThemedText>
            <View style={styles.choiceWrap}>
              <Pressable
                onPress={() => setAvoidBackToBackHard(true)}
                style={[styles.choiceChip, avoidBackToBackHard ? styles.choiceChipActive : null]}>
                <ThemedText style={[styles.choiceText, avoidBackToBackHard ? styles.choiceTextActive : null]}>
                  Yes, space them out
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setAvoidBackToBackHard(false)}
                style={[styles.choiceChip, !avoidBackToBackHard ? styles.choiceChipActive : null]}>
                <ThemedText style={[styles.choiceText, !avoidBackToBackHard ? styles.choiceTextActive : null]}>
                  No, that’s fine
                </ThemedText>
              </Pressable>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <ClayScreen
      greeting={onboardingDone ? 'Profile' : 'Getting started'}
      title={onboardingDone ? (profile?.displayName ?? 'Your Profile') : 'Set up your study system'}
      subtitle={
        onboardingDone
          ? 'Update your class schedule and study preferences.'
          : 'First add your class schedule, then answer a short study quiz so we can build better plans.'
      }
      avatarLabel={profile?.avatarInitials ?? 'SL'}
      onRefresh={async () => {
        if (user) {
          await refreshMockLmsFeed();
        }
      }}>
      <View style={styles.statsRow}>
        <ClayStatCard label="Classes" value={`${existingClassCount + pendingClasses.length}`} />
        <ClayStatCard label="Open tasks" value={`${tasks.filter((task) => task.status !== 'done').length}`} />
      </View>

      <ClaySectionHeader icon="calendar-month" title="Add your schedule" />
      <ClayCard style={styles.card}>
        <ThemedText style={styles.cardTitle}>Class blocks are required</ThemedText>
        <ThemedText style={styles.cardText}>
          Add the classes in your weekly schedule. You can also upload an EAF for reference, but the class blocks are what we actually use to build your calendar.
        </ThemedText>

        <View style={styles.optionalUploadBox}>
          <View style={styles.optionalUploadHeader}>
            <MaterialIcons name="upload-file" size={18} color="#6B5B8A" />
            <ThemedText style={styles.optionalUploadTitle}>Upload EAF (optional)</ThemedText>
          </View>
          <Pressable onPress={handlePickEaf} style={styles.secondaryButton}>
            <ThemedText style={styles.secondaryButtonText}>
              {pickedEafName ?? 'Choose PDF or image'}
            </ThemedText>
          </Pressable>
          <ThemedText style={styles.helperText}>
            {pickedEafName ? `Attached for demo: ${pickedEafName}` : 'Optional only — you can skip this.'}
          </ThemedText>
        </View>
      </ClayCard>

      <ClayCard style={styles.card}>
        <ThemedText style={styles.cardTitle}>Add a class block</ThemedText>
        <ThemedText style={styles.cardText}>
          Make this feel like filling out your real class schedule, not “confirming extracted data.”
        </ThemedText>

        <View style={styles.fieldGroup}>
          <ThemedText style={styles.label}>Class name</ThemedText>
          <TextInput
            value={classTitle}
            onChangeText={setClassTitle}
            placeholder="e.g. Thermodynamics"
            placeholderTextColor="#A899C8"
            style={styles.input}
          />
        </View>

        <View style={styles.fieldGroup}>
          <ThemedText style={styles.label}>Subject / course</ThemedText>
          <TextInput
            value={classSubject}
            onChangeText={setClassSubject}
            placeholder="e.g. Physics"
            placeholderTextColor="#A899C8"
            style={styles.input}
          />
        </View>

        <View style={styles.fieldGroup}>
          <ThemedText style={styles.label}>Day</ThemedText>
          <View style={styles.choiceWrap}>
            {WEEKDAYS.map((day) => (
              <Pressable
                key={day}
                onPress={() => setClassWeekday(day)}
                style={[styles.choiceChip, classWeekday === day ? styles.choiceChipActive : null]}>
                <ThemedText style={[styles.choiceText, classWeekday === day ? styles.choiceTextActive : null]}>
                  {day}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.fieldGroup, styles.half]}>
            <ThemedText style={styles.label}>Starts</ThemedText>
            <TextInput
              value={classStart}
              onChangeText={setClassStart}
              placeholder="08:00"
              placeholderTextColor="#A899C8"
              style={styles.input}
            />
          </View>
          <View style={[styles.fieldGroup, styles.half]}>
            <ThemedText style={styles.label}>Ends</ThemedText>
            <TextInput
              value={classEnd}
              onChangeText={setClassEnd}
              placeholder="09:00"
              placeholderTextColor="#A899C8"
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <ThemedText style={styles.label}>Location</ThemedText>
          <TextInput
            value={classLocation}
            onChangeText={setClassLocation}
            placeholder="Optional room or building"
            placeholderTextColor="#A899C8"
            style={styles.input}
          />
        </View>

        <Pressable onPress={handleAddClass} style={styles.actionButton}>
          <ThemedText style={styles.actionButtonText}>Add class block</ThemedText>
        </Pressable>

        <View style={styles.list}>
          {pendingClasses.length === 0 ? (
            <ThemedText style={styles.helperText}>No class blocks added yet.</ThemedText>
          ) : (
            pendingClasses.map((item, index) => (
              <View key={`${item.title}-${index}`} style={styles.pendingRow}>
                <ClayPill>
                  <ThemedText style={styles.pillText}>
                    {`${item.weekday} • ${item.title} • ${pad(item.startHour)}:${pad(item.startMinute)}-${pad(item.endHour)}:${pad(item.endMinute)}`}
                  </ThemedText>
                </ClayPill>
                <Pressable onPress={() => handleRemovePendingClass(index)} style={styles.removeButton}>
                  <MaterialIcons name="close" size={16} color="#7A55B0" />
                </Pressable>
              </View>
            ))
          )}
        </View>

        <View style={styles.subjectSummaryBox}>
          <ThemedText style={styles.subjectSummaryTitle}>Detected subjects</ThemedText>
          <ThemedText style={styles.helperText}>
            {derivedSubjects.length > 0 ? derivedSubjects.join(', ') : 'Subjects will appear automatically from your class blocks.'}
          </ThemedText>
        </View>
      </ClayCard>

      <ClaySectionHeader icon="psychology" title="Study profile quiz" />
      <ClayCard style={styles.card}>
        <View style={styles.quizHeader}>
          <View style={styles.quizProgressTrack}>
            <View style={[styles.quizProgressFill, { width: `${((quizIndex + 1) / QUIZ_STEPS.length) * 100}%` }]} />
          </View>
          <ThemedText style={styles.helperText}>
            Question {quizIndex + 1} of {QUIZ_STEPS.length}
          </ThemedText>
        </View>

        <View style={styles.quizTitleRow}>
          <MaterialIcons name={quizMeta.icon as never} size={20} color="#7A55B0" />
          <ThemedText style={styles.quizTitle}>{quizMeta.title}</ThemedText>
        </View>
        <ThemedText style={styles.cardText}>{quizMeta.description}</ThemedText>

        {renderQuizStep()}

        <View style={styles.quizButtons}>
          <Pressable
            onPress={() => setQuizIndex((current) => Math.max(0, current - 1))}
            disabled={quizIndex === 0}
            style={[styles.secondaryButton, quizIndex === 0 ? styles.disabledButton : null]}>
            <ThemedText style={styles.secondaryButtonText}>Back</ThemedText>
          </Pressable>

          {quizIndex < QUIZ_STEPS.length - 1 ? (
            <Pressable
              onPress={() => {
                if (!canGoNext) {
                  Alert.alert('Study profile', 'Please answer this question first.');
                  return;
                }
                setQuizIndex((current) => Math.min(QUIZ_STEPS.length - 1, current + 1));
              }}
              style={styles.actionButton}>
              <ThemedText style={styles.actionButtonText}>Next</ThemedText>
            </Pressable>
          ) : (
            <Pressable onPress={handleSaveOnboarding} disabled={saving} style={styles.actionButton}>
              <ThemedText style={styles.actionButtonText}>
                {saving ? 'Saving...' : onboardingDone ? 'Update study profile' : 'Finish onboarding'}
              </ThemedText>
            </Pressable>
          )}
        </View>
      </ClayCard>

      <ClaySectionHeader icon="build" title="Account actions" />
      <View style={styles.list}>
        <Pressable onPress={handleResetWorkspace} disabled={saving}>
          <ClayCard style={[styles.card, styles.redCard]}>
            <ThemedText style={styles.cardTitle}>Reset current workspace</ThemedText>
            <ThemedText style={styles.cardText}>
              Delete this signed-in user&apos;s tasks, schedules, LMS feed, EAF imports, and onboarding answers.
            </ThemedText>
          </ClayCard>
        </Pressable>
        <Pressable onPress={handleSignOut}>
          <ClayCard style={[styles.card, styles.blueCard]}>
            <ThemedText style={styles.cardTitle}>Sign out</ThemedText>
            <ThemedText style={styles.cardText}>{user?.email ?? 'No active session'}</ThemedText>
          </ClayCard>
        </Pressable>
      </View>
    </ClayScreen>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    gap: 12,
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
    minHeight: 48,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(122,85,176,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#2D2250',
    fontWeight: '600',
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
    backgroundColor: 'rgba(255,255,255,0.65)',
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
  },
  choiceTextActive: {
    color: '#2D2250',
  },
  actionButton: {
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: '#7A55B0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    minWidth: 120,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(122,85,176,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    minWidth: 120,
  },
  secondaryButtonText: {
    color: '#6B5B8A',
    fontSize: 13,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.45,
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
  helperText: {
    fontSize: 12,
    color: '#6B5B8A',
  },
  list: {
    gap: 10,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B5B8A',
  },
  redCard: {
    backgroundColor: '#FFD7D7',
  },
  blueCard: {
    backgroundColor: '#CAE7FF',
  },
  optionalUploadBox: {
    padding: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.45)',
    gap: 10,
  },
  optionalUploadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionalUploadTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#2D2250',
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(122,85,176,0.12)',
  },
  subjectSummaryBox: {
    gap: 6,
    padding: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(221,208,255,0.35)',
  },
  subjectSummaryTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#2D2250',
  },
  quizHeader: {
    gap: 8,
  },
  quizProgressTrack: {
    width: '100%',
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(122,85,176,0.12)',
    overflow: 'hidden',
  },
  quizProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#7A55B0',
  },
  quizTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quizTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    color: '#2D2250',
  },
  quizButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  bigEmoji: {
    fontSize: 38,
    textAlign: 'center',
  },
});


