/**
 * backend-reference.ts
 *
 * SchedU Learn - Expo + Firebase backend reference
 *
 * PURPOSE
 * -------
 * This is a single-file architecture reference for your hackathon app.
 * It is NOT meant to run immediately as-is. It is a blueprint you can copy
 * from into your actual Firebase provider, utils, and service files.
 *
 * MAIN FLOW
 * ---------
 * 1) User signs in
 * 2) App subscribes to profile, preferences, tasks, schedules, LMS feed
 * 3) User creates a task OR imports EAF OR syncs LMS
 * 4) Scheduler generates study blocks around classes and existing events
 * 5) Calendar + Home update live from Firestore snapshots
 *
 * IMPORTANT V1 DECISIONS
 * ----------------------
 * - Keep scheduling client-side for now (fastest for Expo Go / hackathon)
 * - Use Firestore for app data
 * - Use Firebase Storage for EAF uploads
 * - EAF import should support:
 *    a) file upload to Storage
 *    b) extracted class blocks saved into schedules collection as type='class'
 * - LMS sync should convert LMS-detected items into tasks
 * - Scheduler must consider:
 *    - classes imported from EAF
 *    - LMS tasks
 *    - manually created tasks
 *    - existing study blocks
 *
 * NOTE ABOUT EAF PARSING
 * ----------------------
 * Extracting schedules from arbitrary EAF PDFs/images is not perfectly reliable in v1.
 * Best hackathon approach:
 * - upload the file
 * - attempt lightweight parsing if text is available
 * - if parsing is weak, let the user confirm/edit the extracted classes
 * - after confirmation, save class schedules to Firestore
 */

import {
  addDoc,
  collection,
  CollectionReference,
  deleteDoc,
  doc,
  DocumentReference,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  Firestore,
} from 'firebase/firestore';
import {
  getDownloadURL,
  ref,
  uploadBytes,
  FirebaseStorage,
} from 'firebase/storage';
import {
  User,
  onAuthStateChanged,
  Auth,
} from 'firebase/auth';

// ======================================================
// 1) COLLECTION PATHS
// ======================================================

/**
 * Firestore structure
 *
 * users/{uid}
 * users/{uid}/preferences/main
 * users/{uid}/tasks/{taskId}
 * users/{uid}/schedules/{scheduleId}
 * users/{uid}/lmsFeed/{feedId}
 * users/{uid}/eafImports/{importId}
 * users/{uid}/sessionLogs/{sessionId}
 */

function userDocPath(uid: string) {
  return `users/${uid}`;
}

function preferencesDocPath(uid: string) {
  return `users/${uid}/preferences/main`;
}

function tasksCollectionPath(uid: string) {
  return `users/${uid}/tasks`;
}

function schedulesCollectionPath(uid: string) {
  return `users/${uid}/schedules`;
}

function lmsFeedCollectionPath(uid: string) {
  return `users/${uid}/lmsFeed`;
}

function eafImportsCollectionPath(uid: string) {
  return `users/${uid}/eafImports`;
}

function sessionLogsCollectionPath(uid: string) {
  return `users/${uid}/sessionLogs`;
}

// ======================================================
// 2) CORE TYPES
// ======================================================

export type Difficulty = 'easy' | 'medium' | 'hard';
export type Priority = 'planned' | 'high' | 'urgent';
export type UrgencyColor = 'green' | 'yellow' | 'red';

export type TaskType =
  | 'assignment'
  | 'quiz'
  | 'exam'
  | 'project'
  | 'reading'
  | 'other';

export type ScheduleType =
  | 'class'
  | 'study'
  | 'deadline'
  | 'personal';

export type ScheduleStatus =
  | 'scheduled'
  | 'done'
  | 'missed'
  | 'cancelled';

export type TaskStatus =
  | 'todo'
  | 'in_progress'
  | 'done'
  | 'overdue';

export type TaskSource =
  | 'manual'
  | 'lms';

export type ScheduleSource =
  | 'manual'
  | 'auto'
  | 'lms'
  | 'eaf';

export type LmsStatus =
  | 'new'
  | 'updated'
  | 'synced';

export type MoodCheck =
  | 'low'
  | 'neutral'
  | 'good';

export type Weekday =
  | 'MON'
  | 'TUE'
  | 'WED'
  | 'THU'
  | 'FRI'
  | 'SAT'
  | 'SUN';

export type YearLevel =
  | '1st Year'
  | '2nd Year'
  | '3rd Year'
  | '4th Year'
  | '5th Year'
  | 'Graduate';

