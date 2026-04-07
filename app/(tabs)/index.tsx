import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, LinearGradient, Path, Stop } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ScheduleItem, TaskItem } from '@/lib/firebase/types';
import {
  planAutoSchedule,
  planPanicMode,
  planRescheduleMissedBlock,
} from '@/lib/scheduler/algorithm';
import { assessTaskUrgency, formatUrgencyLabel } from '@/lib/urgency';
import { useFirebaseBackend } from '@/providers/firebase-provider';

// ─── Helpers ─────────────────────────────────────────────────

function getUrgencyPalette(urgency?: string) {
  switch (urgency?.toLowerCase()) {
    case 'urgent':
    case 'high':
      return { bg: '#FFE4E4', text: '#D32F2F', border: '#FFCDCD' };
    case 'medium':
      return { bg: '#FFE4B0', text: '#B27B00', border: '#FFD685' };
    case 'low':
    case 'planned':
    default:
      return { bg: '#CAE7FF', text: '#005B9F', border: '#A6D7FF' };
  }
}

function formatEventTimeRange(startIso?: string, endIso?: string) {
  if (!startIso || !endIso) return 'Time TBD';
  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString([], { 
      hour: 'numeric', 
      minute: '2-digit' 
    });
  };
  return `${formatTime(startIso)} - ${formatTime(endIso)}`;
}

type AlertTone = 'orange' | 'red' | 'blue';

type DashboardAlert = {
  id: string;
  tone: AlertTone;
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle: string;
  actionLabel: string;
  onPress: () => Promise<void>;
};

type GapWindow = {
  startsAt: Date;
  endsAt: Date;
  minutes: number;
};

type StreakTone = 'idle' | 'small' | 'hot' | 'broken';

type StreakState = {
  count: number;
  tone: StreakTone;
  isBroken: boolean;
  hasAnyHistory: boolean;
};

const clay = {
  background: '#F4EEFF',
  purple: '#D3C0FF',
  purpleDeep: '#7A55B0',
  pink: '#FFC1DF',
  orange: '#FFD697',
  yellow: '#FFF0A8',
  blue: '#CAE7FF',
  green: '#C8F3D7',
  red: '#FFD1D1',
  ink: '#2D2250',
  textMid: '#6B5B8A',
  textLight: '#A899C8',
  white: '#FFFFFF',
  gray: '#D4D1DD',
  grayDeep: '#8D879E',
};

const hourRows = Array.from({ length: 13 }, (_, index) => 7 + index);

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRange(startsAt: string, endsAt: string) {
  return `${formatTime(startsAt)} - ${formatTime(endsAt)}`;
}

function formatHourLabel(hour: number) {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const normalized = hour % 12 === 0 ? 12 : hour % 12;
  return `${normalized} ${suffix}`;
}

function greetingForHour(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function eventColor(item: ScheduleItem, taskMap: Map<string, TaskItem>) {
  if (item.taskId) {
    const linkedTask = taskMap.get(item.taskId);
    const color = linkedTask ? assessTaskUrgency(linkedTask).color : item.urgency;
    if (color === 'red') return styles.eventRed;
    if (color === 'yellow') return styles.eventYellow;
    return styles.eventGreen;
  }
  if (item.urgency === 'red') return styles.eventRed;
  if (item.urgency === 'yellow') return styles.eventYellow;
  if (item.type === 'class') return styles.eventBlue;
  return styles.eventGreen;
}

function eventIcon(type: ScheduleItem['type']) {
  if (type === 'class') return 'school';
  if (type === 'study') return 'menu-book';
  return 'event-note';
}

function taskPriorityLabel(task: TaskItem) {
  return formatUrgencyLabel(assessTaskUrgency(task).level);
}

function urgencyWeight(task: TaskItem) {
  const urgency = assessTaskUrgency(task);
  if (urgency.level === 'high') return 3;
  if (urgency.level === 'medium') return 2;
  return 1;
}

function formatMinutesLabel(minutes: number) {
  if (minutes >= 60 && minutes % 60 === 0) {
    return `${minutes / 60} hour${minutes === 60 ? '' : 's'}`;
  }
  if (minutes > 60) {
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return `${hours}h ${rem}m`;
  }
  return `${minutes} min`;
}

function getTaskSubject(task: TaskItem) {
  return task.subject || 'General';
}

function buildTaskMap(tasks: TaskItem[]) {
  return new Map(tasks.map((task) => [task.id, task]));
}

function findConflict(items: ScheduleItem[]) {
  const sorted = [...items].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    if (new Date(current.endsAt).getTime() > new Date(next.startsAt).getTime()) {
      return { current, next };
    }
  }
  return null;
}

