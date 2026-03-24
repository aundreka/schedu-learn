import { User } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { LmsFeedItem, ScheduleItem, TaskItem, UserPreferences, UserProfile } from '@/lib/firebase/types';

const DEFAULT_PREFERENCES: UserPreferences = {
  notificationsEnabled: true,
  dailyDigestEnabled: true,
  compactView: false,
  themeMode: 'system',
  studyGoalHours: 3,
};

const nowIso = () => new Date().toISOString();

const addHours = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

const addDays = (days: number, hour = 12) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

const userDocRef = (uid: string) => doc(db, 'users', uid);
const tasksCollection = (uid: string) => collection(db, 'users', uid, 'tasks');
const schedulesCollection = (uid: string) => collection(db, 'users', uid, 'schedules');
const lmsFeedCollection = (uid: string) => collection(db, 'users', uid, 'lmsFeed');

const initialsFromName = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'SL';

const defaultProfile = (user: User): UserProfile => ({
  displayName: user.displayName || 'SchedU Learner',
  email: user.email || 'student@example.com',
  role: 'Computer Science Student',
  bio: 'Tracking classes, deadlines, and study sessions in one place.',
  semester: '2nd Term',
  avatarInitials: initialsFromName(user.displayName || 'SchedU Learner'),
  preferences: DEFAULT_PREFERENCES,
  createdAt: nowIso(),
  updatedAt: nowIso(),
});

const seedTaskDocs = (uid: string) => [
  {
    ref: doc(tasksCollection(uid), 'algorithms-problem-set-4'),
    data: {
      title: 'Problem Set 4',
      course: 'Algorithms',
      dueAt: addDays(1, 23),
      status: 'new',
      priority: 'urgent',
      source: 'Canvas',
    },
  },
  {
    ref: doc(tasksCollection(uid), 'os-lab-writeup'),
    data: {
      title: 'Lab write-up',
      course: 'Operating Systems',
      dueAt: addDays(3, 17),
      status: 'in_progress',
      priority: 'high',
      source: 'Google Classroom',
    },
  },
  {
    ref: doc(tasksCollection(uid), 'technical-writing-discussion'),
    data: {
      title: 'Discussion prompt',
      course: 'Technical Writing',
      dueAt: addDays(5, 21),
      status: 'new',
      priority: 'medium',
      source: 'Canvas',
    },
  },
];

const seedScheduleDocs = (uid: string) => [
  {
    ref: doc(schedulesCollection(uid), 'algorithms-lecture'),
    data: {
      title: 'Algorithms Lecture',
      startsAt: addHours(2),
      endsAt: addHours(3),
      location: 'Lecture Hall A',
      type: 'class',
    },
  },
  {
    ref: doc(schedulesCollection(uid), 'group-study'),
    data: {
      title: 'Group Study',
      startsAt: addHours(6),
      endsAt: addHours(8),
      location: 'Library Room 3',
      type: 'study',
    },
  },
  {
    ref: doc(schedulesCollection(uid), 'mock-exam-block'),
    data: {
      title: 'Mock Exam Block',
      startsAt: addDays(1, 19),
      endsAt: addDays(1, 21),
      location: 'Home',
      type: 'study',
    },
  },
];

const buildLmsFeedSeed = (syncedAt: string) => [
  {
    source: 'Canvas',
    course: 'Algorithms',
    title: 'Problem Set 4 detected',
    due: 'Due tomorrow at 11:00 PM',
    status: 'New',
    syncedAt,
  },
  {
    source: 'Google Classroom',
    course: 'Operating Systems',
    title: 'Lab write-up synced',
    due: 'Due Friday at 5:00 PM',
    status: 'Reviewed',
    syncedAt,
  },
  {
    source: 'Moodle',
    course: 'Discrete Math',
    title: 'Quiz window opened',
    due: 'Available now until 8:00 PM',
    status: 'Urgent',
    syncedAt,
  },
  {
    source: 'Canvas',
    course: 'Technical Writing',
    title: 'Discussion prompt pulled in',
    due: 'Due Sunday at 9:00 PM',
    status: 'Queued',
    syncedAt,
  },
];

export async function ensureUserWorkspace(user: User) {
  const snapshot = await getDoc(userDocRef(user.uid));
  if (snapshot.exists()) {
    return;
  }

  const batch = writeBatch(db);
  batch.set(userDocRef(user.uid), defaultProfile(user));

  for (const task of seedTaskDocs(user.uid)) {
    batch.set(task.ref, task.data);
  }

  for (const schedule of seedScheduleDocs(user.uid)) {
    batch.set(schedule.ref, schedule.data);
  }

  const syncedAt = nowIso();
  for (const item of buildLmsFeedSeed(syncedAt)) {
    batch.set(doc(lmsFeedCollection(user.uid)), item);
  }

  await batch.commit();
}

export function subscribeToProfile(
  uid: string,
  onData: (profile: UserProfile | null) => void,
  onError: (error: Error) => void
) {
  return onSnapshot(
    userDocRef(uid),
    (snapshot) => onData(snapshot.exists() ? (snapshot.data() as UserProfile) : null),
    onError
  );
}

export function subscribeToTasks(
  uid: string,
  onData: (tasks: TaskItem[]) => void,
  onError: (error: Error) => void
) {
  return onSnapshot(
    query(tasksCollection(uid), orderBy('dueAt')),
    (snapshot) =>
      onData(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<TaskItem, 'id'>) }))),
    onError
  );
}

export function subscribeToSchedules(
  uid: string,
  onData: (items: ScheduleItem[]) => void,
  onError: (error: Error) => void
) {
  return onSnapshot(
    query(schedulesCollection(uid), orderBy('startsAt')),
    (snapshot) =>
      onData(
        snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<ScheduleItem, 'id'>) }))
      ),
    onError
  );
}

export function subscribeToLmsFeed(
  uid: string,
  onData: (items: LmsFeedItem[]) => void,
  onError: (error: Error) => void
) {
  return onSnapshot(
    query(lmsFeedCollection(uid), orderBy('syncedAt', 'desc')),
    (snapshot) =>
      onData(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<LmsFeedItem, 'id'>) }))),
    onError
  );
}

export async function updatePreferences(uid: string, preferences: Partial<UserPreferences>) {
  const snapshot = await getDoc(userDocRef(uid));
  const current = snapshot.data() as UserProfile | undefined;

  await setDoc(
    userDocRef(uid),
    {
      preferences: {
        ...(current?.preferences ?? DEFAULT_PREFERENCES),
        ...preferences,
      },
      updatedAt: nowIso(),
    },
    { merge: true }
  );
}

export async function addQuickTask(uid: string) {
  const createdAt = new Date();
  const dueAt = new Date(createdAt.getTime() + 36 * 60 * 60 * 1000).toISOString();

  await addDoc(tasksCollection(uid), {
    title: `Quick task ${createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    course: 'General',
    dueAt,
    status: 'new',
    priority: 'medium',
    source: 'Manual',
  });
}

export async function seedLmsMockData(uid: string) {
  const syncedAt = nowIso();
  const batch = writeBatch(db);

  for (const item of buildLmsFeedSeed(syncedAt)) {
    batch.set(doc(lmsFeedCollection(uid)), item);
  }

  await batch.commit();
}
