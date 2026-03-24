import * as DocumentPicker from 'expo-document-picker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { ClayCard, ClayPill, ClayScreen } from '@/components/clay-ui';
import { ThemedText } from '@/components/themed-text';
import type { ExtractedClass, Weekday, YearLevel } from '@/lib/firebase/backend-reference';
import { useFirebaseBackend } from '@/providers/firebase-provider';
import { useNavigation } from '@react-navigation/native';

const HOME_ROUTE = '/(tabs)';
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

function getQuizMeta(step: QuizStep) {
  switch (step) {
    case 'displayName':
      return { icon: 'badge', title: 'What should we call you?', emoji: '👋' };
    case 'yearLevel':
      return { icon: 'school', title: 'What year level are you in?', emoji: '🎓' };
    case 'studyGoalHours':
      return { icon: 'menu-book', title: 'How many hours do you want to study?', emoji: '📚' };
    case 'preferredSessionMinutes':
      return { icon: 'timer', title: 'How long should one study session be?', emoji: '⏱️' };
    case 'shortBreakMinutes':
      return { icon: 'coffee', title: 'How long should your breaks be?', emoji: '☕' };
    case 'sleepStartHour':
      return { icon: 'bedtime', title: 'What time do you usually go to bed?', emoji: '🌙' };
    case 'sleepEndHour':
      return { icon: 'wb-sunny', title: 'What time do you usually wake up?', emoji: '🌅' };
    case 'startHour':
      return { icon: 'play-circle', title: 'What time can studying start?', emoji: '🚀' };
    case 'endHour':
      return { icon: 'nightlight-round', title: 'What time should studying stop?', emoji: '🌃' };
    case 'maxSessionsPerDay':
      return { icon: 'view-day', title: 'Max study sessions in one day?', emoji: '🗓️' };
    case 'avoidBackToBackHard':
      return { icon: 'psychology', title: 'Avoid back-to-back hard sessions?', emoji: '🧠' };
    default:
      return { icon: 'help', title: 'Study preference', emoji: '✨' };
  }
}

export default function ProfileScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const pagerRef = useRef<ScrollView>(null);

  const {
    clearImportedEafClassSchedules,
    completeOnboarding,
    createRecurringClassSchedules,
    profile,
    refreshMockLmsFeed,
    resetCurrentUserData,
    schedules,
    signOut,
    user,
  } = useFirebaseBackend();

  const onboardingDone = profile?.onboardingCompleted ?? false;
