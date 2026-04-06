import { User } from 'firebase/auth';
import { collection, getDocs, writeBatch } from 'firebase/firestore';

import {
  DEFAULT_PREFERENCES as BACKEND_DEFAULT_PREFERENCES,
  type ExtractedClass,
  type LmsFeedItem as BackendLmsFeedItem,
  type ScheduleItem as BackendScheduleItem,
  SchedULearnBackend,
  type TaskItem as BackendTaskItem,
  type UserPreferences as BackendUserPreferences,
  type UserProfile as BackendUserProfile,
} from '@/lib/firebase/backend-reference';
import { auth, db, storage } from '@/lib/firebase/config';
import type {
  CompleteOnboardingInput,
  CreateStudyBlockInput,
  CreateTaskInput,
  GroupStudySlot,
  LmsConnectionInput,
  LmsFeedItem,
  ScheduleItem,
  TaskItem,
  UserPreferences,
  UserProfile,
} from '@/lib/firebase/types';

export const backend = new SchedULearnBackend(auth, db, storage);

export const UI_DEFAULT_PREFERENCES: UserPreferences = {
  ...BACKEND_DEFAULT_PREFERENCES,
  notificationsEnabled: true,
  dailyDigestEnabled: false,
  compactView: false,
  themeMode: 'light',
};

export function mapPreferences(preferences: BackendUserPreferences | null | undefined): UserPreferences {
  return {
    ...UI_DEFAULT_PREFERENCES,
    ...(preferences ?? {}),
  };
}

export function mapProfile(
  profile: BackendUserProfile | null,
  preferences?: BackendUserPreferences | null
): UserProfile | null {
  if (!profile) {
    return null;
  }

  return {
    ...profile,
    preferences: mapPreferences(preferences),
  };
}

export function mapTask(task: BackendTaskItem): TaskItem {
  return {
    ...task,
    course: task.subject,
  };
}

export function mapSchedule(item: BackendScheduleItem): ScheduleItem {
  return {
    ...item,
    location: item.location ?? 'TBD',
  };
}

export function mapLmsFeedItem(item: BackendLmsFeedItem): LmsFeedItem {
  return {
    ...item,
    due: item.detectedDueAt,
    syncedAt: item.syncedAt ?? item.updatedAt,
  };
}

function ensureMatchingUser(uid: string) {
  if (auth.currentUser?.uid !== uid) {
    throw new Error('Authenticated user does not match the requested workspace.');
  }
}

export async function ensureUserWorkspace(user: User) {
  ensureMatchingUser(user.uid);
  await backend.ensureUserBootstrap();
}

export function subscribeToProfile(
  uid: string,
  onData: (profile: BackendUserProfile | null) => void,
  onError: (error: Error) => void
) {
  try {
    ensureMatchingUser(uid);
    return backend.subscribeToProfile(onData);
  } catch (error) {
    onError(error instanceof Error ? error : new Error('Unable to subscribe to profile.'));
    return () => undefined;
  }
}

export function subscribeToPreferences(
  uid: string,
  onData: (preferences: BackendUserPreferences | null) => void,
  onError: (error: Error) => void
) {
  try {
    ensureMatchingUser(uid);
    return backend.subscribeToPreferences(onData);
  } catch (error) {
    onError(error instanceof Error ? error : new Error('Unable to subscribe to preferences.'));
    return () => undefined;
  }
}

export function subscribeToTasks(
  uid: string,
  onData: (tasks: TaskItem[]) => void,
  onError: (error: Error) => void
) {
  try {
    ensureMatchingUser(uid);
    return backend.subscribeToTasks((tasks) => onData(tasks.map(mapTask)));
  } catch (error) {
    onError(error instanceof Error ? error : new Error('Unable to subscribe to tasks.'));
    return () => undefined;
  }
}

export function subscribeToSchedules(
  uid: string,
  onData: (items: ScheduleItem[]) => void,
  onError: (error: Error) => void
) {
  try {
    ensureMatchingUser(uid);
    return backend.subscribeToSchedules((items) => onData(items.map(mapSchedule)));
  } catch (error) {
    onError(error instanceof Error ? error : new Error('Unable to subscribe to schedules.'));
    return () => undefined;
  }
}

export function subscribeToLmsFeed(
  uid: string,
  onData: (items: LmsFeedItem[]) => void,
  onError: (error: Error) => void
) {
  try {
    ensureMatchingUser(uid);
    return backend.subscribeToLmsFeed((items) => onData(items.map(mapLmsFeedItem)));
  } catch (error) {
    onError(error instanceof Error ? error : new Error('Unable to subscribe to LMS feed.'));
    return () => undefined;
  }
}

export async function updatePreferences(uid: string, preferences: Partial<UserPreferences>) {
  ensureMatchingUser(uid);
  await backend.updatePreferences(preferences);
}

export async function updateProfile(uid: string, patch: Partial<BackendUserProfile>) {
  ensureMatchingUser(uid);
  await backend.updateProfile(patch);
}

export async function completeOnboarding(uid: string, input: CompleteOnboardingInput) {
  ensureMatchingUser(uid);
  await backend.completeOnboarding(input);
}