function findNextGap(items: ScheduleItem[], now: Date): GapWindow | null {
  const dayEnd = new Date(now);
  dayEnd.setHours(22, 0, 0, 0);
  const sorted = [...items]
    .filter((item) => new Date(item.endsAt).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  let cursor = new Date(now);
  for (const item of sorted) {
    const start = new Date(item.startsAt);
    const end = new Date(item.endsAt);
    if (start.getTime() > cursor.getTime()) {
      const gapMinutes = Math.floor((start.getTime() - cursor.getTime()) / 60000);
      if (gapMinutes >= 30) {
        return {
          startsAt: new Date(cursor),
          endsAt: new Date(start),
          minutes: gapMinutes,
        };
      }
    }
    if (end.getTime() > cursor.getTime()) {
      cursor = end;
    }
  }
  const finalGap = Math.floor((dayEnd.getTime() - cursor.getTime()) / 60000);
  if (finalGap >= 30) {
    return {
      startsAt: new Date(cursor),
      endsAt: dayEnd,
      minutes: finalGap,
    };
  }
  return null;
}

function findLargestGap(items: ScheduleItem[], today: Date): GapWindow | null {
  const dayStart = new Date(today);
  dayStart.setHours(7, 0, 0, 0);
  const dayEnd = new Date(today);
  dayEnd.setHours(22, 0, 0, 0);
  if (!items.length) {
    const fullGap = Math.floor((dayEnd.getTime() - dayStart.getTime()) / 60000);
    return {
      startsAt: dayStart,
      endsAt: dayEnd,
      minutes: fullGap,
    };
  }
  let best: GapWindow | null = null;
  let cursor = dayStart;
  for (const item of items) {
    const start = new Date(item.startsAt);
    const gapMinutes = Math.floor((start.getTime() - cursor.getTime()) / 60000);
    if (gapMinutes >= 45 && (!best || gapMinutes > best.minutes)) {
      best = {
        startsAt: new Date(cursor),
        endsAt: new Date(start),
        minutes: gapMinutes,
      };
    }
    const itemEnd = new Date(item.endsAt);
    if (itemEnd > cursor) {
      cursor = itemEnd;
    }
  }
  const finalGap = Math.floor((dayEnd.getTime() - cursor.getTime()) / 60000);
  if (finalGap >= 45 && (!best || finalGap > best.minutes)) {
    best = {
      startsAt: new Date(cursor),
      endsAt: dayEnd,
      minutes: finalGap,
    };
  }
  return best;
}

function buildStreakState(tasks: TaskItem[], now: Date): StreakState {
  const completedDays = new Set(
    tasks
      .filter((task) => task.status === 'done' && task.completedAt)
      .map((task) => startOfDay(new Date(task.completedAt as string)).toDateString())
  );
  const hasAnyHistory = completedDays.size > 0;
  let count = 0;
  for (let offset = 0; offset < 365; offset += 1) {
    const day = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset));
    if (!completedDays.has(day.toDateString())) {
      break;
    }
    count += 1;
  }
  const yesterday = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)).toDateString();
  const today = startOfDay(now).toDateString();
  const hasYesterday = completedDays.has(yesterday);
  const hasToday = completedDays.has(today);
  const isBroken = count === 0 && hasAnyHistory && hasYesterday === false && hasToday === false;

  if (isBroken) return { count, tone: 'broken', isBroken: true, hasAnyHistory };
  if (count >= 4) return { count, tone: 'hot', isBroken: false, hasAnyHistory };
  if (count >= 1) return { count, tone: 'small', isBroken: false, hasAnyHistory };
  return { count, tone: 'idle', isBroken: false, hasAnyHistory };
}

function streakBadgeLabel(state: StreakState) {
  if (state.tone === 'hot') return 'On fire';
  if (state.tone === 'small') return 'Momentum live';
  if (state.tone === 'broken') return 'Streak broken';
  return 'Start today';
}

function streakSubtitle(state: StreakState) {
  if (state.tone === 'hot') return 'You have been consistent for several days.';
  if (state.tone === 'small') return 'Nice start. Keep the chain alive.';
  if (state.tone === 'broken') return 'Pick up one completed task today to restart.';
  return 'Complete at least one task today to begin a streak.';
}

function streakShadowStyle(tone: StreakTone) {
  if (tone === 'hot') {
    return {
      shadowColor: '#FF6A3D', shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.45, shadowRadius: 16, elevation: 14,
    } as const;
  }
  if (tone === 'small') {
    return {
      shadowColor: '#FFAA47', shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.2, shadowRadius: 8, elevation: 8,
    } as const;
  }
  return {
    shadowColor: 'transparent', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0, shadowRadius: 0, elevation: 0,
  } as const;
}

function taskRiskScore(task: TaskItem, now: Date) {
  const urgency = assessTaskUrgency(task);
  const hoursLeft = (new Date(task.dueAt).getTime() - now.getTime()) / 3_600_000;
  const remainingRatio = task.estimatedMinutes > 0 ? task.remainingMinutes / task.estimatedMinutes : 0;
  const scheduleCoverage = task.estimatedMinutes > 0 ? task.scheduledMinutes / task.estimatedMinutes : 0;
  let score = urgency.score * 2 + urgencyWeight(task) * 40;
  if (hoursLeft <= 12) score += 160;
  else if (hoursLeft <= 24) score += 120;
  else if (hoursLeft <= 48) score += 80;
  else if (hoursLeft <= 72) score += 40;
  score += remainingRatio * 100;
  score += Math.max(0, 1 - scheduleCoverage) * 60;
  if (task.difficulty === 'hard') score += 20;
  if (task.status === 'in_progress') score += 10;
  return score;
}

function pickFocusTask(tasks: TaskItem[], now: Date) {
  return [...tasks].sort((a, b) => taskRiskScore(b, now) - taskRiskScore(a, now))[0] ?? null;
}

function findFallingBehindTask(tasks: TaskItem[], now: Date) {
  return (
    [...tasks]
      .filter((task) => {
        const hoursLeft = (new Date(task.dueAt).getTime() - now.getTime()) / 3_600_000;
        const remainingRatio = task.estimatedMinutes > 0 ? task.remainingMinutes / task.estimatedMinutes : 0;
        const scheduleCoverage = task.estimatedMinutes > 0 ? task.scheduledMinutes / task.estimatedMinutes : 0;
        return hoursLeft <= 72 && (remainingRatio >= 0.5 || scheduleCoverage < 0.5);
      })
      .sort((a, b) => taskRiskScore(b, now) - taskRiskScore(a, now))[0] ?? null
  );
}