const navigation = useNavigation();
  const existingClasses = useMemo(() => schedules.filter((item) => item.type === 'class'), [schedules]);
  const existingClassCount = existingClasses.length;

  const [pageIndex, setPageIndex] = useState(0);
  const [quizIndex, setQuizIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState(profile?.displayName ?? user?.displayName ?? '');
  const [yearLevel, setYearLevel] = useState<YearLevel>(profile?.yearLevel ?? '1st Year');
  const [studyGoalHours, setStudyGoalHours] = useState(String(profile?.preferences.studyGoalHours ?? 2));
  const [preferredSessionMinutes, setPreferredSessionMinutes] = useState(
    String(profile?.preferences.preferredSessionMinutes ?? 45)
  );
  const [shortBreakMinutes, setShortBreakMinutes] = useState(String(profile?.preferences.shortBreakMinutes ?? 15));
  const [startHour, setStartHour] = useState(String(profile?.preferences.startHour ?? 7));
  const [endHour, setEndHour] = useState(String(profile?.preferences.endHour ?? 22));
  const [sleepStartHour, setSleepStartHour] = useState(String(profile?.preferences.sleepStartHour ?? 23));
  const [sleepEndHour, setSleepEndHour] = useState(String(profile?.preferences.sleepEndHour ?? 7));
  const [maxSessionsPerDay, setMaxSessionsPerDay] = useState(String(profile?.preferences.maxSessionsPerDay ?? 4));
  const [avoidBackToBackHard, setAvoidBackToBackHard] = useState(
    profile?.preferences.avoidBackToBackHard ?? true
  );

  const [pickedEafName, setPickedEafName] = useState<string | null>(null);

  const [classSubject, setClassSubject] = useState('');
  const [classWeekdays, setClassWeekdays] = useState<Weekday[]>(['MON']);
  const [classStart, setClassStart] = useState('08:00');
  const [classEnd, setClassEnd] = useState('09:00');
  const [classLocation, setClassLocation] = useState('');
  const [pendingClasses, setPendingClasses] = useState<ExtractedClass[]>([]);

  const pageWidth = width - 32;
  const cardWidth = Math.min(pageWidth - 8, 500);
  const cardHeight = Math.max(560, height - 210);
    const stepAnim = useRef(new Animated.Value(1)).current;
  const pageAnim = useRef(new Animated.Value(1)).current;

  const derivedSubjects = useMemo(() => {
    const pending = uniqueSubjectsFromClasses(pendingClasses);
    const existing = Array.from(
      new Set(existingClasses.map((item) => item.subject?.trim()).filter(Boolean) as string[])
    );
    return pending.length > 0 ? pending : existing;
  }, [pendingClasses, existingClasses]);

  const currentStep = QUIZ_STEPS[quizIndex];
  const quizMeta = getQuizMeta(currentStep);

  useEffect(() => {
    stepAnim.setValue(0.9);
    Animated.parallel([
      Animated.timing(stepAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [quizIndex, stepAnim]);

  useEffect(() => {
    pageAnim.setValue(0.96);
    Animated.timing(pageAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [pageIndex, pageAnim]);

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

  const goToPage = (index: number) => {
    setPageIndex(index);
    pagerRef.current?.scrollTo({ x: index * pageWidth, animated: true });
  };

  const animateQuizForward = (nextIndex: number) => {
    Animated.timing(stepAnim, {
      toValue: 0.92,
      duration: 120,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setQuizIndex(nextIndex);
    });
  };

  const toggleWeekday = (day: Weekday) => {
    setClassWeekdays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day]
    );
  };

  const handlePickEaf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets.length) return;

      const asset = result.assets[0];
      setPickedEafName(asset.name);
    } catch (error) {
      Alert.alert('Upload', error instanceof Error ? error.message : 'Unable to pick file.');
    }
  };

  const handleAddClass = () => {
    try {
      if (!classSubject.trim()) {
        throw new Error('Add a subject first.');
      }

      if (classWeekdays.length === 0) {
        throw new Error('Pick at least one day.');
      }

      const start = timeParts(classStart);
      const end = timeParts(classEnd);

      if (end.hour < start.hour || (end.hour === start.hour && end.minute <= start.minute)) {
        throw new Error('End time must be later than start time.');
      }

      const blocks: ExtractedClass[] = classWeekdays.map((weekday) => ({
        title: classSubject.trim(),
        subject: classSubject.trim(),
        weekday,
        startHour: start.hour,
        startMinute: start.minute,
        endHour: end.hour,
        endMinute: end.minute,
        location: classLocation.trim() || undefined,
      }));

      setPendingClasses((current) => [...current, ...blocks]);
      setClassSubject('');
      setClassLocation('');
      setClassStart('08:00');
      setClassEnd('09:00');
      setClassWeekdays(['MON']);
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
      setPageIndex(0);
      pagerRef.current?.scrollTo({ x: 0, animated: false });
      Alert.alert('Reset', 'Workspace cleared.');
    } catch (error) {
      Alert.alert('Reset', error instanceof Error ? error.message : 'Unable to reset workspace.');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace('/');
    } catch (error) {
      Alert.alert('Profile', error instanceof Error ? error.message : 'Unable to sign out.');
    }
  };

  const handleSaveOnboarding = async () => {
    if (!user) {
      Alert.alert('Profile', 'Sign in first to continue.');
      return;
    }

    if (!displayName.trim()) {
      Alert.alert('Profile', 'Enter your name.');
      return;
    }

    if (pendingClasses.length === 0 && existingClassCount === 0) {
      Alert.alert('Schedule', 'Add at least one class block first.');
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

      router.replace(HOME_ROUTE as never);
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
          <View style={styles.quizBody}>
            <ThemedText style={styles.bigEmoji}>{quizMeta.emoji}</ThemedText>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              placeholderTextColor="#A899C8"
              style={styles.bigInput}
            />
          </View>
        );

      case 'yearLevel':
        return (
          <View style={styles.quizBody}>
            <ThemedText style={styles.bigEmoji}>{quizMeta.emoji}</ThemedText>
            <View style={styles.choiceGrid}>
              {YEAR_LEVELS.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setYearLevel(option)}
                  style={[styles.largeChoiceChip, yearLevel === option ? styles.choiceChipActive : null]}>
                  <ThemedText
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={[styles.largeChoiceText, yearLevel === option ? styles.choiceTextActive : null]}>
                    {option}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
        );

      case 'studyGoalHours':
        return (
          <View style={styles.quizBody}>
            <ThemedText style={styles.bigEmoji}>{quizMeta.emoji}</ThemedText>
            <TextInput
              value={studyGoalHours}
              onChangeText={setStudyGoalHours}
              keyboardType="number-pad"
              placeholder="2"
              placeholderTextColor="#A899C8"
              style={styles.bigInput}
            />
          </View>
        );

      case 'preferredSessionMinutes':
        return (
          <View style={styles.quizBody}>
            <ThemedText style={styles.bigEmoji}>{quizMeta.emoji}</ThemedText>
            <TextInput
              value={preferredSessionMinutes}
              onChangeText={setPreferredSessionMinutes}
              keyboardType="number-pad"
              placeholder="45"
              placeholderTextColor="#A899C8"
              style={styles.bigInput}
            />
          </View>
        );

      case 'shortBreakMinutes':
        return (
          <View style={styles.quizBody}>
            <ThemedText style={styles.bigEmoji}>{quizMeta.emoji}</ThemedText>
            <TextInput
              value={shortBreakMinutes}
              onChangeText={setShortBreakMinutes}
              keyboardType="number-pad"
              placeholder="15"
              placeholderTextColor="#A899C8"
              style={styles.bigInput}
            />
          </View>
        );

      case 'sleepStartHour':
        return (
          <View style={styles.quizBody}>
            <ThemedText style={styles.bigEmoji}>{quizMeta.emoji}</ThemedText>
            <TextInput
              value={sleepStartHour}
              onChangeText={setSleepStartHour}
              keyboardType="number-pad"
              placeholder="23"
              placeholderTextColor="#A899C8"
              style={styles.bigInput}
            />
          </View>
        );

      case 'sleepEndHour':
        return (
          <View style={styles.quizBody}>
            <ThemedText style={styles.bigEmoji}>{quizMeta.emoji}</ThemedText>
            <TextInput
              value={sleepEndHour}
              onChangeText={setSleepEndHour}
              keyboardType="number-pad"
              placeholder="7"
              placeholderTextColor="#A899C8"
              style={styles.bigInput}
            />
          </View>
        );

      case 'startHour':
        return (
          <View style={styles.quizBody}>
            <ThemedText style={styles.bigEmoji}>{quizMeta.emoji}</ThemedText>
            <TextInput
              value={startHour}
              onChangeText={setStartHour}
              keyboardType="number-pad"
              placeholder="8"
              placeholderTextColor="#A899C8"
              style={styles.bigInput}
            />
          </View>
        );

      case 'endHour':
        return (
          <View style={styles.quizBody}>
            <ThemedText style={styles.bigEmoji}>{quizMeta.emoji}</ThemedText>
            <TextInput
              value={endHour}
              onChangeText={setEndHour}
              keyboardType="number-pad"
              placeholder="21"
              placeholderTextColor="#A899C8"
              style={styles.bigInput}
            />
          </View>
        );

      case 'maxSessionsPerDay':
        return (
          <View style={styles.quizBody}>
            <ThemedText style={styles.bigEmoji}>{quizMeta.emoji}</ThemedText>
            <TextInput
              value={maxSessionsPerDay}
              onChangeText={setMaxSessionsPerDay}
              keyboardType="number-pad"
              placeholder="4"
              placeholderTextColor="#A899C8"
              style={styles.bigInput}
            />
          </View>
        );

      case 'avoidBackToBackHard':
        return (
          <View style={styles.quizBody}>
            <ThemedText style={styles.bigEmoji}>{quizMeta.emoji}</ThemedText>
            <View style={styles.choiceGrid}>
              <Pressable
                onPress={() => setAvoidBackToBackHard(true)}
                style={[styles.largeChoiceChip, avoidBackToBackHard ? styles.choiceChipActive : null]}>
                <ThemedText style={[styles.largeChoiceText, avoidBackToBackHard ? styles.choiceTextActive : null]}>
                  Yes
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setAvoidBackToBackHard(false)}
                style={[styles.largeChoiceChip, !avoidBackToBackHard ? styles.choiceChipActive : null]}>
                <ThemedText style={[styles.largeChoiceText, !avoidBackToBackHard ? styles.choiceTextActive : null]}>
                  No
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
  subtitle=""
  avatarLabel={profile?.avatarInitials ?? 'SL'}
  onRefresh={async () => {
    if (user) {
      await refreshMockLmsFeed();
    }
  }}
>
{onboardingDone && (
  <View style={{ marginBottom: 10, alignItems: 'flex-start' }}>
    <Pressable onPress={() => navigation.goBack()} style={styles.secondaryButton}>
      <MaterialIcons name="arrow-back" size={18} color="#6B5B8A" />
      <ThemedText style={styles.secondaryButtonText}>Back</ThemedText>
    </Pressable>
  </View>
)}
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pagerContent}>
        <View style={[styles.page, { width: pageWidth }]}>
                    <Animated.View
            style={[
              styles.pageInner,
              {
                transform: [{ scale: pageAnim }],
                opacity: pageAnim,
              },
            ]}>
            <View style={[styles.stackedWrap, { width: cardWidth, minHeight: cardHeight }]}>
              <View style={styles.backCard}>
                <View style={styles.stackHeader}>
                  <ThemedText style={styles.stackEyebrow}>OPTIONAL</ThemedText>
                  <ThemedText numberOfLines={1} style={styles.stackTitleBack}>
                    Upload PDF
                  </ThemedText>
                </View>
              </View>

              <ClayCard style={[styles.mainCard, { width: cardWidth, minHeight: cardHeight }]}>
                <View style={styles.stackHeader}>
                  <ThemedText style={styles.stackEyebrow}>STEP 1</ThemedText>
                  <ThemedText style={styles.stackTitle}>Add your schedule</ThemedText>
                </View>

                <View style={styles.scheduleTopActions}>
                  <Pressable onPress={handlePickEaf} style={styles.secondaryButton}>
                    <MaterialIcons name="upload-file" size={18} color="#6B5B8A" />
                    <ThemedText numberOfLines={1} style={styles.secondaryButtonText}>
                      {pickedEafName ? 'PDF added' : 'Upload PDF'}
                    </ThemedText>
                  </Pressable>
                  {pickedEafName ? (
                    <ThemedText numberOfLines={1} style={styles.microText}>
                      {pickedEafName}
                    </ThemedText>
                  ) : null}
                </View>

                <View style={styles.formBlock}>
                  <TextInput
                    value={classSubject}
                    onChangeText={setClassSubject}
                    placeholder="Subject"
                    placeholderTextColor="#A899C8"
                    style={styles.input}
                  />

                  <View style={styles.daysWrap}>
                    {WEEKDAYS.map((day) => {
                      const active = classWeekdays.includes(day);
                      return (
                        <Pressable
                          key={day}
                          onPress={() => toggleWeekday(day)}
                          style={[styles.dayChip, active ? styles.choiceChipActive : null]}>
                          <ThemedText style={[styles.dayChipText, active ? styles.choiceTextActive : null]}>
                            {day}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View style={styles.row}>
                    <TextInput
                      value={classStart}
                      onChangeText={setClassStart}
                      placeholder="08:00"
                      placeholderTextColor="#A899C8"
                      style={[styles.input, styles.half]}
                    />
                    <TextInput
                      value={classEnd}
                      onChangeText={setClassEnd}
                      placeholder="09:00"
                      placeholderTextColor="#A899C8"
                      style={[styles.input, styles.half]}
                    />
                  </View>

                  <TextInput
                    value={classLocation}
                    onChangeText={setClassLocation}
                    placeholder="Location (optional)"
                    placeholderTextColor="#A899C8"
                    style={styles.input}
                  />

                  <Pressable onPress={handleAddClass} style={styles.actionButton}>
                    <ThemedText style={styles.actionButtonText}>Add class</ThemedText>
                  </Pressable>
                </View>

                <View style={styles.classList}>
                  {pendingClasses.length === 0 ? (
                    <View style={styles.emptyState}>
                      <MaterialIcons name="calendar-month" size={28} color="#A899C8" />
                      <ThemedText style={styles.emptyText}>No class blocks yet</ThemedText>
                    </View>
                  ) : (
                    pendingClasses.map((item, index) => (
                      <View key={`${item.subject}-${item.weekday}-${index}`} style={styles.pendingRow}>
                        <ClayPill style={styles.pendingPill}>
                          <ThemedText numberOfLines={1} style={styles.pillText}>
                            {`${item.weekday} • ${item.subject} • ${pad(item.startHour)}:${pad(
                              item.startMinute
                            )}-${pad(item.endHour)}:${pad(item.endMinute)}`}
                          </ThemedText>
                        </ClayPill>
                        <Pressable onPress={() => handleRemovePendingClass(index)} style={styles.removeButton}>
                          <MaterialIcons name="close" size={16} color="#7A55B0" />
                        </Pressable>
                      </View>
                    ))
                  )}
                </View>

                <View style={styles.bottomNav}>
                  <View />
                  <Pressable
                    onPress={() => {
                      if (pendingClasses.length === 0 && existingClassCount === 0) {
                        Alert.alert('Schedule', 'Add at least one class block first.');
                        return;
                      }
                      goToPage(1);
                    }}
                    style={styles.actionButton}>
                    <ThemedText style={styles.actionButtonText}>Next</ThemedText>
                  </Pressable>
                </View>
              </ClayCard>
            </View>
          </Animated.View>
        </View>

        <View style={[styles.page, { width: pageWidth }]}>
          <Animated.View
            style={[
              styles.pageInner,
              {
                transform: [{ scale: pageAnim }],
                opacity: pageAnim,
              },
            ]}>
            <ClayCard style={[styles.mainCard, { width: cardWidth, minHeight: cardHeight }]}>
              <View style={styles.quizHeader}>
                <ThemedText style={styles.stackEyebrow}>STEP 2</ThemedText>
                <ThemedText style={styles.stackTitle}>Study profile</ThemedText>

                <View style={styles.quizProgressTrack}>
                  <View
                    style={[
                      styles.quizProgressFill,
                      { width: `${((quizIndex + 1) / QUIZ_STEPS.length) * 100}%` },
                    ]}
                  />
                </View>
              </View>

              <Animated.View
                style={[
                  styles.quizMain,
                  {
                    opacity: stepAnim,
                    transform: [
                      {
                        translateY: stepAnim.interpolate({
                          inputRange: [0.9, 1],
                          outputRange: [8, 0],
                        }),
                      },
                    ],
                  },
                ]}>
                <View style={styles.quizTitleRow}>
                  <MaterialIcons name={quizMeta.icon as never} size={22} color="#7A55B0" />
                  <ThemedText style={styles.quizTitle}>{quizMeta.title}</ThemedText>
                </View>

                {renderQuizStep()}
              </Animated.View>

              <View style={styles.bottomNav}>
                {quizIndex === 0 ? (
                  <Pressable onPress={() => goToPage(0)} style={styles.secondaryButton}>
                    <ThemedText style={styles.secondaryButtonText}>Back</ThemedText>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => animateQuizForward(Math.max(0, quizIndex - 1))}
                    style={styles.secondaryButton}>
                    <ThemedText style={styles.secondaryButtonText}>Back</ThemedText>
                  </Pressable>
                )}

                {quizIndex < QUIZ_STEPS.length - 1 ? (
                  <Pressable
                    onPress={() => {
                      if (!canGoNext) {
                        Alert.alert('Study profile', 'Please answer this first.');
                        return;
                      }
                      animateQuizForward(Math.min(QUIZ_STEPS.length - 1, quizIndex + 1));
                    }}
                    style={styles.actionButton}>
                    <ThemedText style={styles.actionButtonText}>Next</ThemedText>
                  </Pressable>
                ) : (
                  <Pressable onPress={handleSaveOnboarding} disabled={saving} style={styles.actionButton}>
                    <ThemedText style={styles.actionButtonText}>
                      {saving ? 'Saving...' : onboardingDone ? 'Update' : 'Finish'}
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            </ClayCard>
          </Animated.View>
        </View>
      </ScrollView>

      <View style={styles.accountActions}>
        <Pressable onPress={() => router.push('/settings')}>
          <ClayCard style={[styles.smallActionCard, styles.purpleCard]}>
            <ThemedText style={styles.smallActionText}>Settings</ThemedText>
          </ClayCard>
        </Pressable>

        <Pressable onPress={handleResetWorkspace} disabled={saving}>
          <ClayCard style={[styles.smallActionCard, styles.redCard]}>
            <ThemedText style={styles.smallActionText}>Reset workspace</ThemedText>
          </ClayCard>
        </Pressable>

        <Pressable onPress={handleSignOut}>
          <ClayCard style={[styles.smallActionCard, styles.blueCard]}>
            <ThemedText style={styles.smallActionText}>Sign out</ThemedText>
          </ClayCard>
        </Pressable>
      </View>
    </ClayScreen>
  );
}

const styles = StyleSheet.create({
  pagerContent: {
    alignItems: 'center',
  },

  page: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 0,
  },
  pageInner: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackedWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  backCard: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    bottom: -8,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.38)',
    borderWidth: 1,
    borderColor: 'rgba(122,85,176,0.08)',
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  mainCard: {
    borderRadius: 26,
    padding: 18,
    justifyContent: 'space-between',
    gap: 14,
  },
  stackHeader: {
    gap: 4,
  },
  stackEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    color: '#8D7AB4',
    letterSpacing: 1,
  },
  stackTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#2D2250',
    lineHeight: 29,
  },
  stackTitleBack: {
    fontSize: 20,
    fontWeight: '900',
    color: '#6B5B8A',
  },
  scheduleTopActions: {
    gap: 8,
  },
  microText: {
    fontSize: 12,
    color: '#8D7AB4',
  },
  formBlock: {
    gap: 12,
  },
  input: {
    minHeight: 50,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(122,85,176,0.10)',
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#2D2250',
    fontWeight: '700',
  },
  bigInput: {
    minHeight: 58,
    width: '100%',
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(122,85,176,0.10)',
    paddingHorizontal: 16,
    fontSize: 18,
    color: '#2D2250',
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  half: {
    flex: 1,
  },
  daysWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayChip: {
    minWidth: 50,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.68)',
    borderWidth: 1,
    borderColor: 'rgba(122,85,176,0.10)',
    alignItems: 'center',
  },
  dayChipText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#6B5B8A',
  },
  choiceChipActive: {
    backgroundColor: '#DDD0FF',
    borderColor: 'rgba(122,85,176,0.24)',
  },
  choiceTextActive: {
    color: '#2D2250',
  },
  classList: {
    flex: 1,
    gap: 8,
    minHeight: 120,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pendingPill: {
    flex: 1,
    minWidth: 0,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6B5B8A',
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(122,85,176,0.12)',
  },
  emptyState: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 128,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8D7AB4',
  },
  quizHeader: {
    gap: 10,
  },
  quizMain: {
    flex: 1,
    justifyContent: 'center',
    gap: 18,
    overflow: 'visible',
  },
 quizTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'visible',
  },
  quizTitle: {
    flex: 1,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    color: '#2D2250',
  },
  quizBody: {
    alignItems: 'center',
    gap: 18,
    paddingTop: 6,
    overflow: 'visible',
  },
  bigEmoji: {
    fontSize: 48,
    textAlign: 'center',
    lineHeight: 56,
    includeFontPadding: true,
  },
  choiceGrid: {
    width: '100%',
    gap: 10,
  },
  largeChoiceChip: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.68)',
    borderWidth: 1,
    borderColor: 'rgba(122,85,176,0.10)',
    justifyContent: 'center',
  },
  largeChoiceText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#6B5B8A',
    textAlign: 'center',
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
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  actionButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#7A55B0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    minWidth: 112,
    flexDirection: 'row',
    gap: 6,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(122,85,176,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    minWidth: 112,
    flexDirection: 'row',
    gap: 6,
  },
  secondaryButtonText: {
    color: '#6B5B8A',
    fontSize: 14,
    fontWeight: '800',
  },
  accountActions: {
    marginTop: 18,
    gap: 10,
  },
  smallActionCard: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  smallActionText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#2D2250',
  },
  redCard: {
    backgroundColor: '#FFD7D7',
  },
  blueCard: {
    backgroundColor: '#CAE7FF',
  },
  purpleCard: {
    backgroundColor: '#DDD0FF',
  },
});
