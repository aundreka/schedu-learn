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

  const SCREEN_PADDING_HORIZONTAL = 20;
  const availableWidth = Math.max(width - SCREEN_PADDING_HORIZONTAL * 2, 0);
  const isCompact = width <= 420;
  const horizontalMargin = isCompact ? 12 : 18;
  const pageWidth = availableWidth;
  const availableCardWidth = pageWidth - horizontalMargin * 2 - (isCompact ? 0 : 12);
  const cardWidth = Math.min(Math.max(availableCardWidth, 280), 360);
  const cardHeight = Math.max(isCompact ? 420 : 520, height - (isCompact ? 200 : 240));
  const cardPadding = isCompact ? 12 : 16;
  const cardGap = isCompact ? 10 : 12;
  const navButtonMinWidth = isCompact ? 96 : 112;
  const navButtonPadding = isCompact ? 12 : 16;
  const actionGap = isCompact ? 4 : 6;
  const bigInputMinHeight = isCompact ? 50 : 58;
  const inputMinHeight = isCompact ? 44 : 50;
  const dayChipPadding = isCompact ? 8 : 10;
  const emojiSize = isCompact ? 42 : 48;
  const emojiLineHeight = isCompact ? 48 : 56;
  const accountGap = isCompact ? 8 : 10;
  const accountTopMargin = isCompact ? 12 : 18;

  const inputStyle = { minHeight: inputMinHeight };
  const bigInputStyle = { minHeight: bigInputMinHeight };
  const emojiStyle = { fontSize: emojiSize, lineHeight: emojiLineHeight };
  const primaryButtonStyle = {
    minWidth: navButtonMinWidth,
    paddingHorizontal: navButtonPadding,
    gap: actionGap,
  };
  const secondaryButtonStyle = {
    minWidth: navButtonMinWidth,
    paddingHorizontal: navButtonPadding,
    gap: actionGap,
  };
  const accountActionsStyle = {
    marginTop: accountTopMargin,
    gap: accountGap,
  };
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
            <ThemedText style={[styles.bigEmoji, emojiStyle]}>{quizMeta.emoji}</ThemedText>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              placeholderTextColor="#A899C8"
              style={[styles.bigInput, bigInputStyle]}
            />
          </View>
        );

      case 'yearLevel':
        return (
          <View style={styles.quizBody}>
            <ThemedText style={[styles.bigEmoji, emojiStyle]}>{quizMeta.emoji}</ThemedText>
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
            <ThemedText style={[styles.bigEmoji, emojiStyle]}>{quizMeta.emoji}</ThemedText>
            <TextInput
              value={studyGoalHours}
              onChangeText={setStudyGoalHours}
              keyboardType="number-pad"
              placeholder="2"
              placeholderTextColor="#A899C8"
              style={[styles.bigInput, bigInputStyle]}
            />
          </View>
        );

      case 'preferredSessionMinutes':
        return (
          <View style={styles.quizBody}>
            <ThemedText style={[styles.bigEmoji, emojiStyle]}>{quizMeta.emoji}</ThemedText>
            <TextInput
              value={preferredSessionMinutes}
              onChangeText={setPreferredSessionMinutes}
              keyboardType="number-pad"
              placeholder="45"
              placeholderTextColor="#A899C8"
              style={[styles.bigInput, bigInputStyle]}
            />
          </View>
        );

      case 'shortBreakMinutes':
        return (
          <View style={styles.quizBody}>
            <ThemedText style={[styles.bigEmoji, emojiStyle]}>{quizMeta.emoji}</ThemedText>
            <TextInput
              value={shortBreakMinutes}
              onChangeText={setShortBreakMinutes}
              keyboardType="number-pad"
              placeholder="15"
              placeholderTextColor="#A899C8"
              style={[styles.bigInput, bigInputStyle]}
            />
          </View>
        );

      case 'sleepStartHour':
        return (
          <View style={styles.quizBody}>
            <ThemedText style={[styles.bigEmoji, emojiStyle]}>{quizMeta.emoji}</ThemedText>
            <TextInput
              value={sleepStartHour}
              onChangeText={setSleepStartHour}
              keyboardType="number-pad"
              placeholder="23"
              placeholderTextColor="#A899C8"
              style={[styles.bigInput, bigInputStyle]}
            />
          </View>
        );

      case 'sleepEndHour':
        return (
          <View style={styles.quizBody}>
            <ThemedText style={[styles.bigEmoji, emojiStyle]}>{quizMeta.emoji}</ThemedText>
            <TextInput
              value={sleepEndHour}
              onChangeText={setSleepEndHour}
              keyboardType="number-pad"
              placeholder="7"
              placeholderTextColor="#A899C8"
              style={[styles.bigInput, bigInputStyle]}
            />
          </View>
        );

      case 'startHour':
        return (
          <View style={styles.quizBody}>
            <ThemedText style={[styles.bigEmoji, emojiStyle]}>{quizMeta.emoji}</ThemedText>
            <TextInput
              value={startHour}
              onChangeText={setStartHour}
              keyboardType="number-pad"
              placeholder="8"
              placeholderTextColor="#A899C8"
              style={[styles.bigInput, bigInputStyle]}
            />
          </View>
        );

      case 'endHour':
        return (
          <View style={styles.quizBody}>
            <ThemedText style={[styles.bigEmoji, emojiStyle]}>{quizMeta.emoji}</ThemedText>
            <TextInput
              value={endHour}
              onChangeText={setEndHour}
              keyboardType="number-pad"
              placeholder="21"
              placeholderTextColor="#A899C8"
              style={[styles.bigInput, bigInputStyle]}
            />
          </View>
        );

      case 'maxSessionsPerDay':
        return (
          <View style={styles.quizBody}>
            <ThemedText style={[styles.bigEmoji, emojiStyle]}>{quizMeta.emoji}</ThemedText>
            <TextInput
              value={maxSessionsPerDay}
              onChangeText={setMaxSessionsPerDay}
              keyboardType="number-pad"
              placeholder="4"
              placeholderTextColor="#A899C8"
              style={[styles.bigInput, bigInputStyle]}
            />
          </View>
        );

      case 'avoidBackToBackHard':
        return (
          <View style={styles.quizBody}>
            <ThemedText style={[styles.bigEmoji, emojiStyle]}>{quizMeta.emoji}</ThemedText>
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
        }}>
      {onboardingDone && (
        <View style={styles.backButtonWrapper}>
          <Pressable onPress={() => navigation.goBack()} style={styles.minimalBackButton}>
            <MaterialIcons name="arrow-back-ios" size={20} color="#6B5B8A" />
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
                paddingHorizontal: horizontalMargin,
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

              <ClayCard
                style={[
                  styles.mainCard,
                  {
                    width: cardWidth,
                    minHeight: cardHeight,
                    padding: cardPadding,
                    gap: cardGap,
                  },
                ]}>
                <View style={styles.stackHeader}>
                  <ThemedText style={styles.stackEyebrow}>STEP 1</ThemedText>
                  <ThemedText style={styles.stackTitle}>Add your schedule</ThemedText>
                </View>

                <View style={styles.scheduleTopActions}>
                  <Pressable onPress={handlePickEaf} style={[styles.secondaryButton, secondaryButtonStyle]}>
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
                    style={[styles.input, inputStyle]}
                  />

                  <View style={styles.daysWrap}>
                    {WEEKDAYS.map((day) => {
                      const active = classWeekdays.includes(day);
                      return (
                        <Pressable
                          key={day}
                          onPress={() => toggleWeekday(day)}
                          style={[
                            styles.dayChip,
                            {
                              paddingHorizontal: dayChipPadding,
                              paddingVertical: dayChipPadding,
                            },
                            active ? styles.choiceChipActive : null,
                          ]}>
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
                      style={[styles.input, styles.half, inputStyle]}
                    />
                    <TextInput
                      value={classEnd}
                      onChangeText={setClassEnd}
                      placeholder="09:00"
                      placeholderTextColor="#A899C8"
                      style={[styles.input, styles.half, inputStyle]}
                    />
                  </View>

                  <TextInput
                    value={classLocation}
                    onChangeText={setClassLocation}
                    placeholder="Location (optional)"
                    placeholderTextColor="#A899C8"
                    style={[styles.input, inputStyle]}
                  />

                  <Pressable onPress={handleAddClass} style={[styles.actionButton, primaryButtonStyle]}>
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
                    style={[styles.actionButton, primaryButtonStyle]}>
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
                paddingHorizontal: horizontalMargin,
                transform: [{ scale: pageAnim }],
                opacity: pageAnim,
              },
            ]}>
            <ClayCard
              style={[
                styles.mainCard,
                {
                  width: cardWidth,
                  minHeight: cardHeight,
                  padding: cardPadding,
                  gap: cardGap,
                },
              ]}>
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
                  <Pressable onPress={() => goToPage(0)} style={[styles.secondaryButton, secondaryButtonStyle]}>
                    <ThemedText style={styles.secondaryButtonText}>Back</ThemedText>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => animateQuizForward(Math.max(0, quizIndex - 1))}
                    style={[styles.secondaryButton, secondaryButtonStyle]}>
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
                    style={[styles.actionButton, primaryButtonStyle]}>
                    <ThemedText style={styles.actionButtonText}>Next</ThemedText>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={handleSaveOnboarding}
                    disabled={saving}
                    style={[styles.actionButton, primaryButtonStyle]}>
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

      <View style={[styles.accountActions, accountActionsStyle]}>
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

        <Pressable onPress={() => router.push('/lms-sync')}>
          <ClayCard style={[styles.smallActionCard, styles.greenCard]}>
            <ThemedText style={styles.smallActionText}>Open LMS sync</ThemedText>
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
    padding: 16,
    justifyContent: 'space-between',
    gap: 12,
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
    gap: 6,
  },
  microText: {
    fontSize: 12,
    color: '#8D7AB4',
  },
  formBlock: {
    gap: 10,
  },
  input: {
    minHeight: 44,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(122,85,176,0.10)',
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#2D2250',
    fontWeight: '700',
  },
  bigInput: {
    minHeight: 54,
    width: '100%',
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(122,85,176,0.10)',
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#2D2250',
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  half: {
    flex: 1,
  },
  daysWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dayChip: {
    minWidth: 46,
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
    gap: 6,
    minHeight: 100,
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
    gap: 6,
    minHeight: 100,
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
    justifyContent: 'flex-start',
    gap: 16,
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
    gap: 14,
    paddingTop: 4,
    overflow: 'visible',
  },
  bigEmoji: {
    fontSize: 44,
    textAlign: 'center',
    lineHeight: 52,
    includeFontPadding: true,
  },
  choiceGrid: {
    width: '100%',
    gap: 8,
  },
  largeChoiceChip: {
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    gap: 8,
  },
  actionButton: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#7A55B0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    minWidth: 96,
    flexDirection: 'row',
    gap: 4,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(122,85,176,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    minWidth: 96,
    flexDirection: 'row',
    gap: 4,
  },
  backButtonWrapper: {
    marginBottom: 6,
    alignItems: 'flex-start',
  },
  minimalBackButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(122,85,176,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
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
    paddingVertical: 12,
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
  greenCard: {
    backgroundColor: '#D7F5DF',
  },
});