function FlameIcon({ tone, animatedStyle }: { tone: StreakTone; animatedStyle?: object; }) {
  const isBroken = tone === 'broken';
  const isHot = tone === 'hot';
  const isSmall = tone === 'small';
  const outerTop = isBroken ? '#ECEAF1' : isHot ? '#FFD06C' : '#FFD978';
  const outerMid = isBroken ? '#C7C2D3' : isHot ? '#FF7A54' : '#FFA64D';
  const outerBottom = isBroken ? '#9A94AA' : isHot ? '#FF4343' : '#FF7A3C';
  const innerTop = isBroken ? '#F8F7FB' : isHot ? '#FFF0AA' : '#FFF2B8';
  const innerBottom = isBroken ? '#D8D3E2' : isHot ? '#FF9D5C' : '#FFC65A';
  const shellFill = isBroken ? '#E5E0F0' : isHot ? '#FFE7E1' : '#FFF0E5';
  const shellShadow = isBroken ? '#BBB4CB' : isHot ? '#FF8D73' : '#F8C29A';
  const size = isSmall ? 48 : 58;

  return (
    <Animated.View style={[styles.streakFlameWrap, streakShadowStyle(tone), animatedStyle]}>
      <Svg width={size} height={size + 6} viewBox="0 0 64 70">
        <Defs>
          <LinearGradient id="shell" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={shellFill} />
            <Stop offset="100%" stopColor={shellShadow} />
          </LinearGradient>
          <LinearGradient id="outerFlame" x1="0.5" y1="0" x2="0.5" y2="1">
            <Stop offset="0%" stopColor={outerTop} />
            <Stop offset="55%" stopColor={outerMid} />
            <Stop offset="100%" stopColor={outerBottom} />
          </LinearGradient>
          <LinearGradient id="innerFlame" x1="0.5" y1="0" x2="0.5" y2="1">
            <Stop offset="0%" stopColor={innerTop} />
            <Stop offset="100%" stopColor={innerBottom} />
          </LinearGradient>
        </Defs>
        {isHot ? <Ellipse cx="32" cy="56" rx="18" ry="8" fill="rgba(255,104,67,0.18)" /> : null}
        <Path d="M11 57c0-7 4-13 11-15 2-8 7-13 10-16 3 3 8 8 10 16 7 2 11 8 11 15 0 6-4 10-10 10H21c-6 0-10-4-10-10Z" fill="url(#shell)" />
        <Path d="M32 7c3 9-1 14 5 21 5 5 12 10 12 20 0 11-8 19-18 19S13 59 13 48c0-8 5-13 10-18 6-5 8-10 9-23Z" fill="url(#outerFlame)" />
        <Path d="M33 22c1 5-2 8 2 12 3 3 7 6 7 12 0 7-5 12-11 12s-11-5-11-12c0-5 3-8 6-11 4-3 6-6 7-13Z" fill="url(#innerFlame)" />
      </Svg>
    </Animated.View>
  );
}