export async function resetCurrentUserData(uid: string) {
  ensureMatchingUser(uid);
  await backend.resetCurrentUserData();
}

export async function addQuickTask(uid: string) {
  ensureMatchingUser(uid);

  const createdAt = new Date();
  const dueAt = new Date(createdAt.getTime() + 36 * 60 * 60 * 1000).toISOString();
  const title = `Task ${createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  return backend.createTaskAndSchedule({
    title,
    subject: 'General',
    type: 'other',
    dueAt,
    estimatedMinutes: 45,
    difficulty: 'medium',
    autoSchedule: true,
  });
}

export async function createTask(uid: string, input: CreateTaskInput) {
  ensureMatchingUser(uid);
  return mapTask(await backend.createTask(input));
}

export async function createTaskAndSchedule(uid: string, input: CreateTaskInput) {
  ensureMatchingUser(uid);
  return mapTask(await backend.createTaskAndSchedule(input));
}

export async function refreshLmsFeed(uid: string) {
  ensureMatchingUser(uid);
  await backend.syncLmsFeed();
}

export async function connectLms(uid: string, credentials: LmsConnectionInput) {
  ensureMatchingUser(uid);
  await backend.connectLms(credentials);
}

export async function syncOpenLmsFeed(uid: string) {
  ensureMatchingUser(uid);
  await backend.syncOpenLmsFeed();
}

export async function resetLmsDemo(uid: string) {
  ensureMatchingUser(uid);
  await backend.resetLmsDemo();
}

export async function fetchGroupStudySlots(uid: string): Promise<GroupStudySlot[]> {
  ensureMatchingUser(uid);
  return backend.suggestGroupStudySlots();
}

export async function updateTaskStatus(uid: string, taskId: string, status: TaskItem['status']) {
  ensureMatchingUser(uid);
  await backend.setTaskStatus(taskId, status);
}

export async function updateTask(uid: string, taskId: string, patch: Partial<BackendTaskItem>) {
  ensureMatchingUser(uid);
  await backend.updateTask(taskId, patch);
}

export async function moveSchedule(uid: string, scheduleId: string, startsAt: string, endsAt: string) {
  ensureMatchingUser(uid);
  await backend.rescheduleItem(scheduleId, startsAt, endsAt);
}

function schedulesCollectionPath(uid: string) {
  return 'users/' + uid + '/schedules';
}

function setDayTime(date: Date, hour: number, minute = 0) {
  const copy = new Date(date);
  copy.setHours(hour, minute, 0, 0);
  return copy;
}

function nextDateForWeekday(startDate: Date, weekday: ExtractedClass['weekday']) {
  const targetMap: Record<ExtractedClass['weekday'], number> = {
    SUN: 0,
    MON: 1,
    TUE: 2,
    WED: 3,
    THU: 4,
    FRI: 5,
    SAT: 6,
  };

  const current = new Date(startDate);
  const diff = (targetMap[weekday] - current.getDay() + 7) % 7;
  current.setDate(current.getDate() + diff);
  current.setHours(0, 0, 0, 0);
  return current;
}

export async function createRecurringClassSchedules(uid: string, classes: ExtractedClass[], weeksToGenerate = 16) {
  ensureMatchingUser(uid);
  if (!classes.length) return;

  const blocks: Parameters<typeof backend.createScheduleBlocks>[0] = [];
  const today = new Date();

  for (const cls of classes) {
    const anchor = nextDateForWeekday(today, cls.weekday);

    for (let week = 0; week < weeksToGenerate; week += 1) {
      const classDate = new Date(anchor);
      classDate.setDate(anchor.getDate() + week * 7);

      const start = setDayTime(classDate, cls.startHour, cls.startMinute);
      const end = setDayTime(classDate, cls.endHour, cls.endMinute);

      const recurringClassMeta = {
        ...(cls.courseCode ? { courseCode: cls.courseCode } : {}),
        ...(cls.room ? { room: cls.room } : {}),
        ...(cls.instructor ? { instructor: cls.instructor } : {}),
        weekday: cls.weekday,
      };

      blocks.push({
        title: cls.title,
        type: 'class',
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        location: cls.location ?? cls.room ?? 'Classroom',
        taskId: null,
        subject: cls.subject,
        status: 'scheduled',
        source: 'manual',
        urgency: 'green',
        recurringClassMeta,
      });
    }
  }

  await backend.createScheduleBlocks(blocks);
}

export async function clearImportedEafClassSchedules(uid: string) {
  ensureMatchingUser(uid);
  const snap = await getDocs(collection(db, schedulesCollectionPath(uid)));
  const batch = writeBatch(db);

  snap.docs.forEach((docSnap) => {
    const item = docSnap.data() as BackendScheduleItem;
    const isGeneratedRecurringClass =
      item.type === 'class' &&
      Boolean(item.recurringClassMeta?.weekday) &&
      (item.source === 'eaf' || item.source === 'manual');

    if (isGeneratedRecurringClass) {
      batch.delete(docSnap.ref);
    }
  });

  await batch.commit();
}

export async function addStudyBlock(uid: string, input: CreateStudyBlockInput) {
  ensureMatchingUser(uid);
  await backend.createStudyBlock(input);
}