export type UserProfile = {
  displayName: string;
  avatarInitials: string;
  email: string;
  onboardingCompleted: boolean;
  onboardingCompletedAt?: string | null;
  yearLevel?: YearLevel | null;
  subjects: string[];
  activeEafImportId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserPreferences = {
  studyGoalHours: number;
  preferredSessionMinutes: number;
  shortBreakMinutes: number;
  startHour: number;
  endHour: number;
  maxSessionsPerDay: number;
  avoidBackToBackHard: boolean;

  // optional future knobs
  sleepStartHour?: number;
  sleepEndHour?: number;
  customStudyMode?: 'pomodoro' | 'deep-work' | 'flowtime';
};

export type TaskItem = {
  id: string;
  title: string;
  subject: string;
  type: TaskType;

  dueAt: string;
  estimatedMinutes: number;
  remainingMinutes: number;
  scheduledMinutes: number;

  difficulty: Difficulty;
  priority: Priority;
  colorCode: UrgencyColor;

  status: TaskStatus;
  notes?: string;

  source: TaskSource;
  sourceMeta?: {
    lmsCourseId?: string;
    lmsAssignmentId?: string;
    importedFromFeedId?: string;
  };

  autoSchedule: boolean;

  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
};

export type ScheduleItem = {
  id: string;
  title: string;
  type: ScheduleType;

  startsAt: string;
  endsAt: string;
  location?: string;

  taskId?: string | null;
  subject?: string;
  difficulty?: Difficulty;

  status: ScheduleStatus;
  source: ScheduleSource;
  urgency: UrgencyColor;

  createdAt: string;
  updatedAt: string;

  // for class schedules imported from EAF
  recurringClassMeta?: {
    courseCode?: string;
    section?: string;
    room?: string;
    instructor?: string;
    weekday?: Weekday;
  };
};

export type LmsFeedItem = {
  id: string;
  title: string;
  course: string;
  type: TaskType;
  detectedDueAt: string;
  status: LmsStatus;
  source: string; // e.g. "Canvas", "Moodle", "Mock LMS"
  rawPayload?: string; // optional JSON string if needed for debugging
  linkedTaskId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EafImportItem = {
  id: string;
  filename: string;
  storagePath: string;
  downloadUrl: string;
  uploadedAt: string;
  parsingStatus: 'uploaded' | 'parsed' | 'needs_review' | 'confirmed' | 'failed';

  /**
   * Save raw extracted text if available.
   * Not all EAF files will give you reliable text.
   */
  extractedText?: string;

  /**
   * Extracted classes before user confirmation.
   */
  extractedClasses?: ExtractedClass[];

  /**
   * Final user-confirmed classes.
   */
  confirmedClasses?: ExtractedClass[];
};

export type ExtractedClass = {
  title: string;
  subject: string;
  courseCode?: string;
  room?: string;
  instructor?: string;

  weekday: Weekday;
  startHour: number;   // 24h
  startMinute: number;
  endHour: number;     // 24h
  endMinute: number;

  location?: string;
};

export type SessionLog = {
  id: string;
  taskId?: string | null;
  scheduleId?: string | null;
  startedAt: string;
  endedAt?: string | null;
  durationMinutes?: number;
  moodBefore?: MoodCheck;
  ratingAfter?: 'up' | 'down' | null;
};

export type CreateTaskInput = {
  title: string;
  subject: string;
  type: TaskType;
  dueAt: string;
  estimatedMinutes: number;
  difficulty: Difficulty;
  notes?: string;
  autoSchedule?: boolean;
};

export type CreateStudyBlockInput = {
  title: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  taskId?: string;
  subject?: string;
  difficulty?: Difficulty;
  urgency?: UrgencyColor;
};

export type CompleteOnboardingInput = {
  displayName: string;
  yearLevel: YearLevel;
  subjects: string[];
  studyGoalHours: number;
  preferredSessionMinutes: number;
  shortBreakMinutes: number;
  startHour: number;
  endHour: number;
  maxSessionsPerDay: number;
  avoidBackToBackHard: boolean;
  sleepStartHour: number;
  sleepEndHour: number;
  activeEafImportId?: string | null;
};

export type FreeWindow = {
  startsAt: Date;
  endsAt: Date;
  minutes: number;
};

export type ScheduleDraft = {
  title: string;
  type: 'study';
  startsAt: string;
  endsAt: string;
  location?: string;
  taskId: string;
  subject: string;
  difficulty: Difficulty;
  status: 'scheduled';
  source: 'auto';
  urgency: UrgencyColor;
};

// ======================================================
// 3) DEFAULTS
// ======================================================

export const DEFAULT_PREFERENCES: UserPreferences = {
  studyGoalHours: 2,
  preferredSessionMinutes: 45,
  shortBreakMinutes: 15,
  startHour: 7,
  endHour: 22,
  maxSessionsPerDay: 4,
  avoidBackToBackHard: true,
};

function buildAvatarInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return 'SL';

  return trimmed
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'SL';
}

export const DEFAULT_PROFILE = (email: string, displayName = 'Student'): UserProfile => ({
  displayName,
  avatarInitials: buildAvatarInitials(displayName),
  email,
  onboardingCompleted: false,
  onboardingCompletedAt: null,
  yearLevel: null,
  subjects: [],
  activeEafImportId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// ======================================================
// 4) DATE / TIME HELPERS
// ======================================================

function nowIso() {
  return new Date().toISOString();
}

function toDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function diffMinutes(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 60_000);
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function setDayTime(date: Date, hour: number, minute = 0) {
  const copy = new Date(date);
  copy.setHours(hour, minute, 0, 0);
  return copy;
}

function clampToFuture(date: Date) {
  const now = new Date();
  return date.getTime() < now.getTime() ? now : date;
}

function weekdayFromDate(date: Date): Weekday {
  const day = date.getDay(); // 0 Sun ... 6 Sat
  const map: Weekday[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return map[day];
}

function withDocId<T extends { id?: string }>(id: string, data: T): T & { id: string } {
  return {
    ...data,
    id: data.id ?? id,
  };
}

function nextDateForWeekday(startDate: Date, weekday: Weekday): Date {
  const targetMap: Record<Weekday, number> = {
    SUN: 0,
    MON: 1,
    TUE: 2,
    WED: 3,
    THU: 4,
    FRI: 5,
    SAT: 6,
  };

  const current = new Date(startDate);
  const currentDay = current.getDay();
  const targetDay = targetMap[weekday];
  const diff = (targetDay - currentDay + 7) % 7;

  current.setDate(current.getDate() + diff);
  return startOfDay(current);
}

// ======================================================
// 5) DERIVED PRIORITY / URGENCY
// ======================================================

export function computePriority(dueAt: string): Priority {
  const hoursLeft = (new Date(dueAt).getTime() - Date.now()) / 3_600_000;
  if (hoursLeft <= 24) return 'urgent';
  if (hoursLeft <= 72) return 'high';
  return 'planned';
}

export function computeUrgencyColor(dueAt: string): UrgencyColor {
  const hoursLeft = (new Date(dueAt).getTime() - Date.now()) / 3_600_000;
  if (hoursLeft <= 24) return 'red';
  if (hoursLeft <= 72) return 'yellow';
  return 'green';
}

export function computeDifficultyAdjustedMinutes(
  estimatedMinutes: number,
  difficulty: Difficulty
) {
  const multiplier =
    difficulty === 'easy' ? 1.0 :
    difficulty === 'medium' ? 1.15 :
    1.3;

  return Math.ceil(estimatedMinutes * multiplier);
}

// ======================================================
// 6) FIREBASE BACKEND CLASS / SERVICE
// ======================================================

/**
 * In your real app, you can place this logic inside:
 * - providers/firebase-provider.tsx
 * - services/scheduler.ts
 * - services/eaf.ts
 * - services/lms.ts
 *
 * For reference, this class shows all major backend methods in one place.
 */
export class SchedULearnBackend {
  constructor(
    private auth: Auth,
    private firestore: Firestore,
    private storage: FirebaseStorage
  ) {}

  // --------------------------------------------------
  // AUTH / CURRENT USER
  // --------------------------------------------------

  getCurrentUser() {
    return this.auth.currentUser;
  }

  requireUid() {
    const uid = this.auth.currentUser?.uid;
    if (!uid) throw new Error('User is not authenticated.');
    return uid;
  }

  subscribeToAuth(callback: (user: User | null) => void) {
    return onAuthStateChanged(this.auth, callback);
  }

  // --------------------------------------------------
  // PROFILE + PREFERENCES
  // --------------------------------------------------

  async ensureUserBootstrap() {
    const user = this.auth.currentUser;
    if (!user) throw new Error('User is not authenticated.');

    const profileRef = doc(this.firestore, userDocPath(user.uid));
    const preferencesRef = doc(this.firestore, preferencesDocPath(user.uid));

    const profileSnap = await getDoc(profileRef);
    const preferencesSnap = await getDoc(preferencesRef);

    if (!profileSnap.exists()) {
      await setDoc(profileRef, DEFAULT_PROFILE(user.email ?? '', user.displayName ?? 'Student'));
    }

    if (!preferencesSnap.exists()) {
      await setDoc(preferencesRef, DEFAULT_PREFERENCES);
    }
  }

  subscribeToProfile(callback: (profile: UserProfile | null) => void) {
    const uid = this.requireUid();
    return onSnapshot(doc(this.firestore, userDocPath(uid)), (snap) => {
      callback(snap.exists() ? (snap.data() as UserProfile) : null);
    });
  }

  subscribeToPreferences(callback: (preferences: UserPreferences | null) => void) {
    const uid = this.requireUid();
    return onSnapshot(doc(this.firestore, preferencesDocPath(uid)), (snap) => {
      callback(snap.exists() ? (snap.data() as UserPreferences) : null);
    });
  }

  async updatePreferences(patch: Partial<UserPreferences>) {
    const uid = this.requireUid();
    await updateDoc(doc(this.firestore, preferencesDocPath(uid)), patch);
  }

  async updateProfile(patch: Partial<UserProfile>) {
    const uid = this.requireUid();
    await updateDoc(doc(this.firestore, userDocPath(uid)), {
      ...patch,
      updatedAt: nowIso(),
    });
  }

  async completeOnboarding(input: CompleteOnboardingInput) {
    const user = this.auth.currentUser;
    if (!user) throw new Error('User is not authenticated.');

    const displayName = input.displayName.trim();
    if (!displayName) throw new Error('Display name is required.');
    if (!input.subjects.length) throw new Error('At least one subject is required.');

    const profileRef = doc(this.firestore, userDocPath(user.uid));
    const preferencesRef = doc(this.firestore, preferencesDocPath(user.uid));

    await setDoc(profileRef, {
      displayName,
      avatarInitials: buildAvatarInitials(displayName),
      email: user.email ?? '',
      onboardingCompleted: true,
      onboardingCompletedAt: nowIso(),
      yearLevel: input.yearLevel,
      subjects: input.subjects,
      activeEafImportId: input.activeEafImportId ?? null,
      updatedAt: nowIso(),
    }, { merge: true });

    await setDoc(preferencesRef, {
      studyGoalHours: input.studyGoalHours,
      preferredSessionMinutes: input.preferredSessionMinutes,
      shortBreakMinutes: input.shortBreakMinutes,
      startHour: input.startHour,
      endHour: input.endHour,
      maxSessionsPerDay: input.maxSessionsPerDay,
      avoidBackToBackHard: input.avoidBackToBackHard,
      sleepStartHour: input.sleepStartHour,
      sleepEndHour: input.sleepEndHour,
    }, { merge: true });
  }

  async resetCurrentUserData() {
    const user = this.auth.currentUser;
    if (!user) throw new Error('User is not authenticated.');

    const deleteCollection = async (path: string) => {
      const snap = await getDocs(collection(this.firestore, path));
      if (!snap.docs.length) return;

      const batch = writeBatch(this.firestore);
      snap.docs.forEach((item) => batch.delete(item.ref));
      await batch.commit();
    };

    await deleteCollection(tasksCollectionPath(user.uid));
    await deleteCollection(schedulesCollectionPath(user.uid));
    await deleteCollection(lmsFeedCollectionPath(user.uid));
    await deleteCollection(eafImportsCollectionPath(user.uid));
    await deleteCollection(sessionLogsCollectionPath(user.uid));

    const currentProfile = await getDoc(doc(this.firestore, userDocPath(user.uid)));
    const createdAt = currentProfile.exists()
      ? ((currentProfile.data() as UserProfile).createdAt ?? nowIso())
      : nowIso();

    await setDoc(doc(this.firestore, userDocPath(user.uid)), {
      ...DEFAULT_PROFILE(user.email ?? '', user.displayName ?? 'Student'),
      createdAt,
      updatedAt: nowIso(),
    });

    await setDoc(doc(this.firestore, preferencesDocPath(user.uid)), DEFAULT_PREFERENCES);
  }

  // --------------------------------------------------
  // TASKS
  // --------------------------------------------------

  subscribeToTasks(callback: (tasks: TaskItem[]) => void) {
    const uid = this.requireUid();
    const q = query(
      collection(this.firestore, tasksCollectionPath(uid)),
      orderBy('dueAt', 'asc')
    );

    return onSnapshot(q, (snap) => {
      const tasks = snap.docs.map((d) => withDocId(d.id, d.data() as TaskItem));
      callback(tasks);
    });
  }

  async getTask(taskId: string) {
    const uid = this.requireUid();
    const ref = doc(this.firestore, `${tasksCollectionPath(uid)}/${taskId}`);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Task not found.');
    return withDocId(snap.id, snap.data() as TaskItem);
  }

  async createTask(input: CreateTaskInput): Promise<TaskItem> {
    const uid = this.requireUid();

    const adjustedMinutes = computeDifficultyAdjustedMinutes(
      input.estimatedMinutes,
      input.difficulty
    );

    const taskRef = doc(collection(this.firestore, tasksCollectionPath(uid)));

    const task: TaskItem = {
      id: taskRef.id,
      title: input.title,
      subject: input.subject,
      type: input.type,
      dueAt: input.dueAt,

      estimatedMinutes: adjustedMinutes,
      remainingMinutes: adjustedMinutes,
      scheduledMinutes: 0,

      difficulty: input.difficulty,
      priority: computePriority(input.dueAt),
      colorCode: computeUrgencyColor(input.dueAt),

      status: 'todo',
      notes: input.notes ?? '',

      source: 'manual',
      autoSchedule: input.autoSchedule ?? true,

      createdAt: nowIso(),
      updatedAt: nowIso(),
      completedAt: null,
    };

    await setDoc(taskRef, task);
    return task;
  }

  async updateTask(taskId: string, patch: Partial<TaskItem>) {
    const uid = this.requireUid();
    await updateDoc(
      doc(this.firestore, `${tasksCollectionPath(uid)}/${taskId}`),
      {
        ...patch,
        updatedAt: nowIso(),
      }
    );
  }

  async setTaskStatus(taskId: string, status: TaskStatus) {
    const patch: Partial<TaskItem> = {
      status,
      updatedAt: nowIso(),
    };

    if (status === 'done') {
      patch.completedAt = nowIso();
      patch.remainingMinutes = 0;
    }

    await this.updateTask(taskId, patch);
  }

  async createTaskAndSchedule(input: CreateTaskInput) {
    const task = await this.createTask(input);
    await this.autoScheduleTask(task.id);
    return task;
  }

  // --------------------------------------------------
  // SCHEDULES
  // --------------------------------------------------

  subscribeToSchedules(callback: (items: ScheduleItem[]) => void) {
    const uid = this.requireUid();
    const q = query(
      collection(this.firestore, schedulesCollectionPath(uid)),
      orderBy('startsAt', 'asc')
    );

    return onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => withDocId(d.id, d.data() as ScheduleItem));
      callback(items);
    });
  }

  async getSchedulesUntil(untilIso: string) {
    const uid = this.requireUid();
    const q = query(
      collection(this.firestore, schedulesCollectionPath(uid)),
      where('startsAt', '<=', untilIso),
      orderBy('startsAt', 'asc')
    );

    const snap = await getDocs(q);
    return snap.docs.map((d) => withDocId(d.id, d.data() as ScheduleItem));
  }

  async createScheduleBlocks(blocks: Omit<ScheduleItem, 'id' | 'createdAt' | 'updatedAt'>[]) {
    const uid = this.requireUid();
    const batch = writeBatch(this.firestore);

    for (const block of blocks) {
      const ref = doc(collection(this.firestore, schedulesCollectionPath(uid)));
      const payload: ScheduleItem = {
        id: ref.id,
        ...block,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      batch.set(ref, payload);
    }

    await batch.commit();
  }

  async createStudyBlock(input: CreateStudyBlockInput) {
    await this.createScheduleBlocks([
      {
        title: input.title,
        type: 'study',
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        location: input.location ?? 'Focus zone',
        taskId: input.taskId ?? null,
        subject: input.subject,
        difficulty: input.difficulty,
        status: 'scheduled',
        source: 'manual',
        urgency: input.urgency ?? 'green',
      },
    ]);
  }

  async updateSchedule(scheduleId: string, patch: Partial<ScheduleItem>) {
    const uid = this.requireUid();
    await updateDoc(
      doc(this.firestore, `${schedulesCollectionPath(uid)}/${scheduleId}`),
      {
        ...patch,
        updatedAt: nowIso(),
      }
    );
  }

  async rescheduleItem(scheduleId: string, startsAt: string, endsAt: string) {
    await this.updateSchedule(scheduleId, {
      startsAt,
      endsAt,
    });
  }

  async markScheduleDone(scheduleId: string) {
    const uid = this.requireUid();
    const ref = doc(this.firestore, `${schedulesCollectionPath(uid)}/${scheduleId}`);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Schedule item not found.');

    const schedule = withDocId(snap.id, snap.data() as ScheduleItem);
    await this.updateSchedule(scheduleId, { status: 'done' });

    if (schedule.taskId) {
      const task = await this.getTask(schedule.taskId);
      const duration = diffMinutes(new Date(schedule.startsAt), new Date(schedule.endsAt));
      const remaining = Math.max(0, task.remainingMinutes - duration);

      await this.updateTask(schedule.taskId, {
        remainingMinutes: remaining,
        status: remaining <= 0 ? 'done' : 'in_progress',
        completedAt: remaining <= 0 ? nowIso() : null,
      });
    }
  }

  async markScheduleMissed(scheduleId: string) {
    const uid = this.requireUid();
    const ref = doc(this.firestore, `${schedulesCollectionPath(uid)}/${scheduleId}`);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Schedule item not found.');

    const schedule = withDocId(snap.id, snap.data() as ScheduleItem);
    await this.updateSchedule(scheduleId, { status: 'missed' });

    if (!schedule.taskId) return;

    // Repair only the missed duration
    const duration = diffMinutes(new Date(schedule.startsAt), new Date(schedule.endsAt));
    const task = await this.getTask(schedule.taskId);
    const preferences = await this.getPreferencesSafe();
    const schedules = await this.getSchedulesUntil(task.dueAt);

    const repairDrafts = generateStudyPlanForTask(
      {
        ...task,
        remainingMinutes: duration,
      },
      schedules,
      preferences
    );

    if (repairDrafts.length > 0) {
      await this.createScheduleBlocks(
        repairDrafts.map((d) => ({
          title: d.title,
          type: d.type,
          startsAt: d.startsAt,
          endsAt: d.endsAt,
          location: d.location,
          taskId: d.taskId,
          subject: d.subject,
          difficulty: d.difficulty,
          status: d.status,
          source: d.source,
          urgency: d.urgency,
        }))
      );
    }
  }

  // --------------------------------------------------
  // LMS FEED
  // --------------------------------------------------

  subscribeToLmsFeed(callback: (items: LmsFeedItem[]) => void) {
    const uid = this.requireUid();
    const q = query(
      collection(this.firestore, lmsFeedCollectionPath(uid)),
      orderBy('detectedDueAt', 'asc')
    );

    return onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => withDocId(d.id, d.data() as LmsFeedItem));
      callback(items);
    });
  }

  async ingestLmsFeedItems(feedItems: Omit<LmsFeedItem, 'id' | 'createdAt' | 'updatedAt'>[]) {
    const uid = this.requireUid();
    const batch = writeBatch(this.firestore);

    for (const item of feedItems) {
      const ref = doc(collection(this.firestore, lmsFeedCollectionPath(uid)));
      batch.set(ref, {
        id: ref.id,
        ...item,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }

    await batch.commit();
  }

  /**
   * Converts one LMS feed item into a real task and auto-schedules it.
   * Use this after the user accepts a detected LMS item.
   */
  async createTaskFromLmsFeed(feedId: string) {
    const uid = this.requireUid();
    const feedRef = doc(this.firestore, `${lmsFeedCollectionPath(uid)}/${feedId}`);
    const snap = await getDoc(feedRef);
    if (!snap.exists()) throw new Error('LMS feed item not found.');

    const feed = withDocId(snap.id, snap.data() as LmsFeedItem);

    const taskRef = doc(collection(this.firestore, tasksCollectionPath(uid)));
    const adjustedMinutes = computeDifficultyAdjustedMinutes(60, 'medium'); // default guess for LMS items in v1

    const task: TaskItem = {
      id: taskRef.id,
      title: feed.title,
      subject: feed.course,
      type: feed.type,
      dueAt: feed.detectedDueAt,

      estimatedMinutes: adjustedMinutes,
      remainingMinutes: adjustedMinutes,
      scheduledMinutes: 0,

      difficulty: 'medium',
      priority: computePriority(feed.detectedDueAt),
      colorCode: computeUrgencyColor(feed.detectedDueAt),

      status: 'todo',
      notes: '',
      source: 'lms',
      autoSchedule: true,
      sourceMeta: {
        importedFromFeedId: feed.id,
      },

      createdAt: nowIso(),
      updatedAt: nowIso(),
      completedAt: null,
    };

    await setDoc(taskRef, task);

    await updateDoc(feedRef, {
      linkedTaskId: task.id,
      status: 'synced',
      updatedAt: nowIso(),
    });

    await this.autoScheduleTask(task.id);
    return task;
  }

  /**
   * Placeholder refresh hook for real LMS sync integration.
   *
   * This intentionally does not seed mock data. A new user should start with
   * an empty feed until a real LMS integration or manual ingestion path is used.
   */
  async refreshMockLmsFeed() {
    return;
  }

  // --------------------------------------------------
  // EAF UPLOAD + CLASS IMPORT
  // --------------------------------------------------

  /**
   * Upload EAF file to Firebase Storage and create an import record.
   * You can pass:
   * - PDF
   * - image
   *
   * On Expo, the actual file comes from DocumentPicker / ImagePicker.
   */
  async uploadEafFile(params: {
    fileUri: string;
    blob: Blob;
    filename: string;
  }) {
    const uid = this.requireUid();
    const storagePath = `users/${uid}/eaf/${Date.now()}-${params.filename}`;
    const storageRef = ref(this.storage, storagePath);

    await uploadBytes(storageRef, params.blob);
    const downloadUrl = await getDownloadURL(storageRef);

    const importRef = doc(collection(this.firestore, eafImportsCollectionPath(uid)));

    const importDoc: EafImportItem = {
      id: importRef.id,
      filename: params.filename,
      storagePath,
      downloadUrl,
      uploadedAt: nowIso(),
      parsingStatus: 'uploaded',
      extractedText: '',
      extractedClasses: [],
      confirmedClasses: [],
    };

    await setDoc(importRef, importDoc);
    return importDoc;
  }

  /**
   * Save extracted classes to the EAF import record.
   *
   * In a real implementation, this can happen after:
   * - client-side text extraction
   * - a server-side parser
   * - manual user entry/edit confirmation
   */
  async saveParsedEafClasses(importId: string, extractedClasses: ExtractedClass[], extractedText = '') {
    const uid = this.requireUid();
    await updateDoc(
      doc(this.firestore, `${eafImportsCollectionPath(uid)}/${importId}`),
      {
        extractedText,
        extractedClasses,
        parsingStatus: extractedClasses.length > 0 ? 'needs_review' : 'failed',
      }
    );
  }

  /**
   * After user reviews/edits extracted classes, save them as confirmed.
   */
  async confirmEafClasses(importId: string, confirmedClasses: ExtractedClass[]) {
    const uid = this.requireUid();
    await updateDoc(
      doc(this.firestore, `${eafImportsCollectionPath(uid)}/${importId}`),
      {
        confirmedClasses,
        parsingStatus: 'confirmed',
      }
    );
  }

  /**
   * Convert confirmed EAF classes into schedule items.
   *
   * V1 approach:
   * - create recurring class blocks for the next N weeks
   * - scheduler uses them as busy intervals
   *
   * For a hackathon demo, 16 weeks is enough.
   */
  async importConfirmedEafClassesToSchedules(importId: string, weeksToGenerate = 16) {
    const uid = this.requireUid();
    const ref = doc(this.firestore, `${eafImportsCollectionPath(uid)}/${importId}`);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('EAF import not found.');

    const eaf = snap.data() as EafImportItem;
    const classes = eaf.confirmedClasses ?? [];
    if (!classes.length) throw new Error('No confirmed classes found.');

    const blocks: Omit<ScheduleItem, 'id' | 'createdAt' | 'updatedAt'>[] = [];
    const today = new Date();

    for (const cls of classes) {
      let anchor = nextDateForWeekday(today, cls.weekday);

      for (let week = 0; week < weeksToGenerate; week += 1) {
        const classDate = new Date(anchor);
        classDate.setDate(anchor.getDate() + week * 7);

        const start = setDayTime(classDate, cls.startHour, cls.startMinute);
        const end = setDayTime(classDate, cls.endHour, cls.endMinute);

        blocks.push({
          title: cls.title,
          type: 'class',
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          location: cls.location ?? cls.room ?? 'Classroom',
          taskId: null,
          subject: cls.subject,
          difficulty: undefined,
          status: 'scheduled',
          source: 'eaf',
          urgency: 'green',
          recurringClassMeta: {
            courseCode: cls.courseCode,
            room: cls.room,
            instructor: cls.instructor,
            weekday: cls.weekday,
          },
        });
      }
    }

    await this.createScheduleBlocks(blocks);
  }

  /**
   * Optional helper if the user wants to replace old imported classes.
   * You may want to only delete schedule items where source='eaf'.
   */
  async clearImportedEafClassSchedules() {
    const uid = this.requireUid();
    const q = query(
      collection(this.firestore, schedulesCollectionPath(uid)),
      where('source', '==', 'eaf')
    );

    const snap = await getDocs(q);
    const batch = writeBatch(this.firestore);

    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  // --------------------------------------------------
  // SCHEDULER
  // --------------------------------------------------

  async getPreferencesSafe() {
    const uid = this.requireUid();
    const ref = doc(this.firestore, preferencesDocPath(uid));
    const snap = await getDoc(ref);
    return snap.exists()
      ? (snap.data() as UserPreferences)
      : DEFAULT_PREFERENCES;
  }

  /**
   * Main scheduling entry point for one task.
   */
  async autoScheduleTask(taskId: string) {
    const task = await this.getTask(taskId);
    if (!task.autoSchedule || task.status === 'done') return [];

    const preferences = await this.getPreferencesSafe();
    const existingSchedules = await this.getSchedulesUntil(task.dueAt);

    const drafts = generateStudyPlanForTask(
      task,
      existingSchedules,
      preferences
    );

    if (!drafts.length) return [];

    await this.createScheduleBlocks(
      drafts.map((d) => ({
        title: d.title,
        type: d.type,
        startsAt: d.startsAt,
        endsAt: d.endsAt,
        location: d.location,
        taskId: d.taskId,
        subject: d.subject,
        difficulty: d.difficulty,
        status: d.status,
        source: d.source,
        urgency: d.urgency,
      }))
    );

    const allocated = drafts.reduce((sum, draft) => {
      return sum + diffMinutes(new Date(draft.startsAt), new Date(draft.endsAt));
    }, 0);

    await this.updateTask(task.id, {
      scheduledMinutes: task.scheduledMinutes + allocated,
    });

    return drafts;
  }

  /**
   * Rebuild future study blocks for a task.
   * Useful when:
   * - due date changes
   * - estimated minutes change
   * - user changes preferences
   */
  async regenerateFutureStudyPlanForTask(taskId: string) {
    const uid = this.requireUid();
    const task = await this.getTask(taskId);

    // remove only future auto-generated study blocks for this task
    const q = query(
      collection(this.firestore, schedulesCollectionPath(uid)),
      where('taskId', '==', taskId),
      where('source', '==', 'auto')
    );

    const snap = await getDocs(q);
    const now = new Date();

    const batch = writeBatch(this.firestore);
    for (const d of snap.docs) {
      const schedule = d.data() as ScheduleItem;
      if (new Date(schedule.startsAt).getTime() > now.getTime()) {
        batch.delete(d.ref);
      }
    }
    await batch.commit();

    await this.updateTask(taskId, { scheduledMinutes: 0 });
    return this.autoScheduleTask(taskId);
  }
}

// ======================================================
// 7) PURE SCHEDULER HELPERS
// ======================================================

/**
 * Converts draft study blocks into ScheduleItems for adjacency checks.
 */
function draftsToScheduleItems(drafts: ScheduleDraft[]): ScheduleItem[] {
  return drafts.map((d, index) => ({
    id: `draft-${index}`,
    title: d.title,
    type: d.type,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    location: d.location,
    taskId: d.taskId,
    subject: d.subject,
    difficulty: d.difficulty,
    status: d.status,
    source: d.source,
    urgency: d.urgency,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }));
}

/**
 * Split total work into study chunks.
 * v1 rule:
 * - use preferred session length
 * - minimum useful chunk = 30
 * - merge tiny tail into previous block
 */
export function splitTaskIntoChunks(
  remainingMinutes: number,
  preferredSessionMinutes: number
): number[] {
  const chunks: number[] = [];
  let left = remainingMinutes;

  while (left > 0) {
    if (left <= 30) {
      chunks.push(left);
      break;
    }

    const chunk = Math.min(preferredSessionMinutes, left);
    chunks.push(chunk);
    left -= chunk;
  }

  if (chunks.length >= 2 && chunks[chunks.length - 1] < 20) {
    const tail = chunks.pop()!;
    chunks[chunks.length - 1] += tail;
  }

  return chunks;
}

/**
 * Check if placing a hard study block here would create a hard-hard adjacency.
 */
export function violatesHardBackToBack(
  candidateStart: Date,
  existingSchedules: ScheduleItem[],
  difficulty: Difficulty
) {
  if (difficulty !== 'hard') return false;

  const candidateTime = candidateStart.getTime();

  return existingSchedules.some((item) => {
    if (item.type !== 'study') return false;
    if (item.difficulty !== 'hard') return false;
    if (item.status === 'cancelled') return false;

    const itemStart = new Date(item.startsAt).getTime();
    const itemEnd = new Date(item.endsAt).getTime();

    const closeBefore = Math.abs(candidateTime - itemEnd) <= 15 * 60_000;
    const closeAfter = Math.abs(itemStart - candidateTime) <= 15 * 60_000;

    return closeBefore || closeAfter;
  });
}

/**
 * Build free windows from current schedules, considering:
 * - classes imported from EAF
 * - manual personal blocks
 * - existing study blocks
 * - LMS or other schedule entries
 *
 * The scheduler should work from "now" until due date.
 */
export function findFreeWindows(
  existingSchedules: ScheduleItem[],
  preferences: UserPreferences,
  now: Date,
  dueDate: Date
): FreeWindow[] {
  const freeWindows: FreeWindow[] = [];

  let cursorDay = startOfDay(now);
  const lastDay = startOfDay(dueDate);

  while (cursorDay.getTime() <= lastDay.getTime()) {
    const dayStart = setDayTime(cursorDay, preferences.startHour, 0);
    const dayEnd = setDayTime(cursorDay, preferences.endHour, 0);

    let effectiveDayStart = dayStart;
    if (isSameDay(cursorDay, now)) {
      effectiveDayStart = clampToFuture(dayStart);
    }

    const daySchedules = existingSchedules
      .filter((item) => isSameDay(new Date(item.startsAt), cursorDay))
      .filter((item) => item.status !== 'cancelled')
      .sort((a, b) => {
        return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
      });

    let busyCursor = effectiveDayStart;

    for (const item of daySchedules) {
      const itemStart = new Date(item.startsAt);
      const itemEnd = new Date(item.endsAt);

      // ignore blocks entirely before current usable cursor
      if (itemEnd.getTime() <= busyCursor.getTime()) {
        continue;
      }

      // gap before current item
      if (itemStart.getTime() > busyCursor.getTime()) {
        const gapStart = new Date(busyCursor);
        const gapEnd = new Date(itemStart);
        const minutes = diffMinutes(gapStart, gapEnd);

        if (minutes >= 30) {
          freeWindows.push({
            startsAt: gapStart,
            endsAt: gapEnd,
            minutes,
          });
        }
      }

      // move cursor past this busy interval
      if (itemEnd.getTime() > busyCursor.getTime()) {
        busyCursor = itemEnd;
      }
    }

    // final gap until day end
    if (dayEnd.getTime() > busyCursor.getTime()) {
      const minutes = diffMinutes(busyCursor, dayEnd);
      if (minutes >= 30) {
        freeWindows.push({
          startsAt: new Date(busyCursor),
          endsAt: new Date(dayEnd),
          minutes,
        });
      }
    }

    cursorDay.setDate(cursorDay.getDate() + 1);
  }

  return freeWindows;
}

/**
 * Main v1 task scheduling algorithm.
 *
 * Rules:
 * - earliest free windows first
 * - session length from preferences
 * - 15-min break buffer consumed after a chunk
 * - avoid too many sessions per day
 * - avoid hard-hard back-to-back if possible
 * - stop when no more windows exist
 */
export function generateStudyPlanForTask(
  task: TaskItem,
  existingSchedules: ScheduleItem[],
  preferences: UserPreferences
): ScheduleDraft[] {
  if (!task.autoSchedule || task.status === 'done') return [];

  const dueDate = new Date(task.dueAt);
  const now = new Date();

  if (dueDate.getTime() <= now.getTime()) return [];

  const freeWindows = findFreeWindows(
    existingSchedules,
    preferences,
    now,
    dueDate
  );

  if (!freeWindows.length) return [];

  const chunks = splitTaskIntoChunks(
    task.remainingMinutes,
    preferences.preferredSessionMinutes
  );

  const drafts: ScheduleDraft[] = [];
  const sessionsPerDay = new Map<string, number>();

  for (const chunk of chunks) {
    const currentSchedules = [
      ...existingSchedules,
      ...draftsToScheduleItems(drafts),
    ];

    let chosenWindowIndex = -1;

    for (let i = 0; i < freeWindows.length; i += 1) {
      const window = freeWindows[i];
      const dayKey = startOfDay(window.startsAt).toDateString();
      const usedToday = sessionsPerDay.get(dayKey) ?? 0;

      if (usedToday >= preferences.maxSessionsPerDay) {
        continue;
      }

      if (window.minutes < chunk) {
        continue;
      }

      const candidateStart = new Date(window.startsAt);

      if (
        preferences.avoidBackToBackHard &&
        violatesHardBackToBack(candidateStart, currentSchedules, task.difficulty)
      ) {
        continue;
      }

      chosenWindowIndex = i;
      break;
    }

    // Fallback: if no ideal window found, ignore hard-back-to-back rule once
    if (chosenWindowIndex === -1) {
      for (let i = 0; i < freeWindows.length; i += 1) {
        const window = freeWindows[i];
        const dayKey = startOfDay(window.startsAt).toDateString();
        const usedToday = sessionsPerDay.get(dayKey) ?? 0;

        if (usedToday >= preferences.maxSessionsPerDay) continue;
        if (window.minutes < chunk) continue;

        chosenWindowIndex = i;
        break;
      }
    }

    if (chosenWindowIndex === -1) {
      break;
    }

    const chosen = freeWindows[chosenWindowIndex];
    const start = new Date(chosen.startsAt);
    const end = addMinutes(start, chunk);

    drafts.push({
      title: `${task.subject}: ${task.title}`,
      type: 'study',
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      location: 'Study session',
      taskId: task.id,
      subject: task.subject,
      difficulty: task.difficulty,
      status: 'scheduled',
      source: 'auto',
      urgency: task.colorCode,
    });

    // consume chunk + break
    const consume = chunk + preferences.shortBreakMinutes;
    chosen.startsAt = addMinutes(chosen.startsAt, consume);
    chosen.minutes = Math.max(0, diffMinutes(chosen.startsAt, chosen.endsAt));

    const dayKey = startOfDay(start).toDateString();
    sessionsPerDay.set(dayKey, (sessionsPerDay.get(dayKey) ?? 0) + 1);
  }

  return drafts;
}

// ======================================================
// 8) SELECTORS FOR HOME / DASHBOARD
// ======================================================

export function getTodaySchedules(schedules: ScheduleItem[], now = new Date()) {
  return schedules
    .filter((item) => isSameDay(new Date(item.startsAt), now))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

export function getOpenTasks(tasks: TaskItem[]) {
  return tasks.filter((task) => task.status !== 'done');
}

export function getCompletedTasks(tasks: TaskItem[]) {
  return tasks.filter((task) => task.status === 'done' && task.completedAt);
}

export function getNextSchedule(schedules: ScheduleItem[], now = new Date()) {
  return schedules.find((item) => new Date(item.endsAt).getTime() >= now.getTime()) ?? null;
}

export function getOverdueTasks(tasks: TaskItem[], now = new Date()) {
  return tasks.filter((task) => {
    return task.status !== 'done' && new Date(task.dueAt).getTime() < now.getTime();
  });
}

export function findConflict(items: ScheduleItem[]) {
  const sorted = [...items].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];

    if (new Date(current.endsAt).getTime() > new Date(next.startsAt).getTime()) {
      return { current, next };
    }
  }

  return null;
}

export function findLargestGap(items: ScheduleItem[], today = new Date()): FreeWindow | null {
  if (!items.length) return null;

  const sorted = [...items].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );

  const dayStart = setDayTime(today, 7, 0);
  const dayEnd = setDayTime(today, 20, 0);

  let best: FreeWindow | null = null;
  let cursor = dayStart;

  for (const item of sorted) {
    const start = new Date(item.startsAt);
    const gapMinutes = diffMinutes(cursor, start);

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

  const finalGap = diffMinutes(cursor, dayEnd);
  if (finalGap >= 45 && (!best || finalGap > best.minutes)) {
    best = {
      startsAt: new Date(cursor),
      endsAt: new Date(dayEnd),
      minutes: finalGap,
    };
  }

  return best;
}

// ======================================================
// 9) SUGGESTED PROVIDER API
// ======================================================

/**
 * This is the shape your useFirebaseBackend() hook can expose.
 */
export type FirebaseBackendShape = {
  user: User | null;
  profile: UserProfile | null;
  preferences: UserPreferences | null;

  tasks: TaskItem[];
  schedules: ScheduleItem[];
  lmsFeed: LmsFeedItem[];

  loadingData: boolean;
  authMessage?: string | null;

  // bootstrap
  ensureUserBootstrap: () => Promise<void>;

  // tasks
  createTask: (input: CreateTaskInput) => Promise<TaskItem>;
  createTaskAndSchedule: (input: CreateTaskInput) => Promise<TaskItem>;
  updateTask: (taskId: string, patch: Partial<TaskItem>) => Promise<void>;
  setTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>;

  // schedules
  createStudyBlock: (input: CreateStudyBlockInput) => Promise<void>;
  rescheduleItem: (scheduleId: string, startsAt: string, endsAt: string) => Promise<void>;
  markScheduleDone: (scheduleId: string) => Promise<void>;
  markScheduleMissed: (scheduleId: string) => Promise<void>;
  autoScheduleTask: (taskId: string) => Promise<ScheduleDraft[]>;
  regenerateFutureStudyPlanForTask: (taskId: string) => Promise<ScheduleDraft[]>;

  // LMS
  refreshMockLmsFeed: () => Promise<void>;
  createTaskFromLmsFeed: (feedId: string) => Promise<TaskItem>;

  // profile / onboarding
  updateProfile: (patch: Partial<UserProfile>) => Promise<void>;
  completeOnboarding: (input: CompleteOnboardingInput) => Promise<void>;
  resetCurrentUserData: () => Promise<void>;

  // EAF
  uploadEafFile: (params: {
    fileUri: string;
    blob: Blob;
    filename: string;
  }) => Promise<EafImportItem>;
  saveParsedEafClasses: (importId: string, extractedClasses: ExtractedClass[], extractedText?: string) => Promise<void>;
  confirmEafClasses: (importId: string, confirmedClasses: ExtractedClass[]) => Promise<void>;
  importConfirmedEafClassesToSchedules: (importId: string, weeksToGenerate?: number) => Promise<void>;
  createRecurringClassSchedules: (classes: ExtractedClass[], weeksToGenerate?: number) => Promise<void>;
  clearImportedEafClassSchedules: () => Promise<void>;
};

// ======================================================
// 10) FIRESTORE SECURITY RULES (REFERENCE ONLY)
// ======================================================

/**
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *     match /users/{uid} {
 *       allow read, write: if request.auth != null && request.auth.uid == uid;
 *
 *       match /preferences/{docId} {
 *         allow read, write: if request.auth != null && request.auth.uid == uid;
 *       }
 *
 *       match /tasks/{taskId} {
 *         allow read, write: if request.auth != null && request.auth.uid == uid;
 *       }
 *
 *       match /schedules/{scheduleId} {
 *         allow read, write: if request.auth != null && request.auth.uid == uid;
 *       }
 *
 *       match /lmsFeed/{feedId} {
 *         allow read, write: if request.auth != null && request.auth.uid == uid;
 *       }
 *
 *       match /eafImports/{importId} {
 *         allow read, write: if request.auth != null && request.auth.uid == uid;
 *       }
 *
 *       match /sessionLogs/{sessionId} {
 *         allow read, write: if request.auth != null && request.auth.uid == uid;
 *       }
 *     }
 *   }
 * }
 */

// ======================================================
// 11) STORAGE RULES (REFERENCE ONLY)
// ======================================================

/**
 * service firebase.storage {
 *   match /b/{bucket}/o {
 *     match /users/{uid}/{allPaths=**} {
 *       allow read, write: if request.auth != null && request.auth.uid == uid;
 *     }
 *   }
 * }
 */

// ======================================================
// 12) IMPLEMENTATION NOTES / BUILD ORDER
// ======================================================

/**
 * RECOMMENDED BUILD ORDER
 * -----------------------
 * 1. Ensure auth bootstrap + profile/preferences docs exist
 * 2. Implement createTaskAndSchedule(...)
 * 3. Implement Calendar rendering from schedules
 * 4. Implement markScheduleDone / markScheduleMissed
 * 5. Implement LMS Sync screen:
 *    - show feed items
 *    - let user convert feed items to tasks
 * 6. Implement EAF Upload screen flow:
 *    - upload file
 *    - show extracted or manually entered classes
 *    - confirm classes
 *    - generate class schedules
 *
 * HOW EAF FITS INTO THE SCHEDULER
 * -------------------------------
 * - EAF import creates schedule items of type='class'
 * - findFreeWindows() treats them as busy intervals
 * - therefore study blocks are generated around classes
 *
 * HOW LMS FITS INTO THE SCHEDULER
 * -------------------------------
 * - LMS sync creates feed items
 * - accepted feed items become tasks
 * - tasks then go through autoScheduleTask()
 *
 * HACKATHON-SAFE V1
 * -----------------
 * For EAF parsing, the simplest reliable demo flow is:
 * - upload PDF/image
 * - show "detected classes"
 * - user edits or confirms
 * - confirmed classes become recurring schedule blocks
 *
 * That is much safer than trying to guarantee perfect automatic PDF parsing.
 */