// ─── Main Component ──────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const headerTopPadding = Math.max(insets.top + 12, 24);
  const flameAnimation = useRef(new Animated.Value(0)).current;
  const [refreshing, setRefreshing] = useState(false);

  // Invitation Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteInput, setInviteInput] = useState('');

  const backend = useFirebaseBackend() as ReturnType<typeof useFirebaseBackend> & {
    autoScheduleTask?: (taskId: string) => Promise<unknown>;
    preferences?: { studyGoalHours?: number; } | null;
  };

  const {
    createStudyBlock, loadingData,
    profile, preferences, refreshMockLmsFeed, rescheduleItem,
    schedules, setTaskStatus, tasks, user,
  } = backend;

  const now = useMemo(() => new Date(), []);
  const todaySchedules = useMemo(
    () => schedules
        .filter((item) => isSameDay(new Date(item.startsAt), now))
        .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime()),
    [now, schedules]
  );

  const openTasks = useMemo(() => tasks.filter((task) => task.status !== 'done'), [tasks]);
  const completedTasks = useMemo(() => tasks.filter((task) => task.status === 'done' && task.completedAt), [tasks]);
  const taskMap = useMemo(() => buildTaskMap(tasks), [tasks]);
  const nextSchedule = schedules.find((item) => new Date(item.endsAt).getTime() >= now.getTime()) ?? null;
  const conflict = findConflict(todaySchedules);
  const nextGap = findNextGap(todaySchedules, now);
  const freeWindow = findLargestGap(todaySchedules, now);
  const streakState = useMemo(() => buildStreakState(tasks, now), [tasks, now]);
  const focusTask = useMemo(() => pickFocusTask(openTasks, now), [openTasks, now]);
  const fallingBehindTask = useMemo(() => findFallingBehindTask(openTasks, now), [openTasks, now]);

  const autoSchedulePlan = useMemo(() => planAutoSchedule({ tasks: openTasks, schedules, preferences, now, }), [openTasks, schedules, preferences, now]);
  const reschedulePlan = useMemo(() => planRescheduleMissedBlock({ schedules, tasks: openTasks, preferences, now, }), [schedules, openTasks, preferences, now]);
  const panicPlan = useMemo(() => planPanicMode({ tasks: openTasks, schedules, preferences, now, }), [openTasks, schedules, preferences, now]);
  const completedDays = useMemo(
    () => new Set(completedTasks.map((task) => startOfDay(new Date(task.completedAt as string)).toDateString())),
    [completedTasks]
  );

  useEffect(() => {
    if (streakState.tone === 'idle' || streakState.tone === 'broken') {
      flameAnimation.setValue(0);
      return;
    }
    const durationScale = streakState.tone === 'hot' ? 0.75 : 1;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flameAnimation, { toValue: 0.25, duration: 400 * durationScale, useNativeDriver: true }),
        Animated.timing(flameAnimation, { toValue: 0.6, duration: 250 * durationScale, useNativeDriver: true }),
        Animated.timing(flameAnimation, { toValue: 1, duration: 550 * durationScale, useNativeDriver: true }),
        Animated.timing(flameAnimation, { toValue: 0, duration: 400 * durationScale, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [flameAnimation, streakState.tone]);

  const flameAnimatedStyle = {
    transform: [
      { scale: flameAnimation.interpolate({ inputRange: [0, 0.25, 0.6, 1], outputRange: streakState.tone === 'hot' ? [1, 1.1, 1.16, 1.02] : [1, 1.05, 1.08, 1] }) },
      { rotate: flameAnimation.interpolate({ inputRange: [0, 0.25, 0.6, 1], outputRange: ['-2deg', '2deg', '-2deg', '1deg'] }) },
      { translateY: flameAnimation.interpolate({ inputRange: [0, 0.25, 0.6, 1], outputRange: [0, 0, -3, 0] }) },
    ],
  };

  const weekStart = startOfDay(now);
  const dayOfWeek = (weekStart.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - dayOfWeek);
  const streakDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return {
      key: date.toISOString(),
      label: date.toLocaleDateString([], { weekday: 'narrow' }),
      isToday: isSameDay(date, now),
      isDone: completedDays.has(startOfDay(date).toDateString()),
    };
  });

  const suggestions: DashboardAlert[] = [];
  if (reschedulePlan) {
    const { missedBlock, suggestedStart, suggestedEnd, durationMinutes, bufferMinutes } = reschedulePlan;
    suggestions.push({
      id: `reschedule-${missedBlock.id}`, tone: 'orange', icon: 'schedule', title: `Reschedule ${missedBlock.title}`,
      subtitle: `${formatEventTimeRange(suggestedStart.toISOString(), suggestedEnd.toISOString())} • ${formatMinutesLabel(durationMinutes)} + ${bufferMinutes}m buffer`,
      actionLabel: 'Reschedule', onPress: async () => { await rescheduleItem(missedBlock.id, suggestedStart.toISOString(), suggestedEnd.toISOString()); },
    });
  }
  if (nextGap && focusTask) {
    const blockMinutes = Math.min(Math.max(30, Math.min(focusTask.remainingMinutes || 45, 60)), nextGap.minutes);
    suggestions.push({
      id: `gap-${focusTask.id}-${nextGap.startsAt.toISOString()}`, tone: focusTask.colorCode === 'red' ? 'red' : 'blue', icon: 'auto-awesome',
      title: `You have a ${formatMinutesLabel(nextGap.minutes)} gap at ${formatTime(nextGap.startsAt.toISOString())}`,
      subtitle: `Start ${focusTask.title} for ${getTaskSubject(focusTask)} now and protect ${blockMinutes} minutes before your next block.`,
      actionLabel: 'Start now',
      onPress: async () => {
        const blockEnd = new Date(nextGap.startsAt.getTime() + blockMinutes * 60000);
        await createStudyBlock({ title: focusTask.title, taskId: focusTask.id, subject: focusTask.subject, difficulty: focusTask.difficulty, location: getTaskSubject(focusTask), startsAt: nextGap.startsAt.toISOString(), endsAt: blockEnd.toISOString(), urgency: focusTask.colorCode });
      },
    });
  }
  if (fallingBehindTask) {
    const hoursLeft = Math.max(1, Math.floor((new Date(fallingBehindTask.dueAt).getTime() - now.getTime()) / 3_600_000));
    const remainingRatio = fallingBehindTask.estimatedMinutes > 0 ? Math.round((fallingBehindTask.remainingMinutes / fallingBehindTask.estimatedMinutes) * 100) : 0;
    suggestions.push({
      id: `behind-${fallingBehindTask.id}`, tone: fallingBehindTask.colorCode === 'red' ? 'red' : 'orange', icon: 'trending-up',
      title: `You’re falling behind on ${getTaskSubject(fallingBehindTask)}`,
      subtitle: `${fallingBehindTask.title} is due in about ${hoursLeft}h and ${remainingRatio}% of the work is still unfinished.`,
      actionLabel: 'Prioritize',
      onPress: async () => {
        if (nextGap) {
          const blockMinutes = Math.min(Math.max(30, Math.min(fallingBehindTask.remainingMinutes || 45, 60)), nextGap.minutes);
          const blockEnd = new Date(nextGap.startsAt.getTime() + blockMinutes * 60000);
          await createStudyBlock({ title: fallingBehindTask.title, taskId: fallingBehindTask.id, subject: fallingBehindTask.subject, difficulty: fallingBehindTask.difficulty, location: getTaskSubject(fallingBehindTask), startsAt: nextGap.startsAt.toISOString(), endsAt: blockEnd.toISOString(), urgency: fallingBehindTask.colorCode });
          return;
        }
        if (backend.autoScheduleTask) { await backend.autoScheduleTask(fallingBehindTask.id); return; }
        throw new Error('No gap found to prioritize this task yet.');
      },
    });
  }
  if (panicPlan) {
    suggestions.push({
      id: `panic-${panicPlan.task.id}`, tone: 'red', icon: 'whatshot', title: `Panic plan for ${panicPlan.task.title}`,
      subtitle: `${panicPlan.segments.length} slot${panicPlan.segments.length === 1 ? '' : 's'} covering ${formatMinutesLabel(panicPlan.totalMinutes)} within ${formatMinutesLabel(panicPlan.availableMinutes)} available minutes.`,
      actionLabel: 'Activate panic mode',
      onPress: async () => {
        for (const segment of panicPlan.segments) {
          await createStudyBlock({ title: panicPlan.task.title, taskId: panicPlan.task.id, subject: panicPlan.task.subject, difficulty: panicPlan.task.difficulty, location: 'Emergency focus', startsAt: segment.startsAt.toISOString(), endsAt: segment.endsAt.toISOString(), urgency: panicPlan.task.colorCode });
        }
      },
    });
  }
  if (conflict) {
    suggestions.push({
      id: `conflict-${conflict.next.id}`, tone: 'orange', icon: 'event-busy', title: `${conflict.next.title} overlaps`,
      subtitle: `${formatRange(conflict.current.startsAt, conflict.current.endsAt)} clashes with ${formatRange(conflict.next.startsAt, conflict.next.endsAt)}. Resolve it before the day stacks up further.`,
      actionLabel: 'Resolve',
      onPress: async () => {
        const currentEnd = new Date(conflict.current.endsAt);
        const nextStart = new Date(conflict.next.startsAt);
        const nextEnd = new Date(conflict.next.endsAt);
        const durationMs = nextEnd.getTime() - nextStart.getTime();
        const updatedStart = new Date(currentEnd.getTime() + 30 * 60000);
        const updatedEnd = new Date(updatedStart.getTime() + durationMs);
        await rescheduleItem(conflict.next.id, updatedStart.toISOString(), updatedEnd.toISOString());
      },
    });
  }

  const overdueTask = openTasks.find((task) => new Date(task.dueAt).getTime() < now.getTime());
  if (overdueTask) {
    suggestions.push({
      id: `overdue-${overdueTask.id}`, tone: 'red', icon: 'warning-amber', title: `${overdueTask.title} is overdue`,
      subtitle: `${getTaskSubject(overdueTask)} • Due ${formatTime(overdueTask.dueAt)}`,
      actionLabel: 'Mark done', onPress: async () => setTaskStatus(overdueTask.id, 'done'),
    });
  }

  const visibleSuggestions = suggestions.slice(0, 3);
  const handlePullRefresh = async () => { if (!user) return; try { setRefreshing(true); await refreshMockLmsFeed(); } finally { setRefreshing(false); } };
  const runAction = async (action: () => Promise<void>, successMessage: string) => {
    try { await action(); Alert.alert('SchedU Learn', successMessage); } 
    catch (error) { Alert.alert('SchedU Learn', error instanceof Error ? error.message : 'Action failed.'); }
  };

  const datePill = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const displayName = profile?.displayName?.trim() || user?.displayName?.trim() || user?.email?.split('@')[0] || 'Student';
  const avatarInitials = profile?.avatarInitials?.trim() || displayName.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'S';
  const studyGoalHours = preferences?.studyGoalHours;

  const nextActionText = focusTask
    ? nextGap
      ? `${focusTask.title} is the best next move. You have a ${formatMinutesLabel(nextGap.minutes)} opening at ${formatTime(nextGap.startsAt.toISOString())}, so the scheduler can slot ${getTaskSubject(focusTask)} there immediately.`
      : `${focusTask.title} is currently the riskiest task for ${getTaskSubject(focusTask)}. You should prioritize it next because it carries the highest urgency and unfinished workload.`
    : 'You do not have any open tasks right now. New tasks, LMS detections, and class-aware study blocks will surface here automatically.';

  return (
    <View style={styles.screen}>
      <View style={styles.blobOne} />
      <View style={styles.blobTwo} />
      <View style={styles.blobThree} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handlePullRefresh} tintColor={palette.tint} />
        }>
        <View style={[styles.topSection, { paddingTop: headerTopPadding }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <View style={styles.greetingRow}>
                <MaterialIcons name="wb-sunny" size={14} color={clay.textMid} />
                <ThemedText style={styles.greetingText}>{greetingForHour(now.getHours())}</ThemedText>
              </View>
              
              <TouchableOpacity 
                activeOpacity={0.7} 
                onPress={() => router.push('/lms-sync')}
                style={styles.headerLmsButton}
              >
                <ThemedText style={styles.lmsLabel}>LMS FEED</ThemedText>
                <ThemedText style={styles.lmsTitle}>Sync Progress</ThemedText>
              </TouchableOpacity>
            </View>

            <Pressable onPress={() => router.push('/profile')} style={styles.avatarButton}>
              <ThemedText style={styles.avatarText}>{avatarInitials}</ThemedText>
            </Pressable>
          </View>

          <View style={styles.streakCard}>
            <View style={styles.streakTopRow}>
              <View style={styles.streakLabelRow}>
                <MaterialIcons name="bolt" size={14} color={clay.purpleDeep} />
                <ThemedText style={styles.streakLabel}>Current Streak</ThemedText>
              </View>
              <View style={[styles.streakBadge, streakState.tone === 'hot' ? styles.streakBadgeHot : streakState.tone === 'broken' ? styles.streakBadgeBroken : null]}>
                <MaterialIcons name={streakState.tone === 'broken' ? 'history' : 'emoji-events'} size={12} color={streakState.tone === 'broken' ? clay.grayDeep : clay.purpleDeep} />
                <ThemedText style={[styles.streakBadgeText, streakState.tone === 'broken' ? styles.streakBadgeTextBroken : null]}>
                  {streakBadgeLabel(streakState)}
                </ThemedText>
              </View>
            </View>
            <View style={styles.streakMainRow}>
              <FlameIcon tone={streakState.tone} animatedStyle={flameAnimatedStyle} />
              <ThemedText style={styles.streakNumber}>{streakState.count}</ThemedText>
              <ThemedText style={styles.streakUnit}>days</ThemedText>
            </View>
            <ThemedText style={styles.streakSupportText}>{streakSubtitle(streakState)}</ThemedText>
            <View style={styles.streakDaysRow}>
              {streakDays.map((day) => (
                <View key={day.key} style={styles.streakDayItem}>
                  <View style={[styles.streakDayDot, day.isToday ? styles.streakTodayDot : null, day.isDone ? styles.streakDoneDot : styles.streakMissedDot]}>
                    <MaterialIcons name={day.isToday ? 'star' : day.isDone ? 'check' : 'panorama-fish-eye'} size={16} color={day.isToday || day.isDone ? clay.purpleDeep : 'rgba(122,85,176,0.35)'} />
                  </View>
                  <ThemedText style={[styles.streakDayLabel, day.isToday ? styles.streakTodayLabel : null]}>{day.label}</ThemedText>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <MaterialIcons name="psychology" size={14} color={clay.textMid} />
            <ThemedText style={styles.sectionTitle}>Smart suggestions</ThemedText>
          </View>
          {visibleSuggestions.length ? (
            visibleSuggestions.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => runAction(item.onPress, 'Action successful')}
                style={({ pressed }) => [styles.alertCard, item.tone === 'orange' ? styles.alertOrange : item.tone === 'red' ? styles.alertRed : styles.alertBlue, pressed ? styles.alertPressed : null]}>
                <View style={styles.alertIconWrap}>
                  <MaterialIcons name={item.icon} size={18} color={item.tone === 'red' ? '#A03030' : item.tone === 'orange' ? '#9A6010' : '#205090'} />
                </View>
                <View style={styles.alertCopy}>
                  <ThemedText style={styles.alertTitle}>{item.title}</ThemedText>
                  <ThemedText style={styles.alertSubtitle}>{item.subtitle}</ThemedText>
                </View>
                <View style={styles.alertActionPill}>
                  <ThemedText style={styles.alertActionText}>{item.actionLabel}</ThemedText>
                </View>
              </Pressable>
            ))
          ) : (
            <View style={styles.emptyAlertCard}>
              <MaterialIcons name="check-circle" size={20} color={clay.purpleDeep} />
              <ThemedText style={styles.emptyAlertTitle}>No urgent suggestions right now</ThemedText>
              <ThemedText style={styles.emptyAlertSubtitle}>Once deadline pressure is identified, it will suggest moves here.</ThemedText>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.calendarHeaderRow}>
            <View style={styles.sectionHeaderRow}><MaterialIcons name="calendar-month" size={16} color={clay.textMid} /><ThemedText style={styles.sectionTitle}>Today</ThemedText></View>
            <Pressable onPress={() => router.push('/(tabs)/calendar')} style={styles.datePill}><ThemedText style={styles.datePillText}>{datePill}</ThemedText></Pressable>
          </View>
          <View style={styles.calendarCard}>
            {todaySchedules.length ? (
              <View style={styles.timeGrid}>
                {hourRows.map((hour) => {
                  const events = todaySchedules.filter((item) => new Date(item.startsAt).getHours() === hour);
                  const showNowLine = now.getHours() === hour;
                  return (
                    <View key={hour}>
                      <View style={styles.timeRow}>
                        <ThemedText style={styles.timeLabel}>{formatHourLabel(hour)}</ThemedText>
                        <View style={styles.timeSlot}>
                          {events.map((item) => (
                            <Pressable key={item.id} onPress={() => Alert.alert(item.title, `${formatRange(item.startsAt, item.endsAt)}\n${item.location}`)} style={({ pressed }) => [styles.eventBlock, eventColor(item, taskMap), pressed ? styles.eventPressed : null]}>
                              <View style={styles.eventNameRow}><MaterialIcons name={eventIcon(item.type)} size={14} color={clay.ink} /><ThemedText style={styles.eventName}>{item.title}</ThemedText></View>
                              <ThemedText style={styles.eventTime}>{formatRange(item.startsAt, item.endsAt)}</ThemedText>
                              <ThemedText style={styles.eventTag}>{item.location}</ThemedText>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                      {showNowLine && (
                        <View style={styles.nowLine}>
                          <View style={styles.nowDot} /><View style={styles.nowBar} />
                          <View style={styles.nowBadge}><ThemedText style={styles.nowBadgeText}>Now • {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</ThemedText></View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <MaterialIcons name="event-available" size={24} color={clay.purpleDeep} />
                <ThemedText style={styles.emptyTitle}>No events scheduled</ThemedText>
              </View>
            )}
          </View>
        </View>

        <View style={styles.summaryRow}>
          <Pressable onPress={() => router.push('/(tabs)/create')} style={styles.summaryCard}><ThemedText style={styles.summaryLabel}>Open tasks</ThemedText><ThemedText style={styles.summaryValue}>{openTasks.length}</ThemedText></Pressable>
          <Pressable onPress={() => router.push('/(tabs)/calendar')} style={styles.summaryCard}><ThemedText style={styles.summaryLabel}>Next block</ThemedText><ThemedText style={styles.summaryValueSmall}>{nextSchedule?.title ?? 'Nothing scheduled'}</ThemedText></Pressable>
        </View>

        <View style={styles.summaryRow}>
          {/* Lighter, single summary card layout after removing LMS */}
          <Pressable onPress={() => router.push('/settings')} style={[styles.summaryCard, { flex: 1 }]}><ThemedText style={styles.summaryLabel}>Study goal</ThemedText><ThemedText style={styles.summaryValue}>{typeof studyGoalHours === 'number' ? `${studyGoalHours}h` : 'Not set'}</ThemedText></Pressable>
        </View>

        <View style={styles.focusCard}>
          <View style={styles.focusHeaderRow}>
            <ThemedText style={styles.focusTitle}>Next best move</ThemedText>
            {nextGap && <View style={styles.focusBadge}><ThemedText style={styles.focusBadgeText}>{formatMinutesLabel(nextGap.minutes)} free</ThemedText></View>}
          </View>
          <ThemedText style={styles.focusText}>{nextActionText}</ThemedText>
          {focusTask && (
            <View style={styles.focusMetaRow}>
              <View style={styles.focusMetaPill}><ThemedText style={styles.focusMetaText}>{getTaskSubject(focusTask)}</ThemedText></View>
              <View style={styles.focusMetaPill}><ThemedText style={styles.focusMetaText}>{taskPriorityLabel(focusTask)}</ThemedText></View>
              <View style={styles.focusMetaPill}><ThemedText style={styles.focusMetaText}>{focusTask.remainingMinutes} min left</ThemedText></View>
            </View>
          )}
        </View>

        {autoSchedulePlan.sessions.length > 0 && (
          <View style={styles.autoPlanCard}>
            <View style={styles.sectionHeaderRow}><MaterialIcons name="auto-awesome" size={16} color={clay.textMid} /><ThemedText style={styles.sectionTitle}>Auto-schedule preview</ThemedText></View>
            <View style={styles.autoPlanList}>
              {autoSchedulePlan.sessions.slice(0, 3).map((session, i) => (
                <View key={i} style={styles.autoPlanRow}>
                  <View style={[styles.autoPlanDot, { backgroundColor: getUrgencyPalette(session.urgency).border }]} />
                  <View style={styles.autoPlanCopy}><ThemedText style={styles.autoPlanTitle}>{session.title}</ThemedText><ThemedText style={styles.autoPlanSubtitle}>{formatEventTimeRange(session.startsAt.toISOString(), session.endsAt.toISOString())}</ThemedText></View>
                </View>
              ))}
            </View>
          </View>
        )}

        {freeWindow && (
          <View style={styles.forecastCard}>
            <View style={styles.sectionHeaderRow}><MaterialIcons name="schedule-send" size={14} color={clay.textMid} /><ThemedText style={styles.sectionTitle}>Study forecast</ThemedText></View>
            <ThemedText style={styles.forecastText}>Your largest window today is {formatMinutesLabel(freeWindow.minutes)} starting at {formatTime(freeWindow.startsAt.toISOString())}.</ThemedText>
          </View>
        )}

        {/* ─── GROUP COLLABORATORS BUTTON ─── */}
        <Pressable 
          onPress={() => setShowInviteModal(true)}
          style={({ pressed }) => [
            styles.inviteCard,
            pressed && styles.eventPressed
          ]}
        >
          <View style={styles.inviteIconWrap}>
            <MaterialIcons name="group-add" size={24} color={clay.white} />
          </View>
          <View style={styles.inviteCopy}>
            <ThemedText style={styles.inviteTitle}>Invite Group Collaborators</ThemedText>
            <ThemedText style={styles.inviteSubtitle}>Sync schedules with your study squad</ThemedText>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={clay.white} />
        </Pressable>

        {loadingData && (
          <View style={styles.statusRow}>
            <ActivityIndicator color={palette.tint} />
            <ThemedText style={styles.statusText}>Syncing from Firebase...</ThemedText>
          </View>
        )}
      </ScrollView>

      {/* ─── INVITATION MODAL POPUP ─── */}
      <Modal 
        visible={showInviteModal} 
        transparent 
        animationType="fade"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <ThemedText style={styles.modalTitle}>Invite to Squad</ThemedText>
              <TouchableOpacity onPress={() => setShowInviteModal(false)}>
                <MaterialIcons name="close" size={22} color={clay.textMid} />
              </TouchableOpacity>
            </View>
            
            <ThemedText style={styles.modalSubtitle}>
              Enter a name to invite directly, or use the link options below to share your squad code.
            </ThemedText>
            
            <TextInput 
              style={styles.modalInput}
              placeholder="Name or Student #"
              placeholderTextColor={clay.textLight}
              value={inviteInput}
              onChangeText={setInviteInput}
            />

            <View style={styles.linkActionContainer}>
              <TouchableOpacity 
                style={styles.linkActionButton}
                onPress={() => Alert.alert('Link Copied', 'Squad join link copied to clipboard!')}
              >
                <MaterialIcons name="content-copy" size={18} color={clay.purpleDeep} />
                <ThemedText style={styles.linkActionText}>Copy Invite Link</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.linkActionButton}
                onPress={() => Alert.alert('Link Pasted', 'Joining squad from link...')}
              >
                <MaterialIcons name="content-paste" size={18} color={clay.purpleDeep} />
                <ThemedText style={styles.linkActionText}>Paste Join Link</ThemedText>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActionRow}>
              <TouchableOpacity 
                onPress={() => {
                  if (inviteInput.trim()) {
                    Alert.alert('Invitation Sent', `Sent to: ${inviteInput}`);
                    setShowInviteModal(false);
                    setInviteInput('');
                  } else {
                    Alert.alert('Empty Field', 'Please enter a name or student number.');
                  }
                }} 
                style={styles.modalInviteBtn}
              >
                <ThemedText style={styles.modalInviteText}>Send Direct Invitation</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────

const sharedShadow = {
  shadowColor: 'rgba(120, 90, 200, 0.24)',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.18,
  shadowRadius: 18,
  elevation: 8,
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: clay.background },
  blobOne: { position: 'absolute', width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(201,184,255,0.55)', top: -80, right: -60 },
  blobTwo: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,184,217,0.35)', bottom: 200, left: -60 },
  blobThree: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,207,134,0.28)', bottom: 40, right: 30 },
  content: { padding: 20, paddingBottom: 120, gap: 18 },
  topSection: { gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  headerCopy: { flex: 1, gap: 4 },
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  greetingText: { fontSize: 13, color: clay.textMid, fontWeight: '700', letterSpacing: 0.4 },
  
  headerLmsButton: {
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderRadius: 20,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  lmsLabel: { fontSize: 10, fontWeight: '800', color: clay.textMid, textTransform: 'uppercase', letterSpacing: 1 },
  lmsTitle: { fontFamily: Fonts.rounded, fontSize: 22, fontWeight: '900', color: clay.ink, marginTop: 2 },

  avatarButton: { width: 50, height: 50, borderRadius: 25, backgroundColor: clay.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)', ...sharedShadow },
  avatarText: { fontFamily: Fonts.rounded, fontSize: 18, fontWeight: '800', color: clay.purpleDeep },
  streakCard: { backgroundColor: '#E3D5FF', borderRadius: 28, padding: 20, gap: 14, ...sharedShadow },
  streakTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  streakLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  streakLabel: { fontSize: 12, color: clay.purpleDeep, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.6)' },
  streakBadgeHot: { backgroundColor: 'rgba(255,243,228,0.9)' },
  streakBadgeBroken: { backgroundColor: 'rgba(235,233,240,0.95)' },
  streakBadgeText: { fontSize: 11, color: clay.purpleDeep, fontWeight: '800' },
  streakBadgeTextBroken: { color: clay.grayDeep },
  streakMainRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  streakFlameWrap: { width: 60, height: 66, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 2 },
  streakNumber: { fontFamily: Fonts.rounded, fontSize: 54, lineHeight: 58, color: clay.ink, fontWeight: '900' },
  streakUnit: { fontSize: 18, color: clay.purpleDeep, fontWeight: '800', marginBottom: 10 },
  streakSupportText: { fontSize: 13, color: clay.textMid, lineHeight: 18 },
  streakDaysRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  streakDayItem: { alignItems: 'center', gap: 5, flex: 1 },
  streakDayDot: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  streakDoneDot: { backgroundColor: 'rgba(255,255,255,0.72)' },
  streakTodayDot: { backgroundColor: clay.white, transform: [{ scale: 1.08 }] },
  streakMissedDot: { backgroundColor: 'rgba(255,255,255,0.36)' },
  streakDayLabel: { fontSize: 10, color: clay.purpleDeep, fontWeight: '700' },
  streakTodayLabel: { color: clay.ink },
  section: { gap: 10 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 12, color: clay.textMid, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  alertCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, padding: 12, ...sharedShadow },
  alertOrange: { backgroundColor: '#FFE2B9' },
  alertRed: { backgroundColor: '#FFD7D7' },
  alertBlue: { backgroundColor: '#D8EEFF' },
  alertPressed: { transform: [{ translateY: -1 }] },
  alertIconWrap: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.55)', alignItems: 'center', justifyContent: 'center' },
  alertCopy: { flex: 1, gap: 2 },
  alertTitle: { fontSize: 13, fontWeight: '800', color: clay.ink },
  alertSubtitle: { fontSize: 11, color: clay.textMid, lineHeight: 16 },
  alertActionPill: { borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.6)', paddingHorizontal: 10, paddingVertical: 5 },
  alertActionText: { fontSize: 11, color: clay.textMid, fontWeight: '800' },
  emptyAlertCard: { borderRadius: 18, padding: 16, backgroundColor: 'rgba(255,255,255,0.72)', gap: 6, ...sharedShadow },
  emptyAlertTitle: { fontSize: 13, fontWeight: '800', color: clay.ink },
  emptyAlertSubtitle: { fontSize: 12, color: clay.textMid, lineHeight: 18 },
  calendarHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  datePill: { borderRadius: 18, backgroundColor: clay.white, paddingHorizontal: 12, paddingVertical: 5, ...sharedShadow },
  datePillText: { fontSize: 11, fontWeight: '800', color: clay.textMid },
  calendarCard: { borderRadius: 28, backgroundColor: clay.white, overflow: 'hidden', ...sharedShadow },
  timeGrid: { paddingVertical: 10 },
  timeRow: { flexDirection: 'row', minHeight: 70, borderBottomWidth: 1, borderBottomColor: 'rgba(211,192,255,0.28)' },
  timeLabel: { width: 60, paddingLeft: 16, paddingTop: 10, fontSize: 11, textAlign: 'right', color: clay.textLight, fontWeight: '700' },
  timeSlot: { flex: 1, paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  eventBlock: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  eventPressed: { transform: [{ scale: 0.99 }] },
  eventBlue: { backgroundColor: '#CAE7FF' },
  eventGreen: { backgroundColor: '#C8F3D7' },
  eventYellow: { backgroundColor: '#FFF0A8' },
  eventRed: { backgroundColor: '#FFD7D7' },
  eventNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventName: { fontSize: 12, fontWeight: '800', color: clay.ink, flex: 1 },
  eventTime: { fontSize: 10, color: clay.textMid, fontWeight: '700' },
  eventTag: { alignSelf: 'flex-start', fontSize: 10, color: clay.textMid, backgroundColor: 'rgba(255,255,255,0.55)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, overflow: 'hidden' },
  nowLine: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: -6, marginBottom: 2 },
  nowDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF5A7E' },
  nowBar: { flex: 1, height: 2, backgroundColor: '#FF9CB3', marginLeft: 4 },
  nowBadge: { marginLeft: 8, backgroundColor: '#FFE3EA', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  nowBadgeText: { fontSize: 10, color: '#FF5A7E', fontWeight: '800' },
  emptyState: { padding: 24, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: clay.ink },
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryCard: { flex: 1, borderRadius: 22, padding: 16, backgroundColor: 'rgba(255,255,255,0.72)', gap: 8, ...sharedShadow },
  summaryLabel: { fontSize: 12, color: clay.textMid, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '800' },
  summaryValue: { fontFamily: Fonts.rounded, fontSize: 28, color: clay.ink, fontWeight: '800' },
  summaryValueSmall: { fontSize: 16, color: clay.ink, fontWeight: '800' },
  focusCard: { borderRadius: 24, padding: 18, backgroundColor: '#E7DFFF', gap: 10, ...sharedShadow },
  focusHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  focusTitle: { fontSize: 18, fontWeight: '800', color: clay.ink },
  focusBadge: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: 'rgba(255,255,255,0.7)' },
  focusBadgeText: { fontSize: 11, fontWeight: '800', color: clay.purpleDeep },
  focusText: { fontSize: 14, color: clay.textMid, lineHeight: 21 },
  focusMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  focusMetaPill: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.68)' },
  focusMetaText: { fontSize: 11, fontWeight: '800', color: clay.purpleDeep },
  autoPlanCard: { borderRadius: 24, padding: 16, backgroundColor: '#FFFFFF', gap: 8, ...sharedShadow },
  autoPlanList: { gap: 6 },
  autoPlanRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  autoPlanDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  autoPlanCopy: { flex: 1, gap: 2 },
  autoPlanTitle: { fontSize: 13, fontWeight: '800', color: clay.ink },
  autoPlanSubtitle: { fontSize: 11, fontWeight: '700', color: clay.textMid },
  forecastCard: { borderRadius: 22, padding: 16, backgroundColor: 'rgba(255,255,255,0.72)', gap: 8, ...sharedShadow },
  forecastText: { fontSize: 13, lineHeight: 19, color: clay.textMid },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { fontSize: 13, color: clay.textMid, lineHeight: 18 },

  inviteCard: { backgroundColor: clay.purpleDeep, borderRadius: 24, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8, ...sharedShadow },
  inviteIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  inviteCopy: { flex: 1, gap: 2 },
  inviteTitle: { fontSize: 16, fontWeight: '800', color: clay.white },
  inviteSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },

  /* MODAL STYLES */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(45,34,80,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { width: '100%', backgroundColor: clay.white, borderRadius: 28, padding: 24, gap: 16, ...sharedShadow },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: clay.ink },
  modalSubtitle: { fontSize: 13, color: clay.textMid, lineHeight: 18 },
  modalInput: { backgroundColor: clay.background, borderRadius: 16, padding: 16, fontSize: 14, color: clay.ink, fontWeight: '600' },
  
  linkActionContainer: { gap: 10, paddingVertical: 8 },
  linkActionButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 12, 
    backgroundColor: 'rgba(211,192,255,0.25)', 
    padding: 14, 
    borderRadius: 16 
  },
  linkActionText: { fontSize: 14, fontWeight: '700', color: clay.purpleDeep },

  modalActionRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  modalInviteBtn: { flex: 1, backgroundColor: clay.purpleDeep, padding: 16, borderRadius: 16, alignItems: 'center' },
  modalInviteText: { fontWeight: '800', color: clay.white },
});
